"""What the session manager (scripts/agent_manager.py, #387) and the scripts its agents run
share: the repository's one long-lived branch (`MAIN`, #300), its settings, how often the
watcher looks (`WATCH_EVERY`, #445), the locks that say what runs, the labels it reads
(`LABEL_FAMILIES`), which agent is talking, and where Claude Code compacts a conversation.

    agent-manager.toml   the manager's settings (`ManagerConfig`), the defaults when it's missing
    .agent-runs/         each agent's log, on this machine only (gitignored); the main
                         checkout's holds the locks too, for every worktree (#307)

An agent is headless Claude Code in a worktree of its own, started for one issue with the
model and effort the issue's labels ask for (`AgentPower`), in the turn its priority label
gives it (`Priority`, #485). The manager puts that power in the agent's environment, so its
comments are signed "_Claude Code agent (bateks, opus/xhigh)_" (scripts/github.py), and the
share of the window at which Claude Code compacts its conversation (`CompactShare`, #441), or
the more its issue's `compact:*` label gives (#152); what it writes for after that is `NOTES`.
While the manager holds its lock (`ManagerLock`), a session's watcher ends: the agents take
the issues (CLAUDE.md → Sessions). A session's watcher holds one of its own (`WatchLock`,
#597), so a second session on the machine takes no issue either; and a wiki run with no
manager, one of its own too (`WikiLock`, #295). Each is a file in the main checkout's
.agent-runs/, the same from any worktree of the repository (`main_checkout`, #307): a
session's in the Claude app, which gives each session a worktree of its own, or an agent's.
"""

import os
import re
import subprocess
import sys
import tomllib
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass, fields, replace
from datetime import datetime
from pathlib import Path
from typing import IO, ClassVar

ROOT = Path(__file__).resolve().parents[1]
# The one long-lived branch (GitHub flow, #300): each task branches from it and merges into it
# by a PR, every merge into it is published, and every machine follows it while idle (#347).
MAIN = "main"
RUNS = ROOT / ".agent-runs"
# What an agent writes in its worktree before Claude Code compacts its conversation, and gets
# back after (scripts/handoff_due.py, #155): gitignored, as all of .agent-runs/ is.
NOTES = Path(".agent-runs") / "notes.md"
# Seconds between the watcher's looks at GitHub (#445): a session's, and the manager's unless
# agent-manager.toml says otherwise (`ManagerConfig.watch_every_seconds`).
WATCH_EVERY = 2 * 60
Run = Callable[..., subprocess.CompletedProcess[str]]


def main_checkout(run: Run = subprocess.run, root: Path = ROOT) -> Path:
    """The repository's main checkout, from it or from any of its worktrees (a Claude app
    session's, an agent's): the folder of the Git directory they share. `root` itself where
    there's no Git, or no repository."""
    try:
        found = run(
            ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
            capture_output=True,
            text=True,
            check=False,
            cwd=root,
        )
    except OSError:  # no Git
        return root
    if found.returncode != 0:
        return root
    return Path(found.stdout.strip()).parent


@dataclass(frozen=True, slots=True)
class LabelFamily:
    """Issue labels that tell the manager something, `<name>:<value>`: of two on an issue, the
    stronger value wins. `color` and `about` (`{}` for the value) are the labels' on GitHub,
    which `scripts/agent_manager.py labels` makes."""

    name: str
    values: tuple[str, ...]  # the weakest first
    color: str
    about: str

    def label(self, value: str) -> str:
        return f"{self.name}:{value}"

    def labels(self) -> list[str]:
        return [self.label(value) for value in self.values]

    def description(self, value: str) -> str:
        return self.about.format(value)

    def strongest(self, labels: Iterable[str]) -> str | None:
        """The strongest value of those `labels` set; None when they set none."""
        names = set(labels)
        found = [value for value in self.values if self.label(value) in names]
        return found[-1] if found else None


@dataclass(frozen=True, slots=True)
class AgentPower:
    """The model and the effort an agent runs with, in Claude Code's own words."""

    model: str
    effort: str

    MODELS: ClassVar[tuple[str, ...]] = ("haiku", "sonnet", "opus", "fable")  # the weakest first
    EFFORTS: ClassVar[tuple[str, ...]] = ("high", "xhigh", "max")  # no weaker ones (#4)
    MODEL: ClassVar[LabelFamily] = LabelFamily(
        "model", MODELS, "5319e7", "The agent for this issue runs with model {} (#387)"
    )
    EFFORT: ClassVar[LabelFamily] = LabelFamily(
        "effort", EFFORTS, "0e8a16", "The agent for this issue runs with effort {} (#387)"
    )
    MODEL_ENV: ClassVar[str] = "CLAUDE_AGENT_MODEL"
    EFFORT_ENV: ClassVar[str] = "CLAUDE_AGENT_EFFORT"

    def __post_init__(self) -> None:
        if self.model not in self.MODELS:
            raise ValueError(f"model {self.model!r} isn't one of {', '.join(self.MODELS)}")
        if self.effort not in self.EFFORTS:
            raise ValueError(f"effort {self.effort!r} isn't one of {', '.join(self.EFFORTS)}")

    @classmethod
    def labels(cls) -> list[str]:
        """The issue labels that set it: `model:*` and `effort:*`."""
        return cls.MODEL.labels() + cls.EFFORT.labels()

    def from_labels(self, labels: Iterable[str]) -> AgentPower:
        """This power (the defaults), as an issue's labels change it: each family on its own,
        and of two labels in one, the stronger."""
        names = set(labels)
        return AgentPower(
            self.MODEL.strongest(names) or self.model,
            self.EFFORT.strongest(names) or self.effort,
        )

    def without(self, unavailable: Iterable[str]) -> AgentPower:
        """This power on an account that lacks some models (#4: Fable is on some plans only):
        the strongest model left at or below this one, with the same effort. The weakest
        model is never given up."""
        gone = set(unavailable)
        mine = self.MODELS.index(self.model)
        for model in reversed(self.MODELS[: mine + 1]):
            if model not in gone:
                return self if model == self.model else AgentPower(model, self.effort)
        return self

    @classmethod
    def of_agent(cls, env: Mapping[str, str] = os.environ) -> AgentPower | None:
        """The power the manager gave this process; None in a session of a person's."""
        try:
            return cls(env[cls.MODEL_ENV], env[cls.EFFORT_ENV])
        except KeyError, ValueError:
            return None

    def env(self) -> dict[str, str]:
        """What the manager puts in an agent's environment."""
        return {self.MODEL_ENV: self.model, self.EFFORT_ENV: self.effort}

    def __str__(self) -> str:
        return f"{self.model}/{self.effort}"


@dataclass(frozen=True, slots=True)
class Priority:
    """How soon an issue's agent starts, among the tasks that wait their turn (#485): what
    its `priority:*` label says, the higher of two; none is medium."""

    level: str = "medium"

    FAMILY: ClassVar[LabelFamily] = LabelFamily(
        "priority",
        ("low", "medium", "high"),
        "d93f0b",
        "The agent manager starts this issue's agents at {} priority; none is medium (#485)",
    )

    def __post_init__(self) -> None:
        if self.level not in self.FAMILY.values:
            raise ValueError(
                f"priority {self.level!r} isn't one of {', '.join(self.FAMILY.values)}"
            )

    @classmethod
    def of(cls, labels: Iterable[str]) -> Priority:
        found = cls.FAMILY.strongest(labels)
        return cls(found) if found else cls()

    @property
    def rank(self) -> int:
        """The higher, the sooner."""
        return self.FAMILY.values.index(self.level)


@dataclass(frozen=True, slots=True)
class CompactShare:
    """The share of its window, in percent, at which Claude Code compacts a conversation:
    what CLAUDE_AUTOCOMPACT_PCT_OVERRIDE says (#399). The manager sets it for its agents
    (#441): each reply reads the whole conversation again, so one compacted early costs less.
    The Stop hook reads it as Claude Code does (scripts/handoff_due.py).

    An issue's `compact:*` label gives its agents more (#152): #26's read 300K tokens before
    it wrote a line, past a quarter of the window, so it read them again after each
    compaction, until Claude Code stopped it. The manager puts the next label up on an issue
    whose run ended so (`more`), and a person may for one they know is big."""

    percent: float = 100  # all of it: where Claude Code compacts by itself

    ENV: ClassVar[str] = "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE"
    FAMILY: ClassVar[LabelFamily] = LabelFamily(
        "compact",
        ("50", "100"),
        "c5def5",
        "The agent for this issue compacts its conversation at {}% of the window (#152)",
    )

    @classmethod
    def from_env(cls, env: Mapping[str, str] = os.environ) -> CompactShare:
        """As Claude Code reads it: as JavaScript's parseFloat does, and only from above 0 to
        100; else all of the window."""
        leading = re.match(r"\s*(\d+(?:\.\d*)?)", env.get(cls.ENV, ""))
        percent = float(leading[1]) if leading else 0.0
        return cls(percent) if 0 < percent <= 100 else cls()

    def of(self, window: int) -> int:
        """Where it compacts, in tokens, in a window this big."""
        return min(window, int(window * self.percent / 100))

    def from_labels(self, labels: Iterable[str]) -> CompactShare:
        """This share (agent-manager.toml's), or more where an issue's labels give more: of
        two, the larger."""
        found = self.FAMILY.strongest(labels)
        return CompactShare(float(found)) if found and float(found) > self.percent else self

    def more(self) -> str | None:
        """The label of the next share up, for an issue whose agent compacted again and again
        at this one; None at all of the window."""
        values = self.FAMILY.values
        return next((self.FAMILY.label(v) for v in values if float(v) > self.percent), None)

    def env(self) -> dict[str, str]:
        """What the manager puts in an agent's environment."""
        return {self.ENV: f"{self.percent:g}"}

    def __str__(self) -> str:
        return f"{self.percent:g}%"


# The labels the manager reads: a change to one makes a task new to its watcher (#485).
LABEL_FAMILIES = (AgentPower.MODEL, AgentPower.EFFORT, Priority.FAMILY, CompactShare.FAMILY)


@dataclass(frozen=True, slots=True)
class ManagerConfig:
    """agent-manager.toml, in the checkout: how the manager runs its agents. What the file
    doesn't say, or the file that isn't there, takes the default here."""

    default_model: str = "opus"
    default_effort: str = "xhigh"
    max_parallel: int = 3  # agents at once; the rest wait their turn
    worktree_dir: str = "../worktrees"  # from the checkout; an agent's is <worktree_dir>/<issue>
    # The tests' PostgreSQL server, as the URL of its `<name>_test` database: each agent then
    # gets `<name>_<issue>_test` of its own (`TestDatabase`). Empty: TEST_DATABASE_URL, or no
    # database at all, for a project whose tests need none.
    test_database_url: str = ""
    watch_every_seconds: float = WATCH_EVERY  # between the watcher's looks at GitHub (#445)
    watcher_backoff_seconds: float = 10  # the wait before the watcher starts again after a failure
    watcher_backoff_max_seconds: float = 600  # it doubles after each failure, up to this
    compact_at_percent: float = 25  # of the window: where an agent's conversation is compacted
    wiki_every_hours: float = 6  # between the watcher's looks at the wiki (#126); 0: never

    FILE: ClassVar[str] = "agent-manager.toml"

    def __post_init__(self) -> None:
        AgentPower(self.default_model, self.default_effort)  # raises for a wrong one
        if self.max_parallel < 1:
            raise ValueError("max_parallel must be at least 1")
        if self.watch_every_seconds < 60:  # 2, meant as minutes, would look every 2 seconds
            raise ValueError("watch_every_seconds must be at least 60")
        if not 0 < self.watcher_backoff_seconds <= self.watcher_backoff_max_seconds:
            raise ValueError(
                "watcher_backoff_seconds must be above 0 and at most watcher_backoff_max_seconds"
            )
        if not 1 <= self.compact_at_percent <= 100:
            raise ValueError("compact_at_percent must be from 1 to 100")
        if self.wiki_every_hours < 0:
            raise ValueError("wiki_every_hours must be 0 (never) or more")

    @classmethod
    def load(cls, checkout: Path = ROOT) -> ManagerConfig:
        path = checkout / cls.FILE
        try:
            text = path.read_text(encoding="utf-8")
        except FileNotFoundError:
            return cls()
        try:
            found = tomllib.loads(text)
            unknown = sorted(set(found) - {field.name for field in fields(cls)})
            if unknown:
                raise ValueError(f"unknown keys: {', '.join(unknown)}")
            return cls(**found)
        except (tomllib.TOMLDecodeError, TypeError, ValueError) as error:
            raise SystemExit(f"{cls.FILE}: {error}") from None

    @property
    def power(self) -> AgentPower:
        """An agent's power when its issue has no label for it."""
        return AgentPower(self.default_model, self.default_effort)

    def with_power(self, model: str | None = None, effort: str | None = None) -> ManagerConfig:
        """These settings with the agents' power changed where given: a wiki run's
        `--model` and `--effort` (#295). ValueError for one Claude Code doesn't name."""
        return replace(
            self,
            default_model=model or self.default_model,
            default_effort=effort or self.default_effort,
        )

    @property
    def compaction(self) -> CompactShare:
        """Where Claude Code compacts an agent's conversation."""
        return CompactShare(self.compact_at_percent)

    def worktrees(self, checkout: Path = ROOT) -> Path:
        """The folder of the agents' worktrees."""
        return (checkout / self.worktree_dir).resolve()


class RunLock:
    """Held by a running process: an operating-system lock on a file in the main checkout's
    .agent-runs/, so that it holds in every worktree of the repository (#307), and one that
    died holds nothing. The file says who holds it (`who`: its pid, and what a kind of lock
    adds), the checkout it runs in, and since when."""

    NAME: ClassVar[str]  # its file's, in .agent-runs/
    AT: ClassVar[int] = 1 << 20  # Windows locks bytes: one far past the text, which stays readable

    def __init__(
        self, path: Path | None = None, who: str | None = None, checkout: Path = ROOT
    ) -> None:
        """For a process in `checkout`; its file `path`, by default the one in the main
        checkout of `checkout`'s repository."""
        self.path = path or main_checkout(root=checkout) / RUNS.name / self.NAME
        holder = who or f"pid {os.getpid()}"
        self.who = f"{holder}, in {checkout}"
        self._file: IO[bytes] | None = None

    def acquire(self, since: datetime) -> bool:
        """Takes it for this process; False when another process holds it."""
        self.path.parent.mkdir(parents=True, exist_ok=True)
        file = self.path.open("a+b")
        if not self._lock(file):
            file.close()
            return False
        file.seek(0)
        file.truncate()
        file.write(f"{self.who}, since {since:%Y-%m-%d %H:%M}".encode())
        file.flush()
        self._file = file
        return True

    def release(self) -> None:
        if self._file is None:
            return
        self._file.close()  # which lets go of the lock
        self._file = None
        self.path.unlink(missing_ok=True)

    def holder(self) -> str | None:
        """What the process holding it wrote ("pid 4242, in /srv/everest, since 2026-10-12
        18:02"); None when none does."""
        if not self.path.exists():
            return None
        with self.path.open("a+b") as file:
            if self._lock(file):
                self._unlock(file)
                return None
            file.seek(0)
            return file.read().decode(errors="replace").strip() or "a manager"

    def _lock(self, file: IO[bytes]) -> bool:
        try:
            if sys.platform == "win32":
                import msvcrt

                file.seek(self.AT)
                msvcrt.locking(file.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl

                fcntl.flock(file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            return False
        return True

    def _unlock(self, file: IO[bytes]) -> None:
        if sys.platform == "win32":
            import msvcrt

            file.seek(self.AT)
            msvcrt.locking(file.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl

            fcntl.flock(file.fileno(), fcntl.LOCK_UN)


class ManagerLock(RunLock):
    """The running manager's (#387). While it's held, a session's `scripts/github.py watch`
    ends, and no second manager starts: two of them, or a manager and a session, would both
    start the same issue. That holds in every worktree of the repository (#307): a manager
    in the main checkout ends a session's watcher in a worktree."""

    NAME = "manager.lock"


class WikiLock(RunLock):
    """A wiki run's, `scripts/agent_manager.py wiki` (#295). While it's held, a second one on
    the machine says so and ends, rather than start a second agent in the wiki's worktree,
    `<worktree_dir>/wiki`: the same one from the main checkout as from a worktree beside it
    (#307)."""

    NAME = "wiki.lock"


class WatchLock(RunLock):
    """A session's watcher's (#597). While it's held, a second session's watcher on this
    machine ends, whichever worktree of the repository it runs in (#307): two sessions as
    one login would both start the same new issue. The file names the session too (Claude
    Code's `CLAUDE_CODE_SESSION_ID`, in the environment of the commands it runs), so that
    `handoffs` in that session tells its own watcher from another session's (`another`)."""

    NAME = "watch.lock"
    SESSION: ClassVar[str] = "CLAUDE_CODE_SESSION_ID"

    def __init__(
        self,
        path: Path | None = None,
        env: Mapping[str, str] = os.environ,
        checkout: Path = ROOT,
    ) -> None:
        self.session = env.get(self.SESSION, "")
        who = f"pid {os.getpid()}, session {self.session}" if self.session else None
        super().__init__(path, who, checkout)

    def another(self) -> str | None:
        """What another session's watcher holding it wrote; None when nobody holds it, or
        this session's own watcher does."""
        held = self.holder()
        if held is None or (self.session and f"session {self.session}" in held):
            return None
        return held
