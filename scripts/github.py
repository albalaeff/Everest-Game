"""GitHub from the command line, without `gh`, for working from issues (CLAUDE.md).

It acts as the account whose token it finds: $GITHUB_TOKEN, else `gh auth token`, else the
token Git stores for github.com (`git credential fill`). The token needs read and write
access to Contents, Issues and Pull requests, and read access to Actions. The repository is
the one `origin` points to.

    uv run python scripts/github.py status                  what needs doing: to start, a reply
                                                            waiting, Claude's move (a closing
                                                            handoff says Claude goes on, #449),
                                                            CI finished; stale issues flagged,
                                                            those labelled postponed or release
                                                            left out, with their PRs (#540);
                                                            blocked while what they build on
                                                            is open, unblocked once it merges
                                                            (#107)
    uv run python scripts/github.py watch                  waits until something new does,
                                                            pulling develop when idle (#347);
                                                            one per machine (#597); --json for
                                                            the agent manager (#387), --wiki 6
                                                            with it: is the wiki behind (#126)
    uv run python scripts/github.py comment 180 note.md     comment on an issue or PR (signed);
                                                            --read: the replies since are read;
                                                            --handoff makes it a handoff, with
                                                            this machine's mark (#399), and
                                                            labels whom it waits on (#449);
                                                            --closing: this session is closing
    uv run python scripts/github.py handoffs                what a session carries on from:
                                                            what waits on someone in brief, no
                                                            handoff while the manager or another
                                                            session watches here (#597); --full:
                                                            each handoff whole (#449)
    uv run python scripts/github.py handoffs 180            one issue's alone: an agent's
    uv run python scripts/github.py show 180                an issue or PR and its comments,
                                                            as text (#387); --new: only those
                                                            since Claude's last (#442)
    uv run python scripts/github.py ci feature/180-fx       CI on a branch's latest commit
    uv run python scripts/github.py logs 1253               a CI job's whole log, by the job's
                                                            id: filter it with grep
    uv run python scripts/github.py pr 457                  a PR in brief, with its CI (#442)
    uv run python scripts/github.py pr open pr.json         opens one, its description signed
    uv run python scripts/github.py merge 457               squashes it into develop
    uv run python scripts/github.py release                 a release branch at develop's tip
                                                            and its PR into master (#510): on
                                                            prod on trial once CI passes; a
                                                            person merges or closes it
    uv run python scripts/github.py release --issue 517     the same, for an issue labelled
                                                            release (release-cut.yml, #517):
                                                            what came of it goes there, and
                                                            the issue is closed
    uv run python scripts/github.py close 180               closes an issue or PR
    uv run python scripts/github.py cost 180                what the issue's work cost, in $
    uv run python scripts/github.py title 180 --estimate 40 [~$40] before its title (#390);
    uv run python scripts/github.py title 180 --done        [$62] [~$40] once it's done
    uv run python scripts/github.py api GET issues/180      any REST call: a path in the repo,
    uv run python scripts/github.py api POST pulls pr.json  or one from the API's root (/user;
                                                            Git Bash's rewrite of it is undone),
                                                            a JSON body from a file; prints its
                                                            answer in brief, --full: the whole
                                                            JSON (#442)

What it prints is short (#442): an agent reads every character again on each later reply.

Comments made this way appear under the token owner's account, so Claude signs its own
with whose Claude it is, "_Claude Code (bateks)_" (`comment` and `pr open` add it, #298),
an agent of the session manager's with its power too, "_Claude Code agent (bateks,
opus/xhigh)_" (#387), and the manager, merging a green PR itself, "_Claude Code agent
manager (bateks)_" (#550); `status` tells them from the owner's by it, and from the other
person's Claude's by the account.
`comment` and `close` refuse while there's a reply since
Claude's last comment, and show it: read it, act on it, then run it again with --read.

An issue is its author's, unless a `claude:<login>` label hands it to that login's Claude.
One that waits for a person's answer or review carries `waiting:<login>` (#449). One that
builds on another says so with a `Depends on #16` line or an `after:16` label (#107).
"""

import argparse
import io
import json
import os
import re
import subprocess
import sys
import time
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import asdict, dataclass, field, replace
from datetime import date, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any, ClassVar
from urllib.parse import quote

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))  # run as a script, it still finds scripts

from scripts.agents import (  # noqa: E402
    LABEL_FAMILIES,
    WATCH_EVERY,
    AgentPower,
    ManagerLock,
    WatchLock,
)
from scripts.claude_cost import (  # noqa: E402
    IssueCost,
    IssueNames,
    Title,
    actual_text,
    estimate_text,
    issue_cost,
)
from scripts.claude_prices import DailyCheck, PriceNews  # noqa: E402
from scripts.handoff import (  # noqa: E402
    STALE,
    Git,
    Handoff,
    HandoffMark,
    IssueBranch,
    IssueCarry,
    LocalWork,
    Machine,
    Move,
)
from scripts.wiki import WikiCheck, WikiNews  # noqa: E402

API = "https://api.github.com"
SIGNATURE = "_Claude Code_"  # how Claude signed before #298; still recognised
# either way, an agent's (#387): "_Claude Code agent (bateks, opus/xhigh)_", and the agent
# manager's, which posts the closing comment an agent left (#550): "_Claude Code agent manager
# (bateks)_"
SIGNED = re.compile(
    r"_Claude Code(?: agent(?: manager)?)?(?: \([A-Za-z0-9-]+(?:, [a-z]+/[a-z]+)?\))?_"
)
Run = Callable[..., subprocess.CompletedProcess[str]]


# --- which repository, as whom -------------------------------------------------------------


def repo_slug(remote: str) -> str:
    """ "owner/name" from the URL of a GitHub remote (https or ssh)."""
    match = re.search(r"github\.com[:/]([^/]+)/([^/]+?)(?:\.git)?/?$", remote)
    if match is None:
        raise SystemExit(f"origin isn't a GitHub repository: {remote}")
    return f"{match[1]}/{match[2]}"


def api_path(path: str, env: Mapping[str, str] = os.environ) -> str:
    """The API path as it was typed. Git Bash (MSYS) rewrites an argument that starts with
    `/`, such as `/user/repos`, into a path under its own folder before Python sees it, and
    its EXEPATH names that folder (or its bin): the rewrite is undone here, so a path from
    the API's root works from Claude's Bash tool. `//user/repos`, which Git Bash leaves
    alone, is read as `/user/repos` too."""
    folder = env.get("EXEPATH", "").replace("\\", "/").rstrip("/").removesuffix("/bin")
    if folder and path.lower().startswith(folder.lower() + "/"):
        return path[len(folder) :]
    if path.startswith("//"):
        return path[1:]
    return path


def token(env: Mapping[str, str] = os.environ, run: Run = subprocess.run) -> str:
    """$GITHUB_TOKEN, else the GitHub CLI's, else the one Git stores for github.com."""
    if env.get("GITHUB_TOKEN"):
        return env["GITHUB_TOKEN"]
    # Git's own terminal prompt stays quiet; Git Credential Manager's window still opens when
    # it has nothing stored, and what it takes is kept below
    quiet = {**env, "GIT_TERMINAL_PROMPT": "0"}
    try:
        found = run(["gh", "auth", "token"], capture_output=True, text=True, check=False)
        if found.returncode == 0 and found.stdout.strip():
            return found.stdout.strip()
    except FileNotFoundError:
        pass  # no GitHub CLI
    try:
        stored = run(
            ["git", "credential", "fill"],
            input="protocol=https\nhost=github.com\n\n",
            capture_output=True,
            text=True,
            check=False,
            env=quiet,
        ).stdout
    except FileNotFoundError:
        stored = ""
    for line in stored.splitlines():
        if line.startswith("password="):
            # `fill` alone uses a credential once: Git Credential Manager keeps the token its
            # window took only when Git says `approve`, as Git itself does after a push that
            # worked. Without it, every command opened the window again.
            run(
                ["git", "credential", "approve"],
                input=stored,
                capture_output=True,
                text=True,
                check=False,
                env=quiet,
            )
            return line.removeprefix("password=")
    raise SystemExit(
        "No GitHub token: set GITHUB_TOKEN, sign in with `gh auth login`, or let Git store "
        "one (it does on the first `git push` over https)."
    )


@dataclass(frozen=True, slots=True)
class KeptAnswer:
    """A GET's last answer, and its ETag: while GitHub answers that ETag with "304 Not
    Modified", the answer is still this one (#445)."""

    etag: str
    content: bytes

    def json(self) -> Any:
        """Read anew each time: a caller may change what it's given."""
        return json.loads(self.content) if self.content else None


class GitHub:
    """GitHub's REST API, as the token's account, on the repository `slug`.

    A GET asked before asks only whether its answer changed: it sends the kept answer's ETag
    (`If-None-Match`), and "304 Not Modified" brings back the kept answer. GitHub doesn't count
    those against its rate limit, so a watcher's quiet look costs nothing (#445). The answers
    are kept for the life of the process: a watcher's is 110 minutes."""

    def __init__(self, slug: str, token: str, transport: httpx.BaseTransport | None = None) -> None:
        self.slug = slug
        self._http = httpx.Client(
            base_url=API,
            timeout=30,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            transport=transport,  # the tests' stand-in for GitHub
        )
        self._kept: dict[str, KeptAnswer] = {}  # by URL

    def call(
        self, method: str, path: str, body: object | None = None, missing_ok: bool = False
    ) -> Any:
        """`path` in the repository ("issues/180", "" for the repository itself), or from
        the API's root ("/user"). `missing_ok`: what isn't there (a label taken off
        meanwhile) answers None."""
        url = path if path.startswith("/") else f"/repos/{self.slug}/{path}".rstrip("/")
        kept = self._kept.get(url) if method == "GET" else None
        asked = {"If-None-Match": kept.etag} if kept is not None else {}
        response = self._http.request(method, url, json=body, headers=asked)
        if kept is not None and response.status_code == 304:
            return kept.json()
        if missing_ok and response.status_code == 404:
            return None
        if response.is_error:
            raise SystemExit(f"{method} {url}: HTTP {response.status_code}: {response.text[:500]}")
        if method == "GET" and (etag := response.headers.get("ETag")):
            self._kept[url] = KeptAnswer(etag, response.content)
        return response.json() if response.content else None

    def text(self, path: str) -> str:
        """`path`'s plain text in the repository: a job's log, from the storage GitHub sends
        the asker on to. httpx leaves the token behind on the way there."""
        url = f"/repos/{self.slug}/{path}"
        response = self._http.get(url, follow_redirects=True)
        if response.is_error:
            raise SystemExit(f"GET {url}: HTTP {response.status_code}: {response.text[:500]}")
        return response.text


# --- what needs doing ----------------------------------------------------------------------


GENERATED = "Generated with [Claude Code]"  # the line ending a PR Claude opened
HANDED_TO = "claude:"  # a `claude:<login>` label: the issue is for that login's Claude (#222)
POSTPONED = "postponed"  # a label: nothing to do until it goes, so `status` leaves it out (#309)
RELEASE_LABEL = "release"  # a label: release-cut.yml cuts a release for it (`ReleaseLabel`, #517)
RELEASE_INTO = "master"  # a release PR's base (docs/production.md → A release, #510)


def signature(login: str | None, agent: AgentPower | None = None) -> str:
    """Whose Claude is talking (#298): "_Claude Code (bateks)_"; an agent of the session
    manager's says so, and what it runs on (#387): "_Claude Code agent (bateks, opus/xhigh)_"."""
    if login and agent is not None:
        return f"_Claude Code agent ({login}, {agent})_"
    return f"_Claude Code ({login})_" if login else SIGNATURE


def sign(body: str, login: str | None = None, agent: AgentPower | None = None) -> str:
    """The signature at the top, so who's talking is read first (#226), with whose Claude
    it is (#298). A text signed at the end, the old way, has it moved."""
    text = body.strip()
    if SIGNED.match(text):
        return text
    return f"{signature(login, agent)}\n\n{text.removesuffix(SIGNATURE).rstrip()}"


def by_claude(body: str | None) -> bool:
    return SIGNED.search(body or "") is not None


def claude_s(comment: Mapping[str, Any], me: str) -> bool:
    """Said by this Claude: signed, and posted as `me`. The other person's Claude signs
    too, under their account (#222)."""
    return comment["user"]["login"] == me and by_claude(comment["body"])


def owner(issue: Mapping[str, Any]) -> str:
    """Whose Claude the issue is for: the login a `claude:<login>` label names, else its
    author (#222)."""
    for label in issue.get("labels") or []:
        if label["name"].startswith(HANDED_TO):
            return str(label["name"].removeprefix(HANDED_TO))
    return str(issue["user"]["login"])


def unread(comments: Sequence[Mapping[str, Any]], me: str) -> list[Mapping[str, Any]]:
    """The comments since Claude's last one (all of them before its first): replies it
    must read before it says anything more (#208)."""
    last = max((n for n, c in enumerate(comments) if claude_s(c, me)), default=-1)
    return [c for c in comments[last + 1 :] if not claude_s(c, me)]


@dataclass(frozen=True, slots=True)
class Item:
    number: int
    title: str
    # "to start": mine, no comment from Claude yet; "reply waiting": someone wrote after
    # Claude's last word; "Claude's move": Claude's last word is a closing handoff that says
    # Claude goes on, waiting on nothing (#449); "in progress": Claude's word is the last;
    # "theirs": someone else's (see `owner`), so not this session's to work on; "release": a
    # release PR (`releasing`), a person's to merge or close; "blocked": what it builds on is
    # open, "unblocked": it has closed since Claude's last word, which was the last
    # (`Dependencies`, #107). Claude's words: its comments, and a PR it opened.
    state: str
    owner: str
    stale: bool = False  # in progress, and nobody moves on it (`Conversation`, #449)
    waits_on: tuple[int, ...] = ()  # blocked: the open issues and PRs it builds on
    woken: tuple[int, ...] = ()  # those it builds on that closed since Claude's last word

    TO_DO: ClassVar[tuple[str, ...]] = ("to start", "reply waiting", "Claude's move", "unblocked")

    @property
    def to_do(self) -> bool:
        """Whether a session, or an agent, starts on it now."""
        return self.state in self.TO_DO


@dataclass(frozen=True, slots=True)
class Conversation:
    """An issue or PR and its comments, as this login's Claude (`me`) reads them: whose it
    is, and whose move (`item`)."""

    entry: Mapping[str, Any]
    comments: Sequence[Mapping[str, Any]]
    me: str

    STALE_AFTER: ClassVar[timedelta] = timedelta(days=3)

    def item(self, now: datetime | None = None) -> Item:
        """With `now`, it says whether an issue in progress is stale, too."""
        whose = owner(self.entry)
        if whose != self.me:
            state = "theirs"
        elif not self._opened() and not any(claude_s(c, self.me) for c in self.comments):
            state = "to start"
        elif unread(self.comments, self.me):
            state = "reply waiting"
        elif (handoff := self._handoff()) is not None and handoff.claude_s_move:
            state = "Claude's move"
        else:
            state = "in progress"
        stale = state == "in progress" and now is not None and self._stale(now)
        return Item(int(self.entry["number"]), str(self.entry["title"]), state, whose, stale)

    def _opened(self) -> bool:
        """A PR Claude opened is its first word (#208). An issue it wrote up isn't (#449):
        like any other, it's to start until Claude comments on it."""
        body = self.entry.get("body") or ""
        return (
            "pull_request" in self.entry
            and self.entry["user"]["login"] == self.me
            and (by_claude(body) or GENERATED in body)
        )

    def _handoff(self) -> Handoff | None:
        """The last comment, when it's a handoff."""
        if not self.comments:
            return None
        return Handoff.of(self.comments[-1], len(self.comments) - 1)

    def _stale(self, now: datetime) -> bool:
        """An issue whose last word, Claude's, is older than `STALE_AFTER` and waits on
        nothing (#449: #293 sat so for days). A PR waits on its review."""
        if "pull_request" in self.entry or not self.comments:
            return False
        last = self.comments[-1]
        move, stamp = Move.of(str(last.get("body") or "")), last.get("created_at")
        if not stamp or (move is not None and move.waits):
            return False
        return now.astimezone() - datetime.fromisoformat(str(stamp)) > self.STALE_AFTER


def post_comment(github: GitHub, number: int, text: str, read: bool = False) -> str:
    """Comment on #`number`, signed; its link. Refused while a reply since Claude's last
    comment hasn't been read (#208: a comment posted over bateks's answer on #205 hid it
    from `status`): those replies are shown instead (`IssueThread.check_read`). Act on them,
    then pass `read`."""
    me = github.call("GET", "/user")["login"]
    if not read:
        IssueThread(github, number).check_read(me)
    signed = sign(text, me, AgentPower.of_agent())
    posted = github.call("POST", f"issues/{number}/comments", {"body": signed})
    return str(posted["html_url"])


@dataclass(frozen=True, slots=True)
class CiRuns:
    """CI's runs on a commit: how they went, as "CI: success", and whether Claude has read
    that (#456)."""

    runs: tuple[Mapping[str, Any], ...]

    @classmethod
    def at(cls, github: GitHub, sha: str) -> CiRuns:
        return cls(tuple(github.call("GET", f"actions/runs?head_sha={sha}")["workflow_runs"]))

    def __str__(self) -> str:
        if not self.runs:
            return "no CI run"
        return ", ".join(
            f"{run['name']}: {run['conclusion'] or run['status']}" for run in self.runs
        )

    @property
    def finished(self) -> bool:
        return bool(self.runs) and all(run["status"] == "completed" for run in self.runs)

    @property
    def green(self) -> bool:
        """Finished, every run a success: what's left is the merge (#485)."""
        return self.finished and all(run["conclusion"] == "success" for run in self.runs)

    def read(self, me: str, threads: Iterable[Sequence[Mapping[str, Any]]]) -> bool:
        """Whether Claude (`me`) has spoken in one of `threads`, a PR's comments and its
        issue's, since the last run ended: then it knows how they went (#456: on #449 an agent
        started for a result the one before it had read). Never while one still runs, nor when
        an end isn't known."""
        ended = self._ended()
        return ended is not None and any(
            claude_s(said, me) and self._knows(said, ended) for thread in threads for said in thread
        )

    @staticmethod
    def _knows(said: Mapping[str, Any], ended: datetime) -> bool:
        """Whether a comment came after CI `ended`, knowing how it went. A handoff that waits
        on CI doesn't, though posted after: it was written while CI ran (#534: #528's merge
        was never started)."""
        stamp, move = said.get("created_at"), Move.of(str(said.get("body") or ""))
        return (
            bool(stamp)
            and datetime.fromisoformat(str(stamp)) > ended
            and not (move is not None and move.waits_on_ci)
        )

    def _ended(self) -> datetime | None:
        """When the last of them ended: a finished run's `updated_at`."""
        stamps = [run.get("updated_at") for run in self.runs]
        if not self.finished or not all(stamps):
            return None
        return max(datetime.fromisoformat(str(stamp)) for stamp in stamps)


def left_out(issue: Mapping[str, Any]) -> bool:
    """Nobody's task, so `status`, `handoffs` and the agent manager pass it by: postponed
    (#309), or labelled `release`, which release-cut.yml answers and closes (#517)."""
    return any(label["name"] in (POSTPONED, RELEASE_LABEL) for label in issue.get("labels") or [])


def releasing(pull: Mapping[str, Any] | None) -> bool:
    """A release PR (#510): on prod on trial once its CI passes, then a person merges or
    closes it. Never a task for Claude: what's said on it, CI's report of the deploy first,
    is for that person."""
    return pull is not None and (pull.get("base") or {}).get("ref") == RELEASE_INTO


def label_names(entry: Mapping[str, Any]) -> tuple[str, ...]:
    return tuple(str(label["name"]) for label in entry.get("labels") or [])


AFTER = "after:"  # an `after:<n>` label: the issue builds on #n (#107)
DEPENDS_ON = re.compile(r"^[ \t]*(?:\*\*)?depends on\b(.*)$", re.I | re.M)  # a line of a body


def builds_on(entry: Mapping[str, Any]) -> tuple[int, ...]:
    """The issues and PRs `entry` builds on (#107): those a `Depends on #16, #17` line of its
    body names, and its `after:16` labels'."""
    body = str(entry.get("body") or "")
    found = {int(n) for line in DEPENDS_ON.findall(body) for n in re.findall(r"#(\d+)", line)}
    found |= {
        int(name.removeprefix(AFTER))
        for name in label_names(entry)
        if name.startswith(AFTER) and name.removeprefix(AFTER).isdigit()
    }
    found.discard(int(entry["number"]))
    return tuple(sorted(found))


@dataclass(frozen=True, slots=True)
class Dependencies:
    """What an issue builds on holds it (#107: #18 built on #16 and #17 with nothing to hold
    it, so its branch carried both of theirs and its PR couldn't merge, and nothing woke an
    agent when they merged). While any of it is open the issue is blocked: no task, its PRs
    with it (`look`). Once all of it is closed, what closed since Claude's last word wakes it:
    the agent merges `develop` in first. A chain holds by itself: #18 waits on #17, which
    waits on #16. `open_now`: the open issues and PRs, when a look has listed them; else each
    is asked for."""

    github: GitHub
    open_now: frozenset[int] | None = None

    def hold(
        self, entry: Mapping[str, Any], item: Item, comments: Sequence[Mapping[str, Any]]
    ) -> Item:
        """`item`, the issue `entry`'s as its `comments` say, blocked or woken. Woken, one in
        progress is "unblocked": Claude's move. One to start needs nothing more: its branch
        comes from `develop`."""
        if "pull_request" in entry or item.state == "theirs":
            return item
        if blockers := self.blockers(entry):
            return replace(item, state="blocked", waits_on=blockers, stale=False)
        woken = self._woken(entry, item.owner, comments) if item.state != "to start" else ()
        if not woken:
            return item
        state = "unblocked" if item.state == "in progress" else item.state
        return replace(item, state=state, woken=woken, stale=False)

    def blockers(self, entry: Mapping[str, Any]) -> tuple[int, ...]:
        """What `entry` builds on that's still open."""
        return tuple(number for number in builds_on(entry) if self._open(number))

    def _open(self, number: int) -> bool:
        if self.open_now is not None:
            return number in self.open_now
        found = self.github.call("GET", f"issues/{number}", missing_ok=True)
        return found is not None and found.get("state") == "open"

    def _woken(
        self, entry: Mapping[str, Any], me: str, comments: Sequence[Mapping[str, Any]]
    ) -> tuple[int, ...]:
        """What `entry` builds on that closed after Claude's last word on it. One that isn't
        there (a typo) is passed by."""
        last = next((c.get("created_at") for c in reversed(comments) if claude_s(c, me)), None)
        woken = []
        for number in builds_on(entry):
            found = self.github.call("GET", f"issues/{number}", missing_ok=True)
            closed = (found or {}).get("closed_at")
            if closed and (
                not last or datetime.fromisoformat(str(closed)) > datetime.fromisoformat(str(last))
            ):
                woken.append(number)
        return tuple(woken)


KEYWORDS = r"\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#"  # GitHub's, before an issue
CLOSES = KEYWORDS + r"{number}\b"  # a given issue's
CLOSING = re.compile(KEYWORDS + r"(\d+)\b", re.I)  # any issue's


@dataclass(frozen=True, slots=True)
class Task:
    """Something that needs doing, named so `watch` tells it from what needed doing before
    (#314): an issue or PR to start, with a reply waiting or Claude's move next (with how
    many comments it has, so a newer reply or handoff is new too, #449), or a PR whose CI
    has finished (at its commit, so a run after a new push is new too), until Claude speaks
    after it (`CiRuns.read`, #456). The labels the manager reads end its name too, so the
    manager's next look takes a task whose priority or power changed as a new one (#485).
    `watch --json` says each as JSON for the session manager (#387): `issue` is the issue the
    work is for, a PR's the one it closes (None when it closes none), and `labels` are that
    issue's, which say how strong an agent it takes, and how soon. `woken` names what the
    issue builds on that merged since Claude's last word: its agent merges `develop` in first
    (#107)."""

    key: str
    kind: str  # "issue" or "pull"
    number: int
    state: str  # one of `Item.TO_DO`, or "CI finished"
    title: str
    issue: int | None
    labels: tuple[str, ...] = ()
    branch: str | None = None  # a PR's
    ci: str | None = None  # "CI: success", once CI has finished
    sha: str | None = None  # the commit it ran on
    green: bool = False  # CI finished, every run a success (#485)
    woken: tuple[int, ...] = ()  # what it builds on that closed since Claude's last word (#107)

    @classmethod
    def waiting(
        cls,
        item: Item,
        comments: int,
        pull: Mapping[str, Any] | None,
        labels: Mapping[int, tuple[str, ...]],
    ) -> Task:
        """An issue, or a PR (`pull`), that `item.to_do` says needs doing."""
        issue = item.number if pull is None else cls.issue_of(pull)
        found = cls._labels(labels, issue, item.number)
        return cls(
            f"#{item.number} {item.state}, {comments} comments{cls._manager_s(found)}",
            "issue" if pull is None else "pull",
            item.number,
            item.state,
            item.title,
            issue,
            found,
            branch=None if pull is None else (pull.get("head") or {}).get("ref"),
            woken=item.woken,
        )

    @classmethod
    def ci_finished(
        cls,
        item: Item,
        pull: Mapping[str, Any],
        runs: CiRuns,
        labels: Mapping[int, tuple[str, ...]],
    ) -> Task:
        sha, ci, issue = str(pull["head"]["sha"]), str(runs), cls.issue_of(pull)
        found = cls._labels(labels, issue, item.number)
        return cls(
            f"PR #{item.number} at {sha}: {ci}{cls._manager_s(found)}",
            "pull",
            item.number,
            "CI finished",
            item.title,
            issue,
            found,
            pull["head"].get("ref"),
            ci,
            sha,
            runs.green,
        )

    @property
    def numbers(self) -> tuple[int, ...]:
        """Where it's talked about: its issue or PR, and the issue a PR is for."""
        return tuple(sorted({self.number} | ({self.issue} if self.issue is not None else set())))

    @staticmethod
    def issue_of(pull: Mapping[str, Any]) -> int | None:
        """The issue a PR's work is for: the one it closes ("Closes #387"), else its
        branch's (`feature/387-…`)."""
        if closes := CLOSING.search(pull.get("body") or ""):
            return int(closes[1])
        return IssueNames.of_branch((pull.get("head") or {}).get("ref"))

    @staticmethod
    def _labels(
        labels: Mapping[int, tuple[str, ...]], issue: int | None, number: int
    ) -> tuple[str, ...]:
        """The open issue's the work is for; else the PR's own."""
        if issue is not None and issue in labels:
            return labels[issue]
        return labels.get(number, ())

    @staticmethod
    def _manager_s(labels: Iterable[str]) -> str:
        """Those of `labels` the manager reads, as a key ends with them: ", priority:high"."""
        names = set(labels)
        return "".join(
            f", {name}" for family in LABEL_FAMILIES for name in family.labels() if name in names
        )

    def data(self) -> dict[str, Any]:
        return {"type": "task", **asdict(self)}

    @classmethod
    def from_data(cls, data: Mapping[str, Any]) -> Task:
        issue = data.get("issue")
        return cls(
            str(data["key"]),
            str(data["kind"]),
            int(data["number"]),
            str(data["state"]),
            str(data["title"]),
            int(issue) if issue is not None else None,
            tuple(str(label) for label in data.get("labels") or ()),
            data.get("branch"),
            data.get("ci"),
            data.get("sha"),
            bool(data.get("green")),
            tuple(int(number) for number in data.get("woken") or ()),
        )


@dataclass(frozen=True, slots=True)
class SetAside:
    """The open issues `left_out`, which hold their PRs with them (#540): a PR whose work is
    for one (`Task.issue_of`) starts nothing, neither its CI's result, nor a reply, nor its
    merge, until the label goes. An agent may have opened it before the label went on."""

    issues: frozenset[int]

    @classmethod
    def of(cls, entries: Iterable[Mapping[str, Any]]) -> SetAside:
        """From every open issue, before any is left out."""
        return cls(frozenset(int(entry["number"]) for entry in entries if left_out(entry)))

    def holds(self, entry: Mapping[str, Any], pull: Mapping[str, Any] | None) -> bool:
        """Whether `entry`, an open issue or PR (`pull`: GitHub's PR, when it is one), is
        left out. A release PR never is: a person merges or closes it (`releasing`)."""
        if left_out(entry):
            return True
        return pull is not None and not releasing(pull) and Task.issue_of(pull) in self.issues


@dataclass(frozen=True, slots=True)
class WaitingLabels:
    """The `waiting:<login>` labels (#449): an issue that waits for a person's answer or
    review carries theirs, so filtering the issues by `waiting:bateks` lists what needs
    bateks. A handoff puts them on from its **Waiting on** (`follow`), and the person's reply
    takes theirs off at the next look (`replied`), so the list stays true until Claude's
    next word. The people are this login and those the `claude:<login>` labels name (#222),
    and a missing label is made in the color of that person's `claude:<login>`."""

    github: GitHub

    PREFIX: ClassVar[str] = "waiting:"
    COLOR: ClassVar[str] = "fbca04"  # for one whose `claude:<login>` isn't there

    def follow(self, number: int, text: str) -> str | None:
        """After a handoff on #`number` that says `text`: the labels of the people its
        **Waiting on** names, and no others. What changed, in a line; None when nothing did."""
        there = {
            str(label["name"]): str(label.get("color") or self.COLOR)
            for label in self.github.call("GET", "labels?per_page=100")
        }
        move = Move.of(text)
        people = move.people(self._people(there)) if move is not None else ()
        wanted = {self.PREFIX + login for login in people}
        entry = self.github.call("GET", f"issues/{number}")
        on = {name for name in label_names(entry) if name.startswith(self.PREFIX)}
        put, taken = sorted(wanted - on), sorted(on - wanted)
        for name in put:
            if name not in there:
                self._make(name, there)
        if put:
            self.github.call("POST", f"issues/{number}/labels", {"labels": put})
        for name in taken:
            self._take_off(number, name)
        changes = [f"+{name}" for name in put] + [f"-{name}" for name in taken]
        return f"Labels: {', '.join(changes)}" if changes else None

    def replied(
        self,
        task: Task,
        replies: Sequence[Mapping[str, Any]],
        entries: Mapping[int, Mapping[str, Any]],
    ) -> None:
        """A reply waiting (`task`): the labels of whoever wrote `replies` come off its issue
        or PR, and off the issue a PR is for. They've answered."""
        authors = {str(reply["user"]["login"]) for reply in replies}
        for number in task.numbers:
            for name in label_names(entries.get(number) or {}):
                if name.startswith(self.PREFIX) and name.removeprefix(self.PREFIX) in authors:
                    self._take_off(number, name)

    def _people(self, there: Iterable[str]) -> list[str]:
        """This login, and those the repository's `claude:` and `waiting:` labels name."""
        me = str(self.github.call("GET", "/user")["login"])
        named = {
            name.split(":", 1)[1] for name in there if name.startswith((HANDED_TO, self.PREFIX))
        }
        return sorted(named | {me})

    def _make(self, name: str, there: Mapping[str, str]) -> None:
        """The label `name`, in the color of its person's `claude:<login>` (`there`: the
        repository's labels' colors)."""
        login = name.removeprefix(self.PREFIX)
        color = there.get(HANDED_TO + login, self.COLOR)
        about = f"Waits for {login}'s answer or review (#449)"
        self.github.call("POST", "labels", {"name": name, "color": color, "description": about})

    def _take_off(self, number: int, name: str) -> None:
        """One taken off meanwhile is fine."""
        self.github.call(
            "DELETE", f"issues/{number}/labels/{quote(name, safe='')}", missing_ok=True
        )


@dataclass(frozen=True, slots=True)
class Look:
    """What `status` shows, what in it needs doing now (`tasks`), and what's blocked, a line
    each (`held`, #107)."""

    text: str
    tasks: tuple[Task, ...] = ()
    held: tuple[str, ...] = ()

    @property
    def to_do(self) -> frozenset[str]:
        return frozenset(task.key for task in self.tasks)


def status(github: GitHub, now: Callable[[], datetime] = datetime.now) -> None:
    print(look(github, now).text)


def look(github: GitHub, now: Callable[[], datetime] = datetime.now) -> Look:
    """What needs doing, and when this look was taken (#230: the loop's replies look alike).
    A postponed issue, or a release's, is left out before its comments are read (`left_out`,
    #309, #517), and so is its PR, CI included (`SetAside`, #540). A reply from someone
    an issue waits on takes their label off it (`WaitingLabels.replied`, #449). CI's result
    is left out once Claude has spoken after it (#456): a restart of the agent manager, whose
    watcher says every task as it begins, would start an agent for each PR. A release PR is
    listed apart, and is never a task (`releasing`, #510). An issue that builds on an open one
    is blocked, with its PRs, and woken once that closes (`Dependencies`, #107)."""
    me = github.call("GET", "/user")["login"]
    at = now()
    lines = [f"Acting as {me} on {github.slug}, {at:%Y-%m-%d %H:%M}."]
    everything = github.call("GET", "issues?state=open&per_page=100")
    pulls = {pull["number"]: pull for pull in github.call("GET", "pulls?state=open&per_page=100")}
    aside = SetAside.of(everything)
    dependencies = Dependencies(github, frozenset(int(entry["number"]) for entry in everything))
    open_items = [
        entry
        for entry in everything
        if not aside.holds(
            entry, pulls.get(entry["number"], entry) if "pull_request" in entry else None
        )
    ]
    labels = {int(entry["number"]): label_names(entry) for entry in open_items}
    # each with whether it is a PR, its entry and its comments
    items: list[tuple[Item, bool, Mapping[str, Any], Any]] = []
    for entry in open_items:
        number = int(entry["number"])
        if releasing(pulls.get(number)):
            release = Item(number, str(entry["title"]), "release", owner(entry))
            items.append((release, True, entry, []))
            continue
        mine = owner(entry) == me
        comments = github.call("GET", f"issues/{number}/comments?per_page=100") if mine else []
        item = dependencies.hold(entry, Conversation(entry, comments, me).item(at), comments)
        items.append((item, "pull_request" in entry, entry, comments))
    blocked = {item.number: item.waits_on for item, _, _, _ in items if item.state == "blocked"}
    for n, (item, is_pull, entry, comments) in enumerate(items):
        if not is_pull or item.state in ("theirs", "release"):
            continue
        for_issue = Task.issue_of(pulls.get(item.number, entry))
        if for_issue is not None and for_issue in blocked:
            with_it = replace(item, state="blocked", waits_on=blocked[for_issue], stale=False)
            items[n] = (with_it, is_pull, entry, comments)
    entries = {int(entry["number"]): entry for entry in open_items}
    known = {item.number: comments for item, _, _, comments in items if item.owner == me}
    waiting = WaitingLabels(github)
    tasks: list[Task] = []
    for item, is_pull, entry, comments in items:
        if not item.to_do:
            continue
        pull = pulls.get(item.number, entry) if is_pull else None
        tasks.append(Task.waiting(item, len(comments), pull, labels))
        if item.state == "reply waiting":
            waiting.replied(tasks[-1], unread(comments, me), entries)

    for state, heading in (
        ("to start", "To start (mine, no comment from Claude yet)"),
        ("reply waiting", "A reply waiting (written after Claude's last word)"),
        ("Claude's move", "Claude's move (a closing handoff says Claude goes on)"),
        ("unblocked", "Unblocked (what they build on has closed since Claude's last word)"),
        ("in progress", "In progress (Claude's word is the last)"),
        ("blocked", "Blocked (what they build on is open: no agent starts on them)"),
        ("release", "Releases (on prod on trial once CI passes: a person merges or closes them)"),
    ):
        found = [(item, is_pull) for item, is_pull, _, _ in items if item.state == state]
        if not found:
            continue
        lines.append(f"\n{heading}:")
        for item, is_pull in found:
            kind = "PR" if is_pull else "issue"
            line = f"  {kind} #{item.number} {item.title}"
            if is_pull and item.number in pulls:
                pull = pulls[item.number]
                draft = " (draft)" if pull["draft"] else ""
                runs = CiRuns.at(github, pull["head"]["sha"])
                line += f"{draft} [{runs}]"
                if runs.finished and item.state not in ("release", "blocked"):
                    task = Task.ci_finished(item, pull, runs, labels)
                    threads = [
                        known[n]
                        if n in known
                        else github.call("GET", f"issues/{n}/comments?per_page=100")
                        for n in task.numbers
                    ]
                    if not runs.read(me, threads):
                        tasks.append(task)
            if item.stale:
                line += f" [{STALE}]"
            if item.waits_on:
                line += f" [waits on {numbered(item.waits_on)}]"
            if item.woken:
                line += f" [{numbered(item.woken)} closed]"
            lines.append(line)
    theirs = [item for item, _, _, _ in items if item.state == "theirs"]
    if theirs:
        others = ", ".join(f"#{item.number} ({item.owner})" for item in theirs)
        lines.append(f"\nOthers' (leave alone): {others}")
    held = tuple(
        f"{'PR' if is_pull else 'Issue'} #{item.number} is blocked: it waits on "
        f"{numbered(item.waits_on)}, which it builds on."
        for item, is_pull, _, _ in items
        if item.state == "blocked"
    )
    return Look("\n".join(lines), tuple(tasks), held)


def numbered(numbers: Iterable[int]) -> str:
    """ "#16, #17"."""
    return ", ".join(f"#{number}" for number in numbers)


FOLLOWED = "develop"  # the branch every machine follows while idle (#347)


def follow_develop(run: Run = subprocess.run) -> str | None:
    """Brings `develop` up to date while this machine is idle (#347), so what either Claude
    merged reaches what runs here without anyone pulling.

    Idle means `develop` checked out with no uncommitted changes; on a task branch it only
    fetches. A `develop` with commits of its own is never overwritten: it says so instead.
    What it did, in a line, or None when there was nothing to do."""

    def git(*args: str) -> subprocess.CompletedProcess[str]:
        return run(["git", *args], capture_output=True, text=True, check=False)

    def out(*args: str) -> str:
        return str(git(*args).stdout).strip()

    if git("fetch", "-q", "origin", FOLLOWED).returncode != 0:  # offline: next time
        return None
    if out("rev-parse", "--abbrev-ref", "HEAD") != FOLLOWED:
        return None
    if out("status", "--porcelain", "--untracked-files=no"):
        return None
    behind = int(out("rev-list", "--count", f"HEAD..origin/{FOLLOWED}") or 0)
    if not behind:
        return None
    ahead = int(out("rev-list", "--count", f"origin/{FOLLOWED}..HEAD") or 0)
    if ahead:
        commits = "commit" if ahead == 1 else "commits"
        return (
            f"Not pulled: {FOLLOWED} has {ahead} {commits} of its own, and origin/{FOLLOWED} "
            f"{behind} more. Push them through a PR, or set them aside, to follow it again."
        )
    before = out("rev-parse", "HEAD")
    if git("merge", "--ff-only", "-q", f"origin/{FOLLOWED}").returncode != 0:
        return None
    return f"Pulled {FOLLOWED}: {before[:7]}..{out('rev-parse', 'HEAD')[:7]}."


FOLLOW_EVERY = 10 * 60  # seconds between pulls of develop: each is a `git fetch` (#445)
WATCH_LONGEST = 110 * 60  # under the 2 hours a background job gets in Claude Code


class WatchOutput:
    """How `watch` says what it finds: as text for Claude in a session (`TextOutput`), or as
    JSON lines for the session manager (`JsonOutput`, #387)."""

    def begin(self, seen: Look) -> None:
        """What needs doing as it begins."""

    def new(self, seen: Look, keys: frozenset[str]) -> None:
        """What needs doing now that didn't before (`keys`), as it ends."""

    def say(self, line: str) -> None:
        """Anything else: a pull, why it ends."""

    def prices(self, news: PriceNews) -> None:
        self.say(news.text)

    def wiki(self, news: WikiNews) -> None:
        self.say(news.text)

    def held(self, lines: Iterable[str]) -> None:
        """What's newly blocked (#107): only the agent manager's log says it, since a session
        reads `status`."""


class TextOutput(WatchOutput):
    """For Claude, which acted on `status` before it watched: only what's new, as `status`
    shows it."""

    def new(self, seen: Look, keys: frozenset[str]) -> None:
        print(seen.text, flush=True)

    def say(self, line: str) -> None:
        print(line, flush=True)


class JsonOutput(WatchOutput):
    """One JSON object a line, for the session manager (#387): each task as `Task.data` has
    it, every one as it begins (a program has no `status` to act on first) and then the new
    ones; {"type": "prices", …} for new prices of Claude's, which want a PR too;
    {"type": "wiki", …} for the PRs the wiki lacks (#126, `WikiNews.data`); and
    {"type": "note", "text": …} for the rest, what's blocked among it (#107)."""

    def begin(self, seen: Look) -> None:
        for task in seen.tasks:
            self._line(task.data())

    def new(self, seen: Look, keys: frozenset[str]) -> None:
        for task in seen.tasks:
            if task.key in keys:
                self._line(task.data())

    def say(self, line: str) -> None:
        self._line({"type": "note", "text": line})

    def prices(self, news: PriceNews) -> None:
        if news.added:
            self._line({"type": "prices", "key": f"prices: {news.text}", "text": news.text})
        else:
            self.say(news.text)

    def wiki(self, news: WikiNews) -> None:
        if news.pulls:
            self._line(news.data())
        else:
            self.say(news.text)

    def held(self, lines: Iterable[str]) -> None:
        for line in lines:
            self.say(line)

    @staticmethod
    def _line(data: Mapping[str, Any]) -> None:
        print(json.dumps(data), flush=True)


def manager_running(lock: ManagerLock | None = None) -> str | None:
    """Why a session's `watch` ends, and its `handoffs` shows no handoff: the agent manager
    runs on this machine, and its agents take the issues (#387). None while it doesn't."""
    holder = (lock or ManagerLock()).holder()
    if holder is None:
        return None
    return (
        f"The agent manager runs on this machine ({holder}): its agents take the issues, "
        "and this session takes none (CLAUDE.md → Sessions)."
    )


def another_watching(lock: WatchLock | None = None) -> str | None:
    """Why a session's `watch` ends, and its `handoffs` shows no handoff (#597): another
    session's watcher runs on this machine, and takes the issues. None while none does, or
    the one running is this session's own."""
    held = (lock or WatchLock()).another()
    if held is None:
        return None
    return (
        f"Another session's watcher runs on this machine ({held}): it takes the issues, "
        "and this session takes none, only what its user asks (CLAUDE.md → Sessions)."
    )


def taken_here() -> str | None:
    """Why this session takes no issue, when it doesn't: the agent manager, or another
    session's watcher, runs on this machine."""
    return manager_running() or another_watching()


def watch(
    github: GitHub,
    every: float = WATCH_EVERY,
    longest: float = WATCH_LONGEST,
    now: Callable[[], datetime] = datetime.now,
    sleep: Callable[[float], None] = time.sleep,
    follow: Callable[[], str | None] = lambda: None,
    prices: Callable[[], PriceNews | None] = lambda: None,
    wiki: Callable[[], WikiNews | None] = lambda: None,
    output: WatchOutput | None = None,
    stop: Callable[[], str | None] = lambda: None,
) -> None:
    """Looks every `every` seconds (two minutes, #445), and ends when something new needs
    doing, showing it as `status` does (#314). So a session waits in the background and
    Claude is woken only then, not at each look to read that nothing changed.

    What needed doing when it began isn't new: Claude acts on `status` before it watches,
    and what's left is left on purpose (a CI failure it waits on). After `longest` seconds
    it ends anyway, saying so in one line, before a background job's time runs out.

    Every ten minutes of it (`FOLLOW_EVERY`), not at each look, it also runs `follow`, which
    keeps `develop` up to date while the machine is idle (#347, `follow_develop`, as the
    command does): what it did is said in a line, the same word once, and watching goes on.
    And `prices` reads Claude's prices once a day (#390, `DailyCheck`): a change is
    something to do, so it ends with it. So is a PR the wiki lacks, which `wiki` looks for
    every few hours, for the agent manager only (#126, `WikiCheck`).

    `output` says it all, as text by default, what's blocked as it begins and once more each
    time it's newly so (#107); and before each look `stop` may end it, saying why: in a
    session, that the agent manager runs (#387, `manager_running`)."""
    output = output or TextOutput()
    if (reason := stop()) is not None:
        output.say(reason)
        return
    began = now()
    first = look(github, now)
    output.held(first.held)
    output.begin(first)
    before, held = first.to_do, set(first.held)
    waited, followed, last_said = 0.0, 0.0, None
    while waited < longest:
        sleep(every)
        waited += every
        if (reason := stop()) is not None:
            output.say(reason)
            return
        if waited - followed >= FOLLOW_EVERY:
            followed = waited
            said = follow()
            if said is not None and said != last_said:
                output.say(said)
            last_said = said
        news = prices()
        if news is not None:
            output.prices(news)
            if news.added:
                return
        behind = wiki()
        if behind is not None:
            output.wiki(behind)
            if behind.pulls:
                return
        try:
            seen = look(github, now)
        except httpx.TransportError:  # the network: look again next time
            continue
        output.held(line for line in seen.held if line not in held)
        held = set(seen.held)
        if fresh := seen.to_do - before:
            output.new(seen, fresh)
            return
    output.say(f"Nothing new to do ({began:%H:%M}–{now():%H:%M}).")


# --- the commands --------------------------------------------------------------------------


# --- GitHub's answers, in brief (#442) -----------------------------------------------------


@dataclass(frozen=True, slots=True)
class Answer:
    """GitHub's answer to a call, as `api` prints it (#442). This one is the whole JSON, which
    `--full` asks for and an answer of no kind below gets; each subclass says one kind in
    brief, and `of` picks it. The whole was 22K characters for a PR, which an agent read
    three times per PR, and every character again on each later reply (#441)."""

    data: Any

    @staticmethod
    def of(data: Any) -> Answer:
        """`data` in brief, as its kind says."""
        kinds: tuple[type[Answer], ...] = (Entry, EntryList, MergeResult, WorkflowRuns)
        return next((kind(data) for kind in kinds if kind.fits(data)), Answer(data))

    @staticmethod
    def fits(data: Any) -> bool:
        """Whether `data` is of this kind."""
        return True

    def __str__(self) -> str:
        return json.dumps(self.data, indent=2, ensure_ascii=False)


@dataclass(frozen=True, slots=True)
class Entry(Answer):
    """An issue or a PR: what and where it is, its labels, and a PR's branches, its commit
    and whether it can be merged."""

    @staticmethod
    def fits(data: Any) -> bool:
        """A milestone has a number, title and link too, but no `user`."""
        return isinstance(data, dict) and {"number", "title", "html_url", "user"} <= data.keys()

    @property
    def headline(self) -> str:
        """ "PR #457 [open, draft] Its title", as `show` begins. A PR comes from `pulls` with
        its `head`, or from `issues` with `pull_request`; merged, it's closed with a time."""
        data = self.data
        kind = "PR" if "head" in data or "pull_request" in data else "issue"
        as_issue = data.get("pull_request") or {}
        merged = data.get("merged") or data.get("merged_at") or as_issue.get("merged_at")
        state = "merged" if merged else str(data["state"])
        if data.get("draft"):
            state += ", draft"
        return f"{kind} #{data['number']} [{state}] {data['title']}"

    def __str__(self) -> str:
        lines = [self.headline, str(self.data["html_url"])]
        if labels := label_names(self.data):
            lines.append(f"labels: {', '.join(labels)}")
        if head := self.data.get("head"):
            line = f"{head['ref']} → {self.data['base']['ref']} at {head['sha']}"
            if (mergeable := self.data.get("mergeable_state")) is not None:
                line += f"; mergeable_state: {mergeable}"
            lines.append(line)
        return "\n".join(lines)


@dataclass(frozen=True, slots=True)
class EntryList(Answer):
    """Issues or PRs, as a list of them comes: a line each."""

    @staticmethod
    def fits(data: Any) -> bool:
        return isinstance(data, list) and bool(data) and all(map(Entry.fits, data))

    def __str__(self) -> str:
        return "\n".join(Entry(entry).headline for entry in self.data)


@dataclass(frozen=True, slots=True)
class MergeResult(Answer):
    """A PR merged (`PUT pulls/N/merge`): the commit it made."""

    @staticmethod
    def fits(data: Any) -> bool:
        return isinstance(data, dict) and {"sha", "merged", "message"} <= data.keys()

    def __str__(self) -> str:
        if self.data["merged"]:
            return f"Merged as {self.data['sha']}: {self.data['message']}"
        return f"Not merged: {self.data['message']}"


@dataclass(frozen=True, slots=True)
class WorkflowRuns(Answer):
    """CI's runs, as `actions/runs?…` lists them, or one (`actions/runs/N`): a line each."""

    @staticmethod
    def fits(data: Any) -> bool:
        return isinstance(data, dict) and (
            isinstance(data.get("workflow_runs"), list)
            or {"workflow_id", "head_sha"} <= data.keys()
        )

    def __str__(self) -> str:
        runs = self.data.get("workflow_runs", [self.data])
        if not runs:
            return "No workflow runs."
        return "\n".join(
            f"run {run['id']} {run['name']}: {run['conclusion'] or run['status']} "
            f"at {run['head_sha']}, {run['created_at']}"
            for run in runs
        )


# --- an issue as text (#387) ---------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class IssueThread:
    """An issue or PR and its comments, the `show` command: as text, its title, state, author
    and labels, its description, then each comment with whose it is and when (#387); or only
    what's been said since Claude's last comment (`new`, #442), for the look before each
    comment, which read the whole thread again. An agent's allow list runs this script but
    not `python -c`, so `api --full`'s JSON is no way for it to read one.

    Claude speaks or acts here only once it has read those replies (#208): `comment` and
    `close` (#442) are refused while there are any (`check_read`), and shown them instead."""

    github: GitHub
    number: int

    @staticmethod
    def _when(stamp: str) -> str:
        return f"{stamp[:16].replace('T', ' ')} UTC"  # "2026-10-12T16:45:20Z" → to the minute

    def text(self) -> str:
        issue = self.github.call("GET", f"issues/{self.number}")
        comments = self._comments()
        byline = f"by {issue['user']['login']}, {self._when(issue['created_at'])}"
        if labels := label_names(issue):
            byline += f"; labels: {', '.join(labels)}"
        lines = [
            Entry(issue).headline,
            byline,
            "",
            (issue.get("body") or "(no description)").strip(),
        ]
        for comment in comments:
            lines += self._said(comment)
        if not comments:
            lines += ["", "No comments."]
        return "\n".join(lines)

    def new(self) -> str:
        """Its headline, then only the comments since Claude's last (`unread`)."""
        me = self.github.call("GET", "/user")["login"]
        since = unread(self._comments(), me)
        lines = [Entry(self.github.call("GET", f"issues/{self.number}")).headline]
        for comment in since:
            lines += self._said(comment)
        if not since:
            lines += ["", "Nothing new since Claude's last comment."]
        return "\n".join(lines)

    def check_read(self, me: str) -> None:
        """Refuses, showing them, while there are replies since the last comment of Claude's
        (`me`'s)."""
        if waiting := unread(self._comments(), me):
            shown = "\n".join(line for comment in waiting for line in self._said(comment))
            raise SystemExit(
                f"#{self.number} has replies since Claude's last comment. Read them and act on "
                f"them, then run this again with --read.\n{shown}"
            )

    def close(self, read: bool = False) -> str:
        """Closes it, once Claude's comment has said why; refused while a reply waits unread,
        unless `read`. Its headline, closed."""
        if not read:
            self.check_read(self.github.call("GET", "/user")["login"])
        closed = self.github.call("PATCH", f"issues/{self.number}", {"state": "closed"})
        return Entry(closed).headline

    def _comments(self) -> list[Mapping[str, Any]]:
        return list(self.github.call("GET", f"issues/{self.number}/comments?per_page=100"))

    def _said(self, comment: Mapping[str, Any]) -> list[str]:
        """A comment as `show` prints it: whose, when, and what it says, after a blank line."""
        heading = f"--- {comment['user']['login']}"
        if stamp := comment.get("created_at"):
            heading += f", {self._when(str(stamp))}"
        return ["", f"{heading}:", (comment.get("body") or "").strip()]


# --- a PR's commands (#442) ----------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class PullRequests:
    """What agents did with `api` by hand, reading a PR's 22K characters of JSON each time
    (#442), as commands that say what came of it in a few lines: `pr N` (`brief`), `pr open`
    (`open`) and `merge N` (`merge`)."""

    github: GitHub

    INTO: ClassVar[str] = "develop"  # where a task's PR goes (docs/conventions.md)

    def brief(self, number: int) -> str:
        """The PR as `api` says it, and its CI as `ci` does."""
        pull = self.github.call("GET", f"pulls/{number}")
        return f"{Entry(pull)}\n{CiRuns.at(self.github, pull['head']['sha'])}"

    def open(self, asked: Mapping[str, Any]) -> str:
        """Opens the PR `asked` describes (its title, head, base and body), the description
        signed as a comment is, with whose Claude wrote it (CLAUDE.md, #298)."""
        me = self.github.call("GET", "/user")["login"]
        body = sign(str(asked.get("body") or ""), me, AgentPower.of_agent())
        return str(Entry(self.github.call("POST", "pulls", {**asked, "body": body})))

    def merge(self, number: int, at: str | None = None) -> str:
        """Squashes it into develop as docs/conventions.md says: one commit, titled after the
        PR, with its description as the body. At the commit it was looked at, or at `at`,
        the one the agent manager checked (#550): GitHub refuses it if the branch has moved
        since. Never into master (CLAUDE.md): a release is a merge commit, and a person's
        call."""
        pull = self.github.call("GET", f"pulls/{number}")
        if (base := pull["base"]["ref"]) != self.INTO:
            raise SystemExit(
                f"PR #{number} goes into {base}: merge squashes into {self.INTO} only."
            )
        title = f"{pull['title']} (#{number})"
        merged = self.github.call(
            "PUT",
            f"pulls/{number}/merge",
            {
                "merge_method": "squash",
                "commit_title": title,
                "commit_message": pull.get("body") or "",
                "sha": at or pull["head"]["sha"],
            },
        )
        return f"Merged PR #{number} into {self.INTO} as {merged['sha'][:7]}: {title}"


# --- a release (#510) ------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class ReleaseCut:
    """`release`: a release branch at develop's tip, and its PR into master. Once CI passes,
    the release is on prod on trial; merging the PR confirms it, closing it rolls prod back
    (docs/production.md → A release). A person merges or closes it, never Claude: `merge`
    refuses it. Named after the day, numbered from 01: release/2026-10-16-01, then -02."""

    github: GitHub
    today: Callable[[], date] = date.today

    FROM: ClassVar[str] = "develop"

    def cut(self) -> str:
        """The PR opened, as `api` says one."""
        return str(Entry(self._open()))

    def _open(self) -> Mapping[str, Any]:
        """The branch, then its PR, as GitHub answers it. Refused (`ReleaseRefused`) while a
        release PR is open, or when develop has nothing master hasn't."""
        if pending := self.github.call("GET", f"pulls?state=open&base={RELEASE_INTO}"):
            raise ReleaseRefused(f"{Entry(pending[0]).headline} is open: merge or close it first.")
        tip = str(self.github.call("GET", f"branches/{self.FROM}")["commit"]["sha"])
        news = self.github.call("GET", f"compare/{RELEASE_INTO}...{tip}")
        if not news["ahead_by"]:
            raise ReleaseRefused(
                f"{self.FROM} has nothing {RELEASE_INTO} hasn't: nothing to release."
            )
        name = self._name()
        self.github.call("POST", "git/refs", {"ref": f"refs/heads/{name}", "sha": tip})
        me = self.github.call("GET", "/user")["login"]
        asked = {
            "title": f"Release {name.removeprefix('release/')}",
            "head": name,
            "base": RELEASE_INTO,
            "body": self._signed(self._description(tip, news), me),
        }
        return dict(self.github.call("POST", "pulls", asked))

    def _signed(self, text: str, me: str) -> str:
        """Claude's PR: whose Claude first, the line of a PR Claude opened last."""
        generated = f"{text}\n\n🤖 {GENERATED}(https://claude.com/claude-code)"
        return sign(generated, me, AgentPower.of_agent())

    def _name(self) -> str:
        """release/<today>-NN, one more than the last of today's, a branch or a PR's: once
        merged, its branch is gone. An unnumbered release/<today> counts as 01."""
        day = f"release/{self.today():%Y-%m-%d}"
        refs = self.github.call("GET", f"git/matching-refs/heads/{day}")
        pulls = self.github.call("GET", f"pulls?state=all&base={RELEASE_INTO}&per_page=100")
        names = [str(ref["ref"]).removeprefix("refs/heads/") for ref in refs]
        names += [str(pull["head"]["ref"]) for pull in pulls]
        numbered = re.compile(re.escape(day) + r"(?:-(\d+))?")
        found = [numbered.fullmatch(name) for name in names]
        last = max((int(match[1] or 1) for match in found if match), default=0)
        return f"{day}-{last + 1:02d}"

    def _description(self, tip: str, news: Mapping[str, Any]) -> str:
        """What a person reads first: what's in it, and what merging or closing it does."""
        commits = "\n".join(
            f"- {str(commit['commit']['message']).splitlines()[0]}" for commit in news["commits"]
        )
        return (
            f"{self.FROM} at {tip[:7]}, {news['ahead_by']} commits {RELEASE_INTO} hasn't. Once"
            " CI passes, it goes live on prod on trial, and CI says here how that went. Try"
            " it out, then **merge** this PR to confirm the release, or **close** it to"
            " roll prod back (docs/production.md → A release).\n\n"
            f"{commits}"
        )


class ReleaseRefused(SystemExit):
    """No release cut, and why: a release PR is open, or there's nothing to release. From
    the command line, it ends the script with that, as any refusal does."""


@dataclass(frozen=True, slots=True)
class ReleaseLabel(ReleaseCut):
    """The label `release` on #`issue` (#517): release-cut.yml cuts the release on GitHub's
    runner, with a person's token (`RELEASE_TOKEN`), since a PR opened with Actions' own
    starts no CI. What came of it goes on the issue, which is then closed: from there the
    release lives on its PR. No Claude talks here, so the workflow signs what it writes."""

    issue: int = field(kw_only=True)

    SIGNATURE: ClassVar[str] = "_Release workflow ({login})_"

    def answer(self) -> str:
        """Cuts it, and says so on the issue: closed as done, or, refused, as not planned
        (one release at a time: a second label names the first's PR). What it said."""
        try:
            pull = self._open()
        except ReleaseRefused as refused:
            said, reason = f"**Not cut:** {refused}", "not_planned"
        else:
            head, reason = pull["head"], "completed"
            said = (
                f"**Cut:** #{pull['number']}, `{head['ref']}` at {self.FROM}'s {head['sha'][:7]}."
                " Once CI passes, it's live on prod on trial: merge the PR to confirm it, or"
                " close it to roll it back."
            )
        me = self.github.call("GET", "/user")["login"]
        self.github.call("POST", f"issues/{self.issue}/comments", {"body": self._signed(said, me)})
        closed = {"state": "closed", "state_reason": reason}
        self.github.call("PATCH", f"issues/{self.issue}", closed)
        return said

    def _signed(self, text: str, me: str) -> str:
        return f"{self.SIGNATURE.format(login=me)}\n\n{text}"


# --- what the work cost (#390) -------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class IssueWork:
    """The work on an issue (#390): what it cost on this machine, its PRs' included, and on
    the others, as their handoffs say (#399); the cost prefixes on its title: "[~$40]" from
    the first comment, "[$62] [~$40]" once it's done; and its handoffs, which say where it
    stands for a session on any machine."""

    github: GitHub
    number: int
    cost_of: Callable[[int, Iterable[int]], IssueCost] = issue_cost
    here: Callable[[], Machine] = Machine.here

    def pulls(self) -> list[int]:
        """The PRs whose description closes it ("Closes #390"): their work is its."""
        closes = re.compile(CLOSES.format(number=self.number), re.I)
        return [
            pull["number"]
            for pull in self.github.call("GET", "pulls?state=all&per_page=100")
            if closes.search(pull.get("body") or "")
        ]

    def cost(self) -> IssueCost:
        """On this machine, from its logs."""
        return self.cost_of(self.number, self.pulls())

    def elsewhere(self) -> dict[str, Decimal]:
        """On the other machines, from the latest handoff of each."""
        me = self.github.call("GET", "/user")["login"]
        comments = self.github.call("GET", f"issues/{self.number}/comments?per_page=100")
        return Handoff.shares(comments, me, self.here())

    def summary(self) -> str:
        """What `cost` prints: this machine's, and the others' when there are any."""
        here, others = self.cost(), self.elsewhere()
        if not others:
            return here.summary()
        listed = ", ".join(f"{machine} ${dollars:.2f}" for machine, dollars in others.items())
        total = here.dollars + sum(others.values(), Decimal(0))
        return "\n".join(
            [here.summary(), f"Elsewhere, by its latest handoff: {listed}", f"In all: ${total:.2f}"]
        )

    def handoff(
        self,
        text: str,
        closing: bool = False,
        now: Callable[[], datetime] = lambda: datetime.now().astimezone(),
    ) -> str:
        """The comment `text` as a handoff: ending with the mark that says which machine
        handed off, when, what the work has cost here, and whether this session is closing."""
        return HandoffMark(self.here(), now(), self.cost().dollars, closing).ending(text)

    def retitle(self, estimate: Decimal | None = None, done: bool = False) -> str:
        """Puts the estimate (`estimate` dollars), or what it took (`done`, on every
        machine), in front of the title, replacing what was there; the rest of the title
        stays. The new title."""
        title = Title.parse(self.github.call("GET", f"issues/{self.number}")["title"])
        if estimate is not None:
            title = replace(title, estimate=estimate_text(estimate))
        if done:
            took = self.cost().dollars + sum(self.elsewhere().values(), Decimal(0))
            title = replace(title, actual=actual_text(took))
        self.github.call("PATCH", f"issues/{self.number}", {"title": str(title)})
        return str(title)


# --- carrying on (#399) --------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class CarryOn:
    """What a session carries on from, the `handoffs` command: what `status` shows; each
    open issue of this login with its latest handoff, in brief unless `full` (#449), and what
    has changed since (comments, PRs, its branch on origin and here); and what's only on this
    machine. All but the last part comes from GitHub, so it reads the same on any machine
    (#399). An issue that waits on someone is shown as its move alone (#597), and while the
    agent manager or another session's watcher runs here (`taken` says so), no handoff is:
    the session takes no issue then."""

    github: GitHub
    git: Git
    here: Machine
    now: Callable[[], datetime] = datetime.now
    full: bool = False
    taken: Callable[[], str | None] = lambda: None

    UNFETCHED: ClassVar[str] = "The branches are as last fetched: couldn't fetch origin."
    LEFT_OUT: ClassVar[str] = "The handoffs are left out: `handoffs <n>` shows an issue's."

    def text(self) -> str:
        fetched = self.git.ok("fetch", "-q", "--prune", "origin")
        lines = [look(self.github, self.now).text, ""]
        if not fetched:
            lines.append(self.UNFETCHED)
        if (reason := self.taken()) is not None:
            lines += [reason, self.LEFT_OUT]
        else:
            lines += self._handoffs()
        return "\n".join([*lines, "", *self._machine(LocalWork.collect(self.git))])

    def _handoffs(self) -> list[str]:
        """Each open issue of this login's, with its latest handoff."""
        me = self.github.call("GET", "/user")["login"]
        pulls = self.github.call("GET", "pulls?state=all&per_page=100")
        mine = [
            entry
            for entry in self.github.call("GET", "issues?state=open&per_page=100")
            if "pull_request" not in entry and not left_out(entry) and owner(entry) == me
        ]
        lines = [
            f"Handoffs, the latest on each open issue of {me}'s:"
            if mine
            else f"Handoffs: {me} has no open issue."
        ]
        for entry in mine:
            lines += ["", *self._issue(entry, me, pulls).lines(self.here, full=self.full)]
        return lines

    def _machine(self, work: LocalWork) -> list[str]:
        """This machine, the branch checked out here, and `work`: what's only here."""
        branch = self.git.out("rev-parse", "--abbrev-ref", "HEAD") or "no branch"
        return [f"This machine: {self.here}, on {branch}.", work.text()]

    def _issue(
        self, entry: Mapping[str, Any], me: str, pulls: Sequence[Mapping[str, Any]]
    ) -> IssueCarry:
        number = int(entry["number"])
        comments = self.github.call("GET", f"issues/{number}/comments?per_page=100")
        handoff = Handoff.latest(comments)
        after = comments[handoff.position + 1 :] if handoff else []
        since = tuple(
            f"{c['user']['login']}'s Claude" if by_claude(c["body"]) else str(c["user"]["login"])
            for c in after
        )
        last_word = next((str(c["html_url"]) for c in reversed(comments) if claude_s(c, me)), None)
        branches = IssueBranch.find(number, self.git)
        its = self._pulls(number, {branch.name for branch in branches}, pulls)
        item = Conversation(entry, comments, me).item(self.now())
        item = Dependencies(self.github).hold(entry, item, comments)
        goes_on = handoff is not None and (move := handoff.move) is not None and move.goes_on
        return IssueCarry(
            number,
            item.title,
            item.state,
            handoff,
            since,
            its,
            branches,
            last_word,
            item.stale,
            to_move=item.to_do or item.stale or goes_on,
        )

    def _pulls(
        self, number: int, branches: set[str], pulls: Sequence[Mapping[str, Any]]
    ) -> tuple[str, ...]:
        """The issue's PRs: those that close it, or come from its branch."""
        closes = re.compile(CLOSES.format(number=number), re.I)
        found: list[str] = []
        for pull in pulls:
            if closes.search(pull.get("body") or "") or pull["head"].get("ref") in branches:
                if said := self._pull(pull):
                    found.append(said)
        return tuple(found)

    def _pull(self, pull: Mapping[str, Any]) -> str | None:
        """ "PR #400 open [CI: success]", "PR #398 merged"; None for one closed unmerged."""
        if pull.get("merged_at"):
            return f"PR #{pull['number']} merged"
        if pull["state"] != "open":
            return None
        draft = " (draft)" if pull["draft"] else ""
        runs = CiRuns.at(self.github, pull["head"]["sha"])
        return f"PR #{pull['number']} open{draft} [{runs}]"


@dataclass(frozen=True, slots=True)
class IssueCarryOn(CarryOn):
    """`handoffs <n>`, what an agent carries on from (#424): its issue alone, the latest
    handoff's link without the text that `show <n>` prints with the other comments, and what
    of the issue's is only on this machine. Every open issue's handoff was most of what an
    agent read at its start, and its own it read twice."""

    number: int = field(kw_only=True)

    def text(self) -> str:
        fetched = self.git.ok("fetch", "-q", "--prune", "origin")
        me = self.github.call("GET", "/user")["login"]
        pulls = self.github.call("GET", "pulls?state=all&per_page=100")
        entry = self.github.call("GET", f"issues/{self.number}")
        lines = [] if fetched else [self.UNFETCHED]
        lines += self._issue(entry, me, pulls).lines(self.here, quoted=False)
        work = LocalWork.collect(self.git).about(self.number)
        return "\n".join([*lines, "", *self._machine(work)])


def utf8_output(stream: object = sys.stdout) -> None:
    """Writes UTF-8 whatever the console (#358). Piped on Windows, Python writes the ANSI
    code page (cp1252), where an emoji or Cyrillic can only become "?": what Claude reads
    then isn't what's on GitHub. An interactive console is UTF-8 already (PEP 528)."""
    if isinstance(stream, io.TextIOWrapper):
        stream.reconfigure(encoding="utf-8", errors="replace")


def main(argv: Sequence[str] | None = None) -> None:
    utf8_output()
    parser = argparse.ArgumentParser(prog="scripts/github.py", description=__doc__.split("\n")[0])
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("status", help="what needs doing")
    watching = commands.add_parser(
        "watch", help="wait until something new needs doing, then show it as status does"
    )
    watching.add_argument(
        "--every", type=float, default=WATCH_EVERY / 60, help="minutes between looks"
    )
    watching.add_argument(
        "--for", dest="longest", type=float, default=110, help="minutes at most, then it ends"
    )
    watching.add_argument(
        "--json",
        action="store_true",
        help="one JSON object a line, every task from the start: for the agent manager (#387)",
    )
    watching.add_argument(
        "--wiki",
        type=float,
        default=0,
        metavar="HOURS",
        help="with --json: every HOURS, whether PRs merged since the wiki's last update (#126)",
    )
    commenting = commands.add_parser("comment", help="comment on an issue or PR, signed")
    commenting.add_argument("number", type=int)
    commenting.add_argument("file", help="the comment in Markdown; - reads it from stdin")
    commenting.add_argument(
        "--read", action="store_true", help="the replies since Claude's last comment are read"
    )
    commenting.add_argument(
        "--handoff", action="store_true", help="a handoff: ends with this machine's mark (#399)"
    )
    commenting.add_argument(
        "--closing", action="store_true", help="with --handoff: this session is closing"
    )
    handing = commands.add_parser("handoffs", help="what a session carries on from (#399)")
    handing.add_argument(
        "number", type=int, nargs="?", help="that issue's alone: what an agent carries on from"
    )
    handing.add_argument(
        "--full", action="store_true", help="each handoff whole, not just its move and details"
    )
    showing = commands.add_parser("show", help="an issue or PR and its comments, as text")
    showing.add_argument("number", type=int)
    showing.add_argument(
        "--new", action="store_true", help="only the comments since Claude's last (#442)"
    )
    checking = commands.add_parser("ci", help="CI on a branch's (or commit's) latest commit")
    checking.add_argument("ref")
    reading = commands.add_parser("logs", help="a CI job's whole log: filter it with grep")
    reading.add_argument("job", type=int)
    pulling = commands.add_parser("pr", help="a PR in brief, with its CI; or open one (#442)")
    pulling.add_argument("what", help='the PR\'s number, or "open" to open one')
    pulling.add_argument("file", nargs="?", help="after open: a JSON file with the PR's fields")
    merging = commands.add_parser("merge", help="squash a PR into develop, titled after it")
    merging.add_argument("number", type=int)
    cutting = commands.add_parser(
        "release", help="a release branch from develop, its PR into master"
    )
    cutting.add_argument(
        "--issue",
        type=int,
        help="the issue labelled release (#517): what came of it goes there, and it's closed",
    )
    closing = commands.add_parser("close", help="close an issue or PR, after Claude's comment")
    closing.add_argument("number", type=int)
    closing.add_argument(
        "--read", action="store_true", help="the replies since Claude's last comment are read"
    )
    costing = commands.add_parser("cost", help="what an issue's work cost, in dollars (#390)")
    costing.add_argument("number", type=int)
    titling = commands.add_parser("title", help="the cost prefixes on an issue's title (#390)")
    titling.add_argument("number", type=int)
    titling.add_argument("--estimate", type=Decimal, help="dollars the work will take")
    titling.add_argument("--done", action="store_true", help="what it took, from the logs")
    calling = commands.add_parser("api", help="any REST call; prints its answer in brief")
    calling.add_argument("method", choices=["GET", "POST", "PATCH", "PUT", "DELETE"])
    calling.add_argument("path", help='"issues/180" (in the repo) or "/user" (from the root)')
    calling.add_argument("file", nargs="?", help="a JSON file with the request's body")
    calling.add_argument("--full", action="store_true", help="the whole JSON answer")
    args = parser.parse_args(argv)
    if args.command == "pr" and not (
        args.what.isdigit() and args.file is None or args.what == "open" and args.file
    ):
        parser.error('pr takes a PR\'s number, or "open" and a JSON file')

    remote = subprocess.run(
        ["git", "remote", "get-url", "origin"], capture_output=True, text=True, check=True
    ).stdout.strip()
    github = GitHub(repo_slug(remote), token())

    if args.command == "status":
        status(github)
    elif args.command == "watch" and args.json:  # the manager's own
        watch(
            github,
            every=args.every * 60,
            longest=args.longest * 60,
            follow=follow_develop,
            prices=DailyCheck(),
            wiki=WikiCheck(github, remote, args.wiki) if args.wiki else lambda: None,
            output=JsonOutput(),
        )
    elif args.command == "watch":
        # A session's: one per machine (#597), and it ends while the manager runs.
        lock = WatchLock()
        if not lock.acquire(datetime.now()):
            print(
                another_watching(lock) or f"This session's watcher runs already ({lock.holder()})."
            )
            return
        try:
            watch(
                github,
                every=args.every * 60,
                longest=args.longest * 60,
                follow=follow_develop,
                prices=DailyCheck(),
                output=TextOutput(),
                stop=manager_running,
            )
        finally:
            lock.release()
    elif args.command == "comment":
        if args.closing and not args.handoff:
            parser.error("--closing goes with --handoff")
        text = sys.stdin.read() if args.file == "-" else Path(args.file).read_text(encoding="utf-8")
        if args.handoff:
            text = IssueWork(github, args.number).handoff(text, closing=args.closing)
        print(post_comment(github, args.number, text, read=args.read))
        if args.handoff and (labelled := WaitingLabels(github).follow(args.number, text)):
            print(labelled)
    elif args.command == "handoffs" and args.number is None:
        print(CarryOn(github, Git(), Machine.here(), full=args.full, taken=taken_here).text())
    elif args.command == "handoffs":
        print(IssueCarryOn(github, Git(), Machine.here(), number=args.number).text())
    elif args.command == "show":
        thread = IssueThread(github, args.number)
        print(thread.new() if args.new else thread.text())
    elif args.command == "ci":
        sha = github.call("GET", f"commits/{args.ref}")["sha"]
        print(f"{args.ref} ({sha[:7]}): {CiRuns.at(github, sha)}")
    elif args.command == "logs":
        print(github.text(f"actions/jobs/{args.job}/logs"))
    elif args.command == "pr" and args.what == "open":
        asked = json.loads(Path(args.file).read_text(encoding="utf-8"))
        print(PullRequests(github).open(asked))
    elif args.command == "pr":
        print(PullRequests(github).brief(int(args.what)))
    elif args.command == "merge":
        print(PullRequests(github).merge(args.number))
    elif args.command == "release" and args.issue is not None:
        print(ReleaseLabel(github, issue=args.issue).answer())
    elif args.command == "release":
        print(ReleaseCut(github).cut())
    elif args.command == "close":
        print(IssueThread(github, args.number).close(read=args.read))
    elif args.command == "cost":
        print(IssueWork(github, args.number).summary())
    elif args.command == "title":
        if args.estimate is None and not args.done:
            parser.error("title needs --estimate DOLLARS or --done")
        print(IssueWork(github, args.number).retitle(args.estimate, args.done))
    else:
        body = json.loads(Path(args.file).read_text(encoding="utf-8")) if args.file else None
        answer = github.call(args.method, api_path(args.path), body)
        print(Answer(answer) if args.full else Answer.of(answer))


if __name__ == "__main__":
    main()
