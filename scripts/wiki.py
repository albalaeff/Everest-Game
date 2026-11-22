"""The project's wiki, kept up to date with main by an agent of the manager's (#126).

The wiki is a git repository of its own, beside the project's: `<origin>.wiki.git`. Each run
of the wiki agent ends in a commit there whose message names the last main commit it
covered, in a trailer:

    Main: 782fb26e…

so the next run starts from there; one named `Develop:`, as the wiki's commits did while the
branch was `develop`, still counts (#300). A commit with none (a person's edit) moves
nothing; a wiki with none at all covers main as it was at its latest commit.

`scripts/github.py watch --json --wiki <hours>`, the agent manager's watcher, looks every
`hours` (`WikiCheck`): when PRs merged into main since the commit covered, it says so, and
the manager starts the wiki agent (`agent_manager.WikiJob`). Chores don't count: they change
nothing a player or a developer reads about. Where no manager runs,
`scripts/agent_manager.py wiki` looks once and runs the same agent (`WikiRun`, #295), as a
scheduler runs it every day.
"""

from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, ClassVar, Protocol

import httpx

from scripts.agents import MAIN, RUNS
from scripts.handoff import Git

TRAILER = "Main"
TRAILERS = (TRAILER, "Develop")  # what the wiki's commits named the commit covered before #300
LEFT_OUT = ("chore/",)  # branches whose merges don't count


class WikiUnreadable(Exception):
    """Why the wiki's history, or main's since, couldn't be read."""


class Calls(Protocol):
    """What the check needs of scripts/github.py's GitHub."""

    def call(
        self, method: str, path: str, body: object | None = None, missing_ok: bool = False
    ) -> Any: ...


def wiki_url(origin: str) -> str:
    """The wiki's remote beside the project's, over the same protocol, so the same
    credentials reach it: https://github.com/o/r.git gives https://github.com/o/r.wiki.git."""
    return f"{origin.rstrip('/').removesuffix('.git')}.wiki.git"


@dataclass(frozen=True, slots=True)
class Covered:
    """How far the wiki's history says it covers main: the trailer's commit, else the
    time of its latest commit (`at`), when it has none."""

    sha: str | None
    at: datetime

    @classmethod
    def read(cls, log: str) -> Covered:
        """From `git log --format=%cI%n%B%x1e`, the latest first."""
        records = [record.strip() for record in log.split("\x1e") if record.strip()]
        if not records:
            raise ValueError("the wiki has no commit")
        latest = datetime.fromisoformat(records[0].splitlines()[0])
        for record in records:
            for line in reversed(record.splitlines()[1:]):
                name, _, value = line.partition(":")
                if name.strip() in TRAILERS and value.strip():
                    return cls(value.strip(), latest)
        return cls(None, latest)


@dataclass(frozen=True, slots=True)
class WikiNews:
    """What a check found: the PRs merged into main since the commit the wiki covers
    (`since`) up to `main`, when there are any; `failed` when it couldn't tell, which
    fails a wiki run of its own (`agent_manager.WikiRun`, #295)."""

    text: str
    main: str = ""
    since: str = ""
    pulls: tuple[int, ...] = ()
    failed: bool = False

    @property
    def key(self) -> str:
        return f"wiki: {self.main}"

    def data(self) -> dict[str, Any]:
        """The watcher's line for the manager."""
        return {
            "type": "wiki",
            "key": self.key,
            "text": self.text,
            "main": self.main,
            "since": self.since,
            "pulls": list(self.pulls),
        }

    @classmethod
    def of(cls, data: Mapping[str, Any]) -> WikiNews:
        return cls(
            str(data["text"]),
            str(data["main"]),
            str(data["since"]),
            tuple(int(number) for number in data["pulls"]),
        )


@dataclass(frozen=True, slots=True)
class WikiCheck:
    """Looks every `hours`, from `scripts/github.py watch --json`. The wiki's history is
    read from a bare clone kept in .agent-runs/ (`cache`), fetched only when its remote
    moved; main's from GitHub, so the checkout's state doesn't matter. The time of the
    last try is kept in `stamp`, so a failure waits `hours` too, like a success."""

    github: Calls
    origin: str  # the project's remote
    hours: float
    git: Git = field(default_factory=Git)
    cache: Path = RUNS / "wiki.git"
    stamp: Path = RUNS / "wiki-checked"

    PULLS: ClassVar[str] = (
        f"pulls?state=closed&base={MAIN}&sort=updated&direction=desc&per_page=100"
    )

    def due(self, now: datetime) -> bool:
        try:
            last = datetime.fromisoformat(self.stamp.read_text(encoding="utf-8").strip())
        except OSError, ValueError:
            return True
        return now - last >= timedelta(hours=self.hours)

    def run(self, now: datetime) -> WikiNews:
        """Reads both histories; says what it found."""
        self.stamp.parent.mkdir(parents=True, exist_ok=True)
        self.stamp.write_text(now.isoformat(), encoding="utf-8")
        try:
            covered = self._covered()
            since = covered.sha or self._main_at(covered.at)
            compared = self.github.call("GET", f"compare/{since}...{MAIN}", missing_ok=True)
            if compared is None:
                raise WikiUnreadable(f"{MAIN} has no commit {since[:7]}")
            merged = self._merged({commit["sha"] for commit in compared["commits"]})
        except (WikiUnreadable, httpx.HTTPError, KeyError, IndexError, ValueError) as error:
            return WikiNews(f"The wiki: couldn't tell what's new ({error}).", failed=True)
        if not merged:
            return WikiNews(f"The wiki: nothing merged into {MAIN} since {since[:7]}.")
        tip = compared["commits"][-1]["sha"]
        numbers = ", ".join(f"#{number}" for number in merged)
        return WikiNews(
            f"The wiki is behind {MAIN}: {len(merged)} PR{'s' if len(merged) > 1 else ''} "
            f"merged since {since[:7]} ({numbers}).",
            tip,
            since,
            merged,
        )

    def __call__(self, now: Callable[[], datetime] = datetime.now) -> WikiNews | None:
        """For `watch`: the news when a check was due, else None."""
        moment = now()
        return self.run(moment) if self.due(moment) else None

    def _covered(self) -> Covered:
        url = wiki_url(self.origin)
        if (self.cache / "HEAD").is_file():
            done = self.git.run(
                "fetch", "-q", "--prune", url, "+refs/heads/*:refs/heads/*", at=str(self.cache)
            )
        else:
            done = self.git.run("clone", "-q", "--bare", url, str(self.cache))
        if done.returncode != 0:
            raise WikiUnreadable(str(done.stderr).strip() or f"git: exit {done.returncode}")
        log = self.git.out("log", "--format=%cI%n%B%x1e", "HEAD", at=str(self.cache))
        return Covered.read(log)

    def _main_at(self, at: datetime) -> str:
        """Main's commit as it was at `at`: what a wiki with no trailer was written from."""
        until = at.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
        found = self.github.call("GET", f"commits?sha={MAIN}&until={until}&per_page=1")
        return str(found[0]["sha"])

    def _merged(self, shas: set[str]) -> tuple[int, ...]:
        """The PRs whose merges are among `shas`, but chores', oldest first."""
        pulls = self.github.call("GET", self.PULLS)
        found = [
            pull
            for pull in pulls
            if pull.get("merged_at")
            and pull.get("merge_commit_sha") in shas
            and not str(pull["head"]["ref"]).startswith(LEFT_OUT)
        ]
        return tuple(pull["number"] for pull in sorted(found, key=lambda pull: pull["merged_at"]))


class WikiUnpublished(Exception):
    """Why the wiki's clone couldn't be made, or its pages pushed."""


@dataclass(frozen=True, slots=True)
class WikiClone:
    """The wiki's clone in a wiki agent's worktree, at `path`: the manager makes it before
    the agent starts (`make`), and commits and pushes what the agent changed once it ends
    (`publish`), so the agent needs no command beyond the project's allow list."""

    path: Path
    git: Git

    def make(self, origin: str) -> str:
        """Clones the wiki, or keeps the clone an earlier agent left, with its edits; says
        which."""
        if (self.path / ".git").exists():
            return "the wiki's clone kept from before"
        done = self.git.run("clone", "-q", wiki_url(origin), str(self.path))
        if done.returncode != 0:
            raise WikiUnpublished(f"git clone of the wiki: {str(done.stderr).strip()}")
        return "the wiki cloned"

    def publish(self, tip: str, pulls: tuple[int, ...]) -> str:
        """Commits it all, naming `tip` in the trailer, even with nothing changed, so the
        next check starts from there; takes a person's edits made meanwhile, then pushes.
        What it pushed; or that it dropped the pages, when another run (another machine's
        manager) updated the wiki meanwhile, rather than say the same PRs twice."""
        at = str(self.path)
        self._do("fetch", "-q", "origin")
        since = self.git.out("log", "--format=%B", "HEAD..@{upstream}", at=at).splitlines()
        if any(line.startswith(f"{name}:") for line in since for name in TRAILERS):
            return "the wiki's pages dropped: another run updated it meanwhile"
        self._do("add", "-A")
        changed = len(self.git.out("diff", "--cached", "--name-only", at=at).splitlines())
        numbers = ", ".join(f"#{number}" for number in pulls)
        subject = f"Up to date with {MAIN}: {numbers}" if numbers else f"Up to date with {MAIN}"
        self._do("commit", "-q", "--allow-empty", "-m", subject, "-m", f"{TRAILER}: {tip}")
        self._do("pull", "-q", "--rebase")
        self._do("push", "-q", "origin", "HEAD")
        files = f"{changed} file{'' if changed == 1 else 's'} changed" if changed else "no change"
        return f"the wiki pushed ({files}, {MAIN} at {tip[:7]})"

    def _do(self, *args: str) -> None:
        done = self.git.run(*args, at=str(self.path))
        if done.returncode != 0:
            said = str(done.stderr).strip() or f"exit {done.returncode}"
            raise WikiUnpublished(f"git {args[0]} in the wiki's clone: {said}")
