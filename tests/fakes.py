"""Stand-ins the scripts' tests share."""

import subprocess
from collections.abc import Sequence


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
