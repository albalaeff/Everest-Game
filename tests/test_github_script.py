"""scripts/github.py: GitHub without `gh`, for working from issues (CLAUDE.md)."""

import io
import json
import subprocess
from collections.abc import Callable, Iterable, Sequence
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path

import httpx
import pytest

from scripts.agents import AgentPower
from scripts.claude_cost import IssueCost
from scripts.claude_prices import PriceNews
from scripts.github import (
    SIGNATURE,
    Answer,
    CarryOn,
    CiRuns,
    Conversation,
    Entry,
    GitHub,
    IssueCarryOn,
    IssueThread,
    IssueWork,
    Item,
    JsonOutput,
    PullRequests,
    ReleaseCut,
    ReleaseLabel,
    Task,
    WaitingLabels,
    another_watching,
    api_path,
    block,
    builds_on,
    by_claude,
    follow_develop,
    look,
    post_comment,
    repo_slug,
    sign,
    status,
    token,
    unread,
    utf8_output,
    watch,
)
from scripts.handoff import STALE, Git, HandoffMark, IssueBranch, LocalWork, Machine
from scripts.wiki import WikiNews
from tests.fakes import FakeGit

pytestmark = pytest.mark.unit

ME = "bateks"
HERE = Machine("DESKTOP-1", "c--git-personalexchangebot")
ELSEWHERE = Machine("LAPTOP-2", "c--users-batek-fxbot")


# --- which repository ------------------------------------------------------------------------


@pytest.mark.parametrize(
    "remote",
    [
        "https://github.com/bateks/PersonalExchangeBot.git",
        "https://github.com/bateks/PersonalExchangeBot",
        "git@github.com:bateks/PersonalExchangeBot.git",
        "ssh://git@github.com/bateks/PersonalExchangeBot.git",
        "https://someone@github.com/bateks/PersonalExchangeBot.git",
    ],
)
def test_the_repository_comes_from_the_remote(remote: str) -> None:
    assert repo_slug(remote) == "bateks/PersonalExchangeBot"


def test_a_remote_elsewhere_is_refused() -> None:
    with pytest.raises(SystemExit):
        repo_slug("https://gitlab.com/bateks/PersonalExchangeBot.git")


# --- the token -------------------------------------------------------------------------------


def runner(answers: dict[str, str | None]) -> object:
    """A stand-in for subprocess.run: the output of each command by its first word; None:
    the command isn't installed."""

    def run(args: Sequence[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        output = answers.get(args[0])
        if output is None:
            raise FileNotFoundError(args[0])
        return subprocess.CompletedProcess(args, 0, stdout=output, stderr="")

    return run


def test_the_token_from_the_environment_comes_first() -> None:
    run = runner({"gh": "from-gh\n", "git": "password=from-git\n"})

    assert token({"GITHUB_TOKEN": "from-env"}, run) == "from-env"  # type: ignore[arg-type]


def test_then_the_github_cli() -> None:
    run = runner({"gh": "from-gh\n", "git": "password=from-git\n"})

    assert token({}, run) == "from-gh"  # type: ignore[arg-type]


def test_then_the_token_git_stores() -> None:
    run = runner(
        {"gh": None, "git": "protocol=https\nhost=github.com\nusername=x\npassword=from-git\n"}
    )

    assert token({}, run) == "from-git"  # type: ignore[arg-type]


def test_the_token_git_gave_is_kept() -> None:
    """`fill` alone would use a token Git Credential Manager's window took once and lose it:
    `approve` with the same answer keeps it."""
    answer = "protocol=https\nhost=github.com\nusername=x\npassword=from-git\n"
    calls: list[tuple[Sequence[str], object]] = []

    def run(args: Sequence[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        calls.append((args, kwargs.get("input")))
        if args[0] == "gh":
            raise FileNotFoundError("gh")
        return subprocess.CompletedProcess(args, 0, stdout=answer, stderr="")

    assert token({}, run) == "from-git"
    assert calls[1:] == [
        (["git", "credential", "fill"], "protocol=https\nhost=github.com\n\n"),
        (["git", "credential", "approve"], answer),
    ]


def test_no_token_anywhere_is_an_error() -> None:
    with pytest.raises(SystemExit):
        token({}, runner({"gh": None, "git": "protocol=https\n"}))  # type: ignore[arg-type]


# --- asking again: a quiet look costs nothing (#445) -----------------------------------------


class ETagServer:
    """GitHub's side of a conditional request: each answer with its ETag, and "304 Not
    Modified", which doesn't count against the rate limit, to a GET that sends that ETag
    back while the answer is still the same. What it was asked: each request's method and
    the ETag it sent (`asked`)."""

    def __init__(self, body: object) -> None:
        self.body = body
        self.version = 1
        self.asked: list[tuple[str, str | None]] = []

    def change(self, body: object) -> None:
        self.body, self.version = body, self.version + 1

    def __call__(self, request: httpx.Request) -> httpx.Response:
        etag, sent = f'W/"{self.version}"', request.headers.get("If-None-Match")
        self.asked.append((request.method, sent))
        if request.method == "GET" and sent == etag:
            return httpx.Response(304, headers={"ETag": etag})
        return httpx.Response(200, json=self.body, headers={"ETag": etag})


def served(server: ETagServer) -> GitHub:
    return GitHub("bateks/PersonalExchangeBot", "a-token", httpx.MockTransport(server))


def test_a_get_asked_again_is_answered_by_the_answer_kept() -> None:
    server = ETagServer([{"number": 7}])
    github = served(server)

    first = github.call("GET", "issues?state=open&per_page=100")
    first.append({"number": 8})  # what a caller does with its answer stays its own
    again = github.call("GET", "issues?state=open&per_page=100")

    assert again == [{"number": 7}]
    assert server.asked == [("GET", None), ("GET", 'W/"1"')]


def test_a_changed_answer_is_taken_and_kept_instead() -> None:
    server = ETagServer({"login": ME})
    github = served(server)
    github.call("GET", "/user")

    server.change({"login": "albalaeff"})

    assert github.call("GET", "/user") == {"login": "albalaeff"}
    assert github.call("GET", "/user") == {"login": "albalaeff"}
    assert server.asked == [("GET", None), ("GET", 'W/"1"'), ("GET", 'W/"2"')]


def test_only_a_get_asks_again() -> None:
    server = ETagServer({"html_url": "https://github.com/x/y/issues/7#issuecomment-1"})
    github = served(server)

    github.call("POST", "issues/7/comments", {"body": "One"})
    github.call("POST", "issues/7/comments", {"body": "Two"})
    github.call("GET", "issues/7/comments")

    assert server.asked == [("POST", None), ("POST", None), ("GET", None)]


def test_a_log_is_read_where_github_keeps_it_without_the_token() -> None:
    # A job's log answers with a redirect, to storage outside the API (#18).
    def server(request: httpx.Request) -> httpx.Response:
        if request.url.host == "api.github.com":
            return httpx.Response(302, headers={"Location": "https://logs.example/job.txt"})
        assert "Authorization" not in request.headers
        return httpx.Response(200, text="[warn] src/main.ts\n")

    github = GitHub("bateks/PersonalExchangeBot", "a-token", httpx.MockTransport(server))

    assert github.text("actions/jobs/7/logs") == "[warn] src/main.ts\n"


# --- signing ---------------------------------------------------------------------------------


MINE = f"_Claude Code ({ME})_"  # #298: whose Claude is talking


def test_a_comment_is_signed_once_at_the_top() -> None:
    # #226: who's talking comes before what they say; #298: and whose Claude it is.
    signed = sign("Starting on this.\n", ME)

    assert signed == f"{MINE}\n\nStarting on this."
    assert sign(signed, ME) == signed


def test_a_signature_at_the_end_moves_to_the_top() -> None:
    assert sign(f"Plan: ...\n\n{SIGNATURE}\n", ME) == f"{MINE}\n\nPlan: ..."


def test_an_agent_signs_as_an_agent_with_its_power() -> None:
    # #387: an agent of the session manager's says so, and what it ran on (#390 prices it).
    signed = sign("Plan: ...", ME, AgentPower("opus", "xhigh"))

    assert signed == "_Claude Code agent (bateks, opus/xhigh)_\n\nPlan: ..."
    assert sign(signed, ME) == signed
    assert by_claude(signed)
    assert state(issue(), [comment(signed)]) == "in progress"


def test_the_agent_manager_s_signature_is_claude_s() -> None:
    # #550: the manager posts the closing comment its agent left; it's no person's reply.
    signed = "_Claude Code agent manager (bateks)_\n\nDone."

    assert sign(signed, ME) == signed
    assert by_claude(signed)
    assert state(issue(), [comment(signed)]) == "in progress"


def test_both_signatures_are_claude_s() -> None:
    # The comments signed before #298 still count as Claude's.
    assert by_claude(f"{SIGNATURE}\n\nOld.") and by_claude(f"{MINE}\n\nNew.")
    assert by_claude("_Claude Code (albalaeff)_\n\nThe other one's.")
    assert not by_claude("Claude Code says hi")


# --- what to do with each issue --------------------------------------------------------------


def comment(body: str, author: str = ME) -> dict[str, object]:
    return {"body": body, "user": {"login": author}}


def issue(author: str = ME, number: int = 7, labels: Sequence[str] = ()) -> dict[str, object]:
    return {
        "number": number,
        "title": "Something to do",
        "user": {"login": author},
        "labels": [{"name": label} for label in labels],
    }


def state(entry: dict[str, object], comments: list[dict[str, object]]) -> str:
    return Conversation(entry, comments, ME).item().state


def test_my_issue_with_no_claude_comment_is_to_start() -> None:
    assert Conversation(issue(), [], ME).item() == Item(7, "Something to do", "to start", ME)
    assert state(issue(), [comment("A thought of mine")]) == "to start"


def test_my_issue_with_claude_s_comment_last_is_waiting() -> None:
    comments = [comment(sign("Plan: ..."))]

    assert state(issue(), comments) == "in progress"


def test_my_reply_after_claude_s_comment_needs_an_answer() -> None:
    comments = [comment(sign("Question: A or B?")), comment("B, please")]

    assert state(issue(), comments) == "reply waiting"


def test_someone_else_s_issue_is_theirs_even_without_a_comment() -> None:
    item = Conversation(issue(author="albalaeff"), [], ME).item()

    assert (item.state, item.owner) == ("theirs", "albalaeff")


GENERATED = "🤖 Generated with [Claude Code](https://claude.com/claude-code)"


@pytest.mark.parametrize(
    "body", [sign("Closes #7"), f"Closes #7\n\n{GENERATED}"], ids=["signed", "generated"]
)
def test_a_pr_claude_opened_is_its_first_word(body: str) -> None:
    # #208: Claude's own PRs were listed "to start", with no comment from it yet.
    opened = {**issue(), "body": body, "pull_request": {}}

    assert state(opened, []) == "in progress"
    assert state(opened, [comment("Looks good")]) == "reply waiting"


def test_an_issue_claude_wrote_up_is_to_start_until_claude_comments() -> None:
    # #449: #436, written up in a session, sat "in progress" with no plan, branch or agent.
    written = {**issue(), "body": sign("Asked in chat: ...")}

    assert state(written, []) == "to start"
    assert state(written, [comment("Go")]) == "to start"
    assert state(written, [comment(sign("Plan: ..."))]) == "in progress"


# --- handing an issue to someone's Claude (#222) --------------------------------------------


def test_an_issue_labelled_for_me_is_mine_whoever_opened_it() -> None:
    handed = issue(author="albalaeff", labels=["bug", "claude:bateks"])

    assert Conversation(handed, [], ME).item() == Item(7, "Something to do", "to start", ME)


def test_my_issue_labelled_for_someone_else_is_theirs() -> None:
    item = Conversation(issue(labels=["claude:albalaeff"]), [], ME).item()

    assert (item.state, item.owner) == ("theirs", "albalaeff")


def test_the_other_claude_s_words_are_not_this_one_s() -> None:
    # Both Claudes sign; on an issue handed over, the other one's comments are replies.
    handed = {**issue(author="albalaeff", labels=["claude:bateks"]), "body": sign("Write-up")}
    theirs = comment(sign("Plan: ..."), author="albalaeff")

    assert state(handed, [theirs]) == "to start"
    assert state(handed, [comment(sign("My plan")), theirs]) == "reply waiting"
    assert unread([comment(sign("My plan")), theirs], ME) == [theirs]


# --- never commenting over an unread reply (#208) --------------------------------------------


def test_a_reply_since_claude_s_last_comment_is_unread() -> None:
    answer = comment("Add an env flag and use A")
    thread = [comment(sign("Plan: A, B or C?")), answer]

    assert unread(thread, ME) == [answer]
    assert unread([*thread, comment(sign("Done, in #207"))], ME) == []


def test_before_claude_s_first_comment_every_comment_is_unread() -> None:
    thought = comment("A thought of mine")

    assert unread([thought], ME) == [thought]


class FakeGitHub:
    def __init__(self, comments: list[dict[str, object]]) -> None:
        self.comments = comments
        self.posted: list[object] = []

    def call(self, method: str, path: str, body: object | None = None) -> object:
        if path == "/user":
            return {"login": ME}
        if method == "GET":
            return self.comments
        self.posted.append(body)
        return {"html_url": "https://github.com/x/y/issues/7#issuecomment-1"}


def test_commenting_over_an_unread_reply_is_refused_and_shows_it() -> None:
    # #205: a comment two minutes after bateks's answer hid it from `status`.
    github = FakeGitHub([comment(sign("A, B or C?")), comment("A, with an env flag")])

    with pytest.raises(SystemExit) as refused:
        post_comment(github, 7, "Points 1 and 2 are in a PR")  # type: ignore[arg-type]

    assert "A, with an env flag" in str(refused.value)
    assert github.posted == []


def test_once_read_the_comment_goes(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(AgentPower.MODEL_ENV, raising=False)  # a person's session, not an agent's
    github = FakeGitHub([comment(sign("A, B or C?")), comment("A, with an env flag")])

    url = post_comment(github, 7, "Doing A", read=True)  # type: ignore[arg-type]

    assert github.posted == [{"body": sign("Doing A", ME)}]
    assert url.endswith("issuecomment-1")


# --- status says when it looked (#230) -------------------------------------------------------


class QuietGitHub:
    slug = "bateks/PersonalExchangeBot"

    def call(self, method: str, path: str, body: object | None = None) -> object:
        return {"login": ME} if path == "/user" else []


def test_status_says_when_it_looked(capsys: pytest.CaptureFixture[str]) -> None:
    status(QuietGitHub(), now=lambda: datetime(2026, 10, 7, 6, 47))  # type: ignore[arg-type]

    first = capsys.readouterr().out.splitlines()[0]
    assert first == "Acting as bateks on bateks/PersonalExchangeBot, 2026-10-07 06:47."


# --- a postponed issue is left out (#309), and a release's (#517) ----------------------------


class BoardGitHub:
    """Open issues to list; remembers what was asked for."""

    slug = "bateks/PersonalExchangeBot"

    def __init__(self, issues: list[dict[str, object]]) -> None:
        self.issues = issues
        self.paths: list[str] = []

    def call(self, method: str, path: str, body: object | None = None) -> object:
        self.paths.append(path)
        if path == "/user":
            return {"login": ME}
        return self.issues if path.startswith("issues?") else []


@pytest.mark.parametrize("label", ["postponed", "release"])
def test_a_postponed_issue_is_left_out(label: str, capsys: pytest.CaptureFixture[str]) -> None:
    # "release": release-cut.yml answers it and closes it (#517), nobody's task meanwhile.
    github = BoardGitHub(
        [
            issue(number=7),
            issue(number=8, labels=[label]),
            issue(author="albalaeff", number=9, labels=[label]),
        ]
    )

    status(github, now=lambda: datetime(2026, 10, 9, 23, 10))  # type: ignore[arg-type]

    shown = capsys.readouterr().out
    assert "#7 " in shown
    assert "#8" not in shown and "#9" not in shown  # Others' too
    assert not [path for path in github.paths if path.startswith("issues/8/")]  # not read


def held_pr(body: str, ref: str) -> ChangingGitHub:
    """Postponed #7, and PR #9 with `body` on branch `ref`: a reply on it waits, and CI is
    green."""
    pr = {**issue(number=9), "pull_request": {}, "body": body}
    github = ChangingGitHub([issue(number=7, labels=["postponed"]), pr])
    github.comments[9] = [comment(sign("Opened")), comment("Please rename it")]
    github.pulls = [{"number": 9, "draft": False, "body": body, "head": {"sha": "a", "ref": ref}}]
    github.runs["a"] = [run("CI", "completed", "success", ended="21:50")]
    return github


@pytest.mark.parametrize(
    ("body", "ref"),
    [(f"Closes #7\n\n{GENERATED}", "fix/x"), ("Some change", "feature/7-x")],
    ids=["it closes it", "on its branch"],
)
def test_a_postponed_issue_s_pr_is_left_out_with_it(body: str, ref: str) -> None:
    # #540: the manager started an agent on postponed #59 for CI's result on its PR #536,
    # beside the session that was merging it.
    github = held_pr(body, ref)
    now = lambda: datetime(2026, 10, 13, 22, 0)  # noqa: E731

    held = look(github, now)  # type: ignore[arg-type]
    github.issues[0] = issue(number=7)  # the label goes
    freed = look(github, now)  # type: ignore[arg-type]

    assert held.tasks == () and "#9" not in held.text
    assert {(task.number, task.state) for task in freed.tasks} == {
        (7, "to start"),
        (9, "reply waiting"),
        (9, "CI finished"),
    }


def test_a_pr_for_no_issue_isn_t_held_by_a_postponed_one() -> None:
    github = held_pr(GENERATED, "chore/claude-prices")

    seen = look(github, lambda: datetime(2026, 10, 13, 22, 0))  # type: ignore[arg-type]

    assert {(task.number, task.state) for task in seen.tasks} == {
        (9, "reply waiting"),
        (9, "CI finished"),
    }


# --- what an issue builds on holds it until it merges (#107) ---------------------------------


LATER = datetime(2026, 10, 13, 18, 0, tzinfo=UTC)


def building(number: int, body: str = "", labels: Sequence[str] = ()) -> dict[str, object]:
    return {**issue(number=number, labels=labels), "body": body}


def closed(number: int, at: str) -> dict[str, object]:
    """#`number`, closed at `at` UTC on 2026-10-13."""
    return {**issue(number=number), "state": "closed", "closed_at": f"2026-10-13T{at}:00Z"}


@pytest.mark.parametrize(
    ("body", "labels", "expected"),
    [
        ("Depends on #16", (), (16,)),
        ("The work.\n\n**Depends on** #16, #17 and #20.", (), (16, 17, 20)),
        ("depends on: #17", ("after:16",), (16, 17)),
        ("", ("after:16", "after:x", "bug"), (16,)),
        ("- A `Depends on #16` line in the issue body", (), ()),  # about such a line
        ("Depends on #18", (), ()),  # itself
    ],
    ids=["a line", "several", "a label too", "labels", "in a sentence", "itself"],
)
def test_what_an_issue_builds_on_is_a_line_of_its_body_or_a_label(
    body: str, labels: Sequence[str], expected: tuple[int, ...]
) -> None:
    assert builds_on(building(18, body, labels)) == expected


def test_an_issue_that_builds_on_an_open_one_is_blocked_with_its_pr() -> None:
    # #107: #18 built on #16 and #17 with nothing to hold it, so its PR #103 carried both
    # their commits. A chain holds: #18 waits on #17, which waits on #16.
    body = f"Closes #18\n\n{GENERATED}"
    pr = {**issue(number=103), "pull_request": {}, "body": body}
    github = ChangingGitHub(
        [issue(number=16), building(17, "Depends on #16"), building(18, labels=["after:17"]), pr]
    )
    github.comments[18] = [handing_off(GOES_ON)]
    github.comments[103] = [comment(sign("Opened")), comment("Please rename it")]
    github.pulls = [
        {"number": 103, "draft": False, "body": body, "head": {"sha": "a", "ref": "feature/18-x"}}
    ]
    github.runs["a"] = [run("CI", "completed", "success", ended="17:50")]

    seen = look(github, lambda: LATER)  # type: ignore[arg-type]

    assert [(task.number, task.state) for task in seen.tasks] == [(16, "to start")]
    assert seen.text.splitlines()[1:] == [
        "",
        "To start (mine, no comment from Claude yet):",
        "  issue #16 Something to do",
        "",
        "Blocked (what they build on is open: no agent starts on them):",
        "  issue #17 Something to do [waits on #16]",
        "  issue #18 Something to do [waits on #17]",
        "  PR #103 Something to do [CI: success] [waits on #17]",
    ]
    assert seen.held == (
        "Issue #17 is blocked: it waits on #16, which it builds on.",
        "Issue #18 is blocked: it waits on #17, which it builds on.",
        "PR #103 is blocked: it waits on #17, which it builds on.",
    )
    assert github.asked == []  # nor are the labels of a reply's author taken off


def test_the_merge_of_what_it_builds_on_wakes_it(capsys: pytest.CaptureFixture[str]) -> None:
    # #107: the agents of #17 and #18 both wrote the trap down: nothing woke them at a merge.
    github = ChangingGitHub([issue(number=17), building(18, "Depends on #17")])
    waits = "**Next:** the code (Claude's). **Waiting on:** #17's merge."
    github.comments[17] = [handing_off(waits, created_at="2026-10-13T14:00:00Z")]
    github.comments[18] = [handing_off(waits, created_at="2026-10-13T14:30:00Z")]

    def merged() -> None:
        github.issues.pop(0)
        github.closed[17] = closed(17, "16:00")

    github.later = [merged]

    watch(github, sleep=github.sleep, now=lambda: LATER, output=JsonOutput())  # type: ignore[arg-type]

    lines = said(capsys)
    assert lines[0] == {
        "type": "note",
        "text": "Issue #18 is blocked: it waits on #17, which it builds on.",
    }
    woken = lines[1]
    assert (woken["key"], woken["state"], woken["woken"]) == (
        "#18 unblocked, 1 comments",
        "unblocked",
        [17],
    )
    assert len(lines) == 2


def test_what_closed_before_claude_s_last_word_wakes_nothing() -> None:
    github = ChangingGitHub([building(18, "Depends on #17 and #99")])  # #99: a typo, not there
    github.comments[18] = [said_at("16:30", "Merged develop in; CI runs.")]
    github.closed[17] = closed(17, "16:00")

    seen = look(github, lambda: LATER)  # type: ignore[arg-type]

    assert seen.tasks == () and seen.held == ()
    assert seen.text.splitlines()[-1] == "  issue #18 Something to do"


def test_a_woken_issue_with_its_move_already_claude_s_says_what_merged() -> None:
    github = ChangingGitHub([building(18, "Depends on #17")])
    github.comments[18] = [handing_off(GOES_ON, created_at="2026-10-13T14:30:00Z")]
    github.closed[17] = closed(17, "16:00")

    seen = look(github, lambda: LATER)  # type: ignore[arg-type]

    assert [(task.state, task.woken) for task in seen.tasks] == [("Claude's move", (17,))]
    assert seen.text.splitlines()[-1] == "  issue #18 Something to do [#17 closed]"


def relating(number: int, blockers: int) -> dict[str, object]:
    """#`number`, which GitHub's own "blocked by" has related to `blockers` issues: every issue
    says how many in `issue_dependencies_summary` (template#1)."""
    return {**issue(number=number), "issue_dependencies_summary": {"total_blocked_by": blockers}}


def test_github_s_own_blocked_by_holds_an_issue_as_a_depends_on_line_does() -> None:
    # template#1: the sidebar's relation, which GitHub shows on both issues, holds it too.
    github = ChangingGitHub([issue(number=17), relating(18, 2)])
    github.blocked_by[18] = [{**issue(number=17), "state": "open"}, closed(16, "12:00")]

    seen = look(github, lambda: LATER)  # type: ignore[arg-type]

    assert [(task.number, task.state) for task in seen.tasks] == [(17, "to start")]
    assert seen.text.splitlines()[-1] == "  issue #18 Something to do [waits on #17]"


def test_the_close_of_a_github_blocker_wakes_it() -> None:
    github = ChangingGitHub([relating(18, 1)])
    github.comments[18] = [handing_off(GOES_ON, created_at="2026-10-13T14:30:00Z")]
    github.blocked_by[18] = [closed(17, "16:00")]

    seen = look(github, lambda: LATER)  # type: ignore[arg-type]

    assert [(task.state, task.woken) for task in seen.tasks] == [("Claude's move", (17,))]


def test_blocked_relates_them_as_the_sidebar_does() -> None:
    github = ChangingGitHub([{**issue(number=17), "id": 3017}])

    said = block(github, 18, 17)  # type: ignore[arg-type]

    assert github.asked == [("POST", "issues/18/dependencies/blocked_by")]
    assert github.sent == [{"issue_id": 3017}]  # GitHub takes the blocker's id, not its number
    assert said == "#18 waits on #17: no agent starts on it until #17 is closed."


# --- watch: waits for something new to do (#314) ---------------------------------------------


class ChangingGitHub:
    """Open issues and PRs that change while `watch` sleeps: `later` happens at each sleep.
    What it's asked to change, it notes (`asked`)."""

    slug = "bateks/PersonalExchangeBot"

    def __init__(self, issues: list[dict[str, object]]) -> None:
        self.issues = issues
        self.closed: dict[int, dict[str, object]] = {}  # asked for alone, not listed
        self.comments: dict[int, list[dict[str, object]]] = {}
        self.pulls: list[dict[str, object]] = []
        self.runs: dict[str, list[dict[str, object]]] = {}
        self.later: list[object] = []
        self.asked: list[tuple[str, str]] = []
        self.sent: list[object] = []  # the bodies of what it's asked to change
        self.blocked_by: dict[int, list[dict[str, object]]] = {}  # GitHub's own relation

    def call(
        self, method: str, path: str, body: object | None = None, missing_ok: bool = False
    ) -> object:
        if method != "GET":
            self.asked.append((method, path))
            self.sent.append(body)
            return {}
        if path == "/user":
            return {"login": ME}
        if path.startswith("issues?"):
            return self.issues
        if path.startswith("issues/"):
            number = int(path.split("/")[1])
            if "/dependencies/blocked_by?" in path:  # asked only of one that has had any
                return self.blocked_by[number]
            if path == f"issues/{number}":  # the issue itself; None for one not there
                listed = [entry for entry in self.issues if entry["number"] == number]
                return listed[0] if listed else self.closed.get(number)
            return self.comments.get(number, [])
        if path.startswith("pulls?"):
            return self.pulls
        if path.startswith("actions/runs?head_sha="):
            return {"workflow_runs": self.runs.get(path.split("=")[1], [])}
        raise AssertionError(path)

    def sleep(self, seconds: float) -> None:
        if self.later:
            self.later.pop(0)()  # type: ignore[operator]


def run(
    name: str, status: str, conclusion: str | None = None, ended: str | None = None
) -> dict[str, object]:
    """A workflow run; a finished one's `updated_at` is when it ended (#456)."""
    found = {"name": name, "status": status, "conclusion": conclusion}
    return found if ended is None else {**found, "updated_at": f"2026-10-13T{ended}:00Z"}


def said_at(
    time: str, body: str = "CI is green: merging.", signed: bool = True
) -> dict[str, object]:
    """A comment of Claude's (`signed`) or bateks's own, at `time` UTC on 2026-10-13."""
    return {**comment(sign(body) if signed else body), "created_at": f"2026-10-13T{time}:00Z"}


def test_watch_ends_when_a_reply_comes(capsys: pytest.CaptureFixture[str]) -> None:
    github = ChangingGitHub([issue(number=7)])
    github.comments[7] = [comment(sign("A or B?"))]
    github.later = [
        lambda: None,  # a quiet look
        lambda: github.comments[7].append(comment("B")),
    ]

    watch(github, sleep=github.sleep, now=lambda: datetime(2026, 10, 10, 2, 0))  # type: ignore[arg-type]

    shown = capsys.readouterr().out
    assert "A reply waiting" in shown and "#7 " in shown


def test_what_needed_doing_when_it_began_doesnt_end_it(
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Claude acts on `status` before it starts watching; what it left (a CI failure it waits
    # on) isn't new. Each look is ten minutes; it gives up after the longest wait.
    github = ChangingGitHub([issue(number=7)])  # to start
    now = lambda: datetime(2026, 10, 10, 2, 0)  # noqa: E731

    watch(github, every=600, longest=1800, sleep=github.sleep, now=now)  # type: ignore[arg-type]

    shown = capsys.readouterr().out
    assert shown.strip() == "Nothing new to do (02:00–02:00)."


def test_it_looks_every_two_minutes() -> None:
    # #445: every ten, an issue waited up to ten minutes at each step (plan, reply, CI, merge).
    slept: list[float] = []

    watch(ChangingGitHub([]), longest=360, sleep=slept.append)  # type: ignore[arg-type]

    assert slept == [120, 120, 120]


def test_it_follows_develop_every_ten_minutes_not_at_every_look() -> None:
    # #445: each `follow_develop` is a `git fetch`; it keeps the ten minutes #347 gave it.
    slept: list[float] = []
    followed: list[int] = []  # how many looks had gone by at each

    watch(
        ChangingGitHub([]),  # type: ignore[arg-type]
        every=120,
        longest=1800,
        sleep=slept.append,
        follow=lambda: followed.append(len(slept)),
    )

    assert followed == [5, 10, 15]


def test_a_pr_whose_ci_has_finished_ends_it(capsys: pytest.CaptureFixture[str]) -> None:
    pr = {**issue(number=9), "pull_request": {}, "body": GENERATED}
    github = ChangingGitHub([pr])
    github.pulls = [{"number": 9, "draft": False, "head": {"sha": "abc"}}]
    github.runs["abc"] = [run("CI", "in_progress")]
    github.later = [lambda: github.runs.__setitem__("abc", [run("CI", "completed", "success")])]

    watch(github, sleep=github.sleep, now=lambda: datetime(2026, 10, 10, 2, 0))  # type: ignore[arg-type]

    assert "PR #9 Something to do [CI: success]" in capsys.readouterr().out


def test_a_new_ci_run_on_a_pr_is_new(capsys: pytest.CaptureFixture[str]) -> None:
    # Pushed again after a failure: the new commit's result is something new to do.
    pr = {**issue(number=9), "pull_request": {}, "body": GENERATED}
    github = ChangingGitHub([pr])
    github.pulls = [{"number": 9, "draft": False, "head": {"sha": "abc"}}]
    github.runs["abc"] = [run("CI", "completed", "failure")]
    github.runs["def"] = [run("CI", "completed", "failure")]
    github.later = [lambda: github.pulls[0].__setitem__("head", {"sha": "def"})]

    watch(github, sleep=github.sleep, now=lambda: datetime(2026, 10, 10, 2, 0))  # type: ignore[arg-type]

    assert "PR #9 Something to do [CI: failure]" in capsys.readouterr().out


def test_a_rerun_of_ci_on_the_same_commit_is_new(capsys: pytest.CaptureFixture[str]) -> None:
    # #160: #154's agent waited on attempt 2 of CI on its commit. Its success had the key
    # attempt 1's had, which needed doing when the watcher began, so nothing woke.
    pr = {**issue(number=9), "pull_request": {}, "body": GENERATED}
    github = ChangingGitHub([pr])
    github.pulls = [{"number": 9, "draft": False, "head": {"sha": "abc"}}]
    github.runs["abc"] = [run("CI", "completed", "success")]
    again = {"run_attempt": 2}
    github.later = [
        lambda: github.runs.__setitem__("abc", [{**run("CI", "in_progress"), **again}]),
        lambda: github.runs.__setitem__("abc", [{**run("CI", "completed", "success"), **again}]),
    ]

    watch(github, sleep=github.sleep, now=lambda: datetime(2026, 10, 10, 2, 0))  # type: ignore[arg-type]

    assert "PR #9 Something to do [CI: success]" in capsys.readouterr().out


@pytest.mark.parametrize(
    ("attempts", "key"),
    [
        ((None,), "PR #9 at abc: CI: success"),
        ((1, 1), "PR #9 at abc: CI: success, Project board: success"),
        ((2, 1), "PR #9 at abc (attempt 2): CI: success, Project board: success"),
    ],
)
def test_a_rerun_s_key_says_its_attempt_and_a_first_one_s_is_as_it_was(
    capsys: pytest.CaptureFixture[str], attempts: tuple[int | None, ...], key: str
) -> None:
    # #160: a first attempt's key is unchanged, so no task already handled turns new.
    pr = {**issue(number=9), "pull_request": {}, "body": GENERATED}
    github = ChangingGitHub([pr])
    github.pulls = [{"number": 9, "draft": False, "head": {"sha": "abc"}}]
    names = ["CI", "Project board"][: len(attempts)]
    github.runs["abc"] = [
        {**run(name, "completed", "success"), **({"run_attempt": n} if n else {})}
        for name, n in zip(names, attempts, strict=True)
    ]

    watch(github, longest=0, sleep=github.sleep, output=JsonOutput())  # type: ignore[arg-type]

    assert said(capsys)[0]["key"] == key


# --- keeping develop up to date (#347) -------------------------------------------------------


class Repo:
    """A fake `git` for `follow_develop`: the checkout, and what origin/develop has."""

    def __init__(
        self, branch: str = "develop", dirty: bool = False, ahead: int = 0, behind: int = 2
    ) -> None:
        self.branch, self.dirty, self.ahead, self.behind = branch, dirty, ahead, behind
        self.head, self.commands = "a" * 40, []  # type: list[str]

    def __call__(self, command: Sequence[str], **_: object) -> subprocess.CompletedProcess[str]:
        args = list(command)[1:]
        self.commands.append(" ".join(args))
        out = ""
        match args:
            case ["rev-parse", "--abbrev-ref", "HEAD"]:
                out = self.branch
            case ["rev-parse", "HEAD"]:
                out = self.head
            case ["status", *_]:
                out = " M fxbot/x.py" if self.dirty else ""
            case ["rev-list", "--count", "origin/develop..HEAD"]:
                out = str(self.ahead)
            case ["rev-list", "--count", "HEAD..origin/develop"]:
                out = str(self.behind)
            case ["merge", "--ff-only", *_]:
                self.head, self.behind = "b" * 40, 0
        return subprocess.CompletedProcess(command, 0, out + "\n", "")


def test_an_idle_develop_is_pulled() -> None:
    repo = Repo()

    said = follow_develop(repo)

    assert "merge --ff-only -q origin/develop" in repo.commands
    assert said == "Pulled develop: aaaaaaa..bbbbbbb."


def test_up_to_date_nothing_happens() -> None:
    repo = Repo(behind=0)

    assert follow_develop(repo) is None
    assert not any(c.startswith("merge") for c in repo.commands)


@pytest.mark.parametrize(
    "repo",
    [Repo(branch="feature/347-follow"), Repo(dirty=True)],
    ids=["busy on a branch", "uncommitted changes"],
)
def test_busy_it_only_fetches(repo: Repo) -> None:
    assert follow_develop(repo) is None
    assert repo.commands[0].startswith("fetch")
    assert not any(c.startswith("merge") for c in repo.commands)


def test_develop_with_commits_of_its_own_is_left_alone() -> None:
    repo = Repo(ahead=1)

    said = follow_develop(repo)

    assert not any(c.startswith("merge") for c in repo.commands)
    assert said is not None and "1 commit of its own" in said


def test_no_network_no_pull() -> None:
    def offline(command: Sequence[str], **_: object) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(command, 128, "", "fatal: unable to access")

    assert follow_develop(offline) is None


def test_watch_pulls_without_ending(capsys: pytest.CaptureFixture[str]) -> None:
    """A pull isn't something for Claude to do: it's said in a line, and watching goes on.
    The same word twice (develop still ahead) is said once."""
    github = ChangingGitHub([])
    said = iter(["Pulled develop: aaaaaaa..bbbbbbb.", None, "ahead", "ahead"])

    watch(
        github,  # type: ignore[arg-type]
        every=600,
        longest=2400,
        sleep=github.sleep,
        now=lambda: datetime(2026, 10, 11, 11, 0),
        follow=lambda: next(said),
    )

    assert capsys.readouterr().out.splitlines() == [
        "Pulled develop: aaaaaaa..bbbbbbb.",
        "ahead",
        "Nothing new to do (11:00–11:00).",
    ]


def test_new_prices_end_watching_and_the_rest_is_said_in_a_line(
    capsys: pytest.CaptureFixture[str],
) -> None:
    # #390: once a day the prices are read; a change is a task (commit the new rows).
    github = ChangingGitHub([])
    news = iter(
        [
            None,  # not due
            PriceNews("Claude's prices: unchanged (4 models)."),
            PriceNews("Claude's prices changed (claude-opus-5-5): …", added=(object(),)),  # type: ignore[arg-type]
        ]
    )

    watch(
        github,  # type: ignore[arg-type]
        every=600,
        longest=6000,
        sleep=github.sleep,
        now=lambda: datetime(2026, 10, 12, 15, 0),
        prices=lambda: next(news),
    )

    assert capsys.readouterr().out.splitlines() == [
        "Claude's prices: unchanged (4 models).",
        "Claude's prices changed (claude-opus-5-5): …",
    ]


def test_a_session_s_watch_ends_while_the_agent_manager_runs(
    capsys: pytest.CaptureFixture[str],
) -> None:
    # #387: the manager's agents take the issues; a session watching too would start them twice.
    github = ChangingGitHub([issue(number=7)])
    runs = iter([None, "The agent manager runs on this machine."])  # started after a look

    watch(
        github,  # type: ignore[arg-type]
        sleep=github.sleep,
        now=lambda: datetime(2026, 10, 12, 18, 0),
        stop=lambda: next(runs),
    )

    assert capsys.readouterr().out.splitlines() == ["The agent manager runs on this machine."]


def test_a_manager_already_running_ends_it_before_it_looks(
    capsys: pytest.CaptureFixture[str],
) -> None:
    github = ChangingGitHub([])
    github.call = None  # type: ignore[assignment,method-assign]  # never asked

    watch(github, sleep=github.sleep, stop=lambda: "It runs.")  # type: ignore[arg-type]

    assert capsys.readouterr().out.strip() == "It runs."


# --- watch --json: what needs doing, for the session manager (#387) --------------------------


def said(capsys: pytest.CaptureFixture[str]) -> list[dict[str, object]]:
    return [json.loads(line) for line in capsys.readouterr().out.splitlines()]


def test_for_a_program_it_says_what_needs_doing_when_it_begins(
    capsys: pytest.CaptureFixture[str],
) -> None:
    # A session acted on `status` before it watched; the manager has nothing else to go by.
    github = ChangingGitHub([issue(number=7, labels=["model:sonnet", "bug"])])

    watch(
        github,  # type: ignore[arg-type]
        longest=0,
        sleep=github.sleep,
        now=lambda: datetime(2026, 10, 12, 18, 0),
        output=JsonOutput(),
    )

    assert said(capsys) == [
        {
            "type": "task",
            "key": "#7 to start, 0 comments, model:sonnet",  # the labels the manager reads
            "kind": "issue",
            "number": 7,
            "state": "to start",
            "title": "Something to do",
            "issue": 7,
            "labels": ["model:sonnet", "bug"],
            "branch": None,
            "ci": None,
            "sha": None,
            "green": False,
            "woken": [],
        },
        {"type": "note", "text": "Nothing new to do (18:00–18:00)."},
    ]


def test_a_label_the_manager_reads_makes_a_task_that_waits_new(
    capsys: pytest.CaptureFixture[str],
) -> None:
    # #485: a priority set on a task that waits orders it at the manager's next look, and a
    # new power is the next agent's (CLAUDE.md → How agents work here).
    github = ChangingGitHub([issue(number=7, labels=["bug"])])
    labels = github.issues[0]["labels"]
    github.later = [
        lambda: labels.append({"name": "help wanted"}),  # not the manager's: nothing new
        lambda: labels.append({"name": "priority:high"}),
    ]

    watch(github, sleep=github.sleep, output=JsonOutput())  # type: ignore[arg-type]

    tasks = said(capsys)
    assert [task["key"] for task in tasks] == [
        "#7 to start, 0 comments",
        "#7 to start, 0 comments, priority:high",
    ]
    assert tasks[-1]["labels"] == ["bug", "help wanted", "priority:high"]


def test_for_a_program_it_ends_with_what_s_new(capsys: pytest.CaptureFixture[str]) -> None:
    github = ChangingGitHub([issue(number=7), issue(number=8)])
    github.comments[7] = [comment(sign("A or B?"))]
    github.later = [lambda: github.comments[7].append(comment("B"))]

    watch(github, sleep=github.sleep, output=JsonOutput())  # type: ignore[arg-type]

    keys = [line["key"] for line in said(capsys)]
    assert keys == ["#8 to start, 0 comments", "#7 reply waiting, 2 comments"]


def test_a_pr_s_task_is_for_the_issue_it_closes_with_that_issue_s_labels(
    capsys: pytest.CaptureFixture[str],
) -> None:
    body = f"Closes #7\n\n{GENERATED}"
    pr = {**issue(number=9, labels=["model:haiku"]), "pull_request": {}, "body": body}
    github = ChangingGitHub([issue(number=7, labels=["effort:max"]), pr])
    github.comments[7] = [comment(sign("Plan"))]  # in progress
    github.pulls = [
        {"number": 9, "draft": False, "body": body, "head": {"sha": "abc", "ref": "fix/7-x"}}
    ]
    github.runs["abc"] = [run("CI", "completed", "success")]

    watch(github, longest=0, sleep=github.sleep, output=JsonOutput())  # type: ignore[arg-type]

    assert said(capsys)[0] == {
        "type": "task",
        "key": "PR #9 at abc: CI: success, effort:max",
        "kind": "pull",
        "number": 9,
        "state": "CI finished",
        "title": "Something to do",
        "issue": 7,
        "labels": ["effort:max"],
        "branch": "fix/7-x",
        "ci": "CI: success",
        "sha": "abc",
        "green": True,  # #485: its merge has a lane of its own in the manager
        "woken": [],
    }


@pytest.mark.parametrize(
    ("on", "time", "signed", "a_task"),
    [
        (7, "21:40", True, True),  # before CI ended: not read yet
        (7, "21:55", True, False),  # after, on the issue the PR closes
        (9, "21:55", True, False),  # after, on the PR
        (9, "21:55", False, True),  # bateks's own word isn't Claude's
    ],
    ids=["before", "after on the issue", "after on the PR", "a person's"],
)
def test_ci_s_result_is_a_task_until_claude_speaks_after_it(
    capsys: pytest.CaptureFixture[str], on: int, time: str, signed: bool, a_task: bool
) -> None:
    # #456: on #449 an agent started for a result the handoff before it had read, and each
    # restart of the manager started one for every PR whose CI had finished.
    body = f"Closes #7\n\n{GENERATED}"
    pr = {**issue(number=9), "pull_request": {}, "body": body}
    github = ChangingGitHub([issue(number=7), pr])
    github.comments[7] = [comment(sign("Plan"))]
    github.comments.setdefault(on, []).append(said_at(time, signed=signed))
    github.pulls = [
        {"number": 9, "draft": False, "body": body, "head": {"sha": "abc", "ref": "fix/7-x"}}
    ]
    github.runs["abc"] = [run("CI", "completed", "success", ended="21:50")]

    watch(
        github,  # type: ignore[arg-type]
        longest=0,
        sleep=github.sleep,
        now=lambda: datetime(2026, 10, 13, 22, 0),
        output=JsonOutput(),
    )

    assert ("CI finished" in [line.get("state") for line in said(capsys)]) == a_task


def test_ci_ended_when_its_last_run_did() -> None:
    ci = CiRuns(
        (
            run("CI", "completed", "success", ended="21:50"),
            run("Deploy", "completed", "success", ended="22:05"),
        )
    )

    assert not ci.read(ME, [[said_at("21:55")]])
    assert ci.read(ME, [[comment(sign("Plan"))], [said_at("22:10")]])


@pytest.mark.parametrize(
    ("waiting", "signed", "read"),
    [
        ("CI on #528.", True, False),
        ("nothing.", True, True),
        ("bateks's review.", True, True),
        ("CI on #528.", False, False),  # a person's word isn't Claude's
    ],
    ids=["waits on CI", "waits on nothing", "waits on a review", "a person's"],
)
def test_a_handoff_waiting_on_ci_has_not_read_its_result(
    waiting: str, signed: bool, read: bool
) -> None:
    # #534: CI on #528 ended at 06:18, and the handoff that waited on it came at 06:22, so its
    # merge was never started.
    ci = CiRuns((run("CI", "completed", "success", ended="06:18"),))
    handoff = f"PR open.\n\n**Next:** the merge (CI's). **Waiting on:** {waiting}"

    assert ci.read(ME, [[said_at("06:22", handoff, signed=signed)]]) is read


def test_unfinished_or_with_no_end_ci_is_never_read() -> None:
    running = CiRuns((run("CI", "completed", "success", "21:50"), run("Deploy", "in_progress")))
    no_end = CiRuns((run("CI", "completed", "success"),))

    assert not running.finished and not running.read(ME, [[said_at("22:10")]])
    assert no_end.finished and not no_end.read(ME, [[said_at("22:10")]])
    assert str(running) == "CI: success, Deploy: in_progress"
    assert str(CiRuns(())) == "no CI run" and not CiRuns(()).finished


def test_ci_is_green_when_every_run_has_succeeded() -> None:
    success, failure = run("CI", "completed", "success"), run("Deploy", "completed", "failure")

    assert CiRuns((success, success)).green
    assert not CiRuns((success, failure)).green
    assert not CiRuns((success, run("Deploy", "in_progress"))).green
    assert not CiRuns((run("CI", "completed", "cancelled"),)).green
    assert not CiRuns(()).green


def test_a_failed_run_names_its_failed_jobs_for_logs() -> None:
    # template#5: a red run's log is `logs <job>`, and `ci` is where its job's id is found.
    class JobsGitHub:
        def __init__(self) -> None:
            self.asked: list[str] = []

        def call(self, method: str, path: str) -> object:
            self.asked.append(path)
            jobs = [
                {"id": 1252, "name": "audit", "conclusion": "success"},
                {"id": 1253, "name": "checks", "conclusion": "failure"},
            ]
            return {"jobs": jobs}

    github = JobsGitHub()
    failed = {**run("CI", "completed", "failure"), "id": 88}
    green = {**run("Deploy", "completed", "success"), "id": 89}

    lines = CiRuns((failed, green)).failed_jobs(github)  # type: ignore[arg-type]

    assert lines == ["checks failed: scripts/github.py logs 1253"]
    assert github.asked == ["actions/runs/88/jobs"]  # a green run's jobs aren't asked for


@pytest.mark.parametrize(
    ("body", "ref", "issue_number", "labels"),
    [
        ("Some change", "feature/7-x", 7, []),  # by its branch; #7 has no labels
        (GENERATED, "chore/claude-prices", None, ["model:haiku"]),  # for no issue: its own
    ],
    ids=["branch", "none"],
)
def test_a_pr_s_issue_by_its_branch_or_none(
    capsys: pytest.CaptureFixture[str],
    body: str,
    ref: str,
    issue_number: int | None,
    labels: list[str],
) -> None:
    pr = {**issue(number=9, labels=["model:haiku"]), "pull_request": {}, "body": body}
    github = ChangingGitHub([issue(number=7), pr])
    github.comments[7] = [comment(sign("Plan"))]
    github.comments[9] = [comment(sign("Opened")), comment("Please rename it")]
    github.pulls = [{"number": 9, "draft": False, "body": body, "head": {"sha": "a", "ref": ref}}]

    watch(github, longest=0, sleep=github.sleep, output=JsonOutput())  # type: ignore[arg-type]

    task = said(capsys)[0]
    assert task["key"] == ", ".join(["#9 reply waiting, 2 comments", *labels])
    assert (task["kind"], task["issue"], task["labels"]) == ("pull", issue_number, labels)
    assert task["branch"] == ref


def test_for_a_program_new_prices_are_a_task_and_the_rest_notes(
    capsys: pytest.CaptureFixture[str],
) -> None:
    github = ChangingGitHub([])
    news = iter(
        [
            PriceNews("Claude's prices: unchanged (4 models)."),
            PriceNews("Claude's prices changed (claude-opus-5-5): …", added=(object(),)),  # type: ignore[arg-type]
        ]
    )

    watch(
        github,  # type: ignore[arg-type]
        every=600,  # develop's pull at each look
        sleep=github.sleep,
        follow=lambda: "Pulled develop: aaaaaaa..bbbbbbb.",
        prices=lambda: next(news),
        output=JsonOutput(),
    )

    assert said(capsys) == [
        {"type": "note", "text": "Pulled develop: aaaaaaa..bbbbbbb."},
        {"type": "note", "text": "Claude's prices: unchanged (4 models)."},
        {
            "type": "prices",
            "key": "prices: Claude's prices changed (claude-opus-5-5): …",
            "text": "Claude's prices changed (claude-opus-5-5): …",
        },
    ]


def test_for_the_manager_prs_the_wiki_lacks_are_a_task_and_the_rest_notes(
    capsys: pytest.CaptureFixture[str],
) -> None:
    # #126: the wiki's check ends watching with what it found, as new prices do.
    github = ChangingGitHub([])
    behind = WikiNews(
        "The wiki is behind develop: 1 PR merged since aaaaaaa (#127).", "b", "a", (127,)
    )
    news = iter([None, WikiNews("The wiki: nothing merged into develop since aaaaaaa."), behind])

    watch(github, every=600, sleep=github.sleep, wiki=lambda: next(news), output=JsonOutput())  # type: ignore[arg-type]

    assert said(capsys) == [
        {"type": "note", "text": "The wiki: nothing merged into develop since aaaaaaa."},
        behind.data(),
    ]


def test_a_task_reads_back_as_it_was_said() -> None:
    task = Task(
        "PR #9 at abc: CI: success",
        "pull",
        9,
        "CI finished",
        "X",
        7,
        ("a",),
        "b",
        "c",
        "d",
        True,
        (16, 17),
    )

    assert Task.from_data(json.loads(json.dumps(task.data()))) == task


# --- what the work cost (#390) ---------------------------------------------------------------


class TitledGitHub:
    """One issue's title and comments, and the PRs, some closing it."""

    def __init__(self, title: str) -> None:
        self.title = title
        self.comments: list[dict[str, object]] = []
        self.pulls = [
            {"number": 396, "body": "_Claude Code (bateks)_\n\nCloses #393 (item 3)"},
            {"number": 397, "body": "Fixes #3930"},  # another issue
            {"number": 395, "body": None},
        ]

    def call(self, method: str, path: str, body: object | None = None) -> object:
        if path == "/user":
            return {"login": ME}
        if path.startswith("pulls?"):
            return self.pulls
        if "/comments" in path:
            return self.comments
        if method == "PATCH":
            assert isinstance(body, dict)
            self.title = body["title"]
            return {}
        return {"title": self.title}


def took(dollars: str) -> Callable[[int, Iterable[int]], IssueCost]:
    def cost_of(number: int, pulls: Iterable[int]) -> IssueCost:
        assert list(pulls) == [396]
        return IssueCost(number, dollars=Decimal(dollars))

    return cost_of


def test_the_estimate_goes_in_front_of_the_title() -> None:
    github = TitledGitHub("UI improvements after recent review")

    title = IssueWork(github, 393).retitle(estimate=Decimal(37))  # type: ignore[arg-type]

    assert title == github.title == "[~$40] UI improvements after recent review"


def test_once_done_what_it_took_goes_in_front_of_the_estimate() -> None:
    github = TitledGitHub("[~$40] UI improvements after recent review")

    IssueWork(github, 393, cost_of=took("61.6"), here=lambda: HERE).retitle(done=True)  # type: ignore[arg-type]

    assert github.title == "[$62] [~$40] UI improvements after recent review"


def test_an_issue_s_prs_are_those_that_close_it() -> None:
    assert IssueWork(TitledGitHub("x"), 393).pulls() == [396]  # type: ignore[arg-type]


AT = datetime(2026, 10, 12, 16, 20, tzinfo=UTC)


def handed_off(mark: HandoffMark, login: str = ME) -> dict[str, object]:
    return comment(sign(f"Where it stands.\n\n{mark}", login), author=login)


def test_once_done_every_machine_s_share_counts() -> None:
    # #399: this machine's logs, plus what the latest handoff from each other machine says.
    github = TitledGitHub("[~$40] UI improvements after recent review")
    github.comments = [
        handed_off(HandoffMark(ELSEWHERE, AT, Decimal(12))),
        handed_off(HandoffMark(ELSEWHERE, AT, Decimal(20))),  # the latest from there
        handed_off(HandoffMark(HERE, AT, Decimal(50))),  # here, the logs count instead
    ]

    IssueWork(github, 393, cost_of=took("41.6"), here=lambda: HERE).retitle(done=True)  # type: ignore[arg-type]

    assert github.title == "[$62] [~$40] UI improvements after recent review"


def test_the_cost_says_what_other_machines_recorded() -> None:
    github = TitledGitHub("x")
    github.comments = [handed_off(HandoffMark(ELSEWHERE, AT, Decimal(20)))]

    work = IssueWork(github, 393, cost_of=took("41.6"), here=lambda: HERE)  # type: ignore[arg-type]

    assert work.summary().splitlines() == [
        "Issue 393: $41.60 (nothing priced), 0 replies, 0.0M tokens",
        f"Elsewhere, by its latest handoff: bateks on {ELSEWHERE} $20.00",
        "In all: $61.60",
    ]
    assert IssueWork(TitledGitHub("x"), 393, cost_of=took("2"), here=lambda: HERE).summary() == (  # type: ignore[arg-type]
        "Issue 393: $2.00 (nothing priced), 0 replies, 0.0M tokens"
    )


def test_a_handoff_ends_with_where_when_and_what_it_cost_here() -> None:
    work = IssueWork(TitledGitHub("x"), 393, cost_of=took("12.4"), here=lambda: HERE)  # type: ignore[arg-type]

    text = work.handoff("**Next:** the PR (Claude's).\n", closing=True, now=lambda: AT)

    mark = HandoffMark(HERE, AT, Decimal("12.4"), closing=True)
    assert text == f"**Next:** the PR (Claude's).\n\n{mark}"


# --- what a session carries on from (#399) ---------------------------------------------------


CHECKOUT = "C:/git/PersonalExchangeBot"


def test_handoffs_show_where_each_issue_stands_and_what_is_only_here() -> None:
    github = ChangingGitHub(
        [
            issue(number=399),
            issue(number=387),
            issue(number=390),
            issue(author="albalaeff", number=330),
        ]
    )
    mark = HandoffMark(ELSEWHERE, datetime(2026, 10, 12, 16, 20), Decimal(5))
    github.comments[399] = [
        {**handed_off(mark), "html_url": "https://github.com/x/y/issues/399#1"},
        comment("Looks good"),
    ]
    github.comments[387] = [
        {**comment(sign("Starting now.")), "html_url": "https://github.com/x/y/issues/387#2"}
    ]
    github.pulls = [
        {
            "number": 400,
            "draft": False,
            "state": "open",
            "merged_at": None,
            "body": "Closes #399",
            "head": {"sha": "abc", "ref": "feature/399-handoff"},
        },
        {
            "number": 398,
            "draft": False,
            "state": "closed",
            "merged_at": "2026-10-12T12:00:00Z",
            "body": "Closes #390",
            "head": {"sha": "def", "ref": "feature/390-prices"},
        },
    ]
    github.runs["abc"] = [run("CI", "completed", "success")]
    tip = "a" * 40
    git = Git(
        Path(CHECKOUT),
        FakeGit(
            {
                "fetch -q --prune origin": "",
                " ".join(IssueBranch.REFS): "refs/heads/feature/399-handoff\n"
                "refs/remotes/origin/feature/399-handoff",
                "rev-parse --verify -q refs/remotes/origin/feature/399-handoff": tip,
                "rev-parse --verify -q refs/heads/feature/399-handoff": tip,
                f"rev-list --left-right --count {tip}...{tip}": "0\t0",
                f"log -1 --format=%s {tip}": "Handoff marks",
                f"rev-list --count {tip}..origin/develop": "0",
                "worktree list --porcelain": f"worktree {CHECKOUT}\nHEAD {tip}\n"
                "branch refs/heads/feature/399-handoff\n",
                "status --porcelain": "",
                " ".join(LocalWork.BRANCHES): "feature/399-handoff\torigin/feature/399-handoff\t",
                "stash list": "",
                "rev-parse --abbrev-ref HEAD": "feature/399-handoff",
            }
        ),
    )

    text = CarryOn(github, git, HERE, now=lambda: datetime(2026, 10, 12, 16, 30)).text()  # type: ignore[arg-type]

    assert text.startswith("Acting as bateks on bateks/PersonalExchangeBot, 2026-10-12 16:30.")
    handoffs = text.split("\nHandoffs")[1]
    assert "#399 [reply waiting] Something to do" in handoffs
    assert "another machine, and that session went on" in handoffs
    assert "since: 1 comment (bateks)" in handoffs
    assert "PR #400 open [CI: success]" in handoffs
    assert "feature/399-handoff: on origin at aaaaaaa (Handoff marks); here the same" in handoffs
    assert "Where it stands." in handoffs
    assert "no handoff yet; Claude's last comment: https://github.com/x/y/issues/387#2" in handoffs
    assert "#390 [to start] Something to do" in handoffs and "PR #398 merged" in handoffs
    assert "#330" not in handoffs  # albalaeff's
    assert "This machine: DESKTOP-1 (c--git-personalexchangebot), on feature/399-handoff." in text
    assert text.rstrip().endswith("Nothing is only on this machine.")


def test_offline_the_branches_are_as_last_fetched() -> None:
    git = Git(Path(CHECKOUT), FakeGit({}))  # every git command fails

    text = CarryOn(ChangingGitHub([]), git, HERE).text()  # type: ignore[arg-type]

    assert "couldn't fetch origin" in text


def test_an_agent_carries_on_from_its_own_issue_alone() -> None:
    # Every open issue's handoff was most of what an agent read at its start, and its own
    # it read twice: `show <n>` prints it with the other comments.
    github = ChangingGitHub([issue(number=399), issue(number=387)])
    mark = HandoffMark(HERE, datetime(2026, 10, 12, 16, 20), Decimal(5))
    github.comments[399] = [
        {**handed_off(mark), "html_url": "https://github.com/x/y/issues/399#1"},
        comment("Looks good"),
    ]
    github.comments[387] = [{**handed_off(mark), "html_url": "https://github.com/x/y/issues/387#2"}]
    tip = "a" * 40
    worktrees = (
        f"worktree {CHECKOUT}\nHEAD {tip}\nbranch refs/heads/feature/399-handoff\n\n"
        f"worktree C:/git/worktrees/387\nHEAD {'b' * 40}\nbranch refs/heads/feature/387-agents\n"
    )
    git = Git(
        Path(CHECKOUT),
        FakeGit(
            {
                "fetch -q --prune origin": "",
                " ".join(IssueBranch.REFS): "refs/heads/feature/399-handoff",
                "rev-parse --verify -q refs/heads/feature/399-handoff": tip,
                f"log -1 --format=%s {tip}": "Handoff marks",
                f"rev-list --count {tip}..origin/develop": "0",
                "worktree list --porcelain": worktrees,
                f"{CHECKOUT}: status --porcelain": " M scripts/handoff.py",
                "C:/git/worktrees/387: status --porcelain": " M scripts/agents.py",
                " ".join(LocalWork.BRANCHES): "feature/399-handoff\t\t\nfeature/387-agents\t\t",
                "rev-list --count feature/399-handoff --not --remotes=origin": "2",
                "rev-list --count feature/387-agents --not --remotes=origin": "1",
                "stash list": "",
                "rev-parse --abbrev-ref HEAD": "feature/399-handoff",
            }
        ),
    )

    text = IssueCarryOn(github, git, HERE, number=399).text()  # type: ignore[arg-type]

    lines = text.splitlines()
    assert lines[0] == "#399 [reply waiting] Something to do"
    assert lines[1].endswith(": this machine") and lines[2] == "  since: 1 comment (bateks)"
    assert "  feature/399-handoff: only here, never pushed, at aaaaaaa (Handoff marks)" in lines
    assert "  https://github.com/x/y/issues/399#1: its text is in `show 399`" in lines
    assert "Where it stands." not in text  # the handoff's text: `show 399` has it
    assert "Acting as" not in text and "387" not in text  # no status, nothing of others'
    assert lines[-4:] == [
        "This machine: DESKTOP-1 (c--git-personalexchangebot), on feature/399-handoff.",
        "Only on this machine:",
        f"  - 1 uncommitted change on feature/399-handoff, in {CHECKOUT}",
        "  - feature/399-handoff: never pushed, 2 commits of its own",
    ]


# --- whose move it is (#449) -----------------------------------------------------------------


GOES_ON = "**Next:** the PR (Claude's). **Waiting on:** nothing."
NOW = datetime(2026, 10, 13, 12, 0, tzinfo=UTC)
DAYS_AGO = "2026-10-09T10:00:00Z"


def handing_off(text: str, closing: bool = True, **fields: object) -> dict[str, object]:
    """Claude's comment saying `text`, as a handoff."""
    mark = HandoffMark(HERE, AT, closing=closing)
    return {**comment(sign(f"{text}\n\n{mark}")), **fields}


@pytest.mark.parametrize(
    ("text", "closing", "expected"),
    [
        (GOES_ON, True, "Claude's move"),
        (GOES_ON, False, "in progress"),  # the session that said it goes on by itself
        ("**Next:** your answer (bateks's). **Waiting on:** bateks's answer.", True, "in progress"),
        ("**Next:** CI's result (CI's). **Waiting on:** CI on PR #452.", True, "in progress"),
    ],
    ids=["closing", "still open", "a person's", "CI's"],
)
def test_a_closing_handoff_that_says_claude_goes_on_is_claude_s_move(
    text: str, closing: bool, expected: str
) -> None:
    # #449: such a handoff waited for a person, and an approval given in chat started nothing.
    assert state(issue(), [handing_off(text, closing)]) == expected


def test_claude_s_move_is_a_task_once_per_handoff(capsys: pytest.CaptureFixture[str]) -> None:
    github = ChangingGitHub([issue(number=7)])
    github.comments[7] = [handing_off(GOES_ON)]

    watch(github, longest=0, sleep=github.sleep, output=JsonOutput())  # type: ignore[arg-type]

    task = said(capsys)[0]
    assert (task["key"], task["state"], task["issue"]) == (
        "#7 Claude's move, 1 comments",
        "Claude's move",
        7,
    )


def test_status_lists_claude_s_move_and_flags_a_stale_issue(
    capsys: pytest.CaptureFixture[str],
) -> None:
    # #449: #293 had been "in progress" since 2026-10-09, with no handoff.
    asked = "**Next:** your answer (bateks's). **Waiting on:** bateks's answer."
    pr = {**issue(number=9), "pull_request": {}, "body": GENERATED}
    github = ChangingGitHub([issue(number=n) for n in (5, 6, 7, 8)] + [pr])
    github.comments[5] = [handing_off(GOES_ON)]
    github.comments[6] = [{**comment(sign("Starting now.")), "created_at": DAYS_AGO}]
    github.comments[7] = [handing_off(asked, created_at=DAYS_AGO)]
    github.comments[8] = [{**comment(sign("Starting now.")), "created_at": "2026-10-12T10:00:00Z"}]
    github.comments[9] = [{**comment(sign("Opened.")), "created_at": DAYS_AGO}]
    github.pulls = [{"number": 9, "draft": False, "head": {"sha": "abc"}}]

    status(github, now=lambda: NOW)  # type: ignore[arg-type]

    assert capsys.readouterr().out.splitlines()[1:] == [
        "",
        "Claude's move (a closing handoff says Claude goes on):",
        "  issue #5 Something to do",
        "",
        "In progress (Claude's word is the last):",
        f"  issue #6 Something to do [{STALE}]",
        "  issue #7 Something to do",  # waits on bateks
        "  issue #8 Something to do",  # since yesterday
        "  PR #9 Something to do [no CI run]",  # waits on its review
    ]


def test_handoffs_flag_a_stale_issue_and_show_each_handoff_in_brief() -> None:
    # #449: at a session start, #431's whole proposal scrolled by.
    proposal = "The whole proposal.\n\n**Next:** your answer (bateks's). **Waiting on:** bateks."
    github = ChangingGitHub([issue(number=293), issue(number=431)])
    github.comments[293] = [
        {**comment(sign("Starting now.")), "created_at": DAYS_AGO, "html_url": "u/293#1"}
    ]
    github.comments[431] = [handing_off(proposal, created_at=DAYS_AGO, html_url="u/431#1")]
    git = Git(Path(CHECKOUT), FakeGit({}))  # offline, no branches

    brief = CarryOn(github, git, HERE, now=lambda: NOW).text()  # type: ignore[arg-type]
    whole = CarryOn(github, git, HERE, now=lambda: NOW, full=True).text()  # type: ignore[arg-type]

    assert f"#293 [in progress] Something to do\n  {STALE}\n" in brief
    assert "The whole proposal." not in brief and "**Waiting on:** bateks." in brief
    assert "The whole proposal." in whole


def test_an_issue_waiting_on_someone_is_shown_as_its_move_alone() -> None:
    # #597: a session leaves it alone, so its details only scrolled by.
    waiting = (
        "Where it stands.\n\n**Next:** your answer (bateks's). **Waiting on:** bateks.\n\n"
        "<details><summary>For the next session</summary>\n\n- Notes: the details.\n\n</details>"
    )
    today = "2026-10-13T11:00:00Z"
    github = ChangingGitHub([issue(number=431), issue(number=5)])
    github.comments[431] = [handing_off(waiting, created_at=today, html_url="u/431#1")]
    github.comments[5] = [handing_off(GOES_ON, created_at=today, html_url="u/5#1")]
    git = Git(Path(CHECKOUT), FakeGit({}))

    text = CarryOn(github, git, HERE, now=lambda: NOW).text()  # type: ignore[arg-type]

    assert (
        "#431 [in progress] Something to do\n"
        "  **Next:** your answer (bateks's). **Waiting on:** bateks.\n"
        "  u/431#1 (`handoffs 431` has the rest)\n"
    ) in text
    assert "the details" not in text and "Where it stands." not in text
    assert "#5 [Claude's move] Something to do" in text and "u/5#1 (in brief:" in text


def test_while_the_manager_or_another_session_watches_here_no_handoff_is_shown() -> None:
    # #597: the session takes no issue then, so it reads none of their handoffs.
    github = ChangingGitHub([issue(number=431)])
    github.comments[431] = [handing_off("**Next:** the PR (Claude's). **Waiting on:** bateks.")]
    git = Git(Path(CHECKOUT), FakeGit({}))
    taken = "The agent manager runs on this machine (pid 4242, since 2026-10-18 12:00): …"

    text = CarryOn(github, git, HERE, now=lambda: NOW, taken=lambda: taken).text()  # type: ignore[arg-type]

    assert "In progress (Claude's word is the last):\n  issue #431 Something to do" in text
    assert f"{taken}\n{CarryOn.LEFT_OUT}\n" in text
    assert "**Next:**" not in text and "Handoffs," not in text
    assert text.rstrip().endswith("Nothing is only on this machine.")


def test_another_session_s_watcher_means_this_session_takes_no_issue() -> None:
    class Held:
        def __init__(self, by: str | None) -> None:
            self.by = by

        def another(self) -> str | None:
            return self.by

    said = another_watching(Held("pid 4242, session 0ther, since 2026-10-18 20:34"))  # type: ignore[arg-type]

    assert said is not None and said.startswith(
        "Another session's watcher runs on this machine (pid 4242, session 0ther, since"
    )
    assert another_watching(Held(None)) is None  # type: ignore[arg-type]


# --- the waiting:<login> labels (#449) ---------------------------------------------------------


class LabelledGitHub:
    """Issue #7's labels and the repository's, with their colors; what it's asked to
    change, it notes."""

    def __init__(self, labels: Sequence[str], there: dict[str, str]) -> None:
        self.labels, self.there = list(labels), there
        self.asked: list[tuple[str, str, object]] = []

    def call(
        self, method: str, path: str, body: object | None = None, missing_ok: bool = False
    ) -> object:
        if path == "/user":
            return {"login": ME}
        if method == "GET" and path.startswith("labels?"):
            return [{"name": name, "color": color} for name, color in self.there.items()]
        if method == "GET":
            return issue(labels=self.labels)
        self.asked.append((method, path, body))
        return {}


THERE = {
    "bug": "d73a4a",
    "claude:albalaeff": "0e8a16",
    "claude:bateks": "5319e7",
    "waiting:bateks": "5319e7",
}


def test_a_handoff_puts_on_the_label_of_whom_it_waits_on() -> None:
    # #449: bateks sees at a glance what waits for them, filtering the issues by waiting:bateks.
    github = LabelledGitHub(["bug", "waiting:bateks"], THERE)
    text = "**Next:** a review (albalaeff's). **Waiting on:** albalaeff's review of PR #452."

    said = WaitingLabels(github).follow(7, text)  # type: ignore[arg-type]

    assert [(method, path) for method, path, _ in github.asked] == [
        ("POST", "labels"),  # it wasn't there yet: made like claude:albalaeff
        ("POST", "issues/7/labels"),
        ("DELETE", "issues/7/labels/waiting%3Abateks"),
    ]
    made, put = github.asked[0][2], github.asked[1][2]
    assert isinstance(made, dict)
    assert (made["name"], made["color"]) == ("waiting:albalaeff", "0e8a16")
    assert put == {"labels": ["waiting:albalaeff"]}
    assert said == "Labels: +waiting:albalaeff, -waiting:bateks"


@pytest.mark.parametrize("waiting", ["nothing.", "CI on PR #452."])
def test_a_handoff_waiting_on_no_one_takes_the_labels_off(waiting: str) -> None:
    github = LabelledGitHub(["waiting:bateks", "waiting:albalaeff"], THERE)

    WaitingLabels(github).follow(7, f"**Next:** x (CI's). **Waiting on:** {waiting}")  # type: ignore[arg-type]

    assert [(method, path) for method, path, _ in github.asked] == [
        ("DELETE", "issues/7/labels/waiting%3Aalbalaeff"),
        ("DELETE", "issues/7/labels/waiting%3Abateks"),
    ]


def test_a_label_already_on_stays_on() -> None:
    github = LabelledGitHub(["waiting:bateks"], THERE)
    text = "**Next:** your answer (bateks's). **Waiting on:** bateks's answer."

    assert WaitingLabels(github).follow(7, text) is None  # type: ignore[arg-type]
    assert github.asked == []


def test_a_handoff_in_russian_keeps_the_label_of_whom_it_waits_on() -> None:
    # #593: on #294, a handoff written in the issue's language took waiting:bateks off.
    github = LabelledGitHub(["waiting:bateks"], THERE)
    text = "**Дальше:** ответы на 1–8 (ход bateks, потом Claude). **Ждём:** bateks, здесь."

    assert WaitingLabels(github).follow(7, text) is None  # type: ignore[arg-type]
    assert github.asked == []


def test_a_reply_from_whom_it_waits_on_takes_their_label_off() -> None:
    github = ChangingGitHub([issue(number=7, labels=["waiting:bateks", "waiting:albalaeff"])])
    github.comments[7] = [comment(sign("A or B?")), comment("B")]  # bateks's answer

    status(github, now=lambda: NOW)  # type: ignore[arg-type]

    assert github.asked == [("DELETE", "issues/7/labels/waiting%3Abateks")]


def test_a_reply_on_its_pr_takes_the_issue_s_label_off() -> None:
    body = f"Closes #7\n\n{GENERATED}"
    pr = {**issue(number=9), "pull_request": {}, "body": body}
    github = ChangingGitHub([issue(number=7, labels=["waiting:bateks"]), pr])
    github.comments[7] = [comment(sign("PR #9 is up."))]
    github.comments[9] = [comment("Rename it, please")]
    github.pulls = [
        {"number": 9, "draft": False, "body": body, "head": {"sha": "a", "ref": "feature/7-x"}}
    ]

    status(github, now=lambda: NOW)  # type: ignore[arg-type]

    assert github.asked == [("DELETE", "issues/7/labels/waiting%3Abateks")]


# --- an issue as text (#387) -----------------------------------------------------------------


class ThreadGitHub:
    """An issue or PR and its comments; what it's asked to change, it notes, and answers
    with the entry changed so."""

    def __init__(self, issue: dict[str, object], comments: list[dict[str, object]]) -> None:
        self.issue, self.comments = issue, comments
        self.asked: list[tuple[str, str, object]] = []

    def call(self, method: str, path: str, body: object | None = None) -> object:
        if path == "/user":
            return {"login": ME}
        if method != "GET":
            self.asked.append((method, path, body))
            return self.issue | (body if isinstance(body, dict) else {})
        return self.comments if path.endswith("/comments?per_page=100") else self.issue


def thread_issue(**fields: object) -> dict[str, object]:
    return {
        "number": 402,
        "title": "README → Agents: the manager's --once",
        "state": "open",
        "user": {"login": ME},
        "created_at": "2026-10-12T16:44:05Z",
        "labels": [{"name": "model:haiku"}, {"name": "effort:max"}],
        "body": "Add the `--once` line.",
    } | fields


def test_show_prints_an_issue_and_its_comments_as_text() -> None:
    # #387's trial: an agent got only JSON from `api`, and its `python -c` to pick the body
    # out of it was refused by the allow list.
    comments = [
        {"user": {"login": ME}, "created_at": "2026-10-12T16:45:20Z", "body": "Go ahead."},
        {"user": {"login": "albalaeff"}, "created_at": "2026-10-12T17:06:24Z", "body": "Ok"},
    ]

    text = IssueThread(ThreadGitHub(thread_issue(), comments), 402).text()  # type: ignore[arg-type]

    assert text == "\n".join(
        [
            "issue #402 [open] README → Agents: the manager's --once",
            f"by {ME}, 2026-10-12 16:44 UTC; labels: model:haiku, effort:max",
            "",
            "Add the `--once` line.",
            "",
            f"--- {ME}, 2026-10-12 16:45 UTC:",
            "Go ahead.",
            "",
            "--- albalaeff, 2026-10-12 17:06 UTC:",
            "Ok",
        ]
    )


def test_show_says_when_a_pr_has_no_description_labels_or_comments() -> None:
    pull = thread_issue(labels=[], body=None, pull_request={"url": "x"})

    text = IssueThread(ThreadGitHub(pull, []), 402).text()  # type: ignore[arg-type]

    assert text.startswith("PR #402 [open] README")
    assert f"by {ME}, 2026-10-12 16:44 UTC\n\n(no description)\n\nNo comments." in text


def test_show_new_prints_only_what_was_said_since_claude_s_last_comment() -> None:
    # #442: the #418 run read its whole thread three times (19K, 18K, 14K characters), the
    # second and third only to see the replies since its own comment.
    comments = [
        said_at("05:00", "An old thought", signed=False),
        said_at("05:10", "Plan: ..."),
        said_at("05:37", "Go ahead.", signed=False),
    ]

    text = IssueThread(ThreadGitHub(thread_issue(), comments), 402).new()  # type: ignore[arg-type]

    assert text == "\n".join(
        [
            "issue #402 [open] README → Agents: the manager's --once",
            "",
            f"--- {ME}, 2026-10-13 05:37 UTC:",
            "Go ahead.",
        ]
    )


def test_show_new_says_when_nothing_is_new() -> None:
    github = ThreadGitHub(thread_issue(), [said_at("05:10", "Plan: ...")])

    text = IssueThread(github, 402).new()  # type: ignore[arg-type]

    assert text.splitlines()[1:] == ["", "Nothing new since Claude's last comment."]


# --- closing an issue (#442) -----------------------------------------------------------------


def test_close_closes_it_and_says_so_in_a_line() -> None:
    github = ThreadGitHub(thread_issue(), [said_at("05:10", "Done in PR #403.")])

    said = IssueThread(github, 402).close()  # type: ignore[arg-type]

    assert github.asked == [("PATCH", "issues/402", {"state": "closed"})]
    assert said == "issue #402 [closed] README → Agents: the manager's --once"


def test_closing_over_an_unread_reply_is_refused_and_shows_it() -> None:
    # As `comment` is (#208): closed, the reply would be out of `status` for good.
    comments = [said_at("05:10", "Done in PR #403."), said_at("05:20", "One more", signed=False)]
    github = ThreadGitHub(thread_issue(), comments)

    with pytest.raises(SystemExit) as refused:
        IssueThread(github, 402).close()  # type: ignore[arg-type]

    assert f"--- {ME}, 2026-10-13 05:20 UTC:\nOne more" in str(refused.value)
    assert github.asked == []
    IssueThread(github, 402).close(read=True)  # type: ignore[arg-type]
    assert github.asked == [("PATCH", "issues/402", {"state": "closed"})]


# --- what `api` prints: GitHub's answer in brief (#442) --------------------------------------


HEAD = "661dd9e46be868a434d23a21c8a4f68b1fc21f4a"
SQUASHED = "c98c72b5d2d65c9accefa6c273e727d72ef5175c"
PULL: dict[str, object] = {
    "number": 457,
    "state": "open",
    "title": "A finished CI run is a task only until Claude speaks after it (#456)",
    "html_url": "https://github.com/bateks/PersonalExchangeBot/pull/457",
    "user": {"login": ME},
    "labels": [],
    "draft": False,
    "merged": False,
    "mergeable_state": "clean",
    "head": {"ref": "feature/456-ci-read", "sha": HEAD},
    "base": {"ref": "develop"},
    "body": "Closes #456",
}
PULL_LINE = "PR #457 [open] A finished CI run is a task only until Claude speaks after it (#456)"


def test_api_says_a_pr_in_brief() -> None:
    # #442: a PR's JSON is 22K characters, and an agent read it three times per PR (opening
    # it, checking its mergeable_state, editing it), each again on every later reply.
    assert str(Answer.of(PULL)).splitlines() == [
        PULL_LINE,
        "https://github.com/bateks/PersonalExchangeBot/pull/457",
        f"feature/456-ci-read → develop at {HEAD}; mergeable_state: clean",
    ]


@pytest.mark.parametrize(
    ("fields", "state"),
    [
        ({"draft": True}, "open, draft"),
        ({"state": "closed", "merged": True}, "merged"),
        ({"state": "closed", "merged_at": "2026-10-13T20:00:00Z"}, "merged"),  # in a list
        ({"state": "closed", "pull_request": {"merged_at": "2026-10-13T20:00:00Z"}}, "merged"),
        ({"state": "closed"}, "closed"),
    ],
    ids=["draft", "merged", "listed merged", "merged as an issue", "closed"],
)
def test_a_pr_says_whether_it_s_a_draft_or_merged(fields: dict[str, object], state: str) -> None:
    assert Entry(PULL | fields).headline.startswith(f"PR #457 [{state}] A finished CI run")


def test_api_says_an_issue_in_brief_with_its_labels() -> None:
    entry = thread_issue(html_url="https://github.com/bateks/PersonalExchangeBot/issues/402")

    assert str(Answer.of(entry)).splitlines() == [
        "issue #402 [open] README → Agents: the manager's --once",
        "https://github.com/bateks/PersonalExchangeBot/issues/402",
        "labels: model:haiku, effort:max",
    ]


def test_a_list_of_issues_and_prs_is_a_line_each() -> None:
    entry = thread_issue(html_url="https://github.com/bateks/PersonalExchangeBot/issues/402")

    assert str(Answer.of([PULL, entry])).splitlines() == [
        PULL_LINE,
        "issue #402 [open] README → Agents: the manager's --once",
    ]


def test_a_merge_says_its_commit() -> None:
    merged = {"sha": SQUASHED, "merged": True, "message": "Pull Request successfully merged"}

    assert str(Answer.of(merged)) == f"Merged as {SQUASHED}: Pull Request successfully merged"


def test_workflow_runs_are_a_line_each() -> None:
    runs = [
        {
            "id": 1802,
            "name": "CI",
            "workflow_id": 5,
            "status": "in_progress",
            "conclusion": None,
            "head_sha": HEAD,
            "created_at": "2026-10-13T20:05:00Z",
        },
        {
            "id": 1801,
            "name": "CI",
            "workflow_id": 5,
            "status": "completed",
            "conclusion": "failure",
            "head_sha": SQUASHED,
            "created_at": "2026-10-13T19:58:00Z",
        },
    ]
    failed = f"run 1801 CI: failure at {SQUASHED}, 2026-10-13T19:58:00Z"

    assert str(Answer.of({"total_count": 2, "workflow_runs": runs})).splitlines() == [
        f"run 1802 CI: in_progress at {HEAD}, 2026-10-13T20:05:00Z",
        failed,
    ]
    assert str(Answer.of(runs[1])) == failed  # one run
    assert str(Answer.of({"total_count": 0, "workflow_runs": []})) == "No workflow runs."


MILESTONE = {"number": 1, "title": "Phase 2", "html_url": "u/milestone/1", "creator": {}}


@pytest.mark.parametrize(
    "answer",
    [{"login": ME, "id": 1}, [{"name": "bug", "color": "d73a4a"}], [], None, MILESTONE],
    ids=["a user", "labels", "an empty list", "no content", "a milestone, no issue"],
)
def test_anything_else_is_the_whole_json_as_before(answer: object) -> None:
    assert str(Answer.of(answer)) == json.dumps(answer, indent=2, ensure_ascii=False)


def test_full_is_the_whole_json_of_anything() -> None:
    assert str(Answer(PULL)) == json.dumps(PULL, indent=2, ensure_ascii=False)


# --- a PR's commands (#442) ------------------------------------------------------------------


class PullGitHub:
    """A PR and its CI; what it's asked to write, it notes, and answers as GitHub does."""

    def __init__(self, pull: dict[str, object]) -> None:
        self.pull = pull
        self.asked: list[tuple[str, str, object]] = []

    def call(self, method: str, path: str, body: object | None = None) -> object:
        if path == "/user":
            return {"login": ME}
        if path.startswith("actions/runs?head_sha="):
            assert path.endswith(HEAD)
            return {"workflow_runs": [run("CI", "completed", "success")]}
        if method == "GET":
            return self.pull
        self.asked.append((method, path, body))
        if path.endswith("/merge"):
            return {"sha": SQUASHED, "merged": True, "message": "Pull Request successfully merged"}
        return self.pull


def test_pr_says_a_pr_in_brief_with_its_ci() -> None:
    text = PullRequests(PullGitHub(PULL)).brief(457)  # type: ignore[arg-type]

    assert text.splitlines() == [*str(Entry(PULL)).splitlines(), "CI: success"]


def test_pr_open_opens_it_signed(monkeypatch: pytest.MonkeyPatch) -> None:
    # CLAUDE.md: a PR description Claude writes says whose Claude it is, as a comment does.
    monkeypatch.delenv(AgentPower.MODEL_ENV, raising=False)  # a person's session
    github = PullGitHub(PULL)
    asked = {"title": "x", "head": "feature/456-ci-read", "base": "develop", "body": "Closes #456"}

    text = PullRequests(github).open(asked)  # type: ignore[arg-type]

    assert github.asked == [("POST", "pulls", asked | {"body": sign("Closes #456", ME)})]
    assert text == str(Entry(PULL))


def test_merge_squashes_it_into_develop_titled_after_it() -> None:
    # docs/conventions.md: one commit per task, titled after the PR, its description the body.
    github = PullGitHub(PULL)

    said = PullRequests(github).merge(457)  # type: ignore[arg-type]

    title = "A finished CI run is a task only until Claude speaks after it (#456) (#457)"
    assert github.asked == [
        (
            "PUT",
            "pulls/457/merge",
            {
                "merge_method": "squash",
                "commit_title": title,
                "commit_message": "Closes #456",
                "sha": HEAD,  # what CI ran on, or it's refused
            },
        )
    ]
    assert said == f"Merged PR #457 into develop as c98c72b: {title}"


def test_merge_at_a_commit_is_refused_by_github_if_the_branch_moved_since() -> None:
    # #550: the manager merges the commit it checked, not one pushed after.
    github = PullGitHub(PULL)

    PullRequests(github).merge(457, at="f" * 40)  # type: ignore[arg-type]

    assert [body["sha"] for _, _, body in github.asked] == ["f" * 40]  # type: ignore[index]


def test_merge_into_anything_but_develop_is_refused() -> None:
    # CLAUDE.md: never into master; a release PR is a merge commit, and a person's call.
    github = PullGitHub(PULL | {"base": {"ref": "master"}})

    with pytest.raises(SystemExit, match="develop"):
        PullRequests(github).merge(457)  # type: ignore[arg-type]

    assert github.asked == []


# --- a release (#510) --------------------------------------------------------------------------

TIP = "e" * 40  # develop's
TODAY = date(2026, 10, 16)


class ReleaseGitHub:
    """develop `ahead` of master, with the release branches (`refs`) and the branches of the
    release PRs (`pulls`) there are; what it's asked to make, it notes, and answers as GitHub."""

    def __init__(
        self,
        ahead: int = 2,
        refs: Sequence[str] = (),
        pulls: Sequence[str] = (),
        pending: bool = False,  # a release PR open
    ) -> None:
        self.ahead = ahead
        self.refs = refs
        self.pulls = pulls
        self.pending = pending
        self.asked: list[tuple[str, str, dict[str, str]]] = []

    def call(self, method: str, path: str, body: dict[str, str] | None = None) -> object:
        if method != "GET":
            assert body is not None
            self.asked.append((method, path, body))
            if path == "git/refs":
                return {"ref": body["ref"], "object": {"sha": TIP}}
            if path.startswith("issues/"):  # the labelled issue: a comment, then closed (#517)
                return issue(number=517) | {"state": "closed", "html_url": "https://x/517"}
            head = {"ref": body["head"], "sha": TIP}
            return PULL | {
                "number": 520,
                "title": body["title"],
                "head": head,
                "base": {"ref": "master"},
            }
        if path == "/user":
            return {"login": ME}
        if path == "pulls?state=open&base=master":
            return [PULL | {"base": {"ref": "master"}}] if self.pending else []
        if path == "branches/develop":
            return {"commit": {"sha": TIP}}
        if path == f"compare/master...{TIP}":
            said = [f"Change {n} (#{500 + n})\n\nWhat it does." for n in range(1, self.ahead + 1)]
            return {"ahead_by": self.ahead, "commits": [{"commit": {"message": m}} for m in said]}
        if path == "git/matching-refs/heads/release/2026-10-16":
            today = [name for name in self.refs if name.startswith("release/2026-10-16")]
            return [{"ref": f"refs/heads/{name}"} for name in today]
        if path == "pulls?state=all&base=master&per_page=100":
            return [{"head": {"ref": name}} for name in self.pulls]
        raise AssertionError(path)


def test_release_cuts_a_branch_at_develop_s_tip_and_opens_its_pr_into_master(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv(AgentPower.MODEL_ENV, raising=False)  # a person's session
    github = ReleaseGitHub()

    said = ReleaseCut(github, today=lambda: TODAY).cut()  # type: ignore[arg-type]

    [branch, pull] = github.asked
    assert branch == ("POST", "git/refs", {"ref": "refs/heads/release/2026-10-16-01", "sha": TIP})
    assert pull[:2] == ("POST", "pulls")
    asked = pull[2]
    assert (asked["title"], asked["head"], asked["base"]) == (
        "Release 2026-10-16-01",
        "release/2026-10-16-01",
        "master",
    )
    assert asked["body"].startswith(
        f"_Claude Code ({ME})_\n\ndevelop at eeeeeee, 2 commits master hasn't. Once CI passes,"
    )
    assert "\n\n- Change 1 (#501)\n- Change 2 (#502)\n\n" in asked["body"]
    assert asked["body"].endswith(f"\n\n{GENERATED}")
    assert said.splitlines()[0] == "PR #520 [open] Release 2026-10-16-01"


@pytest.mark.parametrize(
    ("refs", "pulls", "name"),
    [
        (["release/2026-10-16-01"], [], "release/2026-10-16-02"),
        ([], ["release/2026-10-16-01", "release/2026-10-16-02"], "release/2026-10-16-03"),
        (["release/2026-10-16"], [], "release/2026-10-16-02"),
        ([], ["release/2026-10-15-04", "release/2026-10-16-fix"], "release/2026-10-16-01"),
    ],
    ids=["a branch", "merged, branches gone", "unnumbered", "another day's"],
)
def test_a_second_release_that_day_is_numbered_after_the_first(
    refs: list[str], pulls: list[str], name: str
) -> None:
    github = ReleaseGitHub(refs=refs, pulls=pulls)

    ReleaseCut(github, today=lambda: TODAY).cut()  # type: ignore[arg-type]

    assert github.asked[0][2] == {"ref": f"refs/heads/{name}", "sha": TIP}


@pytest.mark.parametrize(
    ("github", "why"),
    [
        (ReleaseGitHub(ahead=0), "develop has nothing master hasn't"),
        (ReleaseGitHub(pending=True), "PR #457 .* is open: merge or close it first"),
    ],
    ids=["nothing new", "a release PR open"],
)
def test_release_is_refused_with_nothing_new_or_a_release_pr_open(
    github: ReleaseGitHub, why: str
) -> None:
    with pytest.raises(SystemExit, match=why):
        ReleaseCut(github, today=lambda: TODAY).cut()  # type: ignore[arg-type]

    assert github.asked == []


# The label `release` on an issue (#517): release-cut.yml cuts it on GitHub's runner.

WORKFLOW = f"_Release workflow ({ME})_"  # no Claude talks there


def test_a_release_labelled_on_an_issue_is_cut_and_the_issue_closed_with_its_pr() -> None:
    github = ReleaseGitHub()

    said = ReleaseLabel(github, today=lambda: TODAY, issue=517).answer()  # type: ignore[arg-type]

    [branch, pull, comment, closed] = github.asked
    assert branch[2]["ref"] == "refs/heads/release/2026-10-16-01"
    assert pull[2]["body"].startswith(f"{WORKFLOW}\n\ndevelop at eeeeeee, 2 commits master")
    assert GENERATED not in pull[2]["body"]
    expected = (
        "**Cut:** #520, `release/2026-10-16-01` at develop's eeeeeee. Once CI passes, it's"
        " live on prod on trial: merge the PR to confirm it, or close it to roll it back."
    )
    assert comment == ("POST", "issues/517/comments", {"body": f"{WORKFLOW}\n\n{expected}"})
    assert closed == ("PATCH", "issues/517", {"state": "closed", "state_reason": "completed"})
    assert said == expected


@pytest.mark.parametrize(
    ("github", "why"),
    [
        (ReleaseGitHub(ahead=0), "develop has nothing master hasn't: nothing to release."),
        (ReleaseGitHub(pending=True), f"{PULL_LINE} is open: merge or close it first."),
    ],
    ids=["nothing new", "a release PR open"],
)
def test_a_release_refused_says_why_on_its_issue_and_closes_it(
    github: ReleaseGitHub, why: str
) -> None:
    # One release at a time: a second label, while the first's PR is open, names that PR.
    said = ReleaseLabel(github, today=lambda: TODAY, issue=517).answer()  # type: ignore[arg-type]

    [comment, closed] = github.asked
    assert comment == ("POST", "issues/517/comments", {"body": f"{WORKFLOW}\n\n**Not cut:** {why}"})
    assert closed == ("PATCH", "issues/517", {"state": "closed", "state_reason": "not_planned"})
    assert said == f"**Not cut:** {why}"


def test_a_release_pr_is_listed_apart_and_never_a_task() -> None:
    # On prod on trial once CI passes, then a person merges or closes it: neither CI's result
    # nor its report of the deploy, a comment on the PR, is for Claude.
    pr = {
        **issue(number=12),
        "title": "Release 2026-10-16-01",
        "pull_request": {},
        "body": sign("develop at eeeeeee"),
    }
    github = ChangingGitHub([pr])
    head = {"sha": TIP, "ref": "release/2026-10-16-01"}
    github.pulls = [{"number": 12, "draft": False, "head": head, "base": {"ref": "master"}}]
    github.comments[12] = [comment("**Live on trial:** …", author="github-actions[bot]")]
    github.runs[TIP] = [run("CI", "completed", "success", ended="10:50")]

    seen = look(github, now=lambda: datetime(2026, 10, 16, 11, 0))  # type: ignore[arg-type]

    assert seen.tasks == ()
    assert "\nReleases (" in seen.text
    assert "  PR #12 Release 2026-10-16-01 [CI: success]" in seen.text


# --- what it prints (#358) -------------------------------------------------------------------


def test_emoji_and_cyrillic_come_out_as_they_are_through_a_pipe() -> None:
    """Piped on Windows, stdout is cp1252, where "➕" and "Привет" can only be "?"."""
    raw = io.BytesIO()
    piped = io.TextIOWrapper(raw, encoding="cp1252", errors="replace")

    utf8_output(piped)
    piped.write("Привет ➕")
    piped.flush()

    assert raw.getvalue().decode("utf-8") == "Привет ➕"


def test_a_root_path_git_bash_rewrote_is_read_as_typed() -> None:
    # Git Bash (MSYS) rewrites an argument that starts with / into a path under its own folder
    # before Python sees it: `api POST /user/repos` once reached GitHub as
    # /repos/…/C:/Program Files/Git/user/repos. EXEPATH names that folder, or its bin.
    bash = {"EXEPATH": "C:\\Program Files\\Git\\bin"}
    git = {"EXEPATH": "C:\\Program Files\\Git"}

    assert api_path("C:/Program Files/Git/user/repos", bash) == "/user/repos"
    assert api_path("c:/program files/git/repos/x/y", bash) == "/repos/x/y"
    assert api_path("C:/Program Files/Git/user/repos", git) == "/user/repos"
    assert api_path("issues/180", bash) == "issues/180"  # a path in the repository: as is
    assert api_path("/user", bash) == "/user"  # MSYS_NO_PATHCONV=1, say: nothing to undo
    assert api_path("//user/repos", {}) == "/user/repos"  # the spelling Git Bash leaves alone
    assert api_path("C:/Program Files/Git/user", {}) == "C:/Program Files/Git/user"  # no Git Bash
