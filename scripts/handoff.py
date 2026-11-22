"""The handoff on GitHub, so that a session on any machine carries on the work (#399).

    uv run python scripts/github.py comment 399 note.md --handoff   a handoff on the issue
    uv run python scripts/github.py handoffs                        what to carry on from
    uv run python scripts/github.py handoffs 399                    one issue's: an agent's

Claude Code keeps its memory on the machine that wrote it, so a handoff is a comment on the
issue, as any of Claude's, ending with a mark people don't see (`HandoffMark`): which machine
wrote it, when, what the issue's work had cost there, and whether that session was closing.
Its **Next** and **Waiting on** say whose move it is (`Move`, #449). A session on any
machine, of either developer, carries on from the latest one on each issue (`Handoff`), after
checking it against GitHub and git (`IssueCarry`, `IssueBranch`). What is only on this
machine (`LocalWork`) is pushed before a handoff, or said in it. The handoff that leaves CI as
the only wait carries the closing comment, so the agent manager merges with no agent once CI is
green (`Handoff.closing_comment`, #550).
"""

import re
import socket
import subprocess
import textwrap
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, ClassVar

from scripts.claude_cost import log_folder

ROOT = Path(__file__).resolve().parents[1]
Run = Callable[..., subprocess.CompletedProcess[str]]


def plural(count: int, word: str) -> str:
    return f"{count} {word}" if count == 1 else f"{count} {word}s"


class Git:
    """`git` in a checkout, or in one of its worktrees (`at`)."""

    def __init__(self, root: Path = ROOT, run: Run = subprocess.run) -> None:
        self.root = root
        self._run = run

    def run(self, *args: str, at: str | None = None) -> subprocess.CompletedProcess[str]:
        """The finished command, with what it printed and why it failed."""
        return self._run(
            ["git", "-C", at or str(self.root), *args],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )

    def out(self, *args: str, at: str | None = None) -> str:
        """What it prints, stripped; empty when it fails (a ref that isn't there, offline)."""
        done = self.run(*args, at=at)
        return str(done.stdout).strip() if done.returncode == 0 else ""

    def ok(self, *args: str, at: str | None = None) -> bool:
        return self.run(*args, at=at).returncode == 0

    def count(self, *args: str, at: str | None = None) -> int:
        """A count it prints (`rev-list --count`); 0 when it fails."""
        found = self.out(*args, at=at)
        return int(found) if found.isdigit() else 0

    def paths(self, *args: str, at: str | None = None) -> frozenset[str] | None:
        """The paths it lists with -z, each exactly as named; None when it fails."""
        done = self.run(*args, at=at)
        if done.returncode != 0:
            return None
        return frozenset(path for path in str(done.stdout).split("\0") if path)


# --- where Claude worked, and the mark that says so -----------------------------------------


@dataclass(frozen=True, slots=True)
class Machine:
    """Where Claude worked: the computer, and the checkout, named as Claude Code names the
    folder of its logs. Two clones on one computer are two machines; a checkout's worktrees
    (#387's agents) are the same one, as their logs count together (claude_cost.worktrees)."""

    host: str
    checkout: str

    @classmethod
    def here(cls, git: Git | None = None, host: str | None = None) -> Machine:
        common = (git or Git()).out("rev-parse", "--path-format=absolute", "--git-common-dir")
        main = Path(common).parent if common else ROOT
        name = re.sub(r"\s+", "-", host or socket.gethostname())
        return cls(name, log_folder(main).lower())

    def __str__(self) -> str:
        return f"{self.host} ({self.checkout})"


@dataclass(frozen=True, slots=True)
class HandoffMark:
    """The end of a handoff comment, on a line of its own that GitHub doesn't show:

        <!-- handoff host=PC checkout=c--git-x at=2026-10-12T16:20+02:00 closing=no cost=12.40 -->

    Which machine handed off and when; what the issue's work had cost there, so `title
    --done` counts every machine (#390 reads only this one's logs); and whether that session
    was closing, so a session elsewhere knows whether it may take over."""

    machine: Machine
    at: datetime
    cost: Decimal | None = None
    closing: bool = False

    PATTERN: ClassVar[re.Pattern[str]] = re.compile(r"^<!-- handoff ([^\n]*?) -->$", re.M)

    def __str__(self) -> str:
        fields = {
            "host": self.machine.host,
            "checkout": self.machine.checkout,
            "at": self.at.isoformat(timespec="minutes"),
            "closing": "yes" if self.closing else "no",
        }
        if self.cost is not None:
            fields["cost"] = f"{self.cost:.2f}"
        return "<!-- handoff " + " ".join(f"{k}={v}" for k, v in fields.items()) + " -->"

    def ending(self, text: str) -> str:
        """The text with this mark at its end."""
        return f"{text.rstrip()}\n\n{self}"

    @classmethod
    def found_in(cls, body: str) -> HandoffMark | None:
        """The last mark in a comment; None when there's no whole one."""
        marks = cls.PATTERN.findall(body)
        if not marks:
            return None
        fields = dict(field.split("=", 1) for field in marks[-1].split() if "=" in field)
        try:
            return cls(
                Machine(fields["host"], fields["checkout"]),
                datetime.fromisoformat(fields["at"]),
                Decimal(fields["cost"]) if "cost" in fields else None,
                fields.get("closing") == "yes",
            )
        except KeyError, ValueError, InvalidOperation:
            return None


@dataclass(frozen=True, slots=True)
class Move:
    """Whose move it is, as a comment's two fields say (#449, the handoff skill's format):

        **Next:** the PR (Claude's). **Waiting on:** nothing.

    or the same in the issue's language (#593): "**Дальше:** PR (ход Claude). **Ждём:**
    ничего." in Russian, "**Далі:** PR (хід Claude). **Чекаємо:** нічого." in Ukrainian.
    `next` is all the first says, `whose` the parenthesis that ends it ("Claude's",
    "bateks's", "CI's"; "ход Claude" is read as "Claude's"), and `waiting` all the second
    says; None when there's no second. `next_name` and `waiting_name` are the fields' names as
    written ("" for one that isn't there)."""

    next: str
    whose: str
    waiting: str | None
    next_name: str = "Next"
    waiting_name: str = "Waiting on"

    NEXT_NAMES: ClassVar[str] = "Next|Дальше|Далі"  # English, Russian, Ukrainian
    WAITING_NAMES: ClassVar[str] = "Waiting on|Жд[её]м|Чекаємо"
    NEXT: ClassVar[re.Pattern[str]] = re.compile(
        rf"\*\*(?P<name>{NEXT_NAMES}):\*\*[ \t]*(?P<said>.*?)[ \t]*"
        rf"(?=\*\*(?:{WAITING_NAMES}):\*\*|$)",
        re.M,
    )
    WAITING: ClassVar[re.Pattern[str]] = re.compile(
        rf"\*\*(?P<name>{WAITING_NAMES}):\*\*[ \t]*(?P<said>.*?)[ \t]*$", re.M
    )
    WHOSE: ClassVar[re.Pattern[str]] = re.compile(r"\(([^()]*)\)[\s.]*$")
    TURN: ClassVar[re.Pattern[str]] = re.compile(r"(?:ход|хід)\s+([\w-]+)", re.I)  # ход Claude
    NOTHING: ClassVar[re.Pattern[str]] = re.compile(
        r"[\W_]*(?:(?:nothing|ничего|нічого)(?!\w)|$)", re.I
    )
    CI: ClassVar[re.Pattern[str]] = re.compile(r"(?<![\w-])CI(?![\w-])")  # not ci.yml
    # not "emergency", nor "осмыслить"
    MERGE: ClassVar[re.Pattern[str]] = re.compile(r"\b(?:merge|слить|влить|злити|влити)", re.I)
    # Where a login names no one: a link's target ("[#297](https://github.com/albalaeff/…)"
    # keeps "#297"), a URL, a reference to another repository's issue ("albalaeff/x#297").
    LINK: ClassVar[re.Pattern[str]] = re.compile(r"\[(?P<text>[^\]]*)\]\([^)]*\)")
    URL: ClassVar[re.Pattern[str]] = re.compile(r"(?:https?://|www\.)[^\s<>]+", re.I)
    REFERENCE: ClassVar[re.Pattern[str]] = re.compile(r"[\w.-]+/[\w.-]+#\d+")

    @classmethod
    def of(cls, text: str) -> Move | None:
        """The move `text` states; None when it has no **Next**."""
        found = cls.NEXT.search(text)
        if found is None:
            return None
        whose = cls.WHOSE.search(found["said"])
        waiting = cls.WAITING.search(text, found.start())
        return cls(
            found["said"],
            cls._whose(whose[1]) if whose else "",
            waiting["said"] if waiting else None,
            found["name"],
            waiting["name"] if waiting else "",
        )

    @classmethod
    def _whose(cls, said: str) -> str:
        """Whose move a parenthesis says: "ход Claude" (Russian) and "хід Claude"
        (Ukrainian) as "Claude's"; anything else as written."""
        turn = cls.TURN.fullmatch(said.strip())
        return f"{turn[1]}'s" if turn else said.strip()

    @property
    def waits(self) -> bool:
        """Whether it waits on something: a person, CI. Not on "nothing", nor unsaid."""
        return self.waiting is not None and not self.NOTHING.match(self.waiting)

    @property
    def waits_on_ci(self) -> bool:
        """Whether what it waits on is CI ("CI on #528"): it was written before CI's result,
        whenever it was posted (#534)."""
        return self.waits and self.CI.search(self.waiting or "") is not None

    @property
    def names_merge(self) -> bool:
        """Whether its **Next** is the merge ("merge #541 once CI is green"): what the agent
        manager does itself once CI is green (#550)."""
        return self.MERGE.search(self.next) is not None

    @property
    def goes_on(self) -> bool:
        """Claude's move next, and nothing waited on."""
        claude_s = self.whose.replace("’", "'").lower() == "claude's"
        return claude_s and self.waiting is not None and not self.waits

    def people(self, logins: Iterable[str]) -> tuple[str, ...]:
        """Those of `logins` it waits on: the ones its **Waiting on** names ("bateks's answer").
        A login inside a link's target or a URL names no one: every link to the repository
        holds its owner's login ("CI on [#297](https://github.com/albalaeff/…)", on #284)."""
        if not self.waits:
            return ()
        said = self.LINK.sub(r"\g<text>", self.waiting or "")
        said = self.REFERENCE.sub("", self.URL.sub("", said))
        return tuple(
            login
            for login in logins
            if re.search(rf"(?<![\w-]){re.escape(login)}(?![\w-])", said, re.I)
        )

    @property
    def line(self) -> str:
        """Both fields, as a handoff says them, in its language."""
        said = f"**{self.next_name}:** {self.next}"
        return said if self.waiting is None else f"{said} **{self.waiting_name}:** {self.waiting}"


@dataclass(frozen=True, slots=True)
class Handoff:
    """A handoff on an issue: whose Claude posted it, its link, what it says (the mark left
    out), the mark, and its place among the issue's comments."""

    login: str
    url: str
    text: str
    mark: HandoffMark
    position: int

    DETAILS: ClassVar[re.Pattern[str]] = re.compile(
        r"<details>\s*(?:<summary>(?P<summary>.*?)</summary>)?(?P<body>.*?)</details>", re.S
    )
    CLOSING: ClassVar[re.Pattern[str]] = re.compile(
        r"<!-- closing -->(?P<text>.*?)<!-- /closing -->", re.S
    )

    @property
    def move(self) -> Move | None:
        return Move.of(self.text)

    @property
    def closing_comment(self) -> str | None:
        """The closing comment it carries (#550): what's posted once CI is green, between
        `<!-- closing -->` and `<!-- /closing -->`, as indented under its list item or not;
        None when it carries none."""
        found = self.CLOSING.search(self.text)
        text = textwrap.dedent(found["text"]).strip() if found else ""
        return text or None

    @property
    def claude_s_move(self) -> bool:
        """Claude goes on, waiting on nothing, and the session that said so closed: the next
        session or agent starts on it (#449). One still open goes on by itself."""
        move = self.move
        return self.mark.closing and move is not None and move.goes_on

    def brief(self) -> str:
        """What a session starting needs of it (#449): its **Next** and **Waiting on**, and
        its folded details; the rest is for people. All of it when it has neither."""
        parts = [move.line] if (move := self.move) is not None else []
        for details in self.DETAILS.finditer(self.text):
            if summary := (details["summary"] or "").strip():
                parts.append(f"{summary}:")
            parts.append(details["body"].strip())
        return "\n".join(part for part in parts if part) or self.text

    @classmethod
    def of(cls, comment: Mapping[str, Any], position: int) -> Handoff | None:
        body = str(comment.get("body") or "")
        mark = HandoffMark.found_in(body)
        if mark is None:
            return None
        text = HandoffMark.PATTERN.sub("", body).strip()
        login = str(comment["user"]["login"])
        return cls(login, str(comment.get("html_url", "")), text, mark, position)

    @classmethod
    def latest(cls, comments: Sequence[Mapping[str, Any]]) -> Handoff | None:
        """The one to carry on from."""
        for position in range(len(comments) - 1, -1, -1):
            if found := cls.of(comments[position], position):
                return found
        return None

    @classmethod
    def shares(
        cls, comments: Sequence[Mapping[str, Any]], me: str, here: Machine
    ) -> dict[str, Decimal]:
        """What the issue's work cost on each other machine, "bateks on LAPTOP-2 (…)" ->
        dollars, as the latest handoff from there says. This machine's isn't among them:
        its logs say it (claude_cost)."""
        found: dict[str, Decimal] = {}
        for position, comment in enumerate(comments):
            handoff = cls.of(comment, position)
            if handoff is None or handoff.mark.cost is None:
                continue
            if (handoff.login, handoff.mark.machine) != (me, here):
                found[f"{handoff.login} on {handoff.mark.machine}"] = handoff.mark.cost
        return found


# --- what's only on this machine -------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class LocalWork:
    """What's only on this machine, in every worktree of the checkout: uncommitted changes,
    commits that aren't on origin, stashes. A handoff pushes it, or says why it stays."""

    lines: tuple[str, ...]
    issue: int | None = None  # only what's on this issue's branch (`about`)

    BRANCHES: ClassVar[tuple[str, ...]] = (
        "for-each-ref",
        "--format=%(refname:short)%09%(upstream:short)%09%(upstream:track)",
        "refs/heads",
    )

    @classmethod
    def collect(cls, git: Git) -> LocalWork:
        found: list[str] = []
        for path, branch in cls._worktrees(git):
            changed = git.out("status", "--porcelain", at=path).splitlines()
            if changed:
                found.append(f"{plural(len(changed), 'uncommitted change')} on {branch}, in {path}")
        for line in git.out(*cls.BRANCHES).splitlines():
            name, upstream, track = (line.split("\t") + ["", ""])[:3]
            if "[gone]" in track:  # merged, and GitHub deleted it
                continue
            own = git.count("rev-list", "--count", name, "--not", "--remotes=origin")
            if not own:  # every commit of it is on some branch of origin's
                continue
            if not upstream:
                found.append(f"{name}: never pushed, {plural(own, 'commit')} of its own")
                continue
            behind = re.search(r"behind (\d+)", track)
            more = f" (and origin has {behind[1]} more)" if behind else ""
            found.append(f"{name}: {plural(own, 'commit')} not pushed{more}")
        found.extend(git.out("stash", "list").splitlines())
        return cls(tuple(found))

    @staticmethod
    def _worktrees(git: Git) -> list[tuple[str, str]]:
        """Each worktree's path and branch."""
        found: list[tuple[str, str]] = []
        for block in git.out("worktree", "list", "--porcelain").split("\n\n"):
            fields = dict(line.partition(" ")[::2] for line in block.splitlines())
            if "worktree" in fields:
                branch = fields.get("branch", "").removeprefix("refs/heads/") or "(detached)"
                found.append((fields["worktree"], branch))
        return found

    def about(self, number: int) -> LocalWork:
        """What of it names the issue's branch: an agent's own."""
        branch = IssueBranch.pattern(number)
        return LocalWork(tuple(line for line in self.lines if branch.search(line)), number)

    def text(self) -> str:
        if not self.lines:
            whose = "" if self.issue is None else f" of #{self.issue}'s"
            return f"Nothing{whose} is only on this machine."
        return "\n".join(["Only on this machine:", *(f"  - {line}" for line in self.lines)])


# --- an issue, as a session finds it ---------------------------------------------------------


@dataclass(frozen=True, slots=True)
class IssueBranch:
    """An issue's task branch (`feature/<n>-…`, docs/conventions.md → Git workflow), on
    origin and here: its commits, the subject of its latest, and how far each side is."""

    name: str
    origin: str | None  # its commit on origin; None when it isn't there
    local: str | None  # its commit here
    subject: str
    ahead: int  # commits here that origin hasn't
    behind: int  # commits on origin that aren't here
    behind_develop: int  # commits on origin/develop it hasn't got

    REFS: ClassVar[tuple[str, ...]] = (
        "for-each-ref",
        "--format=%(refname)",
        "refs/heads",
        "refs/remotes/origin",
    )

    @staticmethod
    def pattern(number: int) -> re.Pattern[str]:
        """The issue's branch by name, in a ref or in a line that names it."""
        return re.compile(rf"\b(?:feature|fix|chore)/{number}-")

    @classmethod
    def find(cls, number: int, git: Git) -> tuple[IssueBranch, ...]:
        task = cls.pattern(number)
        names: set[str] = set()
        for ref in git.out(*cls.REFS).splitlines():
            name = re.sub(r"^refs/(?:heads|remotes/origin)/", "", ref)
            if task.match(name):
                names.add(name)
        return tuple(cls._of(name, git) for name in sorted(names))

    @classmethod
    def _of(cls, name: str, git: Git) -> IssueBranch:
        origin = git.out("rev-parse", "--verify", "-q", f"refs/remotes/origin/{name}") or None
        local = git.out("rev-parse", "--verify", "-q", f"refs/heads/{name}") or None
        behind = ahead = 0
        if origin and local:
            sides = git.out("rev-list", "--left-right", "--count", f"{origin}...{local}").split()
            behind, ahead = (int(side) for side in sides) if len(sides) == 2 else (0, 0)
        tip = origin or local or ""
        subject = git.out("log", "-1", "--format=%s", tip)
        behind_develop = git.count("rev-list", "--count", f"{tip}..origin/develop")
        return cls(name, origin, local, subject, ahead, behind, behind_develop)

    def __str__(self) -> str:
        if self.origin is None:
            said = f"{self.name}: only here, never pushed, at {self._at(self.local)}"
        else:
            said = f"{self.name}: on origin at {self._at(self.origin)}; {self._here()}"
        if self.behind_develop:
            said += f"; develop has {plural(self.behind_develop, 'commit')} it hasn't"
        return said

    def _at(self, commit: str | None) -> str:
        return f"{(commit or '')[:7]} ({self.subject})"

    def _here(self) -> str:
        if self.local is None:
            return "not here"
        if self.ahead and self.behind:
            return f"here {plural(self.ahead, 'commit')} ahead and {self.behind} behind"
        if self.ahead:
            return f"here {plural(self.ahead, 'commit')} ahead"
        if self.behind:
            return f"here {plural(self.behind, 'commit')} behind"
        return "here the same"


STALE = "stale: close it, or hand it off"  # an issue in progress that nobody moves on (#449)


@dataclass(frozen=True, slots=True)
class IssueCarry:
    """One open issue as a session finds it: whose move it is (its state, as `status` says),
    the latest handoff, and what has changed since: comments, PRs, its branch."""

    number: int
    title: str
    state: str
    handoff: Handoff | None
    since: tuple[str, ...] = ()  # who commented after the handoff, in order
    pulls: tuple[str, ...] = ()  # "PR #400 open [CI: success]"
    branches: tuple[IssueBranch, ...] = ()
    last_word: str | None = None  # the link to Claude's last comment, for one without a handoff
    stale: bool = False  # in progress, and nobody moves on it (#449)
    to_move: bool = True  # a session starting moves on it; one that waits on someone, it leaves

    def lines(self, here: Machine, quoted: bool = True, full: bool = False) -> list[str]:
        """The handoff in brief (`Handoff.brief`), or whole when `full`; not `quoted`, its
        link without its text, which `show` prints. An issue the session leaves alone, as it
        waits on someone (not `to_move`, #597): its PRs and its move, no more."""
        found = [f"#{self.number} [{self.state}] {self.title}"]
        if self.stale:
            found.append(f"  {STALE}")
        if self.handoff is not None and quoted and not full and not self.to_move:
            return self._waiting(self.handoff, found)
        if self.handoff is None:
            word = (
                f"Claude's last comment: {self.last_word}"
                if self.last_word
                else "nothing from Claude"
            )
            found.append(f"  no handoff yet; {word}")
        else:
            found.append(f"  {self._handed_off(self.handoff, here)}")
            found.append(f"  since: {self._since()}")
        found.extend(f"  {pull}" for pull in self.pulls)
        found.extend(f"  {branch}" for branch in self.branches)
        if not self.branches:
            found.append("  no branch")
        if self.handoff is not None and not quoted:
            found.append(f"  {self.handoff.url}: its text is in `show {self.number}`")
        elif self.handoff is not None:
            text = self.handoff.text if full else self.handoff.brief()
            link = f"  {self.handoff.url}"
            if text != self.handoff.text:
                link += " (in brief: `handoffs --full` has it whole)"
            found.append(link)
            found.extend(f"    {line}".rstrip() for line in text.splitlines())
        return found

    def _waiting(self, handoff: Handoff, found: list[str]) -> list[str]:
        """`found` and what a session needs of an issue it leaves alone: its PRs (with CI)
        and whose move it is; `handoffs <n>` has the rest."""
        found.extend(f"  {pull}" for pull in self.pulls)
        if (move := handoff.move) is not None:
            found.append(f"  {move.line}")
        found.append(f"  {handoff.url} (`handoffs {self.number}` has the rest)")
        return found

    @staticmethod
    def _handed_off(handoff: Handoff, here: Machine) -> str:
        mark = handoff.mark
        where = f"handed off {mark.at:%Y-%m-%d %H:%M} by {handoff.login}'s Claude on {mark.machine}"
        if mark.machine == here:
            return f"{where}: this machine"
        if mark.closing:
            return f"{where}: another machine, whose session closed"
        return f"{where}: another machine, and that session went on: ask whether it's closed"

    def _since(self) -> str:
        if not self.since:
            return "nothing"
        return f"{plural(len(self.since), 'comment')} ({', '.join(self.since)})"
