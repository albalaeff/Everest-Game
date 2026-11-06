"""Asks Claude for the handoff before Claude Code compacts the conversation (#349), asks an
agent for its notes then (#155), and puts either back after.

    .claude/settings.json runs it as three hooks, which it tells apart by the event named:
    Stop, when Claude ends a turn; PostToolUse, after each of an agent's tools; SessionStart
    with the `compact` matcher, once Claude Code has compacted the conversation.

Claude Code compacts a conversation by itself once it fills the auto-compact window (about
967K tokens for the models with a 1M context, or what `/autocompact` sets), or a share of it
that CLAUDE_AUTOCOMPACT_PCT_OVERRIDE sets: Claude can't type `/compact`, and nobody needs to.
What has to come first is the handoff (.claude/skills/handoff/SKILL.md, #399), so that this
session after compaction, or one on any machine, carries on. So this reads how big the
conversation is from the transcript, the tokens of Claude's last answer, and once that passes
80% of where it compacts it sends Claude back to run the handoff. Once per stretch between
compactions: when the conversation is below the line again (it was compacted), it asks again
the next time it's past it.

The session manager's agents (#387) aren't asked for the handoff (#441). In an agent's
`claude -p` run a turn ends only when the run does, or waits for a background task, never just
before a compaction; its last comment is its handoff, and the skill would write the memory
every worktree shares. An agent is told after a tool instead, at the same line, to write its
notes in its worktree (`NOTES`): #26's agent compacted three times and read the same files
again after each, until Claude Code stopped it (#152). The summary keeps little of what was
read; the notes, written for this, come back whole. A session gets back its latest handoff on
the issue of the branch checked out.
"""

import json
import os
import re
import subprocess
import sys
import tempfile
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import IO, Any, ClassVar

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))  # run as a hook, it still finds scripts

from scripts.agents import NOTES, AgentPower, CompactShare  # noqa: E402
from scripts.claude_cost import IssueNames  # noqa: E402
from scripts.github import GitHub, repo_slug, token  # noqa: E402
from scripts.handoff import Git, Handoff, Run  # noqa: E402


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


class Hook:
    """One of Claude Code's hooks: given what Claude Code says on its stdin, it may answer with
    words for Claude (`told`), which Claude Code adds to the conversation."""

    EVENT: ClassVar[str]  # the event it's run for, as Claude Code names it

    def __init__(self, env: Mapping[str, str] = os.environ) -> None:
        self._env = env

    def run(self, stdin: IO[str] = sys.stdin, stdout: IO[str] = sys.stdout) -> None:
        self.answer(json.load(stdin), stdout)

    def answer(self, hook: Mapping[str, Any], stdout: IO[str] = sys.stdout) -> None:
        if (told := self.told(hook)) is not None:
            output = {"hookEventName": self.EVENT, "additionalContext": told}
            json.dump({"hookSpecificOutput": output}, stdout)

    def told(self, hook: Mapping[str, Any]) -> str | None:
        raise NotImplementedError

    def _project(self, hook: Mapping[str, Any]) -> Path:
        """The folder Claude Code was started in: an agent's, its worktree."""
        return Path(self._env.get("CLAUDE_PROJECT_DIR") or hook["cwd"])


class DueHook(Hook):
    """A hook that asks Claude for something past 80% of where Claude Code compacts, once per
    stretch between compactions: a file in the temp folder says it asked, and goes once the
    conversation is below the line again (it was compacted)."""

    AT: ClassVar[float] = 0.8  # of where it compacts
    ASKED: ClassVar[str]  # that file's name, before the session's id

    def __init__(
        self,
        env: Mapping[str, str] = os.environ,
        home: Path | None = None,
        asked_dir: Path | None = None,
    ) -> None:
        super().__init__(env)
        self._home = home or Path.home()
        self._asked_dir = asked_dir or Path(tempfile.gettempdir())

    def due(self, hook: Mapping[str, Any]) -> str | None:
        """How big the conversation is, said for Claude, when it's time to ask; else None."""
        answer = Answer.last(Path(hook["transcript_path"]))
        if answer is None:
            return None
        full = AutoCompact(self._env, self._files(Path(hook["cwd"]))).at(answer.model)
        asked = self._asked_dir / f"{self.ASKED}-{hook['session_id']}"
        if answer.tokens < self.AT * full:
            asked.unlink(missing_ok=True)
            return None
        if asked.exists():
            return None
        asked.touch()
        return (
            f"The conversation is at {answer.tokens // 1000}K tokens, past {self.AT:.0%} of the "
            f"{full // 1000}K at which Claude Code compacts it by itself"
        )

    def _files(self, cwd: Path) -> list[Path]:
        """Claude Code's settings files: the local, the project's and the user's."""
        project = cwd / ".claude"
        user = self._home / ".claude"
        return [project / "settings.local.json", project / "settings.json", user / "settings.json"]


class StopHook(DueHook):
    """Run when Claude ends a turn: past 80% of where Claude Code compacts, it sends a session
    back to run the handoff, once per stretch between compactions."""

    EVENT: ClassVar[str] = "Stop"
    ASKED: ClassVar[str] = "claude-handoff"
    SKILL: ClassVar[str] = ".claude/skills/handoff/SKILL.md"

    def told(self, hook: Mapping[str, Any]) -> str | None:
        if hook.get("stop_hook_active"):  # another Stop hook keeps Claude going: next time
            return None
        if AgentPower.of_agent(self._env) is not None:  # as the module's docstring says
            return None
        if (past := self.due(hook)) is None:
            return None
        return (
            f"{past} (#349). Run the handoff now (/handoff, as {self.SKILL} says), then carry "
            "on with what you were doing, or wait for the watcher as before. Don't ask your "
            "user to /compact: it comes by itself."
        )


class NotesHook(DueHook):
    """Run after each of an agent's tools (#155): past 80% of where Claude Code compacts, it
    tells the agent to write its notes, once per stretch between compactions. A session isn't
    told: the Stop hook asks it for the handoff."""

    EVENT: ClassVar[str] = "PostToolUse"
    ASKED: ClassVar[str] = "claude-notes"

    def told(self, hook: Mapping[str, Any]) -> str | None:
        if AgentPower.of_agent(self._env) is None:
            return None
        if (past := self.due(hook)) is None:
            return None
        return (
            f"{past} (#155). Write your notes now, in {self._project(hook) / NOTES}, all of "
            "them anew: the plan, what's done and what's next, the decisions and why, and the "
            "facts taken from the files you read (values, `file:line`, names and signatures), so "
            "that none needs reading again. Once Claude Code has compacted the conversation, "
            "they come back whole, where its summary keeps little. Then carry on with what you "
            "were doing."
        )


def connect(git: Git) -> GitHub:
    """GitHub as the token's account, on the repository `origin` names."""
    return GitHub(repo_slug(git.out("remote", "get-url", "origin")), token())


class PutBack(Hook):
    """Run once Claude Code has compacted the conversation (#155): it puts back what was
    written for then: an agent's notes, or a session's latest handoff on the issue of the
    branch checked out (`feature/155-…`)."""

    EVENT: ClassVar[str] = "SessionStart"

    def __init__(
        self,
        env: Mapping[str, str] = os.environ,
        run: Run = subprocess.run,
        github: Callable[[Git], GitHub] = connect,
    ) -> None:
        super().__init__(env)
        self._run = run
        self._github = github

    def told(self, hook: Mapping[str, Any]) -> str | None:
        if hook.get("source") != "compact":  # started, resumed or cleared: nothing written for it
            return None
        if AgentPower.of_agent(self._env) is not None:
            return self._notes(self._project(hook) / NOTES)
        return self._handoff(Git(self._project(hook), self._run))

    @staticmethod
    def _notes(path: Path) -> str | None:
        """None when the agent wrote none: it carries on from the summary and its issue."""
        try:
            notes = path.read_text(encoding="utf-8").strip()
        except OSError, UnicodeDecodeError:
            return None
        if not notes:
            return None
        return (
            f"Claude Code has compacted the conversation. Your notes from before, {path}, "
            f"follow: carry on from them, and read again only what they lack.\n\n{notes}"
        )

    def _handoff(self, git: Git) -> str | None:
        """None on develop, on a branch of no issue, on an issue with no handoff, or when
        GitHub can't be reached."""
        number = IssueNames.of_branch(git.out("rev-parse", "--abbrev-ref", "HEAD"))
        if number is None:
            return None
        try:
            comments = self._github(git).call("GET", f"issues/{number}/comments?per_page=100")
        except SystemExit, httpx.HTTPError:  # no token, GitHub's error, offline
            return None
        if (handoff := Handoff.latest(comments)) is None:
            return None
        return (
            f"Claude Code has compacted the conversation. The latest handoff on #{number}, "
            f"{handoff.url}, follows: carry on from it.\n\n{handoff.brief()}"
        )


HOOKS: dict[str, Callable[[], Hook]] = {hook.EVENT: hook for hook in (StopHook, NotesHook, PutBack)}


def main(stdin: IO[str] = sys.stdin, stdout: IO[str] = sys.stdout) -> None:
    """The hook for the event Claude Code names; none for another."""
    hook = json.load(stdin)
    if (made := HOOKS.get(str(hook.get("hook_event_name")))) is not None:
        made().answer(hook, stdout)


if __name__ == "__main__":
    main()
