"""scripts/agent_manager.py: one headless Claude Code agent per task (#387)."""

import io
import json
import os
import re
import subprocess
import sys
import time
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field, replace
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any, ClassVar
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest

from scripts.agent_manager import (
    Agent,
    AgentError,
    AgentManager,
    AgentResult,
    Backoff,
    Child,
    Console,
    HoldNotice,
    IssueJob,
    IssueLabel,
    Job,
    Keys,
    Labels,
    Launcher,
    ModelUnavailable,
    NotMerged,
    PricesJob,
    Scheduler,
    SelfMerge,
    TestDatabase,
    ToolchainHold,
    UsageLimit,
    Warmup,
    Watcher,
    WikiJob,
    Worktree,
)
from scripts.agents import (
    NOTES,
    WATCH_EVERY,
    AgentPower,
    CompactShare,
    ManagerConfig,
    Priority,
)
from scripts.check_setup import Check
from scripts.claude_cost import IssueCost
from scripts.github import Conversation, Task, sign
from scripts.handoff import Git, HandoffMark, Machine
from scripts.wiki import WikiNews
from tests.fakes import FakeGit

pytestmark = pytest.mark.unit

ME = "bateks"
SLUG = "bateks/PersonalExchangeBot"
TODAY = date(2026, 10, 12)
NOW = datetime(2026, 10, 12, 18, 30)
PRAGUE = ZoneInfo("Europe/Prague")
LIMIT_HIT = datetime(2026, 10, 14, 9, 33, tzinfo=PRAGUE)  # #476: four runs ended on it
SESSION_LIMIT = "You've hit your session limit · resets 12pm (Europe/Prague)"
# #4: what a run on a model the account lacks ends on, at once: the API's refusal, as Claude
# Code reports it. Its exact wording isn't fixed; this is the shape of a not-found answer.
NO_FABLE = (
    'API Error: 404 {"type":"error","error":{"type":"not_found_error",'
    '"message":"model: claude-fable-5-1"}}'
)
THRASHING = (  # #152: Claude Code's words, as #26's run of 2026-11-05 ended on them
    "Autocompact is thrashing: the context refilled to the limit within 3 turns of the "
    "previous compact, 3 times in a row. A file being read or a tool output is likely too "
    "large for the context window. Try reading in smaller chunks, or use /clear to start fresh."
)
SERVER = "postgresql://everest:everest@localhost:5433/everest_test"  # the tests' database server
BEHIND = WikiNews(  # #126: what the watcher found the wiki lacks
    "The wiki is behind develop: 2 PRs merged since 3333333 (#124, #127).",
    "1" * 40,
    "3" * 40,
    (124, 127),
)


def task(
    number: int = 7,
    state: str = "to start",
    *,
    kind: str = "issue",
    issue: int | None = 7,
    title: str = "[~$40] Location rule: fine-tuning!",
    labels: Sequence[str] = (),
    branch: str | None = None,
    ci: str | None = None,
    sha: str | None = None,
) -> Task:
    """A task as the watcher says it: a label changes its key, as one the manager reads does
    (#485)."""
    key = f"#{number} {state}" if sha is None else f"PR #{number} at {sha}: {ci}"
    key += "".join(f", {label}" for label in labels)
    return Task(key, kind, number, state, title, issue, tuple(labels), branch, ci, sha)


def merge(number: int = 9, issue: int = 7) -> IssueJob:
    """A green PR's CI: what's left is its merge (#485)."""
    found = task(number, "CI finished", kind="pull", issue=issue, ci="CI: success", sha="a")
    return IssueJob(replace(found, green=True))


class Clock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


# --- the jobs ----------------------------------------------------------------------------------


def test_a_line_of_the_watcher_s_is_a_job() -> None:
    issue_job = Job.of({"type": "task", **task().data()}, TODAY)
    prices_job = Job.of({"type": "prices", "key": "prices: x", "text": "x"}, TODAY)

    assert isinstance(issue_job, IssueJob) and issue_job.slot == "7"
    assert isinstance(prices_job, PricesJob) and prices_job.slot == "prices"
    wiki_job = Job.of(BEHIND.data(), TODAY)
    assert isinstance(wiki_job, WikiJob) and wiki_job.news == BEHIND and wiki_job.slot == "wiki"
    assert Job.of({"type": "note", "text": "Pulled develop"}, TODAY) is None


def test_a_pr_s_job_is_its_issue_s() -> None:
    # One agent per issue: the PR's CI and the issue's reply wait for each other.
    job = IssueJob(task(9, "CI finished", kind="pull", issue=7, ci="CI: success", sha="abc"))

    assert (job.slot, job.issue) == ("7", 7)
    assert str(job) == "#7 (CI finished on PR #9: CI: success)"


def test_a_green_pr_s_job_is_a_merge_and_a_red_one_code_work() -> None:
    # #485: a merge takes minutes; a red CI's fix may take an hour.
    red = task(9, "CI finished", kind="pull", ci="CI: failure", sha="abc")

    assert merge().merges
    assert not IssueJob(red).merges
    assert not IssueJob(task(9, "reply waiting", kind="pull")).merges


@pytest.mark.parametrize(
    ("found", "begun"),
    [
        (task(state="to start"), False),
        (task(state="reply waiting"), True),  # Claude has spoken on it: a plan, a question
        (task(state="Claude's move"), True),
        (task(9, "to start", kind="pull"), True),  # a PR is open for it
        (task(9, "CI finished", kind="pull", ci="CI: failure", sha="abc"), True),
    ],
    ids=["to start", "reply waiting", "Claude's move", "a PR", "CI finished"],
)
def test_a_job_is_mid_work_once_claude_has_begun_it(found: Task, begun: bool) -> None:
    assert IssueJob(found).begun == begun


def test_a_job_s_priority_is_its_issue_s_label() -> None:
    assert IssueJob(task(labels=["priority:high", "model:opus"])).priority == Priority("high")
    assert IssueJob(task()).priority == Priority("medium")
    assert PricesJob("prices: x", "x", TODAY).priority == Priority("medium")


def test_a_pr_for_no_issue_is_its_own() -> None:
    job = IssueJob(task(9, "reply waiting", kind="pull", issue=None))

    assert (job.slot, job.issue) == ("9", None)
    assert "for PR #9 of" in job.prompt(SLUG, "chore/x")
    assert "`uv run python scripts/github.py show 9`" in job.prompt(SLUG, "chore/x")


def test_a_merge_left_to_an_agent_tells_it_why() -> None:
    # #550: what the manager found, so the agent doesn't look for it again.
    job = merge().left_to_agent("GitHub says PR #9 can't be merged as it is (dirty)")

    assert job.key == merge().key and job.merges
    assert (
        "CI finished on PR #9: CI: success. The manager left the merge to you: GitHub says "
        "PR #9 can't be merged as it is (dirty).\n\n"
    ) in job.prompt(SLUG, "feature/7-x")
    prices = PricesJob("prices: x", "x", TODAY)
    assert prices.left_to_agent("why") is prices


def test_the_prompt_says_what_to_do_and_where_the_rules_are() -> None:
    prompt = IssueJob(task(state="reply waiting")).prompt(SLUG, "feature/7-x")

    assert "for issue #7 of bateks/PersonalExchangeBot: a reply waits." in prompt
    assert '"How agents work here"' in prompt and "work on #7 only" in prompt
    assert "`--handoff --closing`" in prompt
    # #387's trial: the agent couldn't read its issue; `show` gives it as text.
    assert "Read it with `uv run python scripts/github.py show 7`" in prompt
    # Its own issue's handoff, not every open issue's.
    assert "carry on from `uv run python scripts/github.py handoffs 7`" in prompt
    # #442: before each comment, only what's new, not the whole thread again.
    assert "Before each comment, `uv run python scripts/github.py show 7 --new`" in prompt


def test_the_rules_an_agent_is_sent_to_are_there() -> None:
    # Each section a prompt names, in quotes, is one of CLAUDE.md's (#552 moved some out).
    claude_md = (Path(__file__).resolve().parent.parent / "CLAUDE.md").read_text(encoding="utf-8")
    prompts = (
        IssueJob(task(state="reply waiting")).prompt(SLUG, "feature/7-x"),
        PricesJob("prices: x", "x", TODAY).prompt(SLUG, "chore/claude-prices-2026-10-12"),
        WikiJob(BEHIND, TODAY).prompt(SLUG, "wiki/2026-10-12"),
    )
    named = {name for prompt in prompts for name in re.findall(r'"([^"]+)"', prompt)}

    assert named >= {"How agents work here", "Sessions", "Working from GitHub issues"}
    assert [name for name in named if f"\n## {name}\n" not in claude_md] == []


def test_a_new_branch_is_named_after_the_issue_s_title() -> None:
    git = Git(Path("/repo"), FakeGit({}))  # no branch of #7's anywhere

    assert IssueJob(task()).branch(git) == "feature/7-location-rule-fine-tuning"
    assert IssueJob(task(title="Развертывание в ПРОД")).branch(git) == "feature/7-work"


def test_the_issue_s_branch_is_used_the_one_on_origin_first() -> None:
    refs = "refs/heads/fix/7-old\nrefs/remotes/origin/feature/7-new"
    git = Git(
        Path("/repo"),
        FakeGit(
            {
                "for-each-ref --format=%(refname) refs/heads refs/remotes/origin": refs,
                "rev-parse --verify -q refs/remotes/origin/feature/7-new": "abc",
            }
        ),
    )

    assert IssueJob(task()).branch(git) == "feature/7-new"
    assert IssueJob(task(branch="feature/7-pr")).branch(git) == "feature/7-pr"  # a PR's own


class StateGitHub:
    """An issue or PR as GitHub has it now: `comments` on #`on` (on any, when None), CI at
    `sha`, which ended at 21:50 UTC, and `labels` on issue #7 alone, not on its PR #9."""

    def __init__(
        self,
        comments: list[dict[str, object]],
        sha: str = "abc",
        on: int | None = None,
        labels: Sequence[str] = (),
    ) -> None:
        self.comments = comments
        self.sha = sha
        self.on = on
        self.labels = [{"name": label} for label in labels]

    def call(
        self, method: str, path: str, body: object | None = None, missing_ok: bool = False
    ) -> object:
        if path.startswith("pulls/"):
            return {"state": "open", "head": {"sha": self.sha}}
        if path.startswith("actions/runs?head_sha="):
            ended = "2026-10-13T21:50:00Z"
            ci = {"name": "CI", "status": "completed", "conclusion": "success", "updated_at": ended}
            return {"workflow_runs": [ci]}
        if path.endswith("comments?per_page=100"):
            mine = self.on is None or path.startswith(f"issues/{self.on}/")
            return self.comments if mine else []
        number = int(path.split("/")[1])  # issues/<n>
        entry = {"number": number, "title": "X", "state": "open", "user": {"login": ME}}
        return entry | {"labels": self.labels if number == 7 else []}


@pytest.mark.parametrize("label", ["postponed", "release"])
def test_a_job_whose_issue_is_set_aside_meanwhile_is_no_longer_due(label: str) -> None:
    # "release": opened bare, then labelled, it's release-cut.yml's to answer (#517).
    job = IssueJob(task())

    assert job.still_due(StateGitHub([]), ME)  # type: ignore[arg-type]
    assert not job.still_due(StateGitHub([], labels=[label]), ME)  # type: ignore[arg-type]


@pytest.mark.parametrize(
    "found",
    [
        task(9, "CI finished", kind="pull", ci="CI: success", sha="abc"),
        task(9, "reply waiting", kind="pull"),
    ],
    ids=["CI finished", "a reply"],
)
def test_a_pr_s_job_whose_issue_is_postponed_meanwhile_is_no_longer_due(found: Task) -> None:
    # #540: the label holds the issue's PR with it; a job that waited since before it goes.
    job = IssueJob(found)
    asked = {"body": sign("Renamed?", ME), "user": {"login": ME}}
    answer = {"body": "Not yet", "user": {"login": ME}}

    assert job.still_due(StateGitHub([asked, answer], on=9), ME)  # type: ignore[arg-type]
    held = StateGitHub([asked, answer], on=9, labels=["postponed"])
    assert not job.still_due(held, ME)  # type: ignore[arg-type]


@pytest.mark.parametrize(
    "found",
    [task(), task(9, "CI finished", kind="pull", ci="CI: success", sha="abc")],
    ids=["the issue", "its PR"],
)
def test_a_job_whose_issue_is_blocked_meanwhile_is_no_longer_due(found: Task) -> None:
    # #107: an `after:16` label put on #7 while the job waited its turn, and #16 is open.
    job = IssueJob(found)

    assert job.still_due(StateGitHub([]), ME)  # type: ignore[arg-type]
    assert not job.still_due(StateGitHub([], labels=["after:16"]), ME)  # type: ignore[arg-type]


def test_an_agent_woken_by_a_merge_merges_develop_in_first() -> None:
    # #107: #18's branch carried #16's and #17's commits; their squashes fold into develop.
    job = IssueJob(replace(task(18, "unblocked", issue=18), woken=(16, 17)))

    assert str(job) == "#18 (what it builds on has merged)"
    assert (
        "of bateks/PersonalExchangeBot: what it builds on has merged. #16, #17 merged since "
        "Claude's last word: begin by merging `origin/develop` into the branch "
        "(docs/conventions.md → Git workflow).\n\n"
    ) in job.prompt(SLUG, "feature/18-x")
    assert "origin/develop" not in IssueJob(task()).prompt(SLUG, "feature/7-x")


def test_a_waiting_job_answered_meanwhile_is_no_longer_due() -> None:
    job = IssueJob(task(state="reply waiting"))
    asked = {"body": sign("A or B?", ME), "user": {"login": ME}}
    answer = {"body": "B", "user": {"login": ME}}
    replied = {"body": sign("B it is.", ME), "user": {"login": ME}}

    assert job.still_due(StateGitHub([asked, answer]), ME)  # type: ignore[arg-type]
    assert not job.still_due(StateGitHub([asked, answer, replied]), ME)  # type: ignore[arg-type]


def test_ci_on_a_commit_since_replaced_is_no_longer_due() -> None:
    job = IssueJob(task(9, "CI finished", kind="pull", ci="CI: failure", sha="abc"))

    assert job.still_due(StateGitHub([]), ME)  # type: ignore[arg-type]
    assert not job.still_due(StateGitHub([], sha="def"), ME)  # type: ignore[arg-type]


@pytest.mark.parametrize("on", [7, 9], ids=["on the issue", "on the PR"])
def test_ci_read_while_its_job_waited_is_no_longer_due(on: int) -> None:
    # #456: on #449, CI's result came while an agent ran; it read it, and when it ended the
    # job that had waited started another agent for it.
    job = IssueJob(task(9, "CI finished", kind="pull", issue=7, ci="CI: success", sha="abc"))
    before = {"body": sign("Pushed; CI runs.", ME), "user": {"login": ME}}
    after = {"body": sign("CI is green.", ME), "user": {"login": ME}}
    before["created_at"], after["created_at"] = "2026-10-13T21:40:00Z", "2026-10-13T21:55:00Z"

    assert job.still_due(StateGitHub([before], on=on), ME)  # type: ignore[arg-type]
    assert not job.still_due(StateGitHub([before, after], on=on), ME)  # type: ignore[arg-type]


def test_claude_s_move_starts_an_agent_that_carries_on() -> None:
    # #449: a closing handoff that says Claude goes on, waiting on nothing, starts the next one.
    job = IssueJob(task(state="Claude's move"))
    mark = HandoffMark(Machine("DESKTOP-1", "c--git-x"), NOW.astimezone(), closing=True)
    said = f"Plan.\n\n**Next:** the PR (Claude's). **Waiting on:** nothing.\n\n{mark}"
    goes_on: dict[str, object] = {"body": sign(said, ME), "user": {"login": ME}}
    on_it: dict[str, object] = {"body": sign("On it.", ME), "user": {"login": ME}}

    assert str(job) == "#7 (the next move is Claude's)"
    assert "of bateks/PersonalExchangeBot: the next move is Claude's." in job.prompt(SLUG, "x")
    assert job.still_due(StateGitHub([goes_on]), ME)  # type: ignore[arg-type]
    assert not job.still_due(StateGitHub([goes_on, on_it]), ME)  # type: ignore[arg-type]


def test_new_prices_move_from_the_checkout_into_the_agent_s_worktree(tmp_path: Path) -> None:
    checkout, worktree = tmp_path / "repo", tmp_path / "prices"
    for folder in (checkout, worktree):
        (folder / "docs").mkdir(parents=True)
        (folder / "docs" / "claude-prices.csv").write_text("old\n", encoding="utf-8")
    (checkout / "docs" / "claude-prices.csv").write_text("old\nnew\n", encoding="utf-8")
    fake = FakeGit({"checkout -- docs/claude-prices.csv": ""})
    job = PricesJob("prices: x", "Claude's prices changed (claude-opus-5-5)", TODAY)

    job.prepare(worktree, Git(checkout, fake))

    assert (worktree / "docs" / "claude-prices.csv").read_text(encoding="utf-8") == "old\nnew\n"
    assert fake.commands == ["checkout -- docs/claude-prices.csv"]  # the checkout follows again
    assert job.branch(Git(checkout, fake)) == "chore/claude-prices-2026-10-12"
    assert "small chore PR" in job.prompt(SLUG, "chore/claude-prices-2026-10-12")
    # #550: a handoff with its closing comment, so the manager merges it with no agent.
    assert "the closing comment" in job.prompt(SLUG, "chore/claude-prices-2026-10-12")


def test_the_wiki_agent_changes_the_pages_and_the_manager_publishes_them() -> None:
    # #126: the agent edits the wiki's clone only; its commit and push need no rule of its own.
    job = WikiJob(BEHIND, date(2026, 11, 3))
    prompt = job.prompt("albalaeff/Everest-Game", "wiki/2026-11-03")

    assert job.branch(Git(Path("/repo"), FakeGit({}))) == "wiki/2026-11-03"
    assert f"of albalaeff/Everest-Game: {BEHIND.text}\n\n" in prompt
    assert "work on the wiki only" in prompt and "(#124, #127)" in prompt
    assert "its clone is in .agent-runs/wiki here" in prompt
    assert "post nothing on GitHub" in prompt and "Don't commit or push" in prompt
    assert "to 3 November 2026" in prompt and "Changelog.md" in prompt
    assert not job.needs_tools and not job.merges and job.issue is None


def test_the_wiki_is_cloned_into_the_worktree_beside_the_project_s_remote(tmp_path: Path) -> None:
    clone = tmp_path / "wiki" / ".agent-runs" / "wiki"
    url = "https://github.com/albalaeff/Everest-Game.wiki.git"
    fake = FakeGit(
        {"remote get-url origin": "https://github.com/albalaeff/Everest-Game.git"},
        refusals={f"clone -q {url} {clone}": "fatal: repository not found"},
    )

    with pytest.raises(AgentError, match="git clone of the wiki: fatal: repository not found"):
        WikiJob(BEHIND, TODAY).prepare(tmp_path / "wiki", Git(tmp_path, fake))  # tried again later

    assert fake.commands[-1] == f"clone -q {url} {clone}"


class Publishing(WikiJob):
    """A wiki job whose pages are published as `published` says: what it did, or why not."""

    def __init__(self, published: str | AgentError) -> None:
        super().__init__(BEHIND, TODAY)
        self.published = published
        self.concluded: list[Path] = []

    def conclude(self, worktree: Path, git: Git) -> str | None:
        self.concluded.append(worktree)
        if isinstance(self.published, AgentError):
            raise self.published
        return self.published


def wiki_agent(tmp_path: Path, job: Publishing) -> Agent:
    path = (tmp_path / "worktrees" / "wiki").resolve()
    answers = {
        "status --porcelain": "",
        "fetch -q --prune origin": "",
        "rev-list --count HEAD --not --remotes=origin": "0",
        "rev-parse --abbrev-ref HEAD": "wiki/2026-10-12",
        f"worktree remove --force {path}": "",
        "branch -D wiki/2026-10-12": "",
    }
    made = launcher(tmp_path, answers).agent(job)
    made.log.parent.mkdir()
    return made


def test_a_wiki_run_that_ended_well_is_published_and_its_worktree_goes(tmp_path: Path) -> None:
    job = Publishing("the wiki pushed (3 files changed, develop at 1111111)")
    made = wiki_agent(tmp_path, job)

    line = made.finish(0)

    assert job.concluded == [made.worktree.path]
    assert line == (
        "the wiki behind develop: done, the wiki pushed (3 files changed, develop at 1111111); "
        "worktree removed"
    )


def test_a_wiki_that_couldn_t_be_pushed_keeps_the_worktree_with_its_pages(tmp_path: Path) -> None:
    made = wiki_agent(tmp_path, Publishing(AgentError("git push in the wiki's clone: rejected")))

    line = made.finish(0)

    assert line.endswith(": git push in the wiki's clone: rejected")
    assert "worktree kept at " in line


@pytest.mark.parametrize("code", [None, 1], ids=["stopped", "failed"])
def test_a_wiki_run_that_didn_t_end_well_publishes_nothing(
    tmp_path: Path, code: int | None
) -> None:
    job = Publishing("the wiki pushed")

    wiki_agent(tmp_path, job).finish(code)

    assert job.concluded == []


def test_a_wiki_run_that_ended_on_the_usage_limit_publishes_nothing(tmp_path: Path) -> None:
    # It did nothing: the commit would mark develop covered with no page changed.
    job = Publishing("the wiki pushed")
    made = wiki_agent(tmp_path, job)
    result = {"type": "result", "is_error": True, "result": SESSION_LIMIT, "total_cost_usd": 0}
    result["api_error"] = "usage_limit_reached"
    made.log.write_text(json.dumps(result, separators=(",", ":")) + "\n", encoding="utf-8")

    made.finish(0)

    assert made.limit is not None and job.concluded == []


# --- the worktree ------------------------------------------------------------------------------


class FakeUv:
    """A stand-in for subprocess.run with `uv` (`Warmup`): where it ran. Each run takes the
    clock 8 s on, as `uv sync` making a .venv does, and ends as told."""

    def __init__(self, code: int = 0, stderr: str = "", error: Exception | None = None) -> None:
        self.code = code
        self.stderr = stderr
        self.error = error
        self.clock = Clock()
        self.ran: list[tuple[str, Path]] = []

    @property
    def warmup(self) -> Warmup:
        return Warmup(self, self.clock)

    def __call__(self, command: Sequence[str], **options: Any) -> subprocess.CompletedProcess[str]:
        self.ran.append((" ".join(command), Path(options["cwd"])))
        if self.error is not None:
            raise self.error
        self.clock.now += 8
        return subprocess.CompletedProcess(command, self.code, "", self.stderr)


def test_a_new_branch_s_worktree_starts_from_origin_develop(tmp_path: Path) -> None:
    path = tmp_path / "7"
    fake = FakeGit(
        {
            "fetch -q --prune origin": "",
            f"worktree add --no-track -B feature/7-x {path} origin/develop": "",
        }
    )

    said = Worktree(path, "feature/7-x", Git(tmp_path, fake), FakeUv().warmup).ready()

    assert said == "new, from origin/develop; warmed in 8 s: .venv made"  # no caches to copy
    assert f"worktree add --no-track -B feature/7-x {path} origin/develop" in fake.commands


def test_a_branch_on_origin_is_checked_out_as_it_is_there(tmp_path: Path) -> None:
    path = tmp_path / "7"
    fake = FakeGit(
        {
            "rev-parse --verify -q origin/feature/7-x": "abc",
            f"worktree add -B feature/7-x {path} origin/feature/7-x": "",
        }
    )

    said = Worktree(path, "feature/7-x", Git(tmp_path, fake), FakeUv().warmup).ready()

    assert said == "from origin; warmed in 8 s: .venv made"


def test_commits_only_here_are_kept(tmp_path: Path) -> None:
    path = tmp_path / "7"
    fake = FakeGit(
        {
            "rev-list --count refs/heads/feature/7-x --not --remotes=origin": "2",
            "rev-parse --verify -q origin/feature/7-x": "abc",
            f"worktree add {path} feature/7-x": "",
        }
    )

    said = Worktree(path, "feature/7-x", Git(tmp_path, fake), FakeUv().warmup).ready()

    assert said == "with 2 commits only here; warmed in 8 s: .venv made"


def test_an_earlier_agent_s_worktree_is_kept_with_its_work(tmp_path: Path) -> None:
    path = tmp_path / "7"
    path.mkdir()
    fake, uv = FakeGit({}), FakeUv()

    said = Worktree(path, "feature/7-x", Git(tmp_path, fake), uv.warmup).ready()

    assert said == "kept from before"
    assert fake.commands == [] and uv.ran == []  # its caches and its .venv are there already


def test_an_earlier_agent_s_worktree_is_kept_without_its_notes(tmp_path: Path) -> None:
    # #155: the hook puts back the notes in the worktree once Claude Code has compacted the
    # conversation: they're this run's, never an earlier one's.
    path = tmp_path / "7"
    notes = path / NOTES
    notes.parent.mkdir(parents=True)
    notes.write_text("An earlier run's plan.", encoding="utf-8")
    (notes.parent / "plan.md").write_text("A comment it posted.", encoding="utf-8")

    said = Worktree(path, "feature/7-x", Git(tmp_path, FakeGit({})), FakeUv().warmup).ready()

    assert said == "kept from before"
    assert not notes.exists()
    assert (notes.parent / "plan.md").exists()


def test_a_new_worktree_gets_the_checkout_s_caches_and_a_venv_of_its_own(tmp_path: Path) -> None:
    # #444: without mypy's cache an agent's `mypy` run took 60–98 s; with one copied in, 8 s.
    checkout, path = tmp_path / "repo", tmp_path / "7"
    meta = checkout / ".mypy_cache" / "3.14" / "fxbot" / "main.meta.ff"
    example = checkout / ".hypothesis" / "examples" / "1a" / "2b"
    for cached in (meta, example):
        cached.parent.mkdir(parents=True)
        cached.write_bytes(b"cached")
    os.utime(meta, (1_760_000_000, 1_760_000_000))
    fake = FakeGit(
        {
            "fetch -q --prune origin": "",
            f"worktree add --no-track -B feature/7-x {path} origin/develop": "",
        }
    )
    uv = FakeUv()

    said = Worktree(path, "feature/7-x", Git(checkout, fake), uv.warmup).ready()

    assert said == (
        "new, from origin/develop; "
        "warmed in 8 s: .mypy_cache copied, .hypothesis copied, .venv made"
    )
    copy = path / ".mypy_cache" / "3.14" / "fxbot" / "main.meta.ff"
    assert copy.read_bytes() == b"cached"
    assert copy.stat().st_mtime_ns == meta.stat().st_mtime_ns  # mypy drops a file whose time moved
    assert (path / ".hypothesis" / "examples" / "1a" / "2b").read_bytes() == b"cached"
    assert uv.ran == [("uv sync --locked", path)]  # what the agent's first `uv run` would do


def test_a_cache_that_can_t_be_copied_is_said_and_the_agent_starts_anyway(tmp_path: Path) -> None:
    checkout = tmp_path / "repo"
    (checkout / ".mypy_cache").mkdir(parents=True)
    taken = tmp_path / "taken"
    taken.write_text("", encoding="utf-8")  # a file where the worktree's folder would go

    said = FakeUv().warmup.warm(checkout, taken / "7")

    assert said.startswith("warmed in 8 s: .mypy_cache not all copied (")
    assert said.endswith("), .venv made")


@pytest.mark.parametrize(
    ("uv", "why"),
    [
        (
            FakeUv(
                2,
                "warning: `VIRTUAL_ENV=C:\\git\\PersonalExchangeBot\\.venv` does not match the "
                "project environment path `.venv` and will be ignored\n"
                "error: The lockfile at `uv.lock` needs to be updated, but `--locked` was "
                "provided. To update the lockfile, run `uv lock`.\n",
            ),
            "error: The lockfile at `uv.lock` needs to be updated, but `--locked` was provided. "
            "To update the lockfile, run `uv lock`.",
        ),
        (FakeUv(1), "exit 1"),
        (
            FakeUv(error=FileNotFoundError(2, "No such file or directory")),
            "[Errno 2] No such file or directory",
        ),
        (
            FakeUv(error=subprocess.TimeoutExpired(["uv", "sync", "--locked"], 300)),
            "Command '['uv', 'sync', '--locked']' timed out after 300 seconds",
        ),
    ],
    ids=["lock out of date", "silent", "no uv", "too long"],
)
def test_a_venv_uv_couldn_t_make_is_said_and_the_agent_starts_anyway(
    tmp_path: Path, uv: FakeUv, why: str
) -> None:
    said = uv.warmup.warm(tmp_path / "repo", tmp_path / "7")

    assert said.endswith(f": .venv not made (uv sync --locked: {why})")


def test_a_worktree_git_refuses_isn_t_started(tmp_path: Path) -> None:
    with pytest.raises(AgentError, match="git worktree add: fatal: no such thing$"):
        Worktree(tmp_path / "7", "feature/7-x", Git(tmp_path, FakeGit({}))).ready()


@pytest.mark.parametrize(
    "refusal",
    [
        "fatal: 'feature/7-x' is already checked out at 'C:/git/PersonalExchangeBot'",
        "fatal: 'feature/7-x' is already used by worktree at 'C:/git/PersonalExchangeBot'",
    ],  # git's words before 2.42, and since
)
def test_a_branch_checked_out_elsewhere_says_to_switch_that_checkout_back(
    tmp_path: Path, refusal: str
) -> None:
    # #409: a person ran an agent's commands in the checkout, which stayed on the branch.
    path = tmp_path / "7"
    fake = FakeGit(
        {"rev-parse --verify -q origin/feature/7-x": "abc"},
        {f"worktree add -B feature/7-x {path} origin/feature/7-x": refusal},
    )

    with pytest.raises(AgentError) as raised:
        Worktree(path, "feature/7-x", Git(tmp_path, fake)).ready()

    assert str(raised.value) == (
        f"git worktree add: {refusal} (switch that checkout back to develop: "
        "`git switch develop` there)"
    )


@pytest.mark.parametrize(
    ("answers", "kept"),
    [
        ({"status --porcelain": " M README.md\n?? notes.md"}, "2 uncommitted changes"),
        (
            {
                "rev-list --count HEAD --not --remotes=origin": "1",
                "rev-parse --abbrev-ref HEAD": "feature/7-x",
                "for-each-ref --format=%(upstream:track) refs/heads/feature/7-x": "",
            },
            "1 commit not on origin",
        ),
        (
            {
                "rev-list --count HEAD --not --remotes=origin": "3",
                "rev-parse --abbrev-ref HEAD": "feature/7-x",
                "for-each-ref --format=%(upstream:track) refs/heads/feature/7-x": "[gone]",
            },
            None,  # merged, and GitHub deleted the branch
        ),
        ({"rev-list --count HEAD --not --remotes=origin": "0"}, None),  # all of it pushed
    ],
    ids=["changes", "unpushed", "merged", "pushed"],
)
def test_what_keeps_a_worktree(tmp_path: Path, answers: dict[str, str], kept: str | None) -> None:
    fake = FakeGit({"status --porcelain": "", **answers})

    assert Worktree(tmp_path / "7", "feature/7-x", Git(tmp_path, fake)).leftover() == kept


def test_a_worktree_goes_with_its_branch_here(tmp_path: Path) -> None:
    path = tmp_path / "7"
    fake = FakeGit(
        {
            "rev-parse --abbrev-ref HEAD": "feature/7-x",
            f"worktree remove --force {path}": "",
            "branch -D feature/7-x": "",
        }
    )

    Worktree(path, "feature/7-x", Git(tmp_path, fake)).remove()

    assert fake.commands[-2:] == [f"worktree remove --force {path}", "branch -D feature/7-x"]


class Repositories:
    """Real git, for what keeps a worktree after a merge (#436): GitHub (a bare repository),
    the checkout, and an agent's worktree in it on feature/7-x."""

    BRANCH: ClassVar[str] = "feature/7-x"

    def __init__(self, root: Path) -> None:
        self.github = root / "github.git"
        self.checkout = root / "repo"
        self.path = root / "7"
        self.git(root, "init", "-q", "--bare", "-b", "develop", str(self.github))
        self.git(root, "init", "-q", "-b", "develop", str(self.checkout))
        self.commit(self.checkout, {"README.md": "fxbot\n", "docs/old.md": "old\n"})
        self.git(self.checkout, "remote", "add", "origin", str(self.github))
        self.git(self.checkout, "push", "-q", "origin", "develop")

    @staticmethod
    def git(at: Path, *args: str) -> str:
        done = subprocess.run(
            ["git", "-C", str(at), *args], capture_output=True, text=True, check=True
        )
        return done.stdout.strip()

    def branch(self, upstream: str = "--no-track") -> None:
        """The agent's worktree, from origin/develop: with no upstream, as the manager makes
        it, or one that `--track`s origin/develop, as `git switch -c … origin/develop` does."""
        add = ("worktree", "add", "-q", upstream, "-b", self.BRANCH, str(self.path))
        self.git(self.checkout, *add, "origin/develop")

    def commit(self, at: Path, files: Mapping[str, str | None]) -> None:
        """Writes the files, removes those given None, and commits them."""
        for name, text in files.items():
            file = at / name
            if text is None:
                file.unlink()
            else:
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_text(text, encoding="utf-8", newline="\n")
        self.git(at, "add", "-A")
        self.git(at, "commit", "-q", "-m", "work")

    def push(self) -> None:
        """Without -u, so the branch gets no upstream of its own."""
        self.git(self.path, "push", "-q", "origin", self.BRANCH)

    def squash_merge(self) -> None:
        """GitHub squash-merges the PR into develop, then deletes its branch."""
        tree = f"{self.BRANCH}^{{tree}}"  # develop hasn't moved since the branch left it
        squashed = self.git(self.github, "commit-tree", tree, "-p", "develop", "-m", "The work")
        self.git(self.github, "update-ref", "refs/heads/develop", squashed)
        self.git(self.github, "update-ref", "-d", f"refs/heads/{self.BRANCH}")

    def develop_changes(self, files: Mapping[str, str | None]) -> None:
        """Another PR, merged after this one."""
        self.git(self.checkout, "pull", "-q", "--ff-only", "origin", "develop")
        self.commit(self.checkout, files)
        self.git(self.checkout, "push", "-q", "origin", "develop")

    def leftover(self) -> str | None:
        return Worktree(self.path, self.BRANCH, Git(self.checkout)).leftover()


@pytest.fixture
def repositories(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Repositories:
    """With none of the developer's git settings (a signing key, hooks), and a name to
    commit as."""
    settings = tmp_path / "gitconfig"
    settings.write_text("", encoding="utf-8")
    monkeypatch.setenv("GIT_CONFIG_GLOBAL", str(settings))
    monkeypatch.setenv("GIT_CONFIG_NOSYSTEM", "1")
    for who in ("AUTHOR", "COMMITTER"):
        monkeypatch.setenv(f"GIT_{who}_NAME", "Claude")
        monkeypatch.setenv(f"GIT_{who}_EMAIL", "claude@example.com")
    return Repositories(tmp_path)


@pytest.mark.parametrize("upstream", ["--no-track", "--track"], ids=["none", "develop's"])
def test_a_squash_merged_branch_s_worktree_goes_though_no_upstream_is_gone(
    repositories: Repositories, upstream: str
) -> None:
    # #436: pushed without -u, it had no upstream of its own to be [gone] once merged, so its
    # commits, on no remote now, kept the worktree for good.
    repositories.branch(upstream)
    moved = {"docs/old.md": None, "docs/moved.md": "old\n"}
    repositories.commit(repositories.path, {"README.md": "fxbot, better\n", **moved})
    repositories.push()
    repositories.squash_merge()

    assert repositories.leftover() is None


def test_commits_develop_hasn_t_got_keep_the_worktree(repositories: Repositories) -> None:
    repositories.branch()
    repositories.commit(repositories.path, {"README.md": "fxbot, better\n"})
    repositories.push()
    repositories.squash_merge()
    repositories.commit(repositories.path, {"docs/old.md": None})  # after the merge

    assert repositories.leftover() == "2 commits not on origin"


def test_a_file_develop_changed_since_keeps_the_worktree(repositories: Repositories) -> None:
    # As before #436: whether develop's change came after the branch's isn't told, so it stays.
    repositories.branch()
    repositories.commit(repositories.path, {"README.md": "fxbot, better\n"})
    repositories.push()
    repositories.squash_merge()
    repositories.develop_changes({"README.md": "fxbot, better still\n"})

    assert repositories.leftover() == "1 commit not on origin"


# --- the agent -------------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class NotedDatabase(TestDatabase):
    """An agent's test database, whose dropping is only noted, in `dropped`."""

    dropped: list[str] = field(default_factory=list)

    def drop(self) -> None:
        self.dropped.append(self.slot)


def launcher(
    tmp_path: Path,
    answers: dict[str, str] | None = None,
    dropped: list[str] | None = None,
    **settings: Any,
) -> Launcher:
    """`answers`: git's in the checkout (`FakeGit`); `dropped`: the test databases dropped."""
    noted = dropped if dropped is not None else []
    return Launcher(
        ManagerConfig(worktree_dir="worktrees", **settings),
        Git(tmp_path, FakeGit(answers or {})),
        "claude",
        SLUG,
        runs=tmp_path / ".agent-runs",
        now=lambda: NOW,
        database=lambda slot: NotedDatabase(slot, SERVER, dropped=noted),
    )


def agent(
    tmp_path: Path, labels: Sequence[str] = ("model:haiku", "effort:high"), **settings: Any
) -> Agent:
    return launcher(tmp_path, **settings).agent(IssueJob(task(labels=labels)))


def test_a_worktree_an_agent_left_is_work_begun(tmp_path: Path) -> None:
    # #485: an agent stopped on it (Ctrl+C) kept its worktree, and maybe never said a word.
    (tmp_path / "worktrees" / "7").mkdir(parents=True)

    assert launcher(tmp_path).kept(IssueJob(task(7)))
    assert not launcher(tmp_path).kept(IssueJob(task(8, issue=8)))


def test_a_worktree_an_agent_left_with_work_in_it_says_what(tmp_path: Path) -> None:
    # #550: the manager merges no PR whose worktree holds what GitHub hasn't got.
    made = launcher(tmp_path, {"status --porcelain": " M README.md"})

    assert made.leftover(merge()) is None  # no worktree
    (tmp_path / "worktrees" / "7").mkdir(parents=True)
    assert made.leftover(merge()) == "1 uncommitted change"


def test_a_merged_pr_s_worktree_goes_with_its_branch_and_test_database(tmp_path: Path) -> None:
    # #550: as an agent's goes at its end, once nothing in it is missing from GitHub.
    path = tmp_path / "worktrees" / "7"
    answers = {
        "rev-parse --abbrev-ref HEAD": "feature/7-x",
        f"worktree remove --force {path}": "",
        "branch -D feature/7-x": "",
    }
    dropped: list[str] = []
    made = launcher(tmp_path, answers, dropped)

    assert made.clear(merge()) is None  # none was left
    path.mkdir(parents=True)
    assert made.clear(merge()) == "worktree removed"
    assert dropped == ["7"]


def test_an_agent_runs_with_its_issue_s_power_in_its_own_worktree(tmp_path: Path) -> None:
    made = agent(tmp_path)

    assert made.power == AgentPower("haiku", "high")
    assert made.worktree.path == (tmp_path / "worktrees" / "7").resolve()
    assert made.worktree.branch == "feature/7-location-rule-fine-tuning"
    assert made.worktree.warmup == Warmup()  # uv itself, when it's new
    assert made.database.name == "everest_7_test"
    assert made.log == tmp_path / ".agent-runs" / "7.log"


def test_no_label_runs_on_the_defaults(tmp_path: Path) -> None:
    assert agent(tmp_path, labels=()).power == AgentPower("opus", "xhigh")


def test_the_command_is_headless_claude_code_that_never_waits_for_a_person(
    tmp_path: Path,
) -> None:
    command = agent(tmp_path).command()

    assert command[:2] == ["claude", "-p"]
    flags = " ".join(command[3:])
    assert "--model haiku --effort high" in flags
    assert "--permission-mode acceptEdits --permission-prompts none" in flags
    assert "--output-format stream-json --verbose" in flags


def test_an_agent_is_offered_only_what_it_can_use(tmp_path: Path) -> None:
    # #443: what it's offered it pays for on every reply. Its user's MCP servers, skills and
    # settings are of no use to it. The web it gets for the knowledge base's sources (#11),
    # as far as .claude/settings.json's rules allow.
    command = agent(tmp_path).command()

    assert "--strict-mcp-config" in command
    assert command[command.index("--setting-sources") + 1] == "project,local"
    tools = command[command.index("--tools") + 1].split(",")
    assert {"Bash", "Read", "Edit", "Write", "Glob", "Grep", "WebFetch", "WebSearch"} <= set(tools)
    assert "Agent" not in tools
    # #551: no agent invoked a skill, and every PowerShell call had a Bash form.
    assert not {"Skill", "PowerShell"} & set(tools)


def test_an_agent_reads_only_the_sites_settings_name() -> None:
    # Nobody approves a page in a run nobody watches: a WebFetch rule names its site, so an
    # agent reads the knowledge base's sources and nothing else (#11, #12, #13).
    settings = Path(__file__).resolve().parents[1] / ".claude" / "settings.json"
    allow = json.loads(settings.read_text(encoding="utf-8"))["permissions"]["allow"]
    fetches = [rule for rule in allow if rule.startswith("WebFetch")]

    assert fetches
    assert all(re.fullmatch(r"WebFetch\(domain:[a-z0-9.-]+\.[a-z]+\)", rule) for rule in fetches)
    assert len(set(fetches)) == len(fetches)


def test_an_agent_has_no_auto_memory(tmp_path: Path) -> None:
    # #551: the machine's memory is a session's notes, and agents never write it (CLAUDE.md).
    env = agent(tmp_path).environment({"PATH": "/bin"})

    assert env["CLAUDE_CODE_DISABLE_AUTO_MEMORY"] == "1"


def test_an_agent_s_environment_says_its_power_and_its_test_database(tmp_path: Path) -> None:
    env = agent(tmp_path).environment(
        {"PATH": "/bin", "CLAUDECODE": "1", "CLAUDE_EFFORT": "max", "VIRTUAL_ENV": "/repo/.venv"}
    )

    assert env["PATH"] == "/bin"
    assert AgentPower.of_agent(env) == AgentPower("haiku", "high")
    assert env["TEST_DATABASE_URL"].endswith("/everest_7_test")
    assert not {"CLAUDECODE", "CLAUDE_EFFORT", "VIRTUAL_ENV"} & set(env)  # the session's


def test_an_agent_s_conversation_is_compacted_where_the_settings_say(tmp_path: Path) -> None:
    # #441: every reply reads the whole conversation again, so an agent's is compacted early,
    # at a quarter of the window unless agent-manager.toml says otherwise. A share set for
    # the person's own sessions isn't the agents'.
    base = {"PATH": "/bin", "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "20"}

    default = agent(tmp_path).environment(base)
    half = agent(tmp_path, compact_at_percent=50).environment(base)

    assert CompactShare.from_env(default) == CompactShare(25)
    assert CompactShare.from_env(half) == CompactShare(50)


def test_an_issue_s_compact_label_gives_its_agent_more_of_the_window(tmp_path: Path) -> None:
    # #152: put on by the manager after a run that compacted again and again, or by a person.
    labelled = agent(tmp_path, labels=("model:fable", "compact:50"))

    assert labelled.compaction == CompactShare(50)
    assert CompactShare.from_env(labelled.environment({})) == CompactShare(50)
    assert str(labelled).startswith("fable/xhigh, compacted at 50%, in ")  # the log's line
    assert agent(tmp_path).compaction == CompactShare(25)


def test_the_dry_run_says_issue_power_worktree_and_command(tmp_path: Path) -> None:
    plan = agent(tmp_path).plan()

    assert plan.startswith("#7 (it's to start): haiku/high, compacted at 25%, in ")
    assert "everest_7_test" in plan
    assert "\n  $ claude -p " in plan and "--model haiku --effort high" in plan


def test_a_model_the_account_lacks_is_avoided_from_then_on(tmp_path: Path) -> None:
    # #4: Fable is on some plans only. Once a run has ended on the account's refusal of it,
    # the launcher runs that model's agents on the next one down, with their own effort.
    made = launcher(tmp_path)
    fable = IssueJob(task(labels=("model:fable", "effort:max")))
    assert made.agent(fable).power == AgentPower("fable", "max")

    assert made.avoid("fable") == "opus"

    assert made.agent(fable).power == AgentPower("opus", "max")
    assert made.agent(IssueJob(task(labels=()))).power == AgentPower("opus", "xhigh")
    assert made.avoid("opus") == "sonnet"
    assert made.agent(fable).power == AgentPower("sonnet", "max")


def test_a_run_s_result_is_read_from_its_log(tmp_path: Path) -> None:
    log = tmp_path / "7.log"
    result = {
        "type": "result",
        "total_cost_usd": 1.234,
        "duration_ms": 720_000,
        "permission_denials": [{"tool_name": "Bash", "tool_input": {"command": "rm -rf x"}}],
    }
    log.write_text(
        "=== earlier run\n"
        + json.dumps({"type": "result", "total_cost_usd": 9}, separators=(",", ":"))
        + "\n=== this run\n"
        + json.dumps({"type": "assistant"}, separators=(",", ":"))
        + "\n"
        + json.dumps(result, separators=(",", ":"))
        + "\n",
        encoding="utf-8",
    )
    offset = log.read_text(encoding="utf-8").index("=== this run")

    found = AgentResult.read(log, offset)

    assert str(found) == "$1.23, 12 min, 1 refusal: Bash(rm -rf x)"
    assert str(AgentResult.read(tmp_path / "none.log")) == ""


def test_a_run_s_result_is_found_wherever_its_type_sits(tmp_path: Path) -> None:
    # #387's trial: Claude Code writes "type" in the middle of its result, and an assistant's
    # text may quote a result; only a line that is one counts.
    log = tmp_path / "402.log"
    quoted = {"type": "assistant", "message": {"content": [{"text": '{"type":"result"}'}]}}
    result = {
        "duration_api_ms": 5771,
        "total_cost_usd": 0.0049,
        "type": "result",
        "duration_ms": 15_439,
        "permission_denials": [
            {"tool_name": "Bash", "tool_input": {"command": "uv run python scripts/github.py"}}
        ],
    }
    log.write_text(
        "\n".join(json.dumps(line, separators=(",", ":")) for line in (result, quoted)) + "\n",
        encoding="utf-8",
    )

    found = AgentResult.read(log)

    assert str(found) == "$0.00, 0 min, 1 refusal: Bash(uv run python scripts/github.py)"


def test_a_run_in_parts_is_read_from_all_of_them(tmp_path: Path) -> None:
    # #330's run (#408): a background task woke the agent again, so Claude Code wrote a result
    # for each part. The cost is a running total; the minutes and the refusals are each part's.
    log = tmp_path / "330.log"
    first = {
        "type": "result",
        "session_id": "s",
        "total_cost_usd": 11.22,
        "duration_ms": 1_548_000,
        "num_turns": 252,
        "permission_denials": [
            {"tool_name": "Bash", "tool_input": {"command": "uv run pytest | tail"}},
            {"tool_name": "Monitor"},
        ],
    }
    second = {
        "type": "result",
        "session_id": "s",
        "total_cost_usd": 12.49,
        "duration_ms": 192_000,
        "num_turns": 18,
        "permission_denials": [{"tool_name": "Bash", "tool_input": {"command": "$env:X"}}],
    }
    log.write_text(
        "\n".join(
            json.dumps(line, separators=(",", ":"))
            for line in (first, {"type": "assistant"}, second)
        )
        + "\n",
        encoding="utf-8",
    )

    found = AgentResult.read(log)

    assert str(found) == (
        "$12.49, 29 min, 3 refusals: Bash(uv run pytest | tail), Monitor, Bash($env:X)"
    )


def test_a_run_s_result_says_what_its_first_reply_read(tmp_path: Path) -> None:
    # #443: what an agent is offered (tools, skills, CLAUDE.md) it reads again on every
    # reply, so the last line says how much that is: what its first reply read.
    def reply(written: int, read: int) -> dict[str, Any]:
        usage = {
            "input_tokens": 3,
            "cache_creation_input_tokens": written,
            "cache_read_input_tokens": read,
            "output_tokens": 120,
        }
        return {"type": "assistant", "message": {"usage": usage}}

    log = tmp_path / "7.log"
    lines = (
        {"type": "system", "subtype": "init"},
        {"type": "assistant", "message": {"content": []}},  # no usage: not a reply's
        reply(16_400, 15_800),
        reply(900, 32_200),
        {"type": "result", "total_cost_usd": 0.5},
    )
    log.write_text(
        "".join(json.dumps(line, separators=(",", ":")) + "\n" for line in lines),
        encoding="utf-8",
    )

    found = AgentResult.read(log)

    assert found.context == 32_203
    assert str(found) == "$0.50, first reply 32K tokens"


def test_a_run_that_ended_on_the_usage_limit_says_so(tmp_path: Path) -> None:
    # #476: #440's run of 2026-10-14 09:34, which ended within a minute, having done nothing.
    made = agent(tmp_path)
    made.log.parent.mkdir()
    result = {
        "type": "result",
        "subtype": "success",
        "is_error": True,
        "api_error": "usage_limit_reached",
        "duration_ms": 1_200,
        "result": SESSION_LIMIT,
        "total_cost_usd": 0,
    }
    made.log.write_text(json.dumps(result, separators=(",", ":")) + "\n", encoding="utf-8")

    line = made.finish(1)

    assert made.limit == UsageLimit(SESSION_LIMIT)
    assert line.startswith(
        "#7 (it's to start): failed (exit 1), $0.00, 0 min, ended on the usage limit; "
        "worktree kept at "
    )


def test_a_run_that_failed_otherwise_holds_nothing(tmp_path: Path) -> None:
    made = agent(tmp_path)
    made.log.parent.mkdir()
    result = {"type": "result", "is_error": True, "result": "API Error: 500", "total_cost_usd": 1}
    made.log.write_text(json.dumps(result, separators=(",", ":")) + "\n", encoding="utf-8")

    made.finish(1)

    assert made.limit is None
    assert made.unavailable is None
    assert not made.thrashed


@pytest.mark.parametrize(
    "said",
    [
        {"api_error": "autocompact_thrashing", "terminal_reason": "rapid_refill_breaker"},
        {"api_error": "autocompact_thrashing"},
        {"terminal_reason": "rapid_refill_breaker"},
    ],
)
def test_a_run_claude_code_stopped_for_compacting_again_and_again_says_so(
    tmp_path: Path, said: dict[str, str]
) -> None:
    # #152: #26's run of 2026-11-05 07:09 read 300K tokens to begin, past a quarter of the
    # window, and read them again after each compaction, until Claude Code stopped it.
    made = agent(tmp_path)
    made.log.parent.mkdir()
    result = {
        "type": "result",
        "subtype": "success",
        "is_error": True,
        **said,
        "duration_ms": 2_079_838,
        "result": THRASHING,
        "total_cost_usd": 27.873306900000006,
    }
    made.log.write_text(json.dumps(result, separators=(",", ":")) + "\n", encoding="utf-8")

    line = made.finish(1)

    assert made.thrashed
    assert made.limit is None and made.unavailable is None
    assert line.startswith(
        "#7 (it's to start): failed (exit 1), $27.87, 35 min, compacted again and again; "
        "worktree kept at "
    )


def test_a_run_whose_model_the_account_lacks_says_so(tmp_path: Path) -> None:
    # #4: Fable is on some plans only; elsewhere the run ends at once on the API's refusal.
    made = agent(tmp_path, labels=("model:fable", "effort:high"))
    made.log.parent.mkdir()
    result = {
        "type": "result",
        "subtype": "success",
        "is_error": True,
        "duration_ms": 900,
        "result": NO_FABLE,
        "total_cost_usd": 0,
    }
    made.log.write_text(json.dumps(result, separators=(",", ":")) + "\n", encoding="utf-8")

    line = made.finish(1)

    assert made.unavailable == ModelUnavailable("fable", NO_FABLE)
    assert made.limit is None
    assert line.startswith(
        "#7 (it's to start): failed (exit 1), $0.00, 0 min, the account lacks the model fable; "
        "worktree kept at "
    )


@pytest.mark.parametrize(
    "said",
    [
        NO_FABLE,
        'API Error: 403 {"type":"error","error":{"type":"permission_error","message":"Your '
        'organization does not have access to the model claude-fable-5-1"}}',
        "API Error: 400 invalid model: fable",
        "The model fable is not available on your plan.",
    ],
)
def test_a_refusal_that_names_the_model_is_the_account_lacking_it(said: str) -> None:
    result = {"type": "result", "is_error": True, "result": said}

    assert ModelUnavailable.of(result, "fable") == ModelUnavailable("fable", said)


@pytest.mark.parametrize(
    "result",
    [
        {"type": "result", "is_error": True, "result": "API Error: 500 overloaded"},
        {"type": "result", "is_error": True, "result": "API Error: 529 the model is overloaded"},
        {"type": "result", "is_error": False, "result": "The model fable is not available: said"},
        {
            "type": "result",
            "is_error": True,
            "api_error": "usage_limit_reached",
            "result": "You've hit your session limit; the model fable is not available now",
        },
    ],
)
def test_other_errors_aren_t_a_missing_model(result: dict[str, Any]) -> None:
    # Overloads, a successful run that mentions the model, and the usage limit (its own case).
    assert ModelUnavailable.of(result, "fable") is None


@pytest.mark.parametrize(
    ("said", "resets"),
    [
        (SESSION_LIMIT, datetime(2026, 10, 14, 12, 0, tzinfo=PRAGUE)),
        ("resets 12:30am (Europe/Prague)", datetime(2026, 10, 15, 0, 30, tzinfo=PRAGUE)),
        ("resets 3pm (America/New_York)", datetime(2026, 10, 14, 21, 0, tzinfo=PRAGUE)),
        ("resets 12pm", datetime(2026, 10, 14, 12, 0, tzinfo=PRAGUE)),  # the machine's zone
        ("resets 12pm (Mars/Olympus)", datetime(2026, 10, 14, 12, 0, tzinfo=PRAGUE)),
        ("weekly limit · resets Oct 20, 10am", datetime(2026, 10, 20, 10, 0, tzinfo=PRAGUE)),
        ("resets 8am (Europe/Prague)", datetime(2026, 10, 15, 8, 0, tzinfo=PRAGUE)),  # tomorrow's
        # Passed under an hour ago: our clock is ahead, so a minute on, not tomorrow.
        ("resets 9am (Europe/Prague)", datetime(2026, 10, 14, 9, 34, tzinfo=PRAGUE)),
        ("You've hit your session limit", datetime(2026, 10, 14, 10, 33, tzinfo=PRAGUE)),
        ("resets in 5 hours", datetime(2026, 10, 14, 10, 33, tzinfo=PRAGUE)),  # no time: an hour
    ],
)
def test_a_usage_limit_resets_when_it_says(said: str, resets: datetime) -> None:
    assert UsageLimit(said).resets(LIMIT_HIT) == resets


def test_a_child_is_stopped_with_what_it_started() -> None:
    process = subprocess.Popen(
        [sys.executable, "-c", "import time; time.sleep(60)"], **Child.options()
    )

    Child.stop(process)

    assert process.poll() is not None


# --- a green PR's merge, without an agent (#550) ---------------------------------------------


HERE = Machine("LAPTOP-1", "c--git-x")
MERGED_AT = datetime(2026, 10, 17, 12, 6, tzinfo=PRAGUE)
HANDED_OFF = "2026-10-17T09:50:00Z"  # while CI ran
CI_ENDED = "2026-10-17T10:00:00Z"
LATER = "2026-10-17T10:02:00Z"
CLOSING = "Done: the location rule is finer.\n\n- To check by hand: nothing in the browser."


def said(body: str, login: str = ME, at: str = LATER) -> dict[str, object]:
    return {"body": body, "user": {"login": login}, "created_at": at, "html_url": "x"}


def handed_off(
    next_: str = "merge #9 once CI is green (the manager's).", closing: str | None = CLOSING
) -> dict[str, object]:
    """The handoff an agent leaves once CI is all that's left: the PR opened, a fix pushed."""
    carried = (
        f"- Closing comment:\n<!-- closing -->\n{closing}\n<!-- /closing -->\n" if closing else ""
    )
    text = (
        f"PR #9 is open; CI runs.\n\n**Next:** {next_} **Waiting on:** CI on #9.\n\n"
        f"<details><summary>For the next session</summary>\n\n- PR: #9\n{carried}\n</details>"
    )
    mark = HandoffMark(HERE, NOW.astimezone(), Decimal("2.10"), closing=True)
    return said(sign(mark.ending(text), ME, AgentPower("opus", "xhigh")), at=HANDED_OFF)


class MergeGitHub:
    """Issue #7 and its PR #9 as GitHub has them once CI is green on the PR's commit `a`. What
    the manager writes, it notes in `asked`, answering as GitHub does: the merge with `refused`
    when that's set. The first `unworked` looks at the PR find its mergeability not worked out
    yet; `meanwhile` comes on #7 as its title changes."""

    def __init__(self) -> None:
        self.pull: dict[str, Any] = {
            "number": 9,
            "state": "open",
            "title": "Location rule: finer",
            "body": "Closes #7",
            "base": {"ref": "develop"},
            "head": {"sha": "a", "ref": "feature/7-location-rule"},
            "mergeable": True,
            "mergeable_state": "clean",
        }
        user = {"login": ME}
        self.entries: dict[int, dict[str, Any]] = {
            7: {"number": 7, "title": "[~$40] Location rule", "state": "open", "user": user},
            9: {"number": 9, "title": "Location rule: finer", "state": "open", "user": user},
        }
        for entry in self.entries.values():
            entry["labels"] = []
        self.entries[9]["pull_request"] = {}
        self.comments: dict[int, list[dict[str, object]]] = {7: [handed_off()], 9: []}
        self.reviews: list[dict[str, object]] = []
        self.runs: list[dict[str, object]] = [
            {"name": "CI", "status": "completed", "conclusion": "success", "updated_at": CI_ENDED}
        ]
        self.asked: list[tuple[str, str, Any]] = []
        self.refused: str | None = None
        self.unworked = 0
        self.meanwhile: list[dict[str, object]] = []

    def call(self, method: str, path: str, body: Any = None) -> Any:
        if method != "GET":
            self.asked.append((method, path, body))
        if path == "/user":
            return {"login": ME}
        if path.startswith("actions/runs?head_sha="):
            assert path.endswith("=a")
            return {"workflow_runs": self.runs}
        if path.startswith("pulls?"):
            return [self.pull]
        if path == "pulls/9/reviews?per_page=100":
            return self.reviews
        if path == "pulls/9/merge":
            if self.refused:
                raise SystemExit(f"PUT /repos/{SLUG}/pulls/9/merge: HTTP 409: {self.refused}")
            return {"sha": "c98c72b" + "0" * 33, "merged": True}
        if path == "pulls/9":
            self.unworked -= 1
            unknown = {"mergeable": None, "mergeable_state": "unknown"}
            return self.pull | (unknown if self.unworked >= 0 else {})
        number = int(path.split("/")[1])  # issues/<n>…
        if path.endswith("/comments?per_page=100"):
            return self.comments[number]
        if path.endswith("/comments"):
            self.comments[number].append(said(body["body"], at="2026-10-17T10:05:00Z"))
            return self.comments[number][-1]
        if method == "PATCH":
            self.entries[number] |= body
            self.comments[number] += self.meanwhile
        return self.entries[number]

    def writes(self) -> list[str]:
        return [f"{method} {path}" for method, path, _ in self.asked]


class Worktrees:
    """The launcher's part in a merge: a worktree an earlier agent `kept`, holding `left`."""

    def __init__(self, kept: bool = False, left: str | None = None) -> None:
        self.kept = kept
        self.left = left
        self.cleared: list[str] = []

    def leftover(self, job: Job) -> str | None:
        return self.left

    def clear(self, job: Job) -> str | None:
        self.cleared.append(job.slot)
        return "worktree removed" if self.kept else None


def self_merge(
    github: MergeGitHub, worktrees: Worktrees | None = None
) -> tuple[SelfMerge, list[float]]:
    """The manager's merge, with what its waits for GitHub slept."""
    slept: list[float] = []
    made = SelfMerge(
        github,  # type: ignore[arg-type]
        ME,
        worktrees or Worktrees(),  # type: ignore[arg-type]
        cost_of=lambda number, pulls: IssueCost(number, dollars=Decimal("2.6")),
        here=lambda: HERE,
        now=lambda: MERGED_AT,
        sleep=slept.append,
    )
    return made, slept


def test_a_green_pr_is_merged_with_the_closing_comment_its_agent_left() -> None:
    # #550: 14 of 16 green runs were an agent doing just this, for about $0.35 each.
    github = MergeGitHub()
    made, slept = self_merge(github)

    line = made.merge(merge())

    assert github.writes() == ["PATCH issues/7", "POST issues/7/comments", "PUT pulls/9/merge"]
    assert github.asked[0][2] == {"title": "[$3] [~$40] Location rule"}
    assert github.asked[1][2]["body"] == (
        "_Claude Code agent manager (bateks)_\n\n"
        f"{CLOSING}\n\n"
        "Cost: $3 (estimate ~$40).\n\n"
        "**Next:** nothing; the merge closes it. **Waiting on:** nothing.\n\n"
        "<details><summary>For the next session</summary>\n\n"
        "- Branch: `feature/7-location-rule`, merged into `develop` by squash; GitHub deletes it.\n"
        "- PR: #9, merged by the agent manager once CI was green (#550).\n\n"
        "</details>\n\n"
        f"{HandoffMark(HERE, MERGED_AT, Decimal('2.6'), closing=True)}"
    )
    assert github.asked[2][2]["sha"] == "a"  # the commit CI ran on: GitHub refuses a newer one
    assert line == (
        "merged it itself, no agent: Merged PR #9 into develop as c98c72b: "
        "Location rule: finer (#9)"
    )
    assert slept == []
    # Claude's word, not a person's reply waiting for an agent.
    assert Conversation(github.entries[7], github.comments[7], ME).item().state == "in progress"


def test_a_pr_for_no_issue_is_merged_with_the_closing_comment_on_itself() -> None:
    # A chore PR (the prices' rows): no issue to close or retitle.
    github = MergeGitHub()
    github.pull.update(body="New prices.", head={"sha": "a", "ref": "chore/claude-prices"})
    github.comments = {9: [handed_off()]}
    made, _ = self_merge(github)

    made.merge(merge(9, issue=None))

    assert github.writes() == ["POST issues/9/comments", "PUT pulls/9/merge"]
    assert "Cost:" not in github.asked[0][2]["body"]


def test_a_worktree_an_earlier_agent_left_goes_once_merged() -> None:
    worktrees = Worktrees(kept=True)
    made, _ = self_merge(MergeGitHub(), worktrees)

    line = made.merge(merge())

    assert worktrees.cleared == ["7"]
    assert line.endswith("(#9); worktree removed")


def unworked(github: MergeGitHub) -> None:
    github.unworked = 9


REFUSALS: list[tuple[Callable[[MergeGitHub], object], str]] = [
    (lambda github: github.pull.update(state="closed"), "PR #9 is closed"),
    (
        lambda github: github.pull["head"].update(sha="b"),
        "PR #9 is at b now, not at a, where CI ran",
    ),
    (
        lambda github: github.pull.update(mergeable=False, mergeable_state="dirty"),
        "GitHub says PR #9 can't be merged as it is (dirty)",
    ),
    (unworked, "GitHub says PR #9 can't be merged as it is (unknown)"),
    (lambda github: github.pull.update(body="Part of #7"), "PR #9 doesn't say it closes #7"),
    (
        lambda github: github.runs.append(
            {"name": "Docs", "status": "completed", "conclusion": "skipped", "updated_at": LATER}
        ),
        "not every CI run at a succeeded (CI: success, Docs: skipped)",
    ),
    (
        lambda github: github.entries[7]["labels"].append({"name": "postponed"}),
        "#7 is set aside (postponed)",
    ),
    (
        lambda github: github.entries[9]["labels"].append({"name": "waiting:albalaeff"}),
        "#9 waits on someone (waiting:albalaeff)",
    ),
    (lambda github: github.entries[7].update(state="closed"), "#7 is closed"),
    (
        lambda github: github.comments[7].append(said("Hold on.")),
        "the last word on it isn't Claude's handoff",
    ),
    (
        lambda github: github.comments[9].append(said("Hold on.", login="albalaeff")),
        "the last word on it isn't Claude's handoff",
    ),
    (
        lambda github: github.comments[7].__setitem__(0, handed_off(closing=None)),
        "Claude's handoff carries no closing comment",
    ),
    (
        lambda github: github.comments[7].__setitem__(0, handed_off("the PR (Claude's).")),
        "Claude's handoff doesn't name the merge as next",
    ),
    (
        lambda github: github.reviews.append(
            {"state": "COMMENTED", "submitted_at": LATER, "user": {"login": "albalaeff"}}
        ),
        "PR #9 has a review since Claude's handoff",
    ),
]


@pytest.mark.parametrize(
    ("change", "why"),
    REFUSALS,
    ids=[
        "closed",
        "moved on",
        "conflicts",
        "mergeability unknown",
        "closes no issue",
        "a run not a success",
        "postponed",
        "waits on a person",
        "issue closed",
        "a reply on the issue",
        "a reply on the PR",
        "no closing comment",
        "next isn't the merge",
        "a review",
    ],
)
def test_a_merge_any_check_fails_goes_to_an_agent_with_nothing_written(
    change: Callable[[MergeGitHub], object], why: str
) -> None:
    # #525 (green, but conflicting with develop) would have gone to an agent, as before.
    github = MergeGitHub()
    change(github)
    made, _ = self_merge(github)

    with pytest.raises(NotMerged) as refused:
        made.merge(merge())

    assert str(refused.value) == why
    assert github.writes() == []


def test_a_worktree_holding_work_leaves_the_merge_to_an_agent() -> None:
    made, _ = self_merge(MergeGitHub(), Worktrees(kept=True, left="2 uncommitted changes"))

    with pytest.raises(NotMerged, match="the worktree an earlier agent left holds 2 uncommitted"):
        made.merge(merge())


def test_a_pr_whose_mergeability_github_is_still_working_out_is_looked_at_again() -> None:
    # GitHub starts working it out when asked, and says null until it has.
    github = MergeGitHub()
    github.unworked = 1
    made, slept = self_merge(github)

    made.merge(merge())

    assert slept == [2]
    assert "PUT pulls/9/merge" in github.writes()


def test_a_reply_that_comes_while_it_merges_stops_it_before_its_comment() -> None:
    github = MergeGitHub()
    github.meanwhile = [said("Wait, one more thing.", login="albalaeff")]
    made, _ = self_merge(github)

    with pytest.raises(NotMerged, match="couldn't post the closing comment"):
        made.merge(merge())

    assert github.writes() == ["PATCH issues/7"]  # no comment over the reply, and no merge


def test_a_merge_github_refuses_after_the_closing_comment_says_so_and_goes_to_an_agent() -> None:
    github = MergeGitHub()
    github.refused = '{"message":"Head branch was modified. Review and try the merge again."}'
    made, _ = self_merge(github)

    with pytest.raises(NotMerged, match="GitHub refused the merge after the closing comment"):
        made.merge(merge())

    assert github.writes() == [
        "PATCH issues/7",
        "POST issues/7/comments",
        "PUT pulls/9/merge",
        "POST issues/7/comments",
    ]
    note = github.asked[3][2]["body"]
    assert note.startswith(
        "_Claude Code agent manager (bateks)_\n\nGitHub refused to merge PR #9, so the comment "
        "above waits for its merge: PUT"
    )
    assert "**Next:** the merge of PR #9 (Claude's). **Waiting on:** nothing." in note
    assert Conversation(github.entries[7], github.comments[7], ME).item().state == "Claude's move"


# --- one agent per issue, a few at once ------------------------------------------------------


class FakeAgent:
    def __init__(self, job: Job) -> None:
        self.job = job
        self.code: int | None = None
        self.limit: UsageLimit | None = None
        self.unavailable: ModelUnavailable | None = None
        self.thrashed = False
        self.compaction = CompactShare(25)
        self.stopped = False

    def __str__(self) -> str:
        return "opus/xhigh"

    def end_on_the_limit(self, said: str = SESSION_LIMIT) -> None:
        self.code = 1
        self.limit = UsageLimit(said)

    def end_on_a_missing_model(self, model: str = "fable") -> None:
        self.code = 1
        self.unavailable = ModelUnavailable(model, NO_FABLE)

    def end_compacting_again_and_again(self, at: float = 25) -> None:
        self.code = 1
        self.thrashed = True
        self.compaction = CompactShare(at)

    def poll(self) -> int | None:
        return self.code

    def stop(self) -> None:
        self.stopped = True

    def finish(self, code: int | None) -> str:
        return f"{self.job}: finished {code}"


class FakeLauncher:
    """Starts a `FakeAgent`, except for the slots it's told to refuse; the slots in
    `worktrees` have one an earlier agent left."""

    def __init__(self, refuse: set[str] | None = None) -> None:
        self.started: list[FakeAgent] = []
        self.tried: list[str] = []
        self.refuse = refuse or set()
        self.why = "its branch is checked out elsewhere"
        self.worktrees: set[str] = set()
        self.avoided: list[str] = []  # #4: the models the account turned out to lack

    def avoid(self, model: str) -> str:
        self.avoided.append(model)
        return "opus"

    def launch(self, job: Job) -> FakeAgent:
        self.tried.append(job.key)
        if job.slot in self.refuse:
            raise AgentError(self.why)
        self.started.append(FakeAgent(job))
        return self.started[-1]

    def plan(self, job: Job) -> str:
        return f"would run {job}"

    def kept(self, job: Job) -> bool:
        return job.slot in self.worktrees


class FakeMerge:
    """The manager's own merge (#550): it merges what it's asked to, unless it `refuses`."""

    def __init__(self, refuses: str | None = None) -> None:
        self.refuses = refuses
        self.asked: list[str] = []

    def check(self, job: Job) -> None:
        self.asked.append(job.key)
        if self.refuses:
            raise NotMerged(self.refuses)

    def merge(self, job: Job) -> str:
        self.check(job)
        return "merged it itself, no agent"


class FakeLabel:
    """Puts labels on issues (#152), noted in `put`, unless it `refuses`."""

    def __init__(self, refuses: str | None = None) -> None:
        self.put: list[tuple[int, str]] = []
        self.refuses = refuses

    def __call__(self, issue: int, label: str) -> str | None:
        if self.refuses is None:
            self.put.append((issue, label))
        return self.refuses


NO_NODE = Check("Node", False, "not installed", "winget install --id OpenJS.NodeJS.LTS")
HELD = "Node: not installed (fix: winget install --id OpenJS.NodeJS.LTS)"


class Toolbox:
    """What check_setup's Toolchain finds (#108), as a test sets it, and how often it's
    asked; what the manager tells each issue it holds, in `told`."""

    def __init__(self, *missing: Check, refuses: str | None = None) -> None:
        self.missing = list(missing)
        self.looks = 0
        self.told: list[tuple[str, str]] = []
        self.refuses = refuses

    def __call__(self) -> list[Check]:
        self.looks += 1
        return [Check("uv", True, "installed"), *self.missing]

    def tell(self, job: Job, why: str) -> str | None:
        self.told.append((job.slot, why))
        return self.refuses


def scheduler(
    most: int = 2,
    due: bool | Callable[[Job], bool] = True,
    dry_run: bool = False,
    refuse: set[str] | None = None,
    clock: Clock | None = None,
    merger: FakeMerge | None = None,
    tools: Toolbox | None = None,
    label: FakeLabel | None = None,
) -> tuple[Scheduler, FakeLauncher, list[str]]:
    said: list[str] = []
    fake = FakeLauncher(refuse)
    clock = clock or Clock()
    hold = None if tools is None else ToolchainHold(tools, tools.tell, said.append, clock)
    made = Scheduler(
        most,
        fake,  # type: ignore[arg-type]
        due if callable(due) else lambda job: due,
        said.append,
        dry_run,
        clock=clock,
        now=lambda: LIMIT_HIT,
        merger=merger,  # type: ignore[arg-type]
        hold=hold,
        label=label,
    )
    return made, fake, said


def look(made: Scheduler, *jobs: Job) -> None:
    """One look of the watcher's: its tasks taken together, then the manager's tick."""
    for job in jobs:
        made.take(job)
    made.tick()


def started(launcher: FakeLauncher) -> list[str]:
    return [agent.job.key for agent in launcher.started]


def test_no_more_than_the_most_at_once_the_rest_in_turn() -> None:
    made, launcher, said = scheduler(most=1)

    look(made, IssueJob(task(7)), IssueJob(task(8, issue=8)))
    assert started(launcher) == ["#7 to start"]
    assert said[-1] == "#8 (it's to start): waits its turn"

    launcher.started[0].code = 0
    made.tick()
    assert said[-2:] == [
        "#7 (it's to start): finished 0",
        "#8 (it's to start): started, opus/xhigh",
    ]
    assert started(launcher) == ["#7 to start", "#8 to start"]


def test_one_agent_per_issue_and_of_its_waiting_jobs_the_latest() -> None:
    made, launcher, _ = scheduler(most=2)

    look(made, IssueJob(task(7)))
    look(made, IssueJob(task(7, "reply waiting")), merge(9, issue=7))
    assert started(launcher) == ["#7 to start"]  # #9's PR is #7's: its merge waits too

    launcher.started[0].code = 0
    made.tick()
    assert started(launcher) == ["#7 to start", "PR #9 at a: CI: success"]


def test_a_job_is_started_once_however_often_the_watcher_says_it() -> None:
    made, launcher, _ = scheduler()

    look(made, IssueJob(task(7)))
    launcher.started[0].code = 0
    made.tick()
    look(made, IssueJob(task(7)))  # the watcher, started again

    assert started(launcher) == ["#7 to start"]


def test_a_waiting_job_no_longer_due_is_dropped() -> None:
    made, launcher, said = scheduler(most=1, due=False)

    look(made, IssueJob(task(7)), IssueJob(task(8, issue=8)))
    launcher.started[0].code = 0
    made.tick()

    assert started(launcher) == ["#7 to start"]  # the watcher just said it: not asked again
    assert said[-1] == "#8 (it's to start): no longer needs doing"
    assert not made.busy()


def test_a_green_pr_s_merge_has_a_lane_of_its_own() -> None:
    # #485: on 2026-10-14 five green PRs waited behind three long code tasks.
    made, launcher, said = scheduler(most=1)
    look(made, IssueJob(task(7)), IssueJob(task(8, issue=8)))

    look(made, merge(10, issue=10), merge(12, issue=11))
    assert started(launcher) == ["#7 to start", "PR #10 at a: CI: success"]  # beside the most
    assert said[-1] == "#11 (CI finished on PR #12: CI: success): waits its turn"  # one at a time

    launcher.started[0].code = launcher.started[1].code = 0
    made.tick()
    assert started(launcher)[2:] == ["PR #12 at a: CI: success", "#8 to start"]  # a merge first


def test_a_red_ci_s_fix_is_code_work_and_waits_with_it() -> None:
    made, launcher, said = scheduler(most=1)
    red = task(10, "CI finished", kind="pull", issue=10, ci="CI: failure", sha="b")
    look(made, IssueJob(task(7)))

    look(made, IssueJob(red))

    assert started(launcher) == ["#7 to start"]
    assert said[-1] == "#10 (CI finished on PR #10: CI: failure): waits its turn"


def test_a_green_pr_the_manager_merges_itself_starts_no_agent() -> None:
    # #550: the merge lane needs no model when the agent left its closing comment.
    made, launcher, said = scheduler(merger=FakeMerge())

    look(made, merge())

    assert launcher.started == []
    assert said == ["#7 (CI finished on PR #9: CI: success): merged it itself, no agent"]
    assert not made.busy()


def test_a_green_pr_the_manager_won_t_merge_goes_to_an_agent_told_why() -> None:
    why = "GitHub says PR #9 can't be merged as it is (dirty)"
    made, launcher, said = scheduler(merger=FakeMerge(why))

    look(made, merge())

    assert started(launcher) == ["PR #9 at a: CI: success"]
    assert f"The manager left the merge to you: {why}." in launcher.started[0].job.prompt(SLUG, "x")
    assert said == [
        f"#7 (CI finished on PR #9: CI: success): left to an agent: {why}",
        "#7 (CI finished on PR #9: CI: success): started, opus/xhigh",
    ]


def test_only_a_green_pr_s_job_goes_to_the_manager_s_merge() -> None:
    merger = FakeMerge()
    made, launcher, _ = scheduler(merger=merger)
    red = task(10, "CI finished", kind="pull", issue=10, ci="CI: failure", sha="b")

    look(made, IssueJob(task(8, issue=8)), IssueJob(red))

    assert merger.asked == []
    assert len(launcher.started) == 2


def test_a_restart_s_first_look_starts_mid_work_before_new_issues() -> None:
    # #485: GitHub lists the newest issues first, and on 2026-10-14 a restart, which forgets
    # the line, started two brand-new issues ahead of two mid-work ones.
    made, launcher, _ = scheduler(most=2)

    look(
        made,
        IssueJob(task(20, issue=20)),
        IssueJob(task(19, issue=19)),
        IssueJob(task(12, "reply waiting", issue=12)),
        IssueJob(task(11, "Claude's move", issue=11)),
    )

    assert started(launcher) == ["#12 reply waiting", "#11 Claude's move"]


def test_what_waits_starts_by_priority_then_mid_work_then_first_come() -> None:
    made, launcher, _ = scheduler(most=6)
    launcher.worktrees.add("14")  # an agent was stopped on it before it said a word

    look(
        made,
        IssueJob(task(10, issue=10)),
        IssueJob(task(11, issue=11, labels=["priority:low"])),
        IssueJob(task(12, "reply waiting", issue=12)),
        IssueJob(task(13, issue=13, labels=["priority:high"])),
        IssueJob(task(14, issue=14)),
        IssueJob(task(15, issue=15, labels=["priority:medium"])),
    )

    assert [agent.job.slot for agent in launcher.started] == ["13", "12", "14", "10", "15", "11"]


def test_a_priority_set_while_it_waits_orders_it_at_the_next_look() -> None:
    # The watcher says a task whose labels changed as a new one (`task`): the latest waits.
    made, launcher, _ = scheduler(most=1)
    look(made, IssueJob(task(7)), IssueJob(task(8, issue=8)), IssueJob(task(9, issue=9)))

    look(made, IssueJob(task(9, issue=9, labels=["priority:high"])))
    launcher.started[0].code = 0
    made.tick()

    assert started(launcher) == ["#7 to start", "#9 to start, priority:high"]


def test_a_running_agent_is_never_stopped_for_a_higher_one() -> None:
    made, launcher, said = scheduler(most=1)
    look(made, IssueJob(task(7, labels=["priority:low"])))

    look(made, IssueJob(task(8, issue=8, labels=["priority:high"])))

    assert not launcher.started[0].stopped
    assert said[-1] == "#8 (it's to start): waits its turn"


def test_an_agent_that_can_t_start_is_said_and_holds_no_place() -> None:
    made, launcher, said = scheduler(most=1, refuse={"7"})

    look(made, IssueJob(task(7)), IssueJob(task(8, issue=8)))

    assert said[0] == (
        "#7 (it's to start): not started, tried again every 2 min: "
        "its branch is checked out elsewhere"
    )
    assert started(launcher) == ["#8 to start"]


def test_a_job_that_can_t_start_is_tried_again_at_the_watcher_s_next_look() -> None:
    # #409: its branch was checked out in the checkout, and the job was dropped.
    clock = Clock()
    made, launcher, said = scheduler(refuse={"7"}, clock=clock)
    look(made, IssueJob(task(7)))

    made.tick()  # the manager's next second: not yet
    clock.now += WATCH_EVERY - 1
    made.tick()
    assert launcher.tried == ["#7 to start"]

    clock.now += 1
    made.tick()  # still refused: tried, and not said again
    assert launcher.tried == ["#7 to start"] * 2
    assert len(said) == 1

    launcher.refuse.clear()  # the checkout is back on develop
    clock.now += WATCH_EVERY
    made.tick()
    assert started(launcher) == ["#7 to start"]
    assert said[-1] == "#7 (it's to start): started, opus/xhigh"


def test_a_new_reason_it_can_t_start_is_said() -> None:
    clock = Clock()
    made, launcher, said = scheduler(refuse={"7"}, clock=clock)
    look(made, IssueJob(task(7)))

    launcher.why = "git worktree add: fatal: unable to access 'https://github.com/'"
    clock.now += WATCH_EVERY
    made.tick()

    assert said[-1] == (
        "#7 (it's to start): not started, tried again every 2 min: "
        "git worktree add: fatal: unable to access 'https://github.com/'"
    )


def test_a_job_tried_again_is_dropped_once_it_no_longer_needs_doing() -> None:
    clock, due = Clock(), [True]
    made, launcher, said = scheduler(refuse={"7"}, clock=clock, due=lambda job: due[0])
    look(made, IssueJob(task(7)))

    due[0] = False  # answered meanwhile
    clock.now += WATCH_EVERY
    made.tick()

    assert launcher.tried == ["#7 to start"]
    assert said[-1] == "#7 (it's to start): no longer needs doing"
    assert not made.busy()


def test_a_new_task_for_an_issue_waiting_to_be_tried_again_is_tried_at_once() -> None:
    clock = Clock()
    made, launcher, said = scheduler(refuse={"7"}, clock=clock)
    look(made, IssueJob(task(7)))

    look(made, IssueJob(task(7, "reply waiting")))  # a new comment, the checkout still on it
    assert said[-1] == (
        "#7 (a reply waits): not started, tried again every 2 min: "
        "its branch is checked out elsewhere"
    )

    launcher.refuse.clear()
    clock.now += WATCH_EVERY
    made.tick()
    launcher.started[0].code = 0
    clock.now += WATCH_EVERY
    made.tick()
    assert started(launcher) == ["#7 reply waiting"]  # the older one not again


def test_a_job_waiting_to_be_tried_again_keeps_no_once_run_going() -> None:
    made, _, _ = scheduler(refuse={"7"})

    look(made, IssueJob(task(7)))

    assert not made.busy()  # --once ends, having said why #7 didn't start


def test_a_run_that_ends_on_the_usage_limit_holds_every_start_until_it_resets() -> None:
    # #476: on 2026-10-14 four runs ended on it at 09:33–09:34, and the manager started the
    # next ones at once, which ended the same way.
    clock = Clock()
    made, launcher, said = scheduler(most=2, clock=clock)
    look(made, IssueJob(task(7)), IssueJob(task(8, issue=8)), IssueJob(task(9, issue=9)))

    launcher.started[0].end_on_the_limit()
    made.tick()
    assert said[-2:] == ["#7 (it's to start): finished 1", "Usage limit: agents wait until 12:00."]
    assert started(launcher) == ["#7 to start", "#8 to start"]  # #8 goes on, #9 still waits

    launcher.started[1].end_on_the_limit()  # the same limit: the wait stays as it is
    made.tick()
    made.take(IssueJob(task(10, issue=10)))
    clock.now += (2 * 60 + 27) * 60 - 1
    made.tick()
    assert started(launcher) == ["#7 to start", "#8 to start"]
    assert [line for line in said if line.startswith("Usage limit")] == [
        "Usage limit: agents wait until 12:00."
    ]

    clock.now += 1
    made.tick()
    assert started(launcher)[2:] == ["#9 to start", "#7 to start"]  # #7 kept, in line again
    launcher.started[2].code = launcher.started[3].code = 0
    made.tick()
    assert started(launcher)[4:] == ["#8 to start", "#10 to start"]


def test_a_usage_limit_that_names_no_time_holds_the_starts_for_an_hour() -> None:
    clock = Clock()
    made, launcher, said = scheduler(clock=clock)
    look(made, IssueJob(task(7)))

    launcher.started[0].end_on_the_limit("You've hit your session limit")
    made.tick()
    assert said[-1] == "Usage limit: agents wait until 10:33."
    clock.now += 3600 - 1
    made.tick()
    assert started(launcher) == ["#7 to start"]

    clock.now += 1
    made.tick()
    assert started(launcher) == ["#7 to start"] * 2


def test_a_job_held_by_the_usage_limit_is_dropped_once_it_no_longer_needs_doing() -> None:
    clock, due = Clock(), [True]
    made, launcher, said = scheduler(clock=clock, due=lambda job: due[0])
    look(made, IssueJob(task(7)))
    launcher.started[0].end_on_the_limit()
    made.tick()

    due[0] = False  # a person answered it meanwhile
    clock.now += 3 * 3600
    made.tick()

    assert said[-1] == "#7 (it's to start): no longer needs doing"


def test_jobs_held_by_the_usage_limit_keep_no_once_run_going() -> None:
    made, launcher, _ = scheduler()
    look(made, IssueJob(task(7)), IssueJob(task(8, issue=8)))

    launcher.started[0].end_on_the_limit()
    made.tick()
    assert made.busy()  # #8 still runs

    launcher.started[1].code = 0
    made.tick()
    assert not made.busy()  # --once ends: #7 would wait hours for the reset


def test_a_run_whose_model_the_account_lacks_runs_again_on_the_next_model_down() -> None:
    # #4: Fable is on bateks's plan only. On a machine whose account lacks it, the run ends at
    # once; the job waits its turn again and runs on opus, as every later one does, said once.
    made, launcher, said = scheduler(most=2)
    look(made, IssueJob(task(7)), IssueJob(task(8, issue=8)))

    launcher.started[0].end_on_a_missing_model()
    made.tick()

    assert launcher.avoided == ["fable"]
    assert said[-3:] == [
        "#7 (it's to start): finished 1",
        "The account lacks the model fable: its agents run on opus for the rest of this run.",
        "#7 (it's to start): started, opus/xhigh",
    ]
    assert started(launcher) == ["#7 to start", "#8 to start", "#7 to start"]

    launcher.started[1].end_on_a_missing_model()  # #8 too: said no second time
    made.tick()
    assert launcher.avoided == ["fable"]
    assert started(launcher)[3:] == ["#8 to start"]
    assert [line for line in said if line.startswith("The account lacks")] == [
        "The account lacks the model fable: its agents run on opus for the rest of this run."
    ]


def test_a_run_that_compacted_again_and_again_gives_its_issue_more_of_the_window() -> None:
    # #152: the label makes the task new to the watcher, whose next look brings it back for an
    # agent that compacts later: the scheduler starts nothing again itself.
    labels = FakeLabel()
    made, launcher, said = scheduler(label=labels)
    look(made, IssueJob(task(9, "CI finished", kind="pull", issue=7, ci="CI: failure", sha="b")))

    launcher.started[0].end_compacting_again_and_again()
    made.tick()

    assert labels.put == [(7, "compact:50")]  # a PR's work goes on its issue's label
    assert said[-1].endswith(
        ": compacted again and again at 25% of the window: compact:50 put on #7, so its next "
        "agent compacts at 50%"
    )
    assert len(launcher.started) == 1
    assert not made.busy()


def test_a_run_that_compacted_again_and_again_at_all_of_the_window_says_to_split_it() -> None:
    labels = FakeLabel()
    made, launcher, said = scheduler(label=labels)
    look(made, IssueJob(task(7)))

    launcher.started[0].end_compacting_again_and_again(100)
    made.tick()

    assert labels.put == []
    assert said[-1] == (
        "#7 (it's to start): compacted again and again at 100% of the window: too big for one "
        "agent's conversation; split the issue"
    )


def test_a_compact_label_github_refused_is_said() -> None:
    made, launcher, said = scheduler(label=FakeLabel(refuses="GitHub said 403"))
    look(made, IssueJob(task(7)))

    launcher.started[0].end_compacting_again_and_again()
    made.tick()

    assert said[-1] == (
        "#7 (it's to start): compacted again and again at 25% of the window: compact:50 not "
        "put on #7: GitHub said 403"
    )


def test_a_job_of_no_issue_that_compacted_again_and_again_is_said_with_the_setting() -> None:
    # The wiki's agent has no issue to label: agent-manager.toml's share is all there is.
    made, launcher, said = scheduler(label=FakeLabel())
    look(made, WikiJob(BEHIND, TODAY))

    launcher.started[0].end_compacting_again_and_again()
    made.tick()

    assert said[-1].endswith(
        ": compacted again and again at 25% of the window: compact_at_percent in "
        "agent-manager.toml gives its agents more"
    )


def test_a_job_on_a_missing_model_keeps_a_once_run_going() -> None:
    # Unlike the usage limit, nothing waits for a reset: the job runs again at once.
    made, launcher, _ = scheduler()
    look(made, IssueJob(task(7)))

    launcher.started[0].end_on_a_missing_model()
    made.tick()

    assert made.busy()
    assert started(launcher) == ["#7 to start", "#7 to start"]


def test_a_missing_tool_holds_code_work_said_once_in_the_log_and_on_each_issue() -> None:
    # #108: #16, #17 and #18 each wrote their code blind for want of Node, then stopped.
    clock, tools = Clock(), Toolbox(NO_NODE)
    made, launcher, said = scheduler(clock=clock, tools=tools)

    look(made, IssueJob(task(7)), IssueJob(task(8, issue=8)))
    assert launcher.started == []
    assert said == [f"Agents on code work wait: {HELD}"]
    assert tools.told == [("7", HELD), ("8", HELD)]
    assert not made.busy()  # a --once run ends

    look(made, IssueJob(task(7, "Claude's move")))  # what the manager said on #7
    assert launcher.started == []
    assert said == [f"Agents on code work wait: {HELD}"]
    assert tools.told == [("7", HELD), ("8", HELD)]

    tools.missing = []  # installed; tried again at the watcher's next look
    clock.now += WATCH_EVERY
    made.tick()
    assert started(launcher) == ["#7 Claude's move", "#8 to start"]
    assert said[1] == "The machine has what agents need again: the work held starts."


def test_another_missing_tool_is_said_again() -> None:
    clock, tools = Clock(), Toolbox(NO_NODE)
    made, _, said = scheduler(clock=clock, tools=tools)
    look(made, IssueJob(task(7)))

    tools.missing.append(Check("Playwright", False, "no browsers", "npx playwright install"))
    clock.now += WATCH_EVERY
    made.tick()

    both = f"{HELD}; Playwright: no browsers (fix: npx playwright install)"
    assert said == [f"Agents on code work wait: {HELD}", f"Agents on code work wait: {both}"]
    assert tools.told == [("7", HELD), ("7", both)]


def test_an_issue_the_manager_couldn_t_tell_is_said_in_the_log() -> None:
    tools = Toolbox(NO_NODE, refuses="a reply waits on it")
    made, _, said = scheduler(tools=tools)

    look(made, IssueJob(task(7, "reply waiting")))

    assert said == [
        f"Agents on code work wait: {HELD}",
        "#7 (a reply waits): not said on the issue: a reply waits on it",
    ]


def test_a_merge_and_new_prices_aren_t_held() -> None:
    tools = Toolbox(NO_NODE)
    made, launcher, _ = scheduler(tools=tools)

    look(made, merge(), PricesJob("prices", "opus 5.5", TODAY))

    assert started(launcher) == ["PR #9 at a: CI: success", "prices"]
    assert tools.looks == 0


def test_the_machine_is_looked_at_again_only_after_a_few_seconds() -> None:
    clock, tools = Clock(), Toolbox()
    hold = ToolchainHold(tools, tools.tell, lambda line: None, clock)

    hold.holds(IssueJob(task(7)))
    hold.holds(IssueJob(task(8, issue=8)))
    assert tools.looks == 1

    clock.now += ToolchainHold.FRESH
    hold.holds(IssueJob(task(7)))
    assert tools.looks == 2


def test_the_manager_says_at_its_start_what_agents_lack_or_that_they_have_it() -> None:
    said: list[str] = []
    tools = Toolbox()
    ToolchainHold(tools, tools.tell, said.append, Clock()).look()
    tools.missing = [NO_NODE]
    ToolchainHold(tools, tools.tell, said.append, Clock()).look()

    assert said == ["The machine has what agents need: uv.", f"Agents on code work wait: {HELD}"]
    assert tools.told == []  # no issue yet


def notice(github: MergeGitHub) -> HoldNotice:
    return HoldNotice(
        github,  # type: ignore[arg-type]
        ME,
        cost_of=lambda number, pulls: IssueCost(number, dollars=Decimal("0")),
        here=lambda: HERE,
        now=lambda: MERGED_AT,
    )


def test_an_issue_held_is_told_why_and_stays_claude_s_move() -> None:
    # #108: a handoff whose move is Claude's, so the issue is still to do after a restart.
    github = MergeGitHub()
    red = task(9, "CI finished", kind="pull", issue=7, ci="CI: failure", sha="b")

    assert notice(github)(IssueJob(red), HELD) is None

    body = str(github.comments[7][-1]["body"])
    assert body.startswith("_Claude Code agent manager (bateks)_\n\n")
    assert HELD in body and "LAPTOP-1" in body
    state = Conversation(github.entries[7], github.comments[7], ME).item().state
    assert state == "Claude's move"


def test_an_issue_with_a_reply_waiting_isn_t_told() -> None:
    # #208: a comment over the reply would hide it.
    github = MergeGitHub()
    github.comments[7].append(said("Why not Node 22?", login="albalaeff"))

    why = notice(github)(IssueJob(task(7, "reply waiting")), HELD)

    assert why is not None and why.startswith("#7 has replies since Claude's last comment.")
    assert github.writes() == []


def test_stopping_stops_the_agents_and_forgets_the_waiting() -> None:
    made, launcher, said = scheduler(most=1)
    look(made, IssueJob(task(7)), IssueJob(task(8, issue=8)))

    made.stop()

    assert launcher.started[0].stopped
    assert said[-1] == "#7 (it's to start): finished None"
    assert not made.busy()


def test_closing_starts_nothing_more_and_lets_the_running_finish() -> None:
    # #485: the first Ctrl+C. What waits is dropped: the next start's first look says it again.
    made, launcher, said = scheduler(most=1)
    look(made, IssueJob(task(7)), IssueJob(task(8, issue=8)))

    assert made.close() == 1
    look(made, IssueJob(task(9, issue=9)))  # said before the watcher stopped
    launcher.started[0].end_on_the_limit()
    made.tick()

    assert started(launcher) == ["#7 to start"]
    assert not launcher.started[0].stopped
    assert said[-1] == "#7 (it's to start): finished 1"  # no wait for the limit's reset
    assert not made.busy()


def test_reopened_it_takes_again_what_closing_dropped() -> None:
    # #574: Esc cancels the soft stop, and the watcher's first look says #8 again.
    made, launcher, _ = scheduler(most=1)
    look(made, IssueJob(task(7)), IssueJob(task(8, issue=8)))
    made.close()

    made.reopen()
    look(made, IssueJob(task(7)), IssueJob(task(8, issue=8)))
    launcher.started[0].code = 0
    made.tick()

    assert started(launcher) == ["#7 to start", "#8 to start"]  # #7, running, not twice


def test_a_dry_run_says_what_it_would_run_in_turn_and_runs_nothing() -> None:
    made, launcher, said = scheduler(dry_run=True)

    look(made, IssueJob(task(8, issue=8)), IssueJob(task(7, "reply waiting")))

    assert said == ["would run #7 (a reply waits)", "would run #8 (it's to start)"]
    assert launcher.started == []
    assert not made.busy()  # --dry-run is a --once run


@pytest.mark.parametrize(
    ("refuses", "would"),
    [
        (None, "#7 (CI finished on PR #9: CI: success): the manager would merge it itself"),
        ("#7 is closed", "would run #7 (CI finished on PR #9: CI: success)"),
    ],
    ids=["merges", "an agent"],
)
def test_a_dry_run_says_whether_the_manager_would_merge_itself(
    refuses: str | None, would: str
) -> None:
    made, launcher, said = scheduler(dry_run=True, merger=FakeMerge(refuses))

    look(made, merge())

    assert said == [would]
    assert launcher.started == []


# --- the watcher -----------------------------------------------------------------------------


def test_the_watcher_starts_again_at_once_or_after_a_growing_wait() -> None:
    backoff = Backoff(10, 60)

    assert [backoff.after(1) for _ in range(4)] == [10, 20, 40, 60]
    assert backoff.after(0) == 0  # an ordinary end, and the waits start over
    assert backoff.after(1) == 10


def test_the_watcher_looks_as_often_as_the_settings_say(tmp_path: Path) -> None:
    # #445: every two minutes, unless agent-manager.toml says otherwise.
    watcher = Watcher.of(ManagerConfig(watch_every_seconds=90, wiki_every_hours=0), tmp_path)
    once = Watcher.of(ManagerConfig(), tmp_path, once=True)  # --once, --dry-run: one look

    assert watcher.command[1:] == [
        str(tmp_path / "scripts" / "github.py"),
        "watch",
        "--json",
        "--every",
        "1.5",
    ]
    assert once.command[-6:] == ["--every", "2", "--wiki", "6", "--for", "0"]  # #126


def test_the_watcher_s_lines_are_read_as_it_says_them(tmp_path: Path) -> None:
    watcher = Watcher([sys.executable, "-c", "print('a'); print('b')"], tmp_path)
    watcher.start()

    lines: list[str] = []
    deadline = time.monotonic() + 30
    while watcher.ended() is None and time.monotonic() < deadline:
        lines += watcher.lines(timeout=0.5)

    assert lines == ["a", "b"]
    assert watcher.ended() == 0


def test_a_look_s_lines_are_read_together(tmp_path: Path) -> None:
    # #485: the scheduler orders a look's tasks before it starts any, so it needs them all,
    # though the watcher's lines may come apart.
    said = "import time; print('a', flush=True); time.sleep(0.3); print('b', flush=True)"
    watcher = Watcher([sys.executable, "-c", said], tmp_path, settle=10)
    watcher.start()

    assert watcher.lines(timeout=30) == ["a", "b"]
    assert watcher.ended() == 0  # its end read with them, not 10 s after


def test_a_watcher_stopped_and_started_again_hears_only_the_new_one(tmp_path: Path) -> None:
    # #574: Esc after Ctrl+C starts it again; the stopped one's end isn't the new one's.
    said = "import time; print('a', flush=True); time.sleep(60)"
    watcher = Watcher([sys.executable, "-c", said], tmp_path)
    watcher.start()
    assert watcher.lines(timeout=30) == ["a"]
    watcher.stop()
    time.sleep(0.5)  # the stopped one's stream ends meanwhile

    watcher.start()

    assert watcher.lines(timeout=30) == ["a"]
    assert watcher.ended() is None
    watcher.stop()


class Heard:
    def __init__(self) -> None:
        self.jobs: list[Job] = []

    def take(self, job: Job) -> None:
        self.jobs.append(job)


def test_the_watcher_s_tasks_go_to_the_scheduler_and_its_notes_are_said() -> None:
    heard, said = Heard(), []  # type: tuple[Heard, list[str]]
    manager = AgentManager(None, heard, Backoff(1, 1), said.append, today=lambda: TODAY)  # type: ignore[arg-type]

    manager.hear(json.dumps(task().data()))
    manager.hear(json.dumps({"type": "note", "text": "Pulled develop: a..b."}))
    manager.hear("Traceback (most recent call last):")

    assert [job.key for job in heard.jobs] == ["#7 to start"]
    assert said == ["watcher: Pulled develop: a..b.", "watcher: Traceback (most recent call last):"]


def test_a_trial_run_takes_only_its_issues() -> None:
    heard = Heard()
    manager = AgentManager(None, heard, Backoff(1, 1), only=frozenset({8}))  # type: ignore[arg-type]

    for number in (7, 8):
        manager.hear(json.dumps(task(number, issue=number).data()))
    manager.hear(json.dumps({"type": "prices", "key": "prices: x", "text": "x"}))

    assert [job.slot for job in heard.jobs] == ["8"]


class FakeWatcher:
    """Says a look's lines at each call; None is Ctrl+C."""

    def __init__(self, *looks: Sequence[str] | None) -> None:
        self.looks = list(looks)
        self.stopped = False
        self.starts = 0

    def start(self) -> None:
        self.starts += 1

    def lines(self, timeout: float) -> list[str]:
        found = self.looks.pop(0) if self.looks else []
        if found is None:
            raise KeyboardInterrupt
        return list(found)

    def ended(self) -> int | None:
        return None

    def stop(self) -> None:
        self.stopped = True


def to_start(*numbers: int) -> list[str]:
    """A look of the watcher's: these issues to start."""
    return [json.dumps(task(number, issue=number).data()) for number in numbers]


class FakeKeys:
    """The console's keys (#574): a test presses Esc by setting `esc`."""

    def __init__(self) -> None:
        self.esc = False
        self.listening = False
        self.listened = 0

    def __enter__(self) -> FakeKeys:
        self.listening = True
        self.listened += 1
        return self

    def __exit__(self, *exc: object) -> None:
        self.listening = False

    def escaped(self) -> bool:
        pressed, self.esc = self.esc, False
        return pressed


def manager(
    watcher: FakeWatcher,
    made: Scheduler,
    said: list[str],
    sleep: Callable[[float], None],
    keys: FakeKeys | Keys | None = None,
) -> AgentManager:
    return AgentManager(
        watcher,  # type: ignore[arg-type]
        made,
        Backoff(1, 1),
        said.append,
        today=lambda: TODAY,
        sleep=sleep,
        keys=keys or Keys.of(None),  # type: ignore[arg-type]
    )


def test_ctrl_c_stops_softly_letting_the_running_agents_finish() -> None:
    # #485: nothing new starts, and the manager ends once they have.
    made, launcher, said = scheduler(most=1)
    watcher = FakeWatcher(to_start(7, 8), None)  # a look, then Ctrl+C

    def wait(seconds: float) -> None:
        launcher.started[0].code = 0  # #7's agent finishes meanwhile

    manager(watcher, made, said, wait).run()

    assert watcher.stopped
    assert started(launcher) == ["#7 to start"]  # #8, which waited, never starts
    assert not launcher.started[0].stopped
    assert said[-3:] == [
        "Soft-stopping: nothing new starts; waiting for 1 running agent to finish. "
        "Ctrl+C again force-stops; Esc cancels and carries on.",
        "#7 (it's to start): finished 0",
        "Stopped.",
    ]


def test_ctrl_c_again_force_stops_the_agents() -> None:
    made, launcher, said = scheduler(most=1)

    def wait(seconds: float) -> None:
        raise KeyboardInterrupt  # Ctrl+C again

    manager(FakeWatcher(to_start(7), None), made, said, wait).run()

    assert launcher.started[0].stopped
    assert said[-3:] == [
        "Force-stopping the agents: their worktrees stay as they are.",
        "#7 (it's to start): finished None",
        "Stopped.",
    ]


def test_ctrl_c_with_no_agent_running_stops_at_once() -> None:
    made, _, said = scheduler()
    watcher = FakeWatcher(None)

    def wait(seconds: float) -> None:
        raise AssertionError("nothing to wait for")

    manager(watcher, made, said, wait).run()

    assert watcher.stopped
    assert said == ["Stopped."]


def test_esc_cancels_the_soft_stop_and_the_manager_carries_on() -> None:
    # #574: a stray Ctrl+C. The watcher starts again, and what waited is taken again.
    made, launcher, said = scheduler(most=1)
    keys = FakeKeys()
    watcher = FakeWatcher(to_start(7, 8), None, to_start(7, 8), None)

    def wait(seconds: float) -> None:
        launcher.started[-1].code = 0  # the running agent finishes meanwhile
        keys.esc = len(launcher.started) == 1  # Esc at the first soft stop only
        assert keys.listening

    manager(watcher, made, said, wait, keys).run()

    assert watcher.starts == 2
    assert started(launcher) == ["#7 to start", "#8 to start"]
    assert keys.listened == 2 and not keys.listening
    assert said[-7:] == [
        "Soft-stopping: nothing new starts; waiting for 1 running agent to finish. "
        "Ctrl+C again force-stops; Esc cancels and carries on.",
        "Carrying on: the soft stop is cancelled.",
        "#7 (it's to start): finished 0",
        "#8 (it's to start): started, opus/xhigh",
        "Soft-stopping: nothing new starts; waiting for 1 running agent to finish. "
        "Ctrl+C again force-stops; Esc cancels and carries on.",
        "#8 (it's to start): finished 0",
        "Stopped.",
    ]


def test_with_no_terminal_no_key_comes() -> None:
    # #574: --once in a pipe, a service: the soft stop is as before Esc.
    keys = Keys.of(io.StringIO())

    with keys:
        assert not keys.escaped()
    assert not Keys.of(None).escaped()


def test_each_line_in_the_console_starts_with_its_time(capsys: pytest.CaptureFixture[str]) -> None:
    # #522: a log read later says when each thing happened.
    console = Console(now=lambda: datetime(2026, 10, 16, 8, 5, 7, 999999, tzinfo=PRAGUE))

    console.say("#481: started")

    assert capsys.readouterr().out == "2026-10-16 08:05:07 #481: started\n"


class LabelGitHub:
    """GitHub, as `IssueLabel` calls it: what it was asked, in `calls`; or a refusal."""

    def __init__(self, refuses: BaseException | None = None) -> None:
        self.calls: list[tuple[str, str, Any]] = []
        self.refuses = refuses

    def call(self, method: str, path: str, body: Any = None) -> object:
        if self.refuses is not None:
            raise self.refuses
        self.calls.append((method, path, body))
        return []


def test_a_compact_label_goes_on_the_issue() -> None:
    # #152: added to the issue's labels, none taken off.
    github = LabelGitHub()

    assert IssueLabel(github)(7, "compact:50") is None  # type: ignore[arg-type]
    assert github.calls == [("POST", "issues/7/labels", {"labels": ["compact:50"]})]


def test_a_label_github_refuses_is_said_not_raised() -> None:
    github = LabelGitHub(SystemExit("GitHub said 403: Resource not accessible\nmore"))

    said = IssueLabel(github)(7, "compact:50")  # type: ignore[arg-type]

    assert said == "GitHub said 403: Resource not accessible"


# --- the labels and the test database --------------------------------------------------------


class LabelsGitHub:
    def __init__(self, names: Sequence[str]) -> None:
        self.names = list(names)
        self.made: dict[str, Any] = {}

    def call(self, method: str, path: str, body: Any = None) -> object:
        if method == "GET":
            return [{"name": name} for name in self.names]
        self.names.append(body["name"])
        self.made[body["name"]] = body
        return body


def test_the_missing_labels_are_made_once() -> None:
    github = LabelsGitHub(["bug", "model:opus"])

    made = Labels(github).ensure()  # type: ignore[arg-type]

    # #4: three more models (fable among them), the three efforts, the three priorities, and
    # #152's two shares of the window.
    assert "model:opus" not in made and len(made) == 11
    assert "compact:50" in made and "compact:100" in made
    assert "model:fable" in made and "effort:low" not in made
    assert github.made["effort:max"]["description"] == (
        "The agent for this issue runs with effort max (#387)"
    )
    assert github.made["priority:low"] == {  # #485
        "name": "priority:low",
        "color": "d93f0b",
        "description": (
            "The agent manager starts this issue's agents at low priority; none is medium (#485)"
        ),
    }
    assert Labels(github).ensure() == []  # type: ignore[arg-type]  # run again: nothing to do


def test_an_agent_s_test_database_is_its_own_on_the_tests_server() -> None:
    database = TestDatabase("7", server="postgresql://everest:everest@localhost:5433/everest_test")

    assert database.wanted
    assert database.url() == "postgresql://everest:everest@localhost:5433/everest_7_test"
    assert str(database) == "test database everest_7_test"


def test_a_project_without_a_database_gives_its_agents_none() -> None:
    database = TestDatabase("7", server="")

    assert not database.wanted
    assert database.url() == ""
    assert str(database) == "no test database"
    assert database.create() is None  # nothing to make, nothing to say
    database.drop()  # nothing to drop


def test_no_database_server_is_said_not_raised() -> None:
    database = TestDatabase("7", server="postgresql://everest:everest@127.0.0.1:9/everest")

    said = database.create()

    assert said is not None and said.startswith("no test database")


@pytest.mark.db
@pytest.mark.skipif(not os.environ.get("TEST_DATABASE_URL"), reason="no TEST_DATABASE_URL")
def test_an_agent_s_test_database_is_made_and_dropped() -> None:
    # A name of its own: other runs on the server (other agents', other workers') make theirs.
    database = TestDatabase(f"selfcheck{uuid4().hex[:8]}")

    assert database.create() is None
    assert database.create() is None  # there already: kept
    database.drop()
