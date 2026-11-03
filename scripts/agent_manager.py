"""The session manager (#387): one headless Claude Code agent per task, each in a worktree of
its own, so that nobody watches handoffs or starts sessions again.

    uv run python scripts/agent_manager.py             runs until Ctrl+C
    uv run python scripts/agent_manager.py --dry-run   says what it would run, runs nothing
    uv run python scripts/agent_manager.py --once      does what needs doing now, then ends
    uv run python scripts/agent_manager.py --issue 7   only #7's tasks (a trial run)
    uv run python scripts/agent_manager.py labels      puts the model:*, effort:* and
                                                       priority:* labels on the repository
                                                       (scripts/setup.sh does)

It runs the watcher, `scripts/github.py watch --json`, as its child: the watcher decides what
needs doing, as it did for a session, looking every two minutes unless agent-manager.toml says
otherwise (#445), and the manager starts it again whenever it ends (at once after an ordinary
end, after a wait that grows with each failure). For each task:

- the agent's power: the issue's `model:*` and `effort:*` labels, the stronger of two in a
  family, else agent-manager.toml's defaults (`AgentPower`);
- its worktree, <worktree_dir>/<issue>, on the issue's branch, or a new
  `feature/<issue>-<title>` from origin/develop (`Worktree`); a new one gets the checkout's
  caches and a .venv of its own first, so the agent doesn't start cold (`Warmup`);
- its own test database, `everest_<issue>_test`, when the project has one, so two agents'
  tests don't drop each other's tables (`TestDatabase`);
- `claude -p` there (`Agent`): it works on the issue as CLAUDE.md says, and stops when the
  next move is someone else's. Its output goes to .agent-runs/<issue>.log. Claude Code
  compacts its conversation early, at agent-manager.toml's share of the window
  (`CompactShare`, #441): every reply reads all of it again. For the same reason it's
  offered only what it can use: the tools in `Agent.TOOLS`, the project's settings and
  hooks, no MCP server (#443), no skills and no auto-memory (#551).

A green PR's merge needs no agent when the one that opened the PR left the closing comment in
its handoff: the manager checks the PR and merges it itself (`SelfMerge`, #550), and starts an
agent, told why, only when a check fails.

One agent per issue, at most `max_parallel` at once, and a green PR's merge besides, in a lane
of its own (#485): the rest wait their turn, a merge first, then by the issue's `priority:*`
label, then mid-work before new, then first come first served; and one whose turn comes
after it stopped needing anything is dropped (`Scheduler`), as is a PR's whose issue was
postponed meanwhile (#540), or blocked by what it builds on (#107: the watcher holds such an
issue, its log says on what, and its merge wakes it). One that couldn't start (its branch
checked out in the checkout, say) is tried again at the watcher's next look. One whose run
ended on the account's usage limit waits its turn again, and no agent starts before the
limit resets (`UsageLimit`, #476); one whose run ended because the account lacks its model
(Fable is on some plans only) waits its turn again and runs on the next model down, as every
later one on that model does (`ModelUnavailable`, #4). While the machine lacks a tool an
agent needs, code work waits, and the manager says what and the fix, and when a restart would
give its agents a tool installed since it started (`ToolchainHold`, #108). When an agent
ends, its worktree goes if nothing in it is missing from GitHub; else it stays, and the log
says why. The first Ctrl+C stops the watcher and starts nothing more, letting the agents
running finish their work; a second stops them too, and keeps their worktrees as they are
(#485). While it runs it holds a lock (`ManagerLock`), so a session's watcher ends: the
agents take the issues (CLAUDE.md → Sessions).
"""

import argparse
import asyncio
import json
import os
import queue
import re
import select
import shlex
import shutil
import signal
import subprocess
import sys
import threading
import time
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, tzinfo
from pathlib import Path
from typing import IO, Any, ClassVar
from urllib.parse import urlsplit, urlunsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

if sys.platform == "win32":
    import msvcrt
else:
    import termios
    import tty

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))  # run as a script, it still finds scripts

import httpx  # noqa: E402

from scripts.agents import (  # noqa: E402
    LABEL_FAMILIES,
    RUNS,
    WATCH_EVERY,
    AgentPower,
    CompactShare,
    ManagerConfig,
    ManagerLock,
    Priority,
)
from scripts.check_setup import Check, Toolchain  # noqa: E402
from scripts.claude_cost import IssueCost, Title, issue_cost  # noqa: E402
from scripts.github import (  # noqa: E402
    CLOSES,
    POSTPONED,
    RELEASE_LABEL,
    CiRuns,
    Conversation,
    Dependencies,
    GitHub,
    IssueWork,
    PullRequests,
    Task,
    WaitingLabels,
    claude_s,
    label_names,
    left_out,
    post_comment,
    repo_slug,
    token,
    utf8_output,
)
from scripts.handoff import Git, Handoff, IssueBranch, Machine, Run, plural  # noqa: E402

Say = Callable[[str], None]


def local_now() -> datetime:
    """This machine's time, with its offset, so a time in another zone compares with it."""
    return datetime.now().astimezone()


class Console:
    """The manager's console: each line starts with this machine's time, to the second, so a
    log read later says when each thing happened (#522)."""

    def __init__(self, now: Callable[[], datetime] = local_now) -> None:
        self._now = now

    def say(self, line: str) -> None:
        print(f"{self._now():%Y-%m-%d %H:%M:%S} {line}", flush=True)


class AgentError(Exception):
    """Why an agent couldn't start."""


# --- what an agent is started for ------------------------------------------------------------


class Job:
    """What an agent is started for, from a line of the watcher's. `slot` names its
    worktree, its log and its test database: one agent per slot at a time."""

    key: str  # the watcher's: a job seen once isn't started again
    slot: str
    labels: tuple[str, ...] = ()
    issue: int | None = None  # the issue it's for, when there's one
    task: Task | None = None  # the watcher's task, when it's an issue's or a PR's

    INTRO: ClassVar[str] = (
        "You are an agent of the session manager (scripts/agent_manager.py, #387), in a "
        "worktree of your own"
    )
    RULES: ClassVar[str] = (
        'Work as CLAUDE.md says, and as its "How agents work here" says for agents: skip '
        '"Sessions", and work on {what} only.'
    )

    @classmethod
    def of(cls, data: Mapping[str, Any], today: date) -> Job | None:
        """The job for a line of `watch --json`; None for a note."""
        if data.get("type") == "task":
            return IssueJob(Task.from_data(data))
        if data.get("type") == "prices":
            return PricesJob(str(data["key"]), str(data["text"]), today)
        return None

    def branch(self, git: Git) -> str:
        raise NotImplementedError

    def prompt(self, slug: str, branch: str) -> str:
        raise NotImplementedError

    def prepare(self, worktree: Path, git: Git) -> None:
        """What the manager does in the worktree before the agent starts."""

    def still_due(self, github: GitHub, me: str) -> bool:
        """Whether it still needs doing, when its turn comes after a wait."""
        return True

    def left_to_agent(self, why: str) -> Job:
        """The job as an agent gets it once the manager left its merge to one (`SelfMerge`,
        #550), told why."""
        return self

    @property
    def merges(self) -> bool:
        """Whether what's left is a merge, minutes of work: then it has a lane of its own
        (`Scheduler`, #485)."""
        return False

    @property
    def needs_tools(self) -> bool:
        """Whether it's code work, which waits while the machine lacks a tool an agent runs
        (`ToolchainHold`, #108)."""
        return False

    @property
    def begun(self) -> bool:
        """Whether Claude has begun it: mid-work goes before new (#485)."""
        return False

    @property
    def priority(self) -> Priority:
        return Priority.of(self.labels)


class IssueJob(Job):
    """An issue's or a PR's task: to start, a reply waiting, Claude's move (#449), CI
    finished."""

    WHY: ClassVar[dict[str, str]] = {
        "to start": "it's to start",
        "reply waiting": "a reply waits",
        "Claude's move": "the next move is Claude's",
        "unblocked": "what it builds on has merged",
    }
    MERGE_DEVELOP: ClassVar[str] = (
        " {what} merged since Claude's last word: begin by merging `origin/develop` into the "
        "branch (docs/conventions.md → Git workflow)."
    )

    task: Task

    def __init__(self, task: Task, unmerged: str | None = None) -> None:
        self.task = task
        self.unmerged = unmerged  # why the manager didn't merge it itself (#550)
        self.key = task.key
        self.issue = task.issue
        self.slot = str(task.issue if task.issue is not None else task.number)
        self.labels = task.labels

    def __str__(self) -> str:
        return f"#{self.slot} ({self.why()})"

    def why(self) -> str:
        task = self.task
        if task.state == "CI finished":
            return f"CI finished on PR #{task.number}: {task.ci}"
        waits = self.WHY.get(task.state, task.state)
        if task.kind == "pull" and task.issue is not None:
            return f"{waits} on its PR #{task.number}"
        return waits

    def branch(self, git: Git) -> str:
        """A PR's own; else the issue's branch, on origin before one only here; else a new
        one, named as docs/conventions.md → Git workflow says."""
        if self.task.branch:
            return self.task.branch
        number = self.task.issue if self.task.issue is not None else self.task.number
        found = IssueBranch.find(number, git)
        if found:
            return next((branch.name for branch in found if branch.origin), found[0].name)
        return f"feature/{number}-{self._slug()}"

    def _slug(self) -> str:
        words = re.findall(r"[a-z0-9]+", Title.parse(self.task.title).rest.lower())
        return "-".join(words[:4]) or "work"

    def prompt(self, slug: str, branch: str) -> str:
        task = self.task
        what = f"#{self.slot}" if task.issue is not None else f"PR #{task.number}"
        subject = f"issue {what}" if task.issue is not None else what
        unmerged = f" The manager left the merge to you: {self.unmerged}." if self.unmerged else ""
        woken = ", ".join(f"#{number}" for number in task.woken)
        merge = self.MERGE_DEVELOP.format(what=woken) if woken else ""
        return (
            f"{self.INTRO}, for {subject} of {slug}: {self.why()}.{unmerged}{merge}\n\n"
            f"{self.RULES.format(what=what)} Read it with `uv run python scripts/github.py "
            f"show {self.slot}` (its description and every comment), carry on from `uv run "
            f"python scripts/github.py handoffs {self.slot}`, then take the next step of "
            '"Working from GitHub issues". Before each comment, `uv run python '
            f"scripts/github.py show {self.slot} --new` shows only what's been said since "
            "Claude's last. When the next move is "
            f"someone else's (an answer, a review, CI), end with a handoff comment on {what} "
            "(`--handoff --closing`) and stop: their move starts the next agent."
        )

    def left_to_agent(self, why: str) -> IssueJob:
        return IssueJob(self.task, why)

    @property
    def merges(self) -> bool:
        """CI finished green on its PR. A red one's fix is code work."""
        return self.task.state == "CI finished" and self.task.green

    @property
    def needs_tools(self) -> bool:
        """All but a green PR's merge."""
        return not self.merges

    @property
    def begun(self) -> bool:
        """Claude has spoken on it (a plan, a question, a handoff), or a PR is open for it."""
        return self.task.state != "to start" or self.task.kind == "pull"

    def still_due(self, github: GitHub, me: str) -> bool:
        task = self.task
        if task.kind == "pull" and task.issue is not None and self._set_aside(github):
            return False
        if task.sha is not None:  # CI finished: still on that commit, and not read since?
            pull = github.call("GET", f"pulls/{task.number}")
            if pull["state"] != "open" or pull["head"]["sha"] != task.sha:
                return False
            runs = CiRuns.at(github, task.sha)
            threads = [
                github.call("GET", f"issues/{number}/comments?per_page=100")
                for number in task.numbers
            ]
            return runs.finished and not runs.read(me, threads)  # #456
        entry = github.call("GET", f"issues/{task.number}")
        if entry["state"] != "open" or left_out(entry):
            return False
        comments = github.call("GET", f"issues/{task.number}/comments?per_page=100")
        item = Conversation(entry, comments, me).item()
        return Dependencies(github).hold(entry, item, comments).to_do  # blocked meanwhile? #107

    def _set_aside(self, github: GitHub) -> bool:
        """A PR's issue postponed meanwhile, or labelled `release`: the PR waits with it
        (`SetAside`, #540); and so it does when the issue is blocked (`Dependencies`, #107)."""
        entry = github.call("GET", f"issues/{self.task.issue}")
        return entry["state"] == "open" and (
            left_out(entry) or bool(Dependencies(github).blockers(entry))
        )


class PricesJob(Job):
    """New prices of Claude's API (#390), which the watcher wrote into the checkout's
    docs/claude-prices.csv: a small chore PR, as CLAUDE.md asks."""

    FILE: ClassVar[str] = "docs/claude-prices.csv"

    def __init__(self, key: str, text: str, today: date) -> None:
        self.key = key
        self.text = text
        self.today = today
        self.slot = "prices"

    def __str__(self) -> str:
        return "new prices of Claude's"

    def branch(self, git: Git) -> str:
        return f"chore/claude-prices-{self.today:%Y-%m-%d}"

    def prepare(self, worktree: Path, git: Git) -> None:
        """Moves the new rows into the worktree, so the checkout follows develop again."""
        (worktree / self.FILE).write_bytes((git.root / self.FILE).read_bytes())
        git.ok("checkout", "--", self.FILE)

    def prompt(self, slug: str, branch: str) -> str:
        return (
            f"{self.INTRO}, on {branch} of {slug}: the watcher read new prices of Claude's "
            f"API ({self.text}), and {self.FILE} here has the new rows.\n\n"
            f"{self.RULES.format(what='them')} Commit them, push the branch and open a "
            'small chore PR into develop, with no issue ("Working from GitHub issues"). Then '
            "post on the PR the handoff that carries the closing comment "
            '("Working from GitHub issues", step 4; `--handoff --closing`) and stop: once '
            "CI is green, the manager merges it (#550)."
        )


# --- where it works ----------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class Warmup:
    """What a new worktree gets before its agent starts, so the agent doesn't start cold
    (#444): the checkout's caches, copied (`CACHES`), and a .venv of its own. Without mypy's
    cache an agent's `mypy` run took 60–98 s, with one copied from another folder 8 s;
    mypy checks a cache against the files' hashes, so one made on another branch is safe.
    One cache for all the agents (MYPY_CACHE_DIR) isn't: two would write it at once. The
    .venv (`SYNC`) spares the agent's first `uv run` making it, and uv's lines in what that
    prints."""

    run: Run = subprocess.run
    clock: Callable[[], float] = time.monotonic

    CACHES: ClassVar[tuple[str, ...]] = (".mypy_cache", ".hypothesis")  # hypothesis's examples
    SYNC: ClassVar[tuple[str, ...]] = ("uv", "sync", "--locked")
    SYNC_TIMEOUT: ClassVar[float] = 300  # seconds: the manager waits for it

    def warm(self, checkout: Path, worktree: Path) -> str:
        """Does it; what it did, for the run's log line."""
        began = self.clock()
        copies = (self._copy(checkout / name, worktree / name) for name in self.CACHES)
        said = [copy for copy in copies if copy] + [self._sync(worktree)]
        return f"warmed in {self.clock() - began:.0f} s: {', '.join(said)}"

    @staticmethod
    def _copy(cache: Path, to: Path) -> str | None:
        """None when the checkout has no such cache. copytree copies with copy2, which keeps
        the files' times: mypy takes a data file whose time moved for a stale one."""
        if not cache.is_dir():
            return None
        try:
            shutil.copytree(cache, to)
        except OSError as error:  # a file the checkout's own run replaced meanwhile, say
            return f"{cache.name} not all copied ({error})"  # the rest is good: mypy checks each
        return f"{cache.name} copied"

    def _sync(self, worktree: Path) -> str:
        command = shlex.join(self.SYNC)
        try:
            done = self.run(
                list(self.SYNC),
                cwd=worktree,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                check=False,
                timeout=self.SYNC_TIMEOUT,
            )
        except (OSError, subprocess.SubprocessError) as error:  # no uv on the PATH; too long
            return f".venv not made ({command}: {error})"
        if done.returncode != 0:  # the agent's own `uv run` then says why
            lines = str(done.stderr).strip().splitlines()
            why = lines[-1] if lines else f"exit {done.returncode}"
            return f".venv not made ({command}: {why})"
        return ".venv made"


@dataclass(frozen=True, slots=True)
class Worktree:
    """An agent's worktree, <worktree_dir>/<slot>, on its job's branch; `git` is the
    checkout's. A new one is warmed before its agent starts."""

    path: Path
    branch: str
    git: Git
    warmup: Warmup = field(default_factory=Warmup)

    DEVELOP: ClassVar[str] = "origin/develop"  # where a new branch starts, and PRs go
    # git's words for a branch checked out in another worktree, before 2.42 and since
    ELSEWHERE: ClassVar[re.Pattern[str]] = re.compile(r"(?:checked out|used by worktree) at '")

    def ready(self) -> str:
        """Makes it and warms it, or keeps the one an earlier agent left (with its work, its
        caches and its .venv); says which."""
        if self.path.exists():
            return "kept from before"
        self.git.ok("fetch", "-q", "--prune", "origin")
        own = self.git.count(
            "rev-list", "--count", f"refs/heads/{self.branch}", "--not", "--remotes=origin"
        )
        on_origin = bool(self.git.out("rev-parse", "--verify", "-q", f"origin/{self.branch}"))
        where = str(self.path)
        if own:
            args, said = [where, self.branch], f"with {plural(own, 'commit')} only here"
        elif on_origin:
            args, said = ["-B", self.branch, where, f"origin/{self.branch}"], "from origin"
        else:
            args = ["--no-track", "-B", self.branch, where, self.DEVELOP]
            said = f"new, from {self.DEVELOP}"
        done = self.git.run("worktree", "add", *args)
        if done.returncode != 0:
            refused = str(done.stderr).strip()
            if self.ELSEWHERE.search(refused):  # #409: a person ran an agent's commands there
                refused += " (switch that checkout back to develop: `git switch develop` there)"
            raise AgentError(f"git worktree add: {refused}")
        return f"{said}; {self.warmup.warm(self.git.root, self.path)}"

    def leftover(self) -> str | None:
        """What's in it and not on GitHub, which keeps it; None when nothing is."""
        at = str(self.path)
        changed = self.git.out("status", "--porcelain", at=at).splitlines()
        if changed:
            return plural(len(changed), "uncommitted change")
        self.git.ok("fetch", "-q", "--prune", "origin")
        own = self.git.count("rev-list", "--count", "HEAD", "--not", "--remotes=origin", at=at)
        if not own:
            return None
        branch = self.git.out("rev-parse", "--abbrev-ref", "HEAD", at=at)
        track = self.git.out("for-each-ref", "--format=%(upstream:track)", f"refs/heads/{branch}")
        if "[gone]" in track:  # merged, and GitHub deleted the branch
            return None
        if self._in_develop():  # merged, with no upstream of its own to be gone (#436)
            return None
        return f"{plural(own, 'commit')} not on origin"

    def _in_develop(self) -> bool:
        """Whether every file the branch changed since it left develop is in origin/develop
        as the branch has it: then nothing in its commits is missing from GitHub, as after
        the squash merge of a branch pushed without -u, whose upstream, none or develop's,
        is never [gone] (#436). A file develop changed since keeps it, as git failing does."""
        at = str(self.path)
        base = self.git.out("merge-base", self.DEVELOP, "HEAD", at=at)
        if not base:
            return False
        names = ("diff", "--name-only", "--no-renames", "-z")  # a move: both its paths
        changed = self.git.paths(*names, base, "HEAD", at=at)  # by the branch
        unlike = self.git.paths(*names, self.DEVELOP, "HEAD", at=at)  # in develop otherwise
        return changed is not None and unlike is not None and changed.isdisjoint(unlike)

    def remove(self) -> None:
        """It goes, and its branch here: what it had is on GitHub, or merged."""
        branch = self.git.out("rev-parse", "--abbrev-ref", "HEAD", at=str(self.path))
        done = self.git.run("worktree", "remove", "--force", str(self.path))
        if done.returncode != 0:
            raise AgentError(f"git worktree remove: {str(done.stderr).strip()}")
        if branch and branch != "HEAD":
            self.git.ok("branch", "-D", branch)


@dataclass(frozen=True, slots=True)
class TestDatabase:
    """An agent's own test database, on the PostgreSQL server the project's tests use
    (`server`: agent-manager.toml's `test_database_url`, else TEST_DATABASE_URL): two
    agents' runs would otherwise drop each other's tables. It's named
    after the server's: `…/everest_test` gives `everest_<slot>_test`, which the agent gets as its
    TEST_DATABASE_URL. With no server named, the project has no database, and the agent gets
    none (`wanted`)."""

    __test__: ClassVar[bool] = False  # not a test class, whatever pytest makes of the name

    slot: str
    server: str = field(default_factory=lambda: os.environ.get("TEST_DATABASE_URL", ""))

    @property
    def wanted(self) -> bool:
        """Whether the project's tests use a database at all."""
        return bool(self.server)

    @property
    def name(self) -> str:
        base = urlsplit(self.server).path.lstrip("/").removesuffix("_test") or "agent"
        return f"{base}_{self.slot}_test"

    def url(self) -> str:
        """The agent's own, on the same server; empty when none is wanted."""
        if not self.wanted:
            return ""
        return urlunsplit(urlsplit(self.server)._replace(path=f"/{self.name}"))

    def __str__(self) -> str:
        return f"test database {self.name}" if self.wanted else "no test database"

    def create(self) -> str | None:
        """Makes it unless it's there; why it couldn't, when it couldn't (the agent's tests
        then fail to reach it, and say so). Nothing when none is wanted."""
        if not self.wanted:
            return None
        try:
            asyncio.run(self._create())
        except Exception as error:  # a refused connection, asyncpg's own: the agent goes on
            return f"no test database ({type(error).__name__}: {error})"
        return None

    def drop(self) -> None:
        if not self.wanted:
            return
        try:
            asyncio.run(self._execute(f'DROP DATABASE IF EXISTS "{self.name}" WITH (FORCE)'))
        except Exception:  # left for the next agent of this slot, which reuses it
            pass

    async def _create(self) -> None:
        connection = await self._connect()
        try:
            there = await connection.fetchval(
                "SELECT 1 FROM pg_database WHERE datname = $1", self.name
            )
            if not there:
                await connection.execute(f'CREATE DATABASE "{self.name}"')
        finally:
            await connection.close()

    async def _execute(self, sql: str) -> None:
        connection = await self._connect()
        try:
            await connection.execute(sql)
        finally:
            await connection.close()

    async def _connect(self) -> Any:
        import asyncpg  # the `db` dependency group, often not installed (pyproject's mypy)

        url = urlsplit(self.server)
        return await asyncpg.connect(
            user=url.username,
            password=url.password,
            host=url.hostname,
            port=url.port,
            database=url.path.lstrip("/"),
        )


# --- the agent ---------------------------------------------------------------------------------


class Child:
    """A child process in a process group of its own: Ctrl+C in the manager's console then
    reaches only the manager, which stops the child with everything it started."""

    @staticmethod
    def options() -> dict[str, Any]:
        if sys.platform == "win32":
            return {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP}
        return {"start_new_session": True}

    @staticmethod
    def stop(process: subprocess.Popen[Any]) -> None:
        if process.poll() is not None:
            return
        if sys.platform == "win32":
            subprocess.run(
                ["taskkill", "/T", "/F", "/PID", str(process.pid)],
                capture_output=True,
                check=False,
            )
        else:
            os.killpg(process.pid, signal.SIGTERM)
        try:
            process.wait(timeout=15)
        except subprocess.TimeoutExpired:
            if sys.platform != "win32":
                os.killpg(process.pid, signal.SIGKILL)
            process.wait()


@dataclass(frozen=True, slots=True)
class UsageLimit:
    """The account's usage limit, which a run ended on, having done nothing (#476). Claude
    Code's result says `"api_error":"usage_limit_reached"`, and when it resets: "You've hit
    your session limit · resets 12pm (Europe/Prague)"."""

    said: str  # the result's text

    ERROR: ClassVar[str] = "usage_limit_reached"
    RESETS: ClassVar[re.Pattern[str]] = re.compile(
        r"resets?\s+(?:at\s+)?"
        r"(?:(?P<month>[a-z]{3})[a-z]*\.?\s+(?P<day>\d{1,2}),?\s+(?:at\s+)?)?"
        r"(?P<hour>\d{1,2})(?::(?P<minute>\d{2}))?\s*(?P<half>[ap]m)?"
        r"(?:\s*\((?P<zone>[^)]+)\))?",
        re.IGNORECASE,
    )
    MONTHS: ClassVar[tuple[str, ...]] = tuple(
        "jan feb mar apr may jun jul aug sep oct nov dec".split()
    )
    UNSAID: ClassVar[timedelta] = timedelta(hours=1)  # the wait when it names no time
    PASSED: ClassVar[timedelta] = timedelta(hours=1)  # a time passed this recently is today's
    SOONEST: ClassVar[timedelta] = timedelta(minutes=1)

    @classmethod
    def of(cls, result: Mapping[str, Any]) -> UsageLimit | None:
        """The limit a result says the run ended on; None for any other end."""
        if result.get("api_error") != cls.ERROR:
            return None
        return cls(str(result.get("result") or ""))

    def resets(self, now: datetime) -> datetime:
        """When, in `now`'s zone (which it knows): the time it names, the next one; but a
        minute on when that time passed within the hour (the clocks differ: it isn't
        tomorrow's), and an hour on when it names none."""
        named = self._named(now)
        if named is None:
            return now + self.UNSAID
        return max(named, now + self.SOONEST).astimezone(now.tzinfo)

    def _named(self, now: datetime) -> datetime | None:
        found = self.RESETS.search(self.said)
        if found is None or not (found["half"] or found["minute"]):
            return None
        here = now.astimezone(self._zone(found["zone"]) or now.tzinfo)
        hour = int(found["hour"])
        if found["half"]:
            hour = hour % 12 + (12 if found["half"].lower() == "pm" else 0)
        try:
            at = here.replace(hour=hour, minute=int(found["minute"] or 0), second=0, microsecond=0)
            if found["month"]:
                month = self.MONTHS.index(found["month"].lower()) + 1
                at = at.replace(month=month, day=int(found["day"]))
            if at < now - self.PASSED:
                at = at.replace(year=at.year + 1) if found["month"] else at + timedelta(days=1)
        except ValueError:  # no such time or day: it names none we can read
            return None
        return at

    @staticmethod
    def _zone(name: str | None) -> tzinfo | None:
        if not name:
            return None
        try:
            return ZoneInfo(name.strip())
        except ZoneInfoNotFoundError, ValueError, OSError:
            return None


@dataclass(frozen=True, slots=True)
class ModelUnavailable:
    """A model the account lacks, which a run ended on at once (#4): Fable is on some plans
    only. The API refuses the first call, and Claude Code's result is an error naming the
    model; the wording isn't fixed, so any refusal that speaks of the model counts, but the
    usage limit, which is its own case (`UsageLimit`)."""

    model: str  # the one asked for
    said: str  # the result's text

    MODEL: ClassVar[re.Pattern[str]] = re.compile(r"\bmodel\b", re.IGNORECASE)
    REFUSED: ClassVar[re.Pattern[str]] = re.compile(
        r"not[ _-]?(?:found|available|supported|exist|permitted|enabled|allowed|have access)"
        r"|no access|invalid|unknown|unavailable|forbidden|permission|does ?n[o']t have",
        re.IGNORECASE,
    )

    @classmethod
    def of(cls, result: Mapping[str, Any], model: str) -> ModelUnavailable | None:
        """The model a result says the account lacks; None for any other end."""
        if not result.get("is_error") or UsageLimit.of(result) is not None:
            return None
        said = str(result.get("result") or "")
        named = cls.MODEL.search(said) is not None or model.lower() in said.lower()
        if named and cls.REFUSED.search(said):
            return cls(model, said)
        return None


@dataclass(frozen=True, slots=True)
class AgentResult:
    """What an agent's run came to, from the results Claude Code writes (stream-json): one for
    each part of the run, when a background task it waited on wakes it again (#408)."""

    dollars: float | None = None
    minutes: float | None = None
    denials: tuple[str, ...] = ()  # what it wasn't allowed to do: the allow list lacks it
    context: int | None = None  # the tokens its first reply read: what it's offered (#443)
    limit: UsageLimit | None = None  # the usage limit its last part ended on (#476)
    unavailable: ModelUnavailable | None = None  # the model the account lacks, if it ended so (#4)

    TYPES: ClassVar[tuple[str, ...]] = ('"type":"result"', '"type":"assistant"')
    READ: ClassVar[tuple[str, ...]] = (
        "input_tokens",
        "cache_creation_input_tokens",
        "cache_read_input_tokens",
    )

    @classmethod
    def read(cls, log: Path, offset: int = 0, model: str | None = None) -> AgentResult:
        """The cost is a running total, so the last part's is the run's; the minutes and the
        refusals are each part's own, so they're added up. `model`, the one the run was
        asked for, tells a refusal of it from other errors (#4)."""
        events = cls._events(log, offset)
        parts = [event for event in events if event.get("type") == "result"]
        replies = (cls._tokens(event) for event in events if event.get("type") == "assistant")
        costs = [part["total_cost_usd"] for part in parts if part.get("total_cost_usd") is not None]
        took = [part["duration_ms"] for part in parts if part.get("duration_ms") is not None]
        return cls(
            float(costs[-1]) if costs else None,
            sum(float(ms) for ms in took) / 60_000 if took else None,
            tuple(
                cls._denial(denial)
                for part in parts
                for denial in part.get("permission_denials") or []
            ),
            next((tokens for tokens in replies if tokens is not None), None),
            UsageLimit.of(parts[-1]) if parts else None,
            ModelUnavailable.of(parts[-1], model) if parts and model else None,
        )

    @classmethod
    def _events(cls, log: Path, offset: int) -> list[Mapping[str, Any]]:
        """Its results and Claude's replies, in order."""
        events: list[Mapping[str, Any]] = []
        try:
            with log.open(encoding="utf-8", errors="replace") as file:
                file.seek(offset)
                for line in file:
                    if not any(kind in line for kind in cls.TYPES):  # anywhere in the object
                        continue
                    try:
                        event = json.loads(line)
                    except ValueError:
                        continue
                    if isinstance(event, dict):
                        events.append(event)
        except OSError:
            return []
        return events

    @classmethod
    def _tokens(cls, reply: Mapping[str, Any]) -> int | None:
        """The tokens a reply read, cached or not; None for a line that isn't one."""
        usage = (reply.get("message") or {}).get("usage")
        if not isinstance(usage, dict):
            return None
        return sum(int(usage.get(name) or 0) for name in cls.READ)

    @staticmethod
    def _denial(denial: Mapping[str, Any]) -> str:
        said = (denial.get("tool_input") or {}).get("command")
        return f"{denial.get('tool_name')}({said})" if said else str(denial.get("tool_name"))

    def __str__(self) -> str:
        parts = []
        if self.dollars is not None:
            parts.append(f"${self.dollars:.2f}")
        if self.minutes is not None:
            parts.append(f"{self.minutes:.0f} min")
        if self.context is not None:
            parts.append(f"first reply {self.context / 1000:.0f}K tokens")
        if self.denials:
            parts.append(f"{plural(len(self.denials), 'refusal')}: {', '.join(self.denials)}")
        if self.limit is not None:
            parts.append("ended on the usage limit")
        if self.unavailable is not None:
            parts.append(f"the account lacks the model {self.unavailable.model}")
        return ", ".join(parts)


class Agent:
    """Headless Claude Code for one job, in its worktree, with its own test database; all
    it says goes to .agent-runs/<slot>.log."""

    # What a Claude Code session sets for the commands it runs: an agent started from one
    # (a trial run from VS Code) would take them for its own.
    SESSION: ClassVar[frozenset[str]] = frozenset(
        {
            "CLAUDECODE",
            "CLAUDE_CODE_ENTRYPOINT",
            "CLAUDE_CODE_SESSION_ID",
            "CLAUDE_CODE_CHILD_SESSION",
            "CLAUDE_CODE_SESSION_ATTENDED",
            "CLAUDE_CODE_SSE_PORT",
            "CLAUDE_CODE_MESSAGING_SOCKET",
            "CLAUDE_CODE_MESSAGING_TOKEN",
            "CLAUDE_CODE_EXECPATH",
            "CLAUDE_EFFORT",
            "CLAUDE_PID",
            "VIRTUAL_ENV",  # uv's: the worktree has a .venv of its own
        }
    )
    # What it's offered it pays for on every reply (#443), so it's offered what it uses:
    # Claude Code's tools for files and commands, and for background tasks (Monitor and
    # TaskStop, which ToolSearch loads). No web: nobody could approve it in a -p run. No
    # Skill or PowerShell (#551): no agent invoked a skill, and every PowerShell call it made
    # had a Bash form.
    TOOLS: ClassVar[tuple[str, ...]] = (
        "Bash",
        "Read",
        "Edit",
        "Write",
        "Glob",
        "Grep",
        "Monitor",
        "TaskStop",
        "ToolSearch",
    )

    def __init__(
        self,
        job: Job,
        power: AgentPower,
        compaction: CompactShare,
        worktree: Worktree,
        database: TestDatabase,
        claude: str,
        slug: str,
        log: Path,
        now: Callable[[], datetime] = datetime.now,
    ) -> None:
        self.job = job
        self.power = power
        self.compaction = compaction
        self.worktree = worktree
        self.database = database
        self.claude = claude
        self.slug = slug
        self.log = log
        self._now = now
        self._process: subprocess.Popen[bytes] | None = None
        self._offset = 0
        self.limit: UsageLimit | None = None  # the usage limit it ended on, once it has
        self.unavailable: ModelUnavailable | None = None  # the model the account lacked (#4)

    def __str__(self) -> str:
        return f"{self.power}, in {self.worktree.path} on {self.worktree.branch}"

    def command(self) -> list[str]:
        """Claude Code's flags, as `claude --help` names them."""
        return [
            self.claude,
            "-p",
            self.job.prompt(self.slug, self.worktree.branch),
            "--model",
            self.power.model,
            "--effort",
            self.power.effort,
            "--permission-mode",
            "acceptEdits",  # edits in its worktree; commands by .claude/settings.json's allow list
            "--permission-prompts",
            "none",  # nobody answers: what isn't allowed is refused, and it goes on
            "--output-format",
            "stream-json",
            "--verbose",  # stream-json in a -p run needs it
            "--tools",
            ",".join(self.TOOLS),
            "--setting-sources",
            "project,local",  # the project's settings and hooks, not its user's
            "--strict-mcp-config",  # no MCP server: the project has none
            "--name",
            f"agent {self.job.slot}",
        ]

    def environment(self, base: Mapping[str, str] = os.environ) -> dict[str, str]:
        found = {name: value for name, value in base.items() if name not in self.SESSION}
        env = {
            **found,
            **self.power.env(),  # its comments say what it runs on (scripts/github.py)
            **self.compaction.env(),  # not the share a person set for their own sessions
            "CLAUDE_CODE_DISABLE_AUTO_MEMORY": "1",  # the machine's is sessions' notes (#551)
        }
        if self.database.wanted:  # the project's tests use a database: the agent's own
            env["TEST_DATABASE_URL"] = self.database.url()
        return env

    def plan(self) -> str:
        """What it would run: the dry run's line."""
        return f"{self.job}: {self}, {self.database}\n  $ {shlex.join(self.command())}"

    def start(self) -> None:
        made = self.worktree.ready()
        self.job.prepare(self.worktree.path, self.worktree.git)
        database = self.database.create()
        self.log.parent.mkdir(parents=True, exist_ok=True)
        with self.log.open("a", encoding="utf-8") as log:
            log.write(f"=== {self._now():%Y-%m-%d %H:%M} {self.job}: {self} ({made})\n")
            if database:
                log.write(f"=== {database}\n")
            log.write(f"$ {shlex.join(self.command())}\n")
            log.flush()
            self._offset = log.tell()
            self._process = subprocess.Popen(
                self.command(),
                cwd=self.worktree.path,
                stdin=subprocess.DEVNULL,
                stdout=log,
                stderr=subprocess.STDOUT,
                env=self.environment(),
                **Child.options(),
            )

    def poll(self) -> int | None:
        return None if self._process is None else self._process.poll()

    def stop(self) -> None:
        if self._process is not None:
            Child.stop(self._process)

    def finish(self, code: int | None) -> str:
        """After it ended (`code`), or was stopped (None): its worktree goes when nothing in
        it is missing from GitHub, else it stays; the line that says so, in the log too."""
        found = AgentResult.read(self.log, self._offset, self.power.model)
        self.limit = found.limit
        self.unavailable = found.unavailable
        result = str(found)
        outcome = "done" if code == 0 else "stopped" if code is None else f"failed (exit {code})"
        kept = self.worktree.leftover() if code == 0 else outcome
        if kept is None:
            try:
                self.worktree.remove()
                self.database.drop()
                where = "worktree removed"
            except AgentError as error:
                where = f"worktree kept: {error}"
        else:
            where = f"worktree kept at {self.worktree.path}: {kept}"
        line = f"{self.job}: {outcome}{f', {result}' if result else ''}; {where}"
        with self.log.open("a", encoding="utf-8") as log:
            log.write(f"\n=== {self._now():%Y-%m-%d %H:%M} {line}\n")
        return line


class Launcher:
    """Makes an agent for a job: its power, worktree, test database and log."""

    def __init__(
        self,
        config: ManagerConfig,
        git: Git,
        claude: str,
        slug: str,
        runs: Path = RUNS,
        now: Callable[[], datetime] = datetime.now,
        database: Callable[[str], TestDatabase] = TestDatabase,
    ) -> None:
        self._config = config
        self._git = git
        self._claude = claude
        self._slug = slug
        self._runs = runs
        self._now = now
        self._database = database
        self.lacking: set[str] = set()  # the models the account turned out to lack (#4)

    def avoid(self, model: str) -> str:
        """The account lacks `model`, a run has shown (#4): from now on its agents run on the
        next one down; which."""
        self.lacking.add(model)
        return AgentPower(model, AgentPower.EFFORTS[0]).without(self.lacking).model

    def agent(self, job: Job) -> Agent:
        worktree = Worktree(self._worktree(job), job.branch(self._git), self._git)
        return Agent(
            job,
            self._config.power.from_labels(job.labels).without(self.lacking),
            self._config.compaction,
            worktree,
            self._database(job.slot),
            self._claude,
            self._slug,
            self._runs / f"{job.slot}.log",
            self._now,
        )

    def launch(self, job: Job) -> Agent:
        agent = self.agent(job)
        agent.start()
        return agent

    def plan(self, job: Job) -> str:
        return self.agent(job).plan()

    def kept(self, job: Job) -> bool:
        """Whether an earlier agent left the job's worktree, with work begun (#485): it was
        stopped, or something in it isn't on GitHub yet."""
        return self._worktree(job).is_dir()

    def leftover(self, job: Job) -> str | None:
        """What the worktree an earlier agent left for the job holds that GitHub hasn't got;
        None when there's none, or nothing in it is missing. The manager merges no PR whose
        worktree holds work (`SelfMerge`, #550)."""
        worktree = self._kept(job)
        return None if worktree is None else worktree.leftover()

    def clear(self, job: Job) -> str | None:
        """Once the manager has merged the job's PR (#550): the worktree an earlier agent
        left goes, with its branch here and its test database, as an agent's goes at its
        end. What became of it; None when there was none."""
        worktree = self._kept(job)
        if worktree is None:
            return None
        try:
            worktree.remove()
        except AgentError as error:
            return f"worktree kept: {error}"
        self._database(job.slot).drop()
        return "worktree removed"

    def _kept(self, job: Job) -> Worktree | None:
        path = self._worktree(job)
        return Worktree(path, job.branch(self._git), self._git) if path.is_dir() else None

    def _worktree(self, job: Job) -> Path:
        return self._config.worktrees(self._git.root) / job.slot


# --- a green PR's merge, without an agent (#550) ---------------------------------------------


class NotMerged(Exception):
    """Why the manager left a green PR's merge to an agent (#550)."""


@dataclass(frozen=True, slots=True)
class MergeReady:
    """A green PR every check passed, and what the merge needs of what they found."""

    task: Task
    pull: Mapping[str, Any]
    thread: int  # where the closing comment goes: the issue, else the PR itself
    closing: str  # the closing comment, as the agent's handoff carries it


@dataclass(frozen=True, slots=True)
class SelfMerge:
    """A green PR's merge, done by the manager with no model (#550). It's scripted steps and
    one piece of writing, the closing comment, which the agent that opened the PR leaves in
    its handoff (CLAUDE.md → Working from GitHub issues, step 4): 14 of 16 green runs on
    2026-10-12 to 16 were an agent doing just that, in about ten turns for $0.35.

    It merges only when every check holds (`check`): the PR open, at the commit CI ran on,
    going into develop, and mergeable as GitHub says; every CI run there a success; its
    description closing the issue; the issue and the PR open, neither set aside nor waiting
    on a person; the last word on them Claude's handoff, carrying the closing comment, with
    the merge as its **Next**; no review since; and no worktree holding work. Then, as step 5
    says: `title --done`, the closing comment, signed as the manager's, with the cost and a
    handoff's end, the squash merge at the commit checked, and the worktree's removal
    (`Launcher.clear`). A check failing raises `NotMerged` before anything is written, and an
    agent starts on the job as before, told why. A merge GitHub refuses after the comment is
    said on the issue as Claude's move, and goes to an agent the same way."""

    github: GitHub
    me: str
    launcher: Launcher
    cost_of: Callable[[int, Iterable[int]], IssueCost] = issue_cost
    here: Callable[[], Machine] = Machine.here
    now: Callable[[], datetime] = local_now
    sleep: Callable[[float], None] = time.sleep

    SIGNATURE: ClassVar[str] = "_Claude Code agent manager ({login})_"  # SIGNED knows it
    MERGEABLE: ClassVar[tuple[str, ...]] = ("clean", "has_hooks")  # GitHub's mergeable_state
    LOOKS: ClassVar[int] = 3  # at the PR: GitHub works out whether it's mergeable when asked
    LOOK_EVERY: ClassVar[float] = 2  # seconds
    # GitHub.call's refusal (it's a command's), or no answer at all
    FAILED: ClassVar[tuple[type[BaseException], ...]] = (SystemExit, httpx.HTTPError)
    DONE: ClassVar[str] = "**Next:** nothing; the merge closes it. **Waiting on:** nothing."
    DETAILS: ClassVar[str] = (
        "<details><summary>For the next session</summary>\n\n"
        "- Branch: `{branch}`, merged into `develop` by squash; GitHub deletes it.\n"
        "- PR: #{number}, merged by the agent manager once CI was green (#550).\n\n"
        "</details>"
    )

    def merge(self, job: Job) -> str:
        """Merges the job's PR, or raises `NotMerged`; the line that says what it did."""
        ready = self.check(job)
        task = ready.task
        work = IssueWork(self.github, ready.thread, self.cost_of, self.here)
        try:
            cost = self._retitle(work) if task.issue is not None else None
            text = work.handoff(self._closing(ready, cost), closing=True, now=self.now)
            post_comment(self.github, ready.thread, text)
        except self.FAILED as error:  # a reply came meanwhile: `comment` refuses to hide it
            raise NotMerged(
                f"couldn't post the closing comment: {self.first_line(error)}"
            ) from None
        try:
            merged = PullRequests(self.github).merge(task.number, at=task.sha)
        except self.FAILED as error:
            self._refused(ready, work, error)
            why = f"GitHub refused the merge after the closing comment: {self.first_line(error)}"
            raise NotMerged(why) from None
        cleared = self.launcher.clear(job)
        return f"merged it itself, no agent: {merged}" + (f"; {cleared}" if cleared else "")

    def check(self, job: Job) -> MergeReady:
        """What the merge needs, once every check holds; else `NotMerged`, saying which
        failed. It writes nothing: the dry run asks it too."""
        try:
            return self._check(job)
        except self.FAILED as error:
            raise NotMerged(f"GitHub didn't answer: {self.first_line(error)}") from None

    def _check(self, job: Job) -> MergeReady:
        task = job.task
        if task is None or task.sha is None or not job.merges:
            raise NotMerged("it isn't a green PR's")
        number, sha = task.number, task.sha
        pull = self._pull(number)
        if pull["state"] != "open":
            raise NotMerged(f"PR #{number} is {pull['state']}")
        if (head := str(pull["head"]["sha"])) != sha:
            raise NotMerged(f"PR #{number} is at {head[:7]} now, not at {sha[:7]}, where CI ran")
        if (base := pull["base"]["ref"]) != PullRequests.INTO:
            raise NotMerged(f"PR #{number} goes into {base}")
        state = pull.get("mergeable_state")
        if pull.get("mergeable") is not True or state not in self.MERGEABLE:
            raise NotMerged(f"GitHub says PR #{number} can't be merged as it is ({state})")
        runs = CiRuns.at(self.github, sha)
        if not runs.green:
            raise NotMerged(f"not every CI run at {sha[:7]} succeeded ({runs})")
        if task.issue is not None and not self._closes(pull, task.issue):
            raise NotMerged(f"PR #{number} doesn't say it closes #{task.issue}")
        for each in task.numbers:
            self._open(self.github.call("GET", f"issues/{each}"))
        closing = self._closing_comment(task)
        if (left := self.launcher.leftover(job)) is not None:
            raise NotMerged(f"the worktree an earlier agent left holds {left}")
        thread = task.issue if task.issue is not None else number
        return MergeReady(task, pull, thread, closing)

    def _pull(self, number: int) -> Mapping[str, Any]:
        """The PR, once GitHub has worked out whether it can be merged: it starts when asked,
        and says null until then."""
        pull: Mapping[str, Any] = self.github.call("GET", f"pulls/{number}")
        for _ in range(self.LOOKS - 1):
            if pull.get("mergeable") is not None or pull["state"] != "open":
                break
            self.sleep(self.LOOK_EVERY)
            pull = self.github.call("GET", f"pulls/{number}")
        return pull

    @staticmethod
    def _closes(pull: Mapping[str, Any], issue: int) -> bool:
        """Whether its description closes the issue ("Closes #7"): the merge then does."""
        return re.search(CLOSES.format(number=issue), pull.get("body") or "", re.I) is not None

    @staticmethod
    def _open(entry: Mapping[str, Any]) -> None:
        """The issue or the PR: open, not set aside (#540), waiting on nobody (#449)."""
        number, names = entry["number"], label_names(entry)
        if entry["state"] != "open":
            raise NotMerged(f"#{number} is closed")
        if aside := [name for name in names if name in (POSTPONED, RELEASE_LABEL)]:
            raise NotMerged(f"#{number} is set aside ({', '.join(aside)})")
        if waiting := [name for name in names if name.startswith(WaitingLabels.PREFIX)]:
            raise NotMerged(f"#{number} waits on someone ({', '.join(waiting)})")

    def _closing_comment(self, task: Task) -> str:
        """The closing comment the last word on the issue and its PR carries: Claude's
        handoff, naming the merge as next, with no review of the PR since."""
        said = sorted(
            (
                comment
                for each in task.numbers
                for comment in self.github.call("GET", f"issues/{each}/comments?per_page=100")
            ),
            key=lambda comment: str(comment.get("created_at") or ""),
        )
        handoff = None
        if said and claude_s(said[-1], self.me):
            handoff = Handoff.of(said[-1], len(said) - 1)
        if handoff is None:
            raise NotMerged("the last word on it isn't Claude's handoff")
        if (closing := handoff.closing_comment) is None:
            raise NotMerged("Claude's handoff carries no closing comment")
        if (move := handoff.move) is None or not move.names_merge:
            raise NotMerged("Claude's handoff doesn't name the merge as next")
        since = str(said[-1].get("created_at") or "")
        reviews = self.github.call("GET", f"pulls/{task.number}/reviews?per_page=100")
        if any(str(review.get("submitted_at") or "") > since for review in reviews):
            raise NotMerged(f"PR #{task.number} has a review since Claude's handoff")
        return closing

    @staticmethod
    def _retitle(work: IssueWork) -> str:
        """`title --done`; the closing comment's cost line, from the new title."""
        title = Title.parse(work.retitle(done=True))
        estimate = f" (estimate {title.estimate})" if title.estimate else ""
        return f"Cost: {title.actual}{estimate}."

    def _closing(self, ready: MergeReady, cost: str | None) -> str:
        """The closing comment as the agent left it, signed as the manager's, with the cost
        and a handoff's **Next** and details: Claude's last word on it."""
        details = self.DETAILS.format(branch=ready.pull["head"]["ref"], number=ready.task.number)
        parts = [self.SIGNATURE.format(login=self.me), ready.closing, cost, self.DONE, details]
        return "\n\n".join(part for part in parts if part)

    def _refused(self, ready: MergeReady, work: IssueWork, error: BaseException) -> None:
        """Says on the issue that GitHub refused the merge after the closing comment, as
        Claude's move, for the agent that starts on it and for people. Nothing more when even
        that fails: the agent starts anyway."""
        number = ready.task.number
        text = "\n\n".join(
            [
                self.SIGNATURE.format(login=self.me),
                f"GitHub refused to merge PR #{number}, so the comment above waits for its "
                f"merge: {self.first_line(error)}",
                f"**Next:** the merge of PR #{number} (Claude's). **Waiting on:** nothing.",
            ]
        )
        try:
            post_comment(self.github, ready.thread, work.handoff(text, closing=True, now=self.now))
        except self.FAILED:
            pass

    @staticmethod
    def first_line(error: BaseException) -> str:
        """An error's first line: `comment`'s refusal goes on to show the replies."""
        return (str(error).splitlines() or [type(error).__name__])[0]


# --- the machine first (#108) ------------------------------------------------------------------


class ToolchainHold:
    """While the machine lacks a piece an agent needs (`check_setup.Toolchain`, #108), no
    agent starts on code work (`Job.needs_tools`): #16, #17 and #18 each wrote their code
    blind for want of Node, then stopped, at $7 to $15 a run. It looks as the manager starts
    (`look`) and before each agent, again only `FRESH` seconds after its last look, so that a
    look's jobs share one. What's missing, each with its fix, is said once in the log, and
    again when that changes or once it's all there; and once on each issue it holds (`tell`,
    a `HoldNotice`), which says why when it can't."""

    FRESH: ClassVar[float] = 10  # seconds

    def __init__(
        self,
        checks: Callable[[], Sequence[Check]],
        tell: Callable[[Job, str], str | None],
        say: Say,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._checks = checks
        self._tell = tell
        self._say = say
        self._clock = clock
        self._found: tuple[Check, ...] = ()
        self._at: float | None = None  # when it looked last
        self._said: str | None = None  # what was missing, as said last
        self._told: dict[str, str] = {}  # what each issue held was told

    def look(self) -> str | None:
        """Looks now, and says what it found: the manager's start. What's missing; None when
        nothing is."""
        why = self._missing(now=True)
        if why is None:
            names = ", ".join(check.name for check in self._found)
            self._say(f"The machine has what agents need: {names}.")
        return why

    def holds(self, job: Job) -> str | None:
        """Why the job can't start now, said; None when it can, or needs no tools."""
        if not job.needs_tools:
            return None
        why = self._missing()
        if why is not None and self._told.get(job.slot) != why:
            self._told[job.slot] = why
            if (untold := self._tell(job, why)) is not None:
                self._say(f"{job}: not said on the issue: {untold}")
        return why

    def _missing(self, now: bool = False) -> str | None:
        if now or self._at is None or self._clock() - self._at >= self.FRESH:
            self._found = tuple(self._checks())
            self._at = self._clock()
        missing = [check for check in self._found if check.needed and not check.ok]
        why = "; ".join(self._line(check) for check in missing) or None
        if why is not None and why != self._said:
            self._say(f"Agents on code work wait: {why}")
        elif why is None and self._said is not None:
            self._say("The machine has what agents need again: the work held starts.")
            self._told.clear()
        self._said = why
        return why

    @staticmethod
    def _line(check: Check) -> str:
        return f"{check.name}: {check.detail}" + (f" (fix: {check.fix})" if check.fix else "")


@dataclass(frozen=True, slots=True)
class HoldNotice:
    """What the manager says on an issue it holds for want of a tool (`ToolchainHold`, #108):
    a handoff whose move is Claude's, waiting on nothing on GitHub, so that the issue is still
    to do when the manager starts again after the fix. A PR's goes on its issue. Not where a
    reply waits: the comment would hide it (#208); what refused it, then."""

    github: GitHub
    me: str
    cost_of: Callable[[int, Iterable[int]], IssueCost] = issue_cost
    here: Callable[[], Machine] = Machine.here
    now: Callable[[], datetime] = local_now

    TEXT: ClassVar[str] = (
        "{signature}\n\n"
        "No agent starts on this on {host} while the machine lacks what one needs: {why}.\n\n"
        "**Next:** the work, once {host} has it (Claude's). **Waiting on:** nothing on GitHub: "
        "the agent manager starts an agent once the fix is in.\n\n"
        "<details><summary>For the next session</summary>\n\n"
        "- Held by the agent manager on {host} (#108): no agent ran for it.\n\n"
        "</details>"
    )

    def __call__(self, job: Job, why: str) -> str | None:
        """Says it on the job's issue; why it couldn't, when it couldn't."""
        if job.task is None:
            return "it has no issue"
        thread = job.task.issue if job.task.issue is not None else job.task.number
        signature = SelfMerge.SIGNATURE.format(login=self.me)
        text = self.TEXT.format(signature=signature, host=self.here().host, why=why)
        work = IssueWork(self.github, thread, self.cost_of, self.here)
        try:
            post_comment(self.github, thread, work.handoff(text, closing=True, now=self.now))
        except SelfMerge.FAILED as error:
            return SelfMerge.first_line(error)
        return None


# --- one agent per issue, a few at once ------------------------------------------------------


@dataclass(frozen=True, slots=True)
class Refusal:
    """Why a slot's job couldn't start, and when it's tried again."""

    why: str
    again: float


class Scheduler:
    """One agent per slot (an issue), at most `most` at once, and a merge besides (#485): a
    green PR's (`Job.merges`) has a lane of its own, one at a time, since a merge takes
    minutes and should never wait behind code work; `merger` does it with no agent when it
    can (`SelfMerge`, #550), else an agent does, told why. The rest wait their turn, in this order
    (`_line`): a merge first, then the higher `Priority`, then mid-work before new
    (`Job.begun`, or a worktree an earlier agent left), then first come first served. The
    jobs a look brings are taken together and started at the next tick, so the order holds
    among them too: a restart's first look, which says every task at once, puts no new issue
    ahead of a begun one. A running agent is never stopped for a higher one.

    Of a slot's jobs only the latest waits, since an agent reads the whole issue anyway. One
    that waited is asked, when its turn comes, whether it still needs doing (an agent may
    have answered it meanwhile); one the watcher has just said isn't asked again. A job is
    started once: the watcher says it again each time it starts.

    A job that couldn't start (its branch checked out in the checkout, #409) waits too, and
    is tried again `retry` seconds later, at the watcher's next look: why is said once, and
    again only when it changes. A new job for its slot is tried at once.

    A run that ended on the account's usage limit did nothing, so its job waits its turn
    again, and no agent starts before the limit resets (#476), which is said once. The
    agents still running go on; one that ends on the limit too changes nothing. A run that
    ended because the account lacks its model (#4: Fable is on some plans only) did nothing
    either: its job waits its turn again, and the launcher runs that model's agents on the
    next one down for the rest of the run, which is said once per model.

    Code work waits too while the machine lacks a tool an agent needs (`hold`, #108), and is
    tried again at the watcher's next look, as one that couldn't start is.

    Closed, by the manager's first Ctrl+C (#485), it starts nothing more: what waits is
    dropped, and the agents running go on to their end, unless `stop` stops them, or Esc
    reopens it (#574)."""

    MERGES: ClassVar[int] = 1  # at once, in their lane

    def __init__(
        self,
        most: int,
        launcher: Launcher,
        due: Callable[[Job], bool],
        say: Say | None = None,
        dry_run: bool = False,
        retry: float = WATCH_EVERY,
        clock: Callable[[], float] = time.monotonic,
        now: Callable[[], datetime] = local_now,
        merger: SelfMerge | None = None,
        hold: ToolchainHold | None = None,
    ) -> None:
        self._most = most
        self._launcher = launcher
        self._merger = merger
        self._hold_tools = hold
        self._due = due
        self._say = say or Console().say
        self._dry_run = dry_run
        self._retry = retry
        self._clock = clock
        self._now = now
        self._running: dict[str, Agent] = {}
        self._waiting: dict[str, Job] = {}  # in the order they came
        self._fresh: set[str] = set()  # the keys taken since the last tick
        self._refused: dict[str, Refusal] = {}
        self._seen: set[str] = set()
        self._hold: float | None = None  # no agent starts before it: the usage limit's reset
        self._lacking: set[str] = set()  # the models said to be lacking, once each (#4)
        self._closed = False

    def take(self, job: Job) -> None:
        """Puts it in line: the next tick starts it in its turn."""
        if self._closed or job.key in self._seen:
            return
        self._seen.add(job.key)
        self._waiting.pop(job.slot, None)  # the latest only, at the back of the line
        self._refused.pop(job.slot, None)
        self._waiting[job.slot] = job
        self._fresh.add(job.key)

    def tick(self) -> None:
        """Ends what has ended, then starts what waits, in turn, while its lane has room and
        no usage limit holds them; of the jobs taken since the last tick, says which wait. A
        dry run says what would start, in turn, and starts nothing."""
        if self._dry_run:
            for job in self._line():
                self._say(self._plan(job))
            self._waiting.clear()
            self._fresh.clear()
            return
        for slot, agent in list(self._running.items()):
            code = agent.poll()
            if code is not None:
                del self._running[slot]
                self._say(agent.finish(code))
                if agent.limit is not None and not self._closed:
                    self._hold_for(agent.limit, agent.job)
                elif agent.unavailable is not None and not self._closed:
                    self._fall_back(agent.unavailable, agent.job)
        if not self._held():
            for job in self._line():
                if self._room(job):
                    self._turn(job)
        for job in self._waiting.values():
            if job.key in self._fresh and job.slot not in self._refused:
                self._say(f"{job}: waits its turn")
        self._fresh.clear()

    def busy(self) -> bool:
        """Whether an agent runs or a job waits its turn. One waiting to be tried again, or
        for the usage limit's reset, doesn't count: a --once run ends, having said why it
        didn't start."""
        return bool(self._running) or (
            not self._held() and any(slot not in self._refused for slot in self._waiting)
        )

    def close(self) -> int:
        """Starts nothing more: what waits is dropped, and the agents running go on to their
        end. How many run."""
        self._closed = True
        self._seen -= {job.key for job in self._waiting.values()}  # reopened, it takes them
        self._waiting.clear()
        self._fresh.clear()
        self._refused.clear()
        return len(self._running)

    def reopen(self) -> None:
        """Takes jobs again, after `close()` (#574): those it dropped too, when the watcher
        says them again."""
        self._closed = False

    def stop(self) -> None:
        for slot, agent in list(self._running.items()):
            agent.stop()
            del self._running[slot]
            self._say(agent.finish(None))
        self._waiting.clear()
        self._fresh.clear()
        self._refused.clear()

    def _line(self) -> list[Job]:
        """What waits, in the order it starts (#485). The sort keeps the order they came in
        among equals: first come first served."""
        return sorted(self._waiting.values(), key=self._place)

    def _place(self, job: Job) -> tuple[bool, int, bool]:
        """A merge first, then the higher priority, then mid-work before new."""
        begun = job.begun or self._launcher.kept(job)
        return (not job.merges, -job.priority.rank, not begun)

    def _room(self, job: Job) -> bool:
        """Whether it can start now: its slot free, not waiting to be tried again, and room
        in its lane, the merges' or the rest's."""
        refused = self._refused.get(job.slot)
        if job.slot in self._running or (refused and self._clock() < refused.again):
            return False
        lane = sum(agent.job.merges == job.merges for agent in self._running.values())
        return lane < (self.MERGES if job.merges else self._most)

    def _turn(self, job: Job) -> None:
        """It's started, unless it waited and no longer needs doing."""
        del self._waiting[job.slot]
        if job.key in self._fresh or self._due(job):
            self._start(job)
        else:
            self._refused.pop(job.slot, None)
            self._say(f"{job}: no longer needs doing")

    def _plan(self, job: Job) -> str:
        """The dry run's line: the manager's own merge, or the agent it would start."""
        if job.merges and self._merger is not None:
            try:
                self._merger.check(job)
            except NotMerged as why:
                job = job.left_to_agent(str(why))
            else:
                return f"{job}: the manager would merge it itself"
        return self._launcher.plan(job)

    def _start(self, job: Job) -> None:
        """A green PR's merge the manager does itself when it can (#550); the rest, and a
        merge it can't do, get an agent."""
        if job.merges and self._merger is not None:
            try:
                self._say(f"{job}: {self._merger.merge(job)}")
            except NotMerged as why:
                self._say(f"{job}: left to an agent: {why}")
                job = job.left_to_agent(str(why))
            else:
                self._refused.pop(job.slot, None)
                return
        if self._hold_tools is not None and (lacks := self._hold_tools.holds(job)) is not None:
            self._refused[job.slot] = Refusal(lacks, self._clock() + self._retry)  # said by it
            self._waiting[job.slot] = job
            return
        try:
            agent = self._launcher.launch(job)
        except AgentError as error:
            before = self._refused.get(job.slot)
            self._refused[job.slot] = Refusal(str(error), self._clock() + self._retry)
            self._waiting[job.slot] = job
            if before is None or before.why != str(error):
                every = f"{self._retry / 60:.0f} min"
                self._say(f"{job}: not started, tried again every {every}: {error}")
            return
        self._refused.pop(job.slot, None)
        self._running[job.slot] = agent
        self._say(f"{job}: started, {agent}")

    def _held(self) -> bool:
        return self._hold is not None and self._clock() < self._hold

    def _hold_for(self, limit: UsageLimit, job: Job) -> None:
        """Its job waits its turn again, unless a newer one for its slot does; and the first
        run that ends on the limit holds every start until it resets."""
        self._waiting.setdefault(job.slot, job)
        if self._held():
            return
        now = self._now()
        resets = limit.resets(now)
        self._hold = self._clock() + (resets - now).total_seconds()
        when = f"{resets:%H:%M}" if resets.date() == now.date() else f"{resets:%Y-%m-%d %H:%M}"
        self._say(f"Usage limit: agents wait until {when}.")

    def _fall_back(self, unavailable: ModelUnavailable, job: Job) -> None:
        """Its job waits its turn again, to run on the next model down (#4): the launcher
        avoids the model from now on, said once per model."""
        self._waiting.setdefault(job.slot, job)
        if unavailable.model in self._lacking:
            return
        self._lacking.add(unavailable.model)
        instead = self._launcher.avoid(unavailable.model)
        self._say(
            f"The account lacks the model {unavailable.model}: its agents run on {instead} for "
            "the rest of this run."
        )


# --- the watcher, as the manager's child ----------------------------------------------------


@dataclass(slots=True)
class Backoff:
    """The wait before the watcher starts again: none after an ordinary end; after a failure
    `first` seconds, doubling with each failure in a row, up to `longest`."""

    first: float
    longest: float
    _next: float = 0

    def after(self, code: int) -> float:
        if code == 0:
            self._next = 0
            return 0
        wait = self._next or self.first
        self._next = min(wait * 2, self.longest)
        return wait


class Watcher:
    """`scripts/github.py watch --json`, run in the checkout, its lines read on a thread of
    their own so the manager can look after its agents meanwhile. Lines that follow each
    other within `settle` seconds are read together: a look's tasks, which the scheduler
    orders before it starts any (#485)."""

    def __init__(self, command: Sequence[str], cwd: Path, settle: float = 0.5) -> None:
        self.command = list(command)
        self._cwd = cwd
        self._settle = settle
        self._process: subprocess.Popen[str] | None = None
        self._lines: queue.Queue[str | None] = queue.Queue()
        self._done = threading.Event()

    @classmethod
    def of(cls, config: ManagerConfig, checkout: Path = ROOT, once: bool = False) -> Watcher:
        """The checkout's, looking as often as `config` says (#445); `once`: one look."""
        script = checkout / "scripts" / "github.py"
        every = f"{config.watch_every_seconds / 60:g}"  # minutes, as `watch` takes them
        command = [sys.executable, str(script), "watch", "--json", "--every", every]
        return cls(command + (["--for", "0"] if once else []), checkout)

    def start(self) -> None:
        """A new run, with a queue of its own: what a stopped one said last, its end
        included, isn't this one's (#574)."""
        self._done.clear()
        self._lines = queue.Queue()
        self._process = subprocess.Popen(
            self.command,
            cwd=self._cwd,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            **Child.options(),
        )
        reader = threading.Thread(
            target=self._read, args=(self._process.stdout, self._lines), daemon=True
        )
        reader.start()

    @staticmethod
    def _read(stream: IO[str], lines: queue.Queue[str | None]) -> None:
        for line in stream:
            lines.put(line.rstrip("\n"))
        lines.put(None)  # all read

    def lines(self, timeout: float) -> list[str]:
        """What it said since, waiting up to `timeout` seconds for a first line, then for
        each next one as long as it follows within `settle`, until it ends."""
        found: list[str] = []
        wait = timeout
        try:
            while (line := self._lines.get(timeout=wait)) is not None:
                found.append(line)
                wait = self._settle
        except queue.Empty:
            return found
        self._done.set()  # all read
        return found

    def ended(self) -> int | None:
        """Its exit code, once it has ended and all it said is read."""
        if self._process is None or not self._done.is_set():
            return None
        return self._process.wait()

    def stop(self) -> None:
        if self._process is not None:
            Child.stop(self._process)


class Keys:
    """The keys pressed in the manager's console, read without waiting (#574): Esc cancels a
    soft stop. They're listened to only inside `with`, which drops what was pressed before
    and puts a POSIX terminal in cbreak mode (Ctrl+C still interrupts), restored after. With
    no terminal (stdin redirected, a service) no key comes."""

    ESC: ClassVar[str] = "\x1b"
    SPECIAL: ClassVar[tuple[str, ...]] = ("\x00", "\xe0")  # Windows: a key in two halves

    def __init__(self, stdin: IO[str] | None) -> None:
        self._stdin = stdin
        self._saved: list[Any] | None = None  # the terminal's mode, while in cbreak

    @classmethod
    def of(cls, stdin: IO[str] | None) -> Keys:
        """Its terminal's, or none when stdin isn't one."""
        try:
            terminal = stdin is not None and stdin.isatty()
        except ValueError:  # closed
            terminal = False
        return cls(stdin if terminal else None)

    def __enter__(self) -> Keys:
        if self._stdin is not None:
            if sys.platform == "win32":
                self._pressed()
            else:
                fd = self._stdin.fileno()
                self._saved = termios.tcgetattr(fd)
                tty.setcbreak(fd)
                termios.tcflush(fd, termios.TCIFLUSH)
        return self

    def __exit__(self, *exc: object) -> None:
        if self._stdin is not None and self._saved is not None and sys.platform != "win32":
            termios.tcsetattr(self._stdin.fileno(), termios.TCSADRAIN, self._saved)
        self._saved = None

    def escaped(self) -> bool:
        """Whether Esc was pressed since the last look; the other keys are dropped."""
        return self._stdin is not None and self.ESC in self._pressed()

    def _pressed(self) -> list[str]:
        """The keys waiting, read. On POSIX each read is a key: a terminal sends a cursor
        key as Esc and more, all at once, so only an Esc read on its own is Esc."""
        assert self._stdin is not None
        keys: list[str] = []
        if sys.platform == "win32":
            while msvcrt.kbhit():
                key = msvcrt.getwch()
                if key in self.SPECIAL:
                    msvcrt.getwch()
                else:
                    keys.append(key)
            return keys
        fd = self._stdin.fileno()
        while select.select([fd], [], [], 0)[0]:
            chunk = os.read(fd, 64)
            if not chunk:  # its end
                break
            keys.append(chunk.decode(errors="replace"))
        return keys


class AgentManager:
    """The loop: the watcher's lines to jobs for the scheduler, the agents looked after, the
    watcher started again whenever it ends. The first Ctrl+C stops it softly, the second at
    once (#485); Esc in between cancels the soft stop (#574)."""

    def __init__(
        self,
        watcher: Watcher,
        scheduler: Scheduler,
        backoff: Backoff,
        say: Say | None = None,
        once: bool = False,
        only: frozenset[int] = frozenset(),
        today: Callable[[], date] = date.today,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
        keys: Keys | None = None,
    ) -> None:
        self._watcher = watcher
        self._scheduler = scheduler
        self._backoff = backoff
        self._say = say or Console().say
        self._once = once
        self._only = only
        self._today = today
        self._clock = clock
        self._sleep = sleep
        self._keys = keys or Keys.of(sys.stdin)

    def hear(self, line: str) -> None:
        """A line of the watcher's."""
        try:
            data = json.loads(line)
        except ValueError:
            self._say(f"watcher: {line}")
            return
        job = Job.of(data, self._today())
        if job is None:
            self._say(f"watcher: {data.get('text', line)}")
        elif not self._only or job.issue in self._only:
            self._scheduler.take(job)

    def run(self) -> None:
        self._watcher.start()
        while True:
            try:
                self._watch()
                return
            except KeyboardInterrupt:
                if not self._stop_softly():
                    return

    def _watch(self) -> None:
        """Until a --once run has done what its look found; else until Ctrl+C."""
        again: float | None = None  # when the watcher starts again
        while True:
            for line in self._watcher.lines(timeout=1):
                self.hear(line)
            self._scheduler.tick()
            code = self._watcher.ended()
            if code is None:
                continue
            if self._once:
                if not self._scheduler.busy():
                    return
            elif again is None:
                wait = self._backoff.after(code)
                if code != 0:
                    self._say(f"The watcher failed (exit {code}): again in {wait:.0f} s.")
                again = self._clock() + wait
            elif self._clock() >= again:
                again = None
                self._watcher.start()

    def _stop_softly(self) -> bool:
        """The first Ctrl+C: the watcher stops and nothing new starts, while the agents
        running finish their work. A second stops them too, keeping their worktrees. Esc
        meanwhile cancels it (#574): the watcher starts again and the scheduler takes work
        again; True then, and the manager watches on."""
        try:
            self._watcher.stop()
            if running := self._scheduler.close():
                self._say(
                    "Soft-stopping: nothing new starts; waiting for "
                    f"{plural(running, 'running agent')} to finish. "
                    "Ctrl+C again force-stops; Esc cancels and carries on."
                )
            with self._keys:
                while self._scheduler.busy():
                    self._sleep(1)
                    if self._keys.escaped():
                        self._scheduler.reopen()
                        self._watcher.start()
                        self._say("Carrying on: the soft stop is cancelled.")
                        return True
                    self._scheduler.tick()
        except KeyboardInterrupt:
            self._say("Force-stopping the agents: their worktrees stay as they are.")
            self._scheduler.stop()
        self._say("Stopped.")
        return False


# --- the labels ------------------------------------------------------------------------------


class Labels:
    """The labels the manager reads, on the repository (`LABEL_FAMILIES`): model:* and
    effort:*, which say how strong an agent an issue gets (#387), and priority:*, how soon
    (#485)."""

    def __init__(self, github: GitHub) -> None:
        self._github = github

    def ensure(self) -> list[str]:
        """Makes the missing ones; which those were."""
        there = {label["name"] for label in self._github.call("GET", "labels?per_page=100")}
        made = []
        for family in LABEL_FAMILIES:
            for value in family.values:
                name = family.label(value)
                if name in there:
                    continue
                about = family.description(value)
                self._github.call(
                    "POST", "labels", {"name": name, "color": family.color, "description": about}
                )
                made.append(name)
        return made


# --- the command ---------------------------------------------------------------------------------


def main(argv: Sequence[str] | None = None) -> None:
    utf8_output()
    parser = argparse.ArgumentParser(
        prog="scripts/agent_manager.py", description=__doc__.split("\n")[0]
    )
    parser.add_argument("command", nargs="?", choices=["run", "labels"], default="run")
    parser.add_argument("--dry-run", action="store_true", help="say what it would run")
    parser.add_argument("--once", action="store_true", help="what needs doing now, then end")
    parser.add_argument(
        "--issue", type=int, action="append", default=[], help="only this issue's tasks"
    )
    args = parser.parse_args(argv)

    git = Git(ROOT)
    github = GitHub(repo_slug(git.out("remote", "get-url", "origin")), token())
    if args.command == "labels":
        made = Labels(github).ensure()
        print(f"Made: {', '.join(made)}." if made else "The labels are all there.")
        return

    config = ManagerConfig.load(ROOT)
    claude = shutil.which("claude")
    if claude is None and not args.dry_run:
        raise SystemExit(
            "No `claude` on the PATH: the agents are Claude Code's command line. "
            "scripts/check_setup.py says how to install it."
        )
    lock = ManagerLock()
    if not args.dry_run and not lock.acquire(datetime.now()):
        raise SystemExit(f"An agent manager already runs here ({lock.holder()}).")
    me = github.call("GET", "/user")["login"]
    server = config.test_database_url or os.environ.get("TEST_DATABASE_URL", "")
    launcher = Launcher(
        config,
        git,
        claude or "claude",
        github.slug,
        database=lambda slot: TestDatabase(slot, server),
    )
    console = Console()
    hold = ToolchainHold(
        Toolchain(os.environ.get("PATH", "")).checks,  # the PATH its agents get
        HoldNotice(github, me),
        console.say,
    )
    scheduler = Scheduler(
        config.max_parallel,
        launcher,
        lambda job: job.still_due(github, me),
        console.say,
        dry_run=args.dry_run,
        retry=config.watch_every_seconds,  # at the watcher's next look
        merger=SelfMerge(github, me, launcher),
        hold=hold,
    )
    console.say(
        f"Agent manager for {me} on {github.slug}: at most "
        f"{plural(config.max_parallel, 'agent')} and a merge, "
        f"{config.power} unless labels say otherwise, compacted at {config.compaction} of the "
        f"window, worktrees in {config.worktrees(ROOT)}, GitHub looked at every "
        f"{config.watch_every_seconds:g} s. Ctrl+C lets the running agents finish, then "
        "stops (Esc then carries on); twice stops them too."
    )
    try:
        hold.look()
        AgentManager(
            Watcher.of(config, ROOT, once=args.once or args.dry_run),
            scheduler,
            Backoff(config.watcher_backoff_seconds, config.watcher_backoff_max_seconds),
            console.say,
            once=args.once or args.dry_run,
            only=frozenset(args.issue),
        ).run()
    finally:
        lock.release()


if __name__ == "__main__":
    main()
