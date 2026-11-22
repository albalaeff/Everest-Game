"""scripts/handoff_due.py: the handoff, asked for before the conversation is compacted (#349),
an agent's notes then (#155), and either put back after."""

import io
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

import httpx
import pytest

from scripts.agents import NOTES, AgentPower, CompactShare
from scripts.github import GitHub
from scripts.handoff import Git
from scripts.handoff_due import Answer, AutoCompact, NotesHook, PutBack, StopHook
from tests.fakes import FakeGit

pytestmark = pytest.mark.unit

ROOT = Path(__file__).resolve().parent.parent
OPUS = "claude-opus-5-5"


def answer(tokens: int, model: str = OPUS, sidechain: bool = False) -> dict[str, Any]:
    """A line of the transcript: Claude's answer, and how big the conversation was."""
    usage = {
        "input_tokens": 2,
        "cache_creation_input_tokens": 1000,
        "cache_read_input_tokens": tokens - 1502,
        "output_tokens": 500,
    }
    message = {"model": model, "role": "assistant", "usage": usage}
    return {"type": "assistant", "isSidechain": sidechain, "message": message}


def transcript(tmp_path: Path, *lines: dict[str, Any]) -> Path:
    path = tmp_path / "session.jsonl"
    path.write_text("".join(json.dumps(line) + "\n" for line in lines), encoding="utf-8")
    return path


# --- how big the conversation is --------------------------------------------------------------


def test_the_last_answer_tells_the_model_and_all_its_tokens(tmp_path: Path) -> None:
    path = transcript(
        tmp_path,
        answer(100_000),
        answer(200_000),
        {"type": "user", "message": {"role": "user", "content": "go on"}},
    )
    assert Answer.last(path) == Answer(OPUS, 200_000)


def test_a_subagents_answers_dont_count(tmp_path: Path) -> None:
    path = transcript(tmp_path, answer(300_000), answer(20_000, sidechain=True))
    assert Answer.last(path) == Answer(OPUS, 300_000)


def test_it_reads_back_from_the_end_over_long_lines(tmp_path: Path) -> None:
    tool_output = {"type": "user", "message": {"role": "user", "content": "x" * 5000}}
    path = transcript(tmp_path, answer(1_000), answer(400_000), tool_output, tool_output)
    assert Answer.last(path, block=64) == Answer(OPUS, 400_000)


def test_no_answer_yet_or_no_transcript(tmp_path: Path) -> None:
    assert Answer.last(transcript(tmp_path, {"type": "summary"})) is None
    assert Answer.last(tmp_path / "missing.jsonl") is None


# --- where Claude Code compacts ---------------------------------------------------------------


def settings(tmp_path: Path, name: str, data: dict[str, Any]) -> Path:
    path = tmp_path / name
    path.write_text(json.dumps(data), encoding="utf-8")
    return path


def test_the_window_tuned_for_the_model_by_default(tmp_path: Path) -> None:
    assert AutoCompact({}, [tmp_path / "none.json"]).window(OPUS) == AutoCompact.DEFAULT == 967_000
    assert AutoCompact({"CLAUDE_CODE_DISABLE_1M_CONTEXT": "1"}, []).window(OPUS) == 200_000


def test_the_environment_wins(tmp_path: Path) -> None:
    files = [settings(tmp_path, "user.json", {"autoCompactWindow": 500_000})]
    env = {"CLAUDE_CODE_AUTO_COMPACT_WINDOW": "300000"}
    assert AutoCompact(env, files).window(OPUS) == 300_000


def test_a_window_set_for_the_model_beats_one_for_every_model(tmp_path: Path) -> None:
    local = settings(tmp_path, "local.json", {"autoCompactWindow": 600_000})
    user = settings(
        tmp_path,
        "user.json",
        {"modelSettings": {OPUS: {"autoCompactWindow": 400_000}, "claude-fable-5-1": {}}},
    )
    found = AutoCompact({}, [local, user])
    assert found.window(f"{OPUS}-20261001") == 400_000
    assert found.window("claude-sonnet-5-5") == 600_000


def test_the_first_settings_file_wins_and_auto_means_the_default(tmp_path: Path) -> None:
    local = settings(tmp_path, "local.json", {"autoCompactWindow": 250_000})
    user = settings(tmp_path, "user.json", {"autoCompactWindow": 700_000})
    auto = settings(tmp_path, "auto.json", {"modelSettings": {OPUS: {"autoCompactWindow": "auto"}}})
    assert AutoCompact({}, [local, user]).window(OPUS) == 250_000
    assert AutoCompact({}, [auto]).window(OPUS) == AutoCompact.DEFAULT


def test_it_compacts_at_the_window_or_at_the_share_of_it_the_environment_sets(
    tmp_path: Path,
) -> None:
    # #399: with CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=20 Claude Code compacts at a fifth of the
    # window, long before the hook's 80% of all of it (scripts/agents.py reads the share).
    files = [settings(tmp_path, "user.json", {"autoCompactWindow": 500_000})]
    assert AutoCompact({}, files).at(OPUS) == 500_000
    assert AutoCompact(CompactShare(20).env(), files).at(OPUS) == 100_000
    assert AutoCompact(CompactShare(20).env(), []).at(OPUS) == 193_400


# --- the hook ---------------------------------------------------------------------------------


class Session:
    """One Claude Code session: its transcript, and the hooks run at the end of each turn,
    after each tool, and once it's compacted."""

    def __init__(self, tmp_path: Path) -> None:
        self.tmp_path = tmp_path
        self.home = tmp_path / "home"
        self.project = tmp_path / "project"
        self.asked = tmp_path / "asked"
        for folder in (self.home, self.project, self.asked):
            folder.mkdir()
        self.lines: list[dict[str, Any]] = []
        self.env: dict[str, str] = {"CLAUDE_PROJECT_DIR": str(self.project)}

    @classmethod
    def agent(cls, tmp_path: Path) -> Session:
        """An agent's: the manager's power and share in its environment (#441), 241K of the
        window where it compacts, and 80% of that past 193K."""
        session = cls(tmp_path)
        session.env.update({**AgentPower("opus", "max").env(), **CompactShare(25).env()})
        return session

    def hook(self, event: str = "Stop", **more: Any) -> dict[str, Any]:
        """What Claude Code gives the hook on its stdin."""
        return {
            "session_id": "abc123",
            "transcript_path": str(transcript(self.tmp_path, *self.lines)),
            "cwd": str(self.project),
            "hook_event_name": event,
            **more,
        }

    def stop(self, tokens: int, continuing: bool = False) -> dict[str, Any] | None:
        """Claude ends a turn with the conversation this big; what the hook answers."""
        self.lines.append(answer(tokens))
        hook, out = io.StringIO(json.dumps(self.hook(stop_hook_active=continuing))), io.StringIO()
        StopHook(self.env, self.home, self.asked).run(hook, out)
        return said(out)

    def tool(self, tokens: int) -> dict[str, Any] | None:
        """Claude used a tool with the conversation this big; what the hook answers."""
        self.lines.append(answer(tokens))
        hook = self.hook("PostToolUse", tool_name="Read", tool_input={"file_path": "spec.md"})
        out = io.StringIO()
        NotesHook(self.env, self.home, self.asked).answer(hook, out)
        return said(out)

    def compacted(self, source: str = "compact", put_back: PutBack | None = None) -> str | None:
        """Claude Code compacted the conversation (or started it: `source`); what the hook
        puts back."""
        self.lines.append(answer(40_000))
        out = io.StringIO()
        (put_back or PutBack(self.env)).answer(self.hook("SessionStart", source=source), out)
        found = said(out)
        if found is None:
            return None
        assert found["hookSpecificOutput"]["hookEventName"] == "SessionStart"
        return str(found["hookSpecificOutput"]["additionalContext"])


def said(out: io.StringIO) -> dict[str, Any] | None:
    """What a hook answered on its stdout; None when it said nothing."""
    return json.loads(out.getvalue()) if out.getvalue() else None


def test_below_80_percent_of_the_window_it_lets_claude_stop(tmp_path: Path) -> None:
    assert Session(tmp_path).stop(773_000) is None


def test_past_it_claude_is_asked_for_the_handoff_once(tmp_path: Path) -> None:
    session = Session(tmp_path)
    asked = session.stop(774_000)
    assert asked is not None
    told = asked["hookSpecificOutput"]
    assert told["hookEventName"] == "Stop"
    assert ".claude/skills/handoff/SKILL.md" in told["additionalContext"]
    assert (ROOT / ".claude" / "skills" / "handoff" / "SKILL.md").is_file()
    assert "774K" in told["additionalContext"] and "967K" in told["additionalContext"]
    assert session.stop(800_000) is None  # the handoff is done: not again


def test_with_a_percentage_override_it_asks_before_that(tmp_path: Path) -> None:
    session = Session(tmp_path)
    session.env["CLAUDE_AUTOCOMPACT_PCT_OVERRIDE"] = "20"
    assert session.stop(150_000) is None
    asked = session.stop(160_000)  # past 80% of the 193K where it compacts
    assert asked is not None and "193K" in asked["hookSpecificOutput"]["additionalContext"]


def test_after_compaction_it_asks_again_next_time(tmp_path: Path) -> None:
    session = Session(tmp_path)
    assert session.stop(780_000) is not None
    assert session.stop(60_000) is None  # compacted
    assert session.stop(790_000) is not None


def test_not_while_another_stop_hook_keeps_claude_going(tmp_path: Path) -> None:
    session = Session(tmp_path)
    assert session.stop(900_000, continuing=True) is None
    assert session.stop(900_000) is not None


def test_an_agent_is_not_asked(tmp_path: Path) -> None:
    # #441: in an agent's `claude -p` run a turn ends only when the run does, or waits for a
    # background task: never just before Claude Code compacts. Its last comment is its
    # handoff, and the skill would write the memory every worktree shares.
    assert Session.agent(tmp_path).stop(230_000) is None  # past 80% of the 241K where it compacts


def test_the_projects_settings_set_its_window(tmp_path: Path) -> None:
    session = Session(tmp_path)
    (session.project / ".claude").mkdir()
    (session.project / ".claude" / "settings.json").write_text(
        json.dumps({"autoCompactWindow": 200_000}), encoding="utf-8"
    )
    assert session.stop(170_000) is not None


# --- an agent's notes (#155) ------------------------------------------------------------------


def test_past_80_percent_an_agent_is_told_after_a_tool_to_write_its_notes_once(
    tmp_path: Path,
) -> None:
    # #152: #26's agent compacted at 298K, 250K and 270K, and read spec.md and the facts
    # again each time, until Claude Code stopped it. Its turn never ends before a compaction,
    # so it's told after a tool.
    agent = Session.agent(tmp_path)
    assert agent.tool(193_000) is None
    told = agent.tool(194_000)
    assert told is not None
    output = told["hookSpecificOutput"]
    assert output["hookEventName"] == "PostToolUse"
    assert "194K" in output["additionalContext"] and "241K" in output["additionalContext"]
    assert str(tmp_path / "project" / NOTES) in output["additionalContext"]
    assert "file:line" in output["additionalContext"]
    assert agent.tool(200_000) is None  # once per stretch


def test_a_session_is_not_told_after_a_tool(tmp_path: Path) -> None:
    # The Stop hook asks it for the handoff instead.
    assert Session(tmp_path).tool(900_000) is None


def test_the_notes_come_back_after_compaction_and_are_asked_for_again(tmp_path: Path) -> None:
    agent = Session.agent(tmp_path)
    assert agent.tool(195_000) is not None
    notes = tmp_path / "project" / NOTES  # the agent writes them
    notes.parent.mkdir()
    notes.write_text(
        "Plan: two hooks.\n- AutoCompact.at: scripts/handoff_due.py:114\n", encoding="utf-8"
    )

    put_back = agent.compacted()

    assert put_back is not None
    assert str(notes) in put_back
    assert put_back.endswith("Plan: two hooks.\n- AutoCompact.at: scripts/handoff_due.py:114")
    assert agent.tool(60_000) is None  # the next stretch
    assert agent.tool(196_000) is not None


def test_only_a_compaction_puts_notes_back_and_only_written_ones(tmp_path: Path) -> None:
    agent = Session.agent(tmp_path)
    assert agent.compacted() is None  # none written
    notes = tmp_path / "project" / NOTES
    notes.parent.mkdir()
    notes.write_text("\n", encoding="utf-8")
    assert agent.compacted() is None  # empty
    notes.write_text("Plan: two hooks.", encoding="utf-8")
    assert agent.compacted("startup") is None and agent.compacted("resume") is None
    assert agent.compacted() is not None


# --- a session's handoff, put back (#155) -------------------------------------------------------


HANDOFF = (
    "_Claude Code (bateks)_\n\nThe hooks are written.\n\n"
    "**Next:** the PR (Claude's). **Waiting on:** nothing.\n\n"
    "<details><summary>For the next session</summary>\n\n"
    "- Notes: `PutBack` in scripts/handoff_due.py\n\n</details>\n\n"
    "<!-- handoff host=PC checkout=c--git-everest-game at=2026-11-05T10:00+01:00 closing=no -->"
)


def github(comments: list[dict[str, Any]], asked: list[str]) -> GitHub:
    """GitHub with an issue's comments, noting what it was asked."""

    def server(request: httpx.Request) -> httpx.Response:
        asked.append(request.url.path)
        if request.url.path.endswith("/issues/155/comments"):
            return httpx.Response(200, json=comments)
        return httpx.Response(404, json={"message": "Not Found"})

    return GitHub("albalaeff/Everest-Game", "a-token", httpx.MockTransport(server))


def comment(body: str, number: int = 1) -> dict[str, Any]:
    url = f"https://github.com/albalaeff/Everest-Game/issues/155#issuecomment-{number}"
    return {"user": {"login": "bateks"}, "body": body, "html_url": url}


def put_back(branch: str, comments: list[dict[str, Any]], asked: list[str]) -> PutBack:
    """A session's hook, on `branch`, with GitHub holding the issue's `comments`."""
    git = FakeGit({"rev-parse --abbrev-ref HEAD": branch})
    return PutBack({}, git, lambda _: github(comments, asked))


def test_a_session_gets_back_the_latest_handoff_on_its_branch_s_issue(tmp_path: Path) -> None:
    comments = [comment(HANDOFF, 1), comment("_Claude Code (bateks)_\n\nA word.", 2)]
    asked: list[str] = []

    found = Session(tmp_path).compacted(put_back=put_back("feature/155-notes", comments, asked))

    assert asked == ["/repos/albalaeff/Everest-Game/issues/155/comments"]
    assert found is not None
    assert "#155, https://github.com/albalaeff/Everest-Game/issues/155#issuecomment-1" in found
    assert "**Next:** the PR (Claude's). **Waiting on:** nothing." in found
    assert "- Notes: `PutBack` in scripts/handoff_due.py" in found
    assert "The hooks are written." not in found  # for people: Handoff.brief


def test_a_session_on_main_with_no_handoff_or_offline_gets_nothing(tmp_path: Path) -> None:
    session, asked = Session(tmp_path), []
    assert session.compacted(put_back=put_back("main", [comment(HANDOFF)], asked)) is None
    assert asked == []  # GitHub isn't asked
    assert (
        session.compacted(put_back=put_back("feature/155-x", [comment("A word.")], asked)) is None
    )
    assert session.compacted(put_back=put_back("feature/156-x", [], asked)) is None  # HTTP 404

    def offline(_: Git) -> GitHub:
        raise httpx.ConnectError("no network")

    git = FakeGit({"rev-parse --abbrev-ref HEAD": "feature/155-x"})
    assert session.compacted(put_back=PutBack({}, git, offline)) is None


# --- as Claude Code runs it -------------------------------------------------------------------


def test_claude_codes_settings_run_it_when_claude_stops() -> None:
    hooks = json.loads((ROOT / ".claude" / "settings.json").read_text(encoding="utf-8"))["hooks"]
    commands = [hook["command"] for group in hooks["Stop"] for hook in group["hooks"]]
    assert any("scripts/handoff_due.py" in command for command in commands)


def test_claude_codes_settings_run_it_after_an_agent_s_tools_and_after_compaction() -> None:
    hooks = json.loads((ROOT / ".claude" / "settings.json").read_text(encoding="utf-8"))["hooks"]
    after_tool = [hook["command"] for group in hooks["PostToolUse"] for hook in group["hooks"]]
    # a person's session doesn't start uv after each tool, for a hook that tells it nothing
    assert any(
        command.startswith('[ -z "$CLAUDE_AGENT_MODEL" ] || ')
        and "scripts/handoff_due.py" in command
        for command in after_tool
    )
    compacted = [
        hook["command"]
        for group in hooks["SessionStart"]
        if group.get("matcher") == "compact"
        for hook in group["hooks"]
    ]
    assert any("scripts/handoff_due.py" in command for command in compacted)


def run_by_path(tmp_path: Path, hook: dict[str, Any], env: dict[str, str]) -> tuple[int, str, str]:
    """It, as Claude Code runs it: by its path, not as a module of the checkout's."""
    done = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "handoff_due.py")],
        input=json.dumps(hook),
        capture_output=True,
        text=True,
        check=False,
        cwd=tmp_path,
        env={**os.environ, **env},
    )
    return done.returncode, done.stdout, done.stderr


def test_it_runs_as_claude_code_runs_it_by_its_path(tmp_path: Path) -> None:
    # It finds scripts.agents by itself.
    session = Session(tmp_path)
    session.lines.append(answer(1_000))

    hook = session.hook(stop_hook_active=True)
    assert run_by_path(tmp_path, hook, session.env) == (0, "", "")


def test_by_its_path_it_answers_the_event_claude_code_names(tmp_path: Path) -> None:
    agent = Session.agent(tmp_path)
    (tmp_path / "project" / NOTES).parent.mkdir()
    (tmp_path / "project" / NOTES).write_text("Plan: two hooks.", encoding="utf-8")

    code, out, err = run_by_path(tmp_path, agent.hook("SessionStart", source="compact"), agent.env)

    assert (code, err) == (0, "")
    output = json.loads(out)["hookSpecificOutput"]
    assert output["hookEventName"] == "SessionStart"
    assert output["additionalContext"].endswith("Plan: two hooks.")
    assert run_by_path(tmp_path, agent.hook("Notification"), agent.env) == (0, "", "")
