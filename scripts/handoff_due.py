"""Asks Claude for the handoff before Claude Code compacts the conversation (#349).

    .claude/settings.json runs it as a Stop hook, when Claude ends a turn.

Claude Code compacts a conversation by itself once it fills the auto-compact window (about
967K tokens for the models with a 1M context, or what `/autocompact` sets), or a share of it
that CLAUDE_AUTOCOMPACT_PCT_OVERRIDE sets: Claude can't type `/compact`, and nobody needs to.
What has to come first is the handoff (.claude/skills/handoff/SKILL.md, #399), so that this
session after compaction, or one on any machine, carries on. So this reads how big the
conversation is from the transcript, the tokens of Claude's last answer, and once that passes
80% of where it compacts it sends Claude back to run the handoff. Once per stretch between
compactions: when the conversation is below the line again (it was compacted), it asks again
the next time it's past it.

The session manager's agents (#387) aren't asked (#441). In an agent's `claude -p` run a turn
ends only when the run does, or waits for a background task, never just before a compaction;
its last comment is its handoff, and the skill would write the memory every worktree shares.
"""

import json
import os
import re
import sys
import tempfile
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import IO, Any, ClassVar

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))  # run as a hook, it still finds scripts

from scripts.agents import AgentPower, CompactShare  # noqa: E402


@dataclass(frozen=True, slots=True)
class Answer:
    """One of Claude's answers in the transcript: the model that wrote it, and how big the
    conversation was then."""

    model: str
    tokens: int

    TOKENS: ClassVar[tuple[str, ...]] = (
        "input_tokens",
        "cache_creation_input_tokens",
        "cache_read_input_tokens",
        "output_tokens",
    )

    @classmethod
    def last(cls, transcript: Path, block: int = 1 << 20) -> Answer | None:
        """Claude's last answer; a subagent's don't count. It reads back from the end, as a
        long session's transcript is big."""
        try:
            file = transcript.open("rb")
        except OSError:
            return None
        with file:
            end = file.seek(0, os.SEEK_END)
            rest = b""
            while end > 0:
                start = max(0, end - block)
                file.seek(start)
                lines = (file.read(end - start) + rest).split(b"\n")
                end = start
                rest = lines.pop(0) if end > 0 else b""  # maybe cut short: the block before ends it
                for line in reversed(lines):
                    if found := cls._parse(line):
                        return found
        return None

    @classmethod
    def _parse(cls, line: bytes) -> Answer | None:
        """The answer on the line, if it's one of the main conversation's."""
        if b'"usage"' not in line:
            return None
        try:
            entry = json.loads(line)
        except ValueError:  # the line being written
            return None
        message = entry.get("message")
        if entry.get("type") != "assistant" or entry.get("isSidechain"):
            return None
        if not isinstance(message, dict):
            return None
        usage = message.get("usage")
        if not isinstance(usage, dict):
            return None
        return cls(str(message.get("model", "")), sum(usage.get(name) or 0 for name in cls.TOKENS))


class AutoCompact:
    """Where Claude Code compacts a conversation, found as it finds it: from the environment,
    and from the first of the settings `files` that says (local, project, user)."""

    DEFAULT: ClassVar[int] = 967_000  # where the models with a native 1M context compact
    SMALL: ClassVar[int] = 200_000  # where they compact with CLAUDE_CODE_DISABLE_1M_CONTEXT=1
    WINDOW_ENV: ClassVar[str] = "CLAUDE_CODE_AUTO_COMPACT_WINDOW"

    def __init__(self, env: Mapping[str, str], files: Sequence[Path]) -> None:
        self._env = env
        self._files = files

    def at(self, model: str) -> int:
        """Where it compacts this model's conversation, in tokens: at the window, or earlier
        at the share of it the environment sets (#399: 20 compacts at a fifth, long before
        the hook's 80% of all of it)."""
        return CompactShare.from_env(self._env).of(self.window(model))

    def window(self, model: str) -> int:
        """The environment's window, then one set for the model (`/autocompact` saves one),
        then one for every model; "auto" means the default."""
        if self._env.get(self.WINDOW_ENV, "").isdigit():
            return int(self._env[self.WINDOW_ENV])
        found = [self._settings(path) for path in self._files]
        for data in found:
            models = data.get("modelSettings")
            for name, its in (models if isinstance(models, dict) else {}).items():
                # the canonical name also covers its dated and [1m] spellings
                if not re.fullmatch(re.escape(name) + r"(-\d{8})?(\[1m\])?", model):
                    continue
                if isinstance(its, dict) and (tokens := self._tokens(its.get("autoCompactWindow"))):
                    return tokens
        for data in found:
            if (tokens := self._tokens(data.get("autoCompactWindow"))) is not None:
                return tokens
        if self._env.get("CLAUDE_CODE_DISABLE_1M_CONTEXT") == "1":
            return self.SMALL
        return self.DEFAULT

    @staticmethod
    def _settings(path: Path) -> dict[str, Any]:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except OSError, ValueError:
            return {}
        return data if isinstance(data, dict) else {}

    @staticmethod
    def _tokens(value: Any) -> int | None:
        return value if isinstance(value, int) and not isinstance(value, bool) else None


class StopHook:
    """Run when Claude ends a turn: past 80% of where Claude Code compacts, it sends Claude
    back to run the handoff, once per stretch between compactions."""

    HANDOFF_AT: ClassVar[float] = 0.8  # of where it compacts
    SKILL: ClassVar[str] = ".claude/skills/handoff/SKILL.md"

    def __init__(
        self,
        env: Mapping[str, str] = os.environ,
        home: Path | None = None,
        asked_dir: Path | None = None,
    ) -> None:
        self._env = env
        self._home = home or Path.home()
        self._asked_dir = asked_dir or Path(tempfile.gettempdir())

    def run(self, stdin: IO[str] = sys.stdin, stdout: IO[str] = sys.stdout) -> None:
        hook = json.load(stdin)
        if hook.get("stop_hook_active"):  # another Stop hook keeps Claude going: next time
            return
        if AgentPower.of_agent(self._env) is not None:  # as the module's docstring says
            return
        answer = Answer.last(Path(hook["transcript_path"]))
        if answer is None:
            return
        full = AutoCompact(self._env, self._files(Path(hook["cwd"]))).at(answer.model)
        asked = self._asked_dir / f"claude-handoff-{hook['session_id']}"
        if answer.tokens < self.HANDOFF_AT * full:
            asked.unlink(missing_ok=True)
            return
        if asked.exists():
            return
        asked.touch()
        told = (
            f"The conversation is at {answer.tokens // 1000}K tokens, past {self.HANDOFF_AT:.0%} "
            f"of the {full // 1000}K at which Claude Code compacts it by itself (#349). Run the "
            f"handoff now (/handoff, as {self.SKILL} says), then carry on with what you were "
            "doing, or wait for the watcher as before. Don't ask your user to /compact: it comes "
            "by itself."
        )
        output = {"hookEventName": "Stop", "additionalContext": told}
        json.dump({"hookSpecificOutput": output}, stdout)

    def _files(self, cwd: Path) -> list[Path]:
        """Claude Code's settings files: the local, the project's and the user's."""
        project = cwd / ".claude"
        user = self._home / ".claude"
        return [project / "settings.local.json", project / "settings.json", user / "settings.json"]


if __name__ == "__main__":
    StopHook().run()
