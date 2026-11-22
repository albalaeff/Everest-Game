"""What Claude's work on an issue cost, in dollars, from Claude Code's session logs (#390).

    uv run python scripts/github.py cost 390      (scripts/github.py's command uses this)

Claude Code logs each session on the machine it runs on (~/.claude/projects/<the folder,
as a name>/<session>.jsonl), with the tokens of every reply and the model that wrote it.
Each reply is priced at its model's prices on its day (scripts/claude_prices.py), and
counted for the issue its work names (`IssueNames`):

- a command naming one, or a page read of it: a comment on it (`scripts/github.py comment
  390`), its API path or its page (`issues/390`), its branch (`feature/390-…`), its title
  (`scripts/github.py title 390`), reading or closing it (`show 390`, `close 390`), or its
  PR's (`pr 401`, `merge 401`, #442). Not what a reply writes, a file's content, an edit or a
  message: writing about an issue isn't working on it (#302);
- else the worktree it works in, when that's another than the session's own: the issue the
  agent manager named it after, `<worktree_dir>/<issue>` (`cd /c/git/worktrees/256`,
  `C:\\git\\worktrees\\256\\…`, #293), or none, for one named after no issue (a chore's, an app
  session's `.claude/worktrees/<name>`, #302);
- else the branch the session was on, when it's an issue's, unless the session works in
  another worktree: the branch is that of its own folder, the one it was started in, which
  may be on another session's issue (#293);
- else the last issue the session named: the replies in between belong to it;
- before a session names any, its upkeep (setup, the watcher) counts for none.

A session works in another worktree from a reply whose commands or file paths name it until
one names a path in its own folder; an agent's own folder is its worktree, an app session's
its `.claude/worktrees/<name>`, and a reply that names several worktrees (a clean-up's look
over them) moves nothing. A file's content says nothing of where: only the commands, and the
paths the tools are given (#293).

Each machine counts its own Claude's work; the sum over a session matches the total
Claude Code itself logs for it ("cost-state").
"""

import json
import re
import subprocess
from collections.abc import Iterable, Iterator, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Any, ClassVar

from scripts.agents import ManagerConfig
from scripts.claude_prices import PriceHistory, Tokens

ROOT = Path(__file__).resolve().parents[1]
LOGS = Path.home() / ".claude" / "projects"
FAST = Decimal(2)  # fast mode: twice the standard prices


def log_folder(path: Path) -> str:
    """The name Claude Code gives a folder's logs: "c:\\git\\PersonalExchangeBot" ->
    "c--git-PersonalExchangeBot"."""
    return re.sub(r"[^A-Za-z0-9]", "-", str(path))


def worktrees(root: Path = ROOT) -> list[Path]:
    """This checkout and the repository's other worktrees (an agent's, #387)."""
    listed = subprocess.run(
        ["git", "worktree", "list", "--porcelain"],
        capture_output=True,
        text=True,
        check=False,
        cwd=root,
    ).stdout
    found = [
        Path(line.removeprefix("worktree "))
        for line in listed.splitlines()
        if line.startswith("worktree ")
    ]
    return [root, *found]


def main_checkout(root: Path = ROOT) -> Path:
    """The repository's main checkout, which git lists first among the worktrees."""
    listed = worktrees(root)
    return listed[1] if len(listed) > 1 else root


def agents_folder(root: Path = ROOT) -> Path:
    """Where the session manager puts its agents' worktrees (#387): from the main
    checkout's agent-manager.toml."""
    checkout = main_checkout(root)
    return ManagerConfig.load(checkout).worktrees(checkout)


def app_worktrees(root: Path = ROOT) -> Path:
    """Where the Claude app puts a session's worktree when it starts one (#302): the main
    checkout's .claude/worktrees."""
    return main_checkout(root) / ".claude" / "worktrees"


def session_logs(
    folders: Iterable[Path], logs: Path = LOGS, under: Iterable[Path] = ()
) -> list[Path]:
    """The session logs of these folders, and of every folder `under` these: the agents'
    worktrees, gone once their work is on GitHub (#387), and the Claude app's, gone once their
    session is archived (#302). Wherever Claude Code keeps them (its folder names differ only
    in case on Windows, by how the drive letter was typed)."""
    names = {log_folder(folder).lower() for folder in folders}
    inside = tuple(f"{log_folder(folder).lower()}-" for folder in under)
    if not logs.is_dir():
        return []
    return sorted(
        log
        for project in logs.iterdir()
        if project.is_dir()
        and (project.name.lower() in names or project.name.lower().startswith(inside))
        for log in project.glob("*.jsonl")
    )


@dataclass(frozen=True, slots=True)
class Place:
    """Where a reply worked, as its commands and the paths its tools were given say (#293):
    in a worktree other than the session's own folder (`worktree`, its folder's name), or in
    its own folder; neither, when they don't say."""

    worktree: str | None = None
    own_folder: bool = False

    @property
    def issue(self) -> int | None:
        """The issue its worktree is named after; None for one named after none (#302)."""
        return int(self.worktree) if self.worktree and self.worktree.isdigit() else None


@dataclass(frozen=True, slots=True)
class Reply:
    """One of Claude's replies: when, by which model, its tokens, the issues its work names
    (in order), and where it worked."""

    at: datetime
    model: str
    tokens: Tokens
    fast: bool = False
    names: tuple[int, ...] = ()
    branch: int | None = None  # the issue whose branch the session was on
    place: Place = Place()

    def cost(self, prices: PriceHistory) -> Decimal | None:
        """In dollars; None when its model has no prices kept."""
        price = prices.price(self.model, self.at.date(), self.tokens.prompt)
        if price is None:
            return None
        cost = price.cost(self.tokens)
        return cost * FAST if self.fast else cost


class IssueNames:
    """The issues a piece of Claude's work names, by the patterns its commands use, and the
    worktree it works in (#293)."""

    PATTERNS: ClassVar[tuple[re.Pattern[str], ...]] = (
        re.compile(r"github\.py\s+(?:comment|title|show|close|pr|merge)\s+(\d+)"),
        re.compile(r"\bissues/(\d+)\b"),
        re.compile(r"\bfeature/(\d+)-"),
    )
    BRANCH: ClassVar[re.Pattern[str]] = re.compile(r"^(?:feature|fix|chore)/(\d+)-")
    WORKTREE: ClassVar[re.Pattern[str]] = re.compile(r"(?<![\w.-])worktrees[/\\]+([\w.-]+)")

    @classmethod
    def worktree(cls, where: str) -> str | None:
        """The worktree `where` names, by its folder in a `worktrees` folder: the agent
        manager's, named after its issue, <worktree_dir>/<issue> (#387): "/c/git/worktrees/256";
        or another, a chore's or the Claude app's, `.claude/worktrees/<name>` (#302). None when
        it names several: a look over them, as a clean-up takes, is work in none."""
        found = set(cls.WORKTREE.findall(where))
        return found.pop() if len(found) == 1 else None

    @classmethod
    def in_text(cls, text: str) -> tuple[int, ...]:
        found = sorted(
            (match.start(), int(match[1]))
            for pattern in cls.PATTERNS
            for match in pattern.finditer(text)
        )
        return tuple(number for _, number in found)

    @classmethod
    def of_branch(cls, branch: str | None) -> int | None:
        match = cls.BRANCH.match(branch or "")
        return int(match[1]) if match else None


@dataclass(frozen=True, slots=True)
class Folder:
    """A session's own folder, the one it was started in, whose branch its log stamps on
    every reply (#293). Its tools write it "C:\\git\\Everest-Game", "C:/git/Everest-Game"
    or, in Git Bash, "/c/git/Everest-Game", in any case."""

    path: str  # "" when the log doesn't say

    def place(self, where: str) -> Place:
        """Where a reply worked, by `where`: the commands it ran and the paths its tools were
        given. In this folder when they name a path in it, its own worktree included (an
        agent's, an app session's)."""
        worktree = IssueNames.worktree(where)
        if worktree is not None and worktree != IssueNames.worktree(self.path):
            return Place(worktree=worktree)
        spelled = re.sub(r"[\\/]+", "/", where).lower()
        return Place(own_folder=bool(self.path) and self._spelled().search(spelled) is not None)

    def _spelled(self) -> re.Pattern[str]:
        path = re.sub(r"[\\/]+", "/", self.path).rstrip("/").lower()
        spellings = [path]
        if re.match(r"[a-z]:/", path):  # Git Bash's /c/git for C:\git
            spellings.append(f"/{path[0]}{path[2:]}")
        either = "|".join(re.escape(spelling) for spelling in spellings)
        return re.compile(rf"(?<![\w.-])(?:{either})(?![\w.-])")


class SessionLog:
    """A session's log: its replies, once each. Claude Code writes a reply as several
    entries (one per block of it), each with the reply's usage: the last one counts. In a
    long session it also writes older entries again, each copy stamped with the branch
    checked out then, so a reply's branch is its first entry's, from when it was made
    (#413). The session's own folder is its first reply's `cwd` (#293)."""

    # what in a tool's input names an issue: a command, or a page it reads (#302)
    NAMED: ClassVar[tuple[str, ...]] = ("command", "url")
    # what in a tool's input says where it worked: a command, or the paths it was given
    WHERE: ClassVar[tuple[str, ...]] = (
        "command",
        "file_path",
        "notebook_path",
        "path",
        "cwd",
        "files",  # SendUserFile's
        "paths",
    )

    def __init__(self, path: Path) -> None:
        self.path = path

    def replies(self) -> list[Reply]:
        last: dict[str, Mapping[str, Any]] = {}
        branch: dict[str, str | None] = {}
        names: dict[str, list[int]] = {}
        where: dict[str, list[str]] = {}
        folder: Folder | None = None
        with self.path.open(encoding="utf-8") as file:
            for line in file:
                if '"usage"' not in line:  # not a reply: skipped unparsed, logs grow large
                    continue
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue  # a line being written
                if entry.get("type") != "assistant" or not entry.get("message", {}).get("usage"):
                    continue
                key = f"{entry['message'].get('id')}|{entry.get('requestId')}"
                last[key] = entry
                branch.setdefault(key, entry.get("gitBranch"))
                if folder is None and entry.get("cwd"):
                    folder = Folder(entry["cwd"])
                inputs = self._inputs(entry["message"])
                names.setdefault(key, []).extend(self._named(inputs))
                where.setdefault(key, []).extend(self._where(inputs))
        own = folder or Folder("")
        return [
            self._reply(entry, tuple(names[key]), branch[key], own.place("\n".join(where[key])))
            for key, entry in last.items()
        ]

    @staticmethod
    def _inputs(message: Mapping[str, Any]) -> list[Any]:
        """The inputs of the tools a reply used."""
        content = message.get("content")
        if not isinstance(content, list):
            return []
        return [
            block.get("input")
            for block in content
            if isinstance(block, dict) and block.get("type") == "tool_use"
        ]

    @classmethod
    def _named(cls, inputs: Sequence[Any]) -> list[int]:
        """The issues the commands and the pages read name, not what was written (#302)."""
        return list(IssueNames.in_text("\n".join(cls._given(inputs, cls.NAMED))))

    @classmethod
    def _where(cls, inputs: Sequence[Any]) -> list[str]:
        """Where the tools worked: the commands run and the paths given, not what was
        written (#293)."""
        return cls._given(inputs, cls.WHERE)

    @staticmethod
    def _given(inputs: Sequence[Any], keys: Sequence[str]) -> list[str]:
        """The text the tools were given under `keys`, a list's items each."""
        given = [one.get(key) for one in inputs if isinstance(one, dict) for key in keys]
        listed = [
            item for value in given for item in (value if isinstance(value, list) else [value])
        ]
        return [text for text in listed if isinstance(text, str)]

    @staticmethod
    def _reply(
        entry: Mapping[str, Any], names: tuple[int, ...], branch: str | None, place: Place
    ) -> Reply:
        usage = entry["message"]["usage"]
        cache = usage.get("cache_creation") or {}
        written = usage.get("cache_creation_input_tokens") or 0
        one_hour = cache.get("ephemeral_1h_input_tokens", 0 if cache else written)
        tokens = Tokens(
            input=usage.get("input_tokens") or 0,
            output=usage.get("output_tokens") or 0,
            cache_read=usage.get("cache_read_input_tokens") or 0,
            cache_write_5m=cache.get("ephemeral_5m_input_tokens", 0),
            cache_write_1h=one_hour,
        )
        return Reply(
            at=datetime.fromisoformat(entry["timestamp"]),
            model=entry["message"].get("model", ""),
            tokens=tokens,
            fast=usage.get("speed") == "fast",
            names=names,
            branch=IssueNames.of_branch(branch),
            place=place,
        )


@dataclass(slots=True)
class Counting:
    """One session's replies counted in turn, oldest first: the last issue it named, and the
    worktree it works in, None while it's in its own folder (#293)."""

    named: int | None = None
    worktree: str | None = None

    def issue(self, reply: Reply) -> int | None:
        """The issue `reply` counts for (None: upkeep), as the module's docstring says."""
        if reply.place.worktree is not None:
            self.worktree = reply.place.worktree
        elif reply.place.own_folder:
            self.worktree = None
        if reply.names:
            self.named = reply.names[-1]
        elif reply.place.worktree is not None:
            self.named = reply.place.issue  # none for a worktree of no issue (#302)
        elif self.worktree is None and reply.branch is not None:
            return reply.branch  # its own folder's branch: true of its work only there
        return self.named


@dataclass(slots=True)
class IssueCost:
    """What the work on an issue took."""

    number: int
    dollars: Decimal = Decimal(0)
    tokens: Tokens = field(default_factory=Tokens)
    replies: int = 0
    by_model: dict[str, Decimal] = field(default_factory=dict)
    unpriced: dict[str, int] = field(default_factory=dict)  # model -> its replies, no prices

    def add(self, reply: Reply, cost: Decimal | None) -> None:
        self.replies += 1
        self.tokens += reply.tokens
        if cost is None:
            self.unpriced[reply.model] = self.unpriced.get(reply.model, 0) + 1
            return
        self.dollars += cost
        self.by_model[reply.model] = self.by_model.get(reply.model, Decimal(0)) + cost

    def summary(self) -> str:
        """ "Issue 390: $12.40 (claude-opus-5-5: $12.40), 380 replies, 21.3M tokens"."""
        models = ", ".join(f"{model}: ${cost:.2f}" for model, cost in sorted(self.by_model.items()))
        tokens = self.tokens.prompt + self.tokens.output
        text = (
            f"Issue {self.number}: ${self.dollars:.2f} ({models or 'nothing priced'}), "
            f"{self.replies} replies, {tokens / 1_000_000:.1f}M tokens"
        )
        if self.unpriced:
            missing = ", ".join(f"{model} ({n})" for model, n in sorted(self.unpriced.items()))
            text += f"; no prices kept for {missing}"
        return text


class Ledger:
    """Every reply in the logs, counted for its issue as the module's docstring says."""

    def __init__(self, logs: Sequence[Path], prices: PriceHistory) -> None:
        self._logs = logs
        self._prices = prices

    def counted(self) -> Iterator[tuple[int | None, Reply]]:
        """Each reply with the issue it counts for (None: upkeep), session by session."""
        for log in self._logs:
            counting = Counting()
            for reply in sorted(SessionLog(log).replies(), key=lambda reply: reply.at):
                yield counting.issue(reply), reply

    def issue(self, number: int, pulls: Iterable[int] = ()) -> IssueCost:
        """What `number` took, its `pulls` (the PRs that close it) included."""
        counted_for = {number, *pulls}
        found = IssueCost(number)
        for counted, reply in self.counted():
            if counted in counted_for:
                found.add(reply, reply.cost(self._prices))
        return found


def issue_cost(number: int, pulls: Iterable[int] = ()) -> IssueCost:
    """What `number` took on this machine, from its logs at the kept prices."""
    logs = session_logs(worktrees(), under=[agents_folder(), app_worktrees()])
    return Ledger(logs, PriceHistory.load()).issue(number, pulls)


# --- the title's prefixes ------------------------------------------------------------------


def estimate_text(dollars: Decimal) -> str:
    """An estimate to one significant figure, "~$40", "~$0.5": precision would be false."""
    rounded = float(f"{float(dollars):.1g}")
    return f"~${rounded:g}"


def actual_text(dollars: Decimal) -> str:
    """What it took, "$62", or "$0.40" under a dollar."""
    return f"${dollars:.0f}" if dollars >= 1 else f"${dollars:.2f}"


@dataclass(frozen=True, slots=True)
class Title:
    """An issue's title with its cost prefixes (#390): "[$62] [~$40] Location rule…", the
    actual one once the work is done, the estimate from the first comment on."""

    PREFIXES: ClassVar[re.Pattern[str]] = re.compile(
        r"^(?:\[(?P<actual>\$[\d.]+)\]\s*)?(?:\[(?P<estimate>~\$[\d.]+)\]\s*)?(?P<rest>.*)$", re.S
    )

    rest: str
    estimate: str | None = None
    actual: str | None = None

    @classmethod
    def parse(cls, title: str) -> Title:
        match = cls.PREFIXES.match(title)
        assert match is not None  # the pattern matches any title
        return cls(match["rest"], match["estimate"], match["actual"])

    def __str__(self) -> str:
        prefixes = [f"[{text}]" for text in (self.actual, self.estimate) if text]
        return " ".join([*prefixes, self.rest])
