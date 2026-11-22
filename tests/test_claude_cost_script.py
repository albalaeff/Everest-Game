"""scripts/claude_cost.py: what Claude's work on an issue cost, from its logs (#390)."""

import json
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

import pytest

from scripts.claude_cost import (
    IssueNames,
    Ledger,
    Reply,
    SessionLog,
    Title,
    actual_text,
    estimate_text,
    log_folder,
    session_logs,
)
from scripts.claude_prices import ALL, ModelPrice, Price, PriceHistory, Tokens

pytestmark = pytest.mark.unit

D = Decimal
OPUS = "claude-opus-5-5"
PRICES = PriceHistory()
PRICES.record([ModelPrice(OPUS, ALL, Price(D(4), D(20), D("0.20"), D(5), D(8)))], date(2026, 10, 1))
HOME = "C:\\git\\Everest-Game"  # the folder the session was started in, its own
WEATHER, DEVICES = "feature/272-weather", "feature/284-devices-drawn"  # its branches in turn


def reply(
    message_id: str,
    minute: int,
    *,
    output: int = 1_000_000,  # $20 at Opus 5.5's prices
    commands: tuple[str, ...] = (),
    tools: tuple[dict[str, Any], ...] = (),  # other tools' inputs: {"file_path": …}
    branch: str = "develop",
    model: str = OPUS,
    speed: str = "standard",
    cwd: str = HOME,
) -> dict[str, Any]:
    """A log entry of Claude's: a reply, with the commands it ran and the other tools it
    used."""
    content: list[dict[str, Any]] = [{"type": "text", "text": "On it."}]
    content += [{"type": "tool_use", "input": {"command": command}} for command in commands]
    content += [{"type": "tool_use", "input": dict(tool)} for tool in tools]
    return {
        "type": "assistant",
        "timestamp": f"2026-10-12T10:{minute:02d}:00.000Z",
        "requestId": f"req_{message_id}",
        "gitBranch": branch,
        "cwd": cwd,
        "message": {
            "id": message_id,
            "model": model,
            "content": content,
            "usage": {
                "input_tokens": 0,
                "output_tokens": output,
                "cache_read_input_tokens": 0,
                "cache_creation_input_tokens": 0,
                "cache_creation": {"ephemeral_5m_input_tokens": 0, "ephemeral_1h_input_tokens": 0},
                "speed": speed,
            },
        },
    }


def write_log(folder: Path, name: str, entries: list[dict[str, Any]]) -> Path:
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{name}.jsonl"
    lines = [json.dumps({"type": "user", "message": {"content": "carry on"}})]
    lines += [json.dumps(entry) for entry in entries]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


# --- where the logs are --------------------------------------------------------------------


def test_the_logs_folder_is_named_after_the_checkout() -> None:
    assert log_folder(Path("c:\\git\\PersonalExchangeBot")) == "c--git-PersonalExchangeBot"


def test_a_checkout_s_logs_are_found_whatever_the_drive_letter_s_case(tmp_path: Path) -> None:
    write_log(tmp_path / "C--git-PersonalExchangeBot", "a", [])
    write_log(tmp_path / "c--git-SortingAlgorithms", "b", [])

    found = session_logs([Path("c:\\git\\PersonalExchangeBot")], logs=tmp_path)

    assert [log.name for log in found] == ["a.jsonl"]


def test_the_agents_worktrees_count_even_once_they_re_gone(tmp_path: Path) -> None:
    # #387: the manager removes an agent's worktree once its work is on GitHub.
    write_log(tmp_path / "C--git-worktrees-387", "a", [])
    write_log(tmp_path / "C--git-worktrees2", "b", [])  # beside it, not in it

    found = session_logs([], logs=tmp_path, under=[Path("c:\\git\\worktrees")])

    assert [log.name for log in found] == ["a.jsonl"]


# --- a session's replies -------------------------------------------------------------------


def test_a_reply_written_in_blocks_counts_once_with_its_last_usage(tmp_path: Path) -> None:
    # Claude Code logs a reply once per block, each with the usage so far.
    early = reply("m1", 0, output=10)
    late = reply("m1", 0, output=1_000_000)

    [counted] = SessionLog(write_log(tmp_path, "s", [early, late])).replies()

    assert counted.tokens.output == 1_000_000
    assert counted.cost(PRICES) == D(20)


def test_the_cache_writes_are_priced_by_how_long_they_last(tmp_path: Path) -> None:
    entry = reply("m1", 0, output=0)
    entry["message"]["usage"]["cache_creation_input_tokens"] = 3_000_000
    entry["message"]["usage"]["cache_creation"] = {
        "ephemeral_5m_input_tokens": 1_000_000,
        "ephemeral_1h_input_tokens": 2_000_000,
    }

    [counted] = SessionLog(write_log(tmp_path, "s", [entry])).replies()

    assert counted.tokens == Tokens(cache_write_5m=1_000_000, cache_write_1h=2_000_000)
    assert counted.cost(PRICES) == D(5 + 16)


def test_fast_mode_costs_twice(tmp_path: Path) -> None:
    [counted] = SessionLog(write_log(tmp_path, "s", [reply("m1", 0, speed="fast")])).replies()

    assert counted.cost(PRICES) == D(40)


def test_a_model_without_prices_isnt_priced() -> None:
    unknown = Reply(datetime(2026, 10, 12, tzinfo=UTC), "claude-sonnet-4-6", Tokens(output=1))

    assert unknown.cost(PRICES) is None


@pytest.mark.parametrize(
    ("command", "named"),
    [
        ("uv run python scripts/github.py comment 390 note.md --read", (390,)),
        ("uv run python scripts/github.py title 390 --estimate 40", (390,)),
        ("uv run python scripts/github.py api GET issues/372/comments?per_page=100", (372,)),
        # #442: what agents did with `api` on issues/N and pulls/N
        ("uv run python scripts/github.py show 390 --new", (390,)),
        ("uv run python scripts/github.py close 390 --read", (390,)),
        ("uv run python scripts/github.py pr 401", (401,)),
        ("uv run python scripts/github.py merge 401", (401,)),
        ("uv run python scripts/github.py pr open .agent-runs/pr.json", ()),
        ("git checkout -b feature/393-more-toggles", (393,)),
        ("uv run python scripts/github.py status", ()),
        ("uv run python scripts/github.py cost 390", ()),  # measuring isn't working on it
    ],
)
def test_what_a_command_names(command: str, named: tuple[int, ...]) -> None:
    assert IssueNames.in_text(command) == named


# --- which issue a reply counts for ----------------------------------------------------------


def test_replies_count_for_the_issue_their_work_names_then_the_ones_after_it(
    tmp_path: Path,
) -> None:
    log = write_log(
        tmp_path,
        "s",
        [
            reply("m1", 0),  # the session's upkeep: none yet
            reply("m2", 1, commands=("uv run python scripts/github.py comment 372 c.md",)),
            reply("m3", 2),  # reading code for it
            reply("m4", 3, branch="feature/390-cost-in-dollars"),  # on #390's branch
            reply("m5", 4, commands=("uv run python scripts/github.py comment 354 c.md",)),
            reply("m6", 5),  # back on develop: still #354
        ],
    )

    counted = [(issue, item.at.minute) for issue, item in Ledger([log], PRICES).counted()]

    assert counted == [(None, 0), (372, 1), (372, 2), (390, 3), (354, 4), (354, 5)]


def test_a_reply_counts_for_the_branch_it_was_made_on_not_a_later_copy_s(
    tmp_path: Path,
) -> None:
    # #413: Claude Code rewrites a long session's older entries, each copy stamped with the
    # branch checked out when it's written: #286 came to $214, most of it other issues' work.
    made = reply("m1", 0, branch="feature/216-phone-anywhere", output=10)
    done = reply("m1", 0, branch="feature/216-phone-anywhere")
    copy = reply("m1", 0, branch="feature/286-select-hash")

    [counted] = SessionLog(write_log(tmp_path, "s", [made, done, copy])).replies()

    assert counted.branch == 216
    assert counted.cost(PRICES) == D(20)  # the usage still from its last entry


def test_an_issue_s_cost_includes_its_prs_and_says_what_it_couldnt_price(
    tmp_path: Path,
) -> None:
    log = write_log(
        tmp_path,
        "s",
        [
            reply("m1", 0, commands=("uv run python scripts/github.py comment 393 c.md",)),
            reply("m2", 1, model="claude-sonnet-4-6"),
            reply("m3", 2, commands=("uv run python scripts/github.py api GET issues/396",)),
            reply("m4", 3, commands=("uv run python scripts/github.py comment 354 c.md",)),
        ],
    )

    cost = Ledger([log], PRICES).issue(393, pulls=[396])

    assert (cost.dollars, cost.replies) == (D(40), 3)
    assert cost.summary() == (
        "Issue 393: $40.00 (claude-opus-5-5: $40.00), 3 replies, 3.0M tokens; "
        "no prices kept for claude-sonnet-4-6 (1)"
    )


def test_sessions_are_read_one_by_one(tmp_path: Path) -> None:
    # What one session named doesn't carry over to the next.
    first = write_log(
        tmp_path, "a", [reply("m1", 0, commands=("uv run python scripts/github.py comment 7 c",))]
    )
    second = write_log(tmp_path, "b", [reply("m2", 1)])

    counted = [issue for issue, _ in Ledger([first, second], PRICES).counted()]

    assert counted == [7, None]


# --- a session working in another worktree (#293) -------------------------------------------


@pytest.mark.parametrize(
    ("where", "issue"),
    [
        ("cd /c/git/worktrees/256 && npm test", 256),
        ("C:\\git\\worktrees\\256\\src\\physics\\ladder.ts", 256),
        ("C:/git/worktrees/256/src/physics/ladder.ts", 256),
        ("git worktree add -b feature/256-rope /c/git/worktrees/256 origin/develop", 256),
        ("cd /c/git/worktrees/256 && diff ladder.ts /c/git/worktrees/301/ladder.ts", 301),
        ("ls /c/git/worktrees/", None),
        ("C:\\git\\Everest-Game\\.claude\\worktrees\\admiring-cohen-eaf01e\\x.py", None),
        ("cd /c/git/PersonalExchangeBot-worktrees/390", None),  # another folder
    ],
)
def test_what_names_a_numbered_worktree(where: str, issue: int | None) -> None:
    # The agent manager's naming, <worktree_dir>/<issue> (#387).
    assert IssueNames.of_worktree(where) == issue


def test_a_session_s_work_in_another_worktree_counts_for_its_issue_not_its_folder_s_branch(
    tmp_path: Path,
) -> None:
    # #256's session worked in C:\git\worktrees\256 while its own folder was on #272's
    # branch, then #284's: $45 of its $65 went to #272.
    log = write_log(
        tmp_path,
        "s",
        [
            reply("m1", 0, branch=WEATHER, commands=("uv run python scripts/github.py show 256",)),
            reply("m2", 1, branch=WEATHER),  # still in its own folder: its branch's, as before
            reply("m3", 2, branch=WEATHER, commands=("cd /c/git/worktrees/256 && npm test",)),
            reply("m4", 3, branch=WEATHER, tools=({"file_path": "C:\\git\\worktrees\\256\\a.ts"},)),
            reply("m5", 4, branch=DEVICES),  # the answer, as its own folder moved on to #284
            reply("m6", 5, branch=DEVICES, tools=({"query": "ladder descent speed"},)),
        ],
    )

    counted = [(issue, item.at.minute) for issue, item in Ledger([log], PRICES).counted()]

    assert counted == [(256, 0), (272, 1), (256, 2), (256, 3), (256, 4), (256, 5)]


def test_in_a_worktree_the_issue_it_names_takes_the_replies_after_it(tmp_path: Path) -> None:
    log = write_log(
        tmp_path,
        "s",
        [
            reply("m1", 0, branch=DEVICES, commands=("cd /c/git/worktrees/256 && npm test",)),
            reply("m2", 1, branch=DEVICES, commands=("uv run python scripts/github.py pr 292",)),
            reply("m3", 2, branch=DEVICES),  # reading its CI
            reply("m4", 3, branch=DEVICES, tools=({"file_path": "C:\\git\\worktrees\\256\\a.ts"},)),
        ],
    )

    counted = [issue for issue, _ in Ledger([log], PRICES).counted()]

    assert counted == [256, 292, 292, 256]
    assert Ledger([log], PRICES).issue(256, pulls=[292]).replies == 4


@pytest.mark.parametrize(
    ("where", "back"),
    [
        ({"file_path": "C:\\git\\Everest-Game\\src\\devices.ts"}, True),
        ({"command": "cd /c/git/Everest-Game && npm test"}, True),
        ({"path": "c:/git/everest-game/docs"}, True),
        ({"command": "ls C:\\git\\Everest-Game"}, True),
        ({"file_path": "C:\\git\\Everest-Game-old\\src\\devices.ts"}, False),  # beside it
        ({"command": "npm test"}, False),  # where it ran isn't said
        ({"file_path": "C:\\Users\\alexa\\.claude\\memory\\note.md"}, False),
    ],
)
def test_a_path_in_its_own_folder_brings_a_session_back_to_its_branch(
    tmp_path: Path, where: dict[str, str], back: bool
) -> None:
    log = write_log(
        tmp_path,
        "s",
        [
            reply("m1", 0, branch=DEVICES, commands=("cd /c/git/worktrees/256 && git log -3",)),
            reply("m2", 1, branch=DEVICES, tools=(where,)),
            reply("m3", 2, branch=DEVICES),
        ],
    )

    counted = [issue for issue, _ in Ledger([log], PRICES).counted()]

    assert counted == ([256, 284, 284] if back else [256, 256, 256])


def test_the_files_a_reply_shows_say_where_it_worked(tmp_path: Path) -> None:
    shots = {"files": ["C:\\git\\worktrees\\256\\before.png", "C:\\git\\worktrees\\256\\after.png"]}
    log = write_log(
        tmp_path,
        "s",
        [
            reply(
                "m1", 0, branch=DEVICES, commands=("cd /c/git/Everest-Game && git worktree prune",)
            ),
            reply("m2", 1, branch=DEVICES, tools=(shots,)),  # SendUserFile
            reply("m3", 2, branch=DEVICES),
        ],
    )

    counted = [issue for issue, _ in Ledger([log], PRICES).counted()]

    assert counted == [284, 256, 256]


def test_an_agent_in_its_own_worktree_counts_for_its_branch_as_before(tmp_path: Path) -> None:
    # An agent's own folder is its worktree (#387): naming it is no move.
    own, branch = "C:\\git\\worktrees\\256", "feature/256-rope-ladders"
    log = write_log(
        tmp_path,
        "s",
        [
            reply("m1", 0, cwd=own, branch=branch, tools=({"file_path": f"{own}\\src\\a.ts"},)),
            reply(
                "m2",
                1,
                cwd=own,
                branch=branch,
                commands=("uv run python scripts/github.py show 255",),
            ),
            reply("m3", 2, cwd=own, branch=branch),
        ],
    )

    counted = [issue for issue, _ in Ledger([log], PRICES).counted()]

    assert counted == [256, 255, 256]


def test_a_worktree_only_quoted_in_what_a_reply_writes_moves_nothing(tmp_path: Path) -> None:
    # Where the work is: its commands and file paths, not the text it writes.
    note = {"file_path": f"{HOME}\\notes.md", "content": "cd /c/git/worktrees/256 && npm test"}
    log = write_log(
        tmp_path,
        "s",
        [
            reply("m1", 0, branch=DEVICES, tools=(note,)),
            reply("m2", 1, branch=DEVICES),
        ],
    )

    counted = [issue for issue, _ in Ledger([log], PRICES).counted()]

    assert counted == [284, 284]


# --- the title -----------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("dollars", "text"),
    [(D("37.4"), "~$40"), (D(140), "~$100"), (D("0.83"), "~$0.8"), (D(5), "~$5")],
)
def test_an_estimate_has_one_significant_figure(dollars: Decimal, text: str) -> None:
    assert estimate_text(dollars) == text


def test_what_it_took_is_in_whole_dollars_or_cents_under_one() -> None:
    assert (actual_text(D("61.6")), actual_text(D("0.4"))) == ("$62", "$0.40")


def test_the_prefixes_are_set_without_touching_the_rest_of_the_title() -> None:
    plain = Title.parse("Location rule fine-tuning, ➕ to ➖")
    estimated = Title(plain.rest, estimate="~$300")
    done = Title.parse(str(estimated))

    assert str(estimated) == "[~$300] Location rule fine-tuning, ➕ to ➖"
    assert (done.rest, done.estimate, done.actual) == (plain.rest, "~$300", None)
    assert str(Title(done.rest, done.estimate, "$620")) == (
        "[$620] [~$300] Location rule fine-tuning, ➕ to ➖"
    )
    assert Title.parse("[$620] [~$300] Rule").rest == "Rule"
