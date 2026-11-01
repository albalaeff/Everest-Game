"""scripts/handoff_due.py: the handoff, asked for before the conversation is compacted (#349)."""

import io
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest

from scripts.agents import AgentPower, CompactShare
from scripts.handoff_due import Answer, AutoCompact, StopHook

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
    """One Claude Code session: its transcript, and the hook run at the end of each turn."""

    def __init__(self, tmp_path: Path) -> None:
        self.tmp_path = tmp_path
        self.home = tmp_path / "home"
        self.project = tmp_path / "project"
        self.asked = tmp_path / "asked"
        for folder in (self.home, self.project, self.asked):
            folder.mkdir()
        self.lines: list[dict[str, Any]] = []
        self.env: dict[str, str] = {}

    def hook(self, continuing: bool = False) -> dict[str, Any]:
        """What Claude Code gives the hook on its stdin."""
        return {
            "session_id": "abc123",
            "transcript_path": str(transcript(self.tmp_path, *self.lines)),
            "cwd": str(self.project),
            "hook_event_name": "Stop",
            "stop_hook_active": continuing,
        }

    def stop(self, tokens: int, continuing: bool = False) -> dict[str, Any] | None:
        """Claude ends a turn with the conversation this big; what the hook answers."""
        self.lines.append(answer(tokens))
        hook, out = io.StringIO(json.dumps(self.hook(continuing))), io.StringIO()
        StopHook(self.env, self.home, self.asked).run(hook, out)
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
    session = Session(tmp_path)
    session.env.update({**AgentPower("opus", "max").env(), **CompactShare(25).env()})
    assert session.stop(230_000) is None  # past 80% of the 241K where it compacts


def test_the_projects_settings_set_its_window(tmp_path: Path) -> None:
    session = Session(tmp_path)
    (session.project / ".claude").mkdir()
    (session.project / ".claude" / "settings.json").write_text(
        json.dumps({"autoCompactWindow": 200_000}), encoding="utf-8"
    )
    assert session.stop(170_000) is not None


def test_claude_codes_settings_run_it_when_claude_stops() -> None:
    hooks = json.loads((ROOT / ".claude" / "settings.json").read_text(encoding="utf-8"))["hooks"]
    commands = [hook["command"] for group in hooks["Stop"] for hook in group["hooks"]]
    assert any("scripts/handoff_due.py" in command for command in commands)


def test_it_runs_as_claude_code_runs_it_by_its_path(tmp_path: Path) -> None:
    # Not as a module of the checkout's: it finds scripts.agents by itself.
    session = Session(tmp_path)
    session.lines.append(answer(1_000))

    done = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "handoff_due.py")],
        input=json.dumps(session.hook(continuing=True)),
        capture_output=True,
        text=True,
        check=False,
        cwd=tmp_path,
    )

    assert (done.returncode, done.stdout, done.stderr) == (0, "", "")
