"""Stand-ins the scripts' tests share."""

import subprocess
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True, slots=True)
class Worktrees:
    """A repository's checkouts on one machine, in real git (#307): its main checkout, a
    Claude app session's worktree in its .claude/worktrees, and an agent's in worktrees/307
    beside it, as the agent manager makes them. The `worktrees` fixture makes them."""

    checkout: Path
    app: Path
    agent: Path

    @classmethod
    def make(cls, root: Path) -> Worktrees:
        """In `root`, with none of the developer's git settings (the `plain_git` fixture)."""
        checkout = root / "Everest-Game"
        made = cls(
            checkout,
            checkout / ".claude" / "worktrees" / "vigilant-panini-aa1333",
            root / "worktrees" / "307",
        )
        for args in (
            ["init", "-q", "-b", "main", str(checkout)],
            ["-C", str(checkout), "commit", "-q", "--allow-empty", "-m", "start"],
            ["-C", str(checkout), "worktree", "add", "-q", "-b", "claude/x", str(made.app)],
            ["-C", str(checkout), "worktree", "add", "-q", "-b", "feature/307-x", str(made.agent)],
        ):
            subprocess.run(["git", *args], check=True, capture_output=True)
        return made


class FakeGit:
    """A stand-in for subprocess.run with `git -C <path>` (scripts/handoff.py, #399): what
    each command prints, by its words after the path, or by "<path>: <words>" for one
    worktree. A command it doesn't know fails, as git does for a ref that isn't there; one in
    `refusals` fails saying that."""

    def __init__(self, answers: dict[str, str], refusals: dict[str, str] | None = None) -> None:
        self.answers = answers
        self.refusals = refusals or {}
        self.commands: list[str] = []

    def __call__(self, command: Sequence[str], **_: object) -> subprocess.CompletedProcess[str]:
        assert list(command[:2]) == ["git", "-C"]
        path, words = command[2].replace("\\", "/"), " ".join(command[3:])
        self.commands.append(words)
        out = self.answers.get(f"{path}: {words}", self.answers.get(words))
        if out is None:
            said = self.refusals.get(words, "fatal: no such thing")
            return subprocess.CompletedProcess(command, 1, "", said)
        return subprocess.CompletedProcess(command, 0, out + "\n", "")
