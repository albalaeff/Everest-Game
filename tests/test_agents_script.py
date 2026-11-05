"""scripts/agents.py: what the session manager and its agents share (#387)."""

from datetime import datetime
from pathlib import Path

import pytest

from scripts.agents import (
    LABEL_FAMILIES,
    AgentPower,
    CompactShare,
    ManagerConfig,
    ManagerLock,
    Priority,
    WatchLock,
)

pytestmark = pytest.mark.unit

DEFAULT = AgentPower("opus", "xhigh")
PCT = "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE"


# --- the settings ----------------------------------------------------------------------------


def test_without_the_file_the_defaults_hold(tmp_path: Path) -> None:
    config = ManagerConfig.load(tmp_path)

    assert config == ManagerConfig()
    assert config.power == DEFAULT
    assert config.max_parallel == 3
    assert config.compaction == CompactShare(25)  # #441: a quarter of the window
    assert config.worktrees(tmp_path / "repo") == (tmp_path / "worktrees").resolve()
    assert config.watch_every_seconds == 120  # #445: a session's watcher looks as often


def test_the_file_overrides_what_it_names(tmp_path: Path) -> None:
    (tmp_path / "agent-manager.toml").write_text(
        'default_model = "sonnet"\nmax_parallel = 4\nwatch_every_seconds = 300\n',
        encoding="utf-8",
    )

    config = ManagerConfig.load(tmp_path)

    assert config.power == AgentPower("sonnet", "xhigh")
    assert config.max_parallel == 4
    assert config.watch_every_seconds == 300
    assert config.watcher_backoff_seconds == ManagerConfig().watcher_backoff_seconds


def test_the_repository_s_file_says_the_defaults() -> None:
    # agent-manager.toml is where a developer looks for them: it says what the code does.
    assert ManagerConfig.load() == ManagerConfig()


@pytest.mark.parametrize(
    "text",
    [
        'default_model = "gpt"\n',  # not Claude Code's
        'default_effort = "extreme"\n',
        "max_parallel = 0\n",
        'max_parallel = "two"\n',
        "watcher_backoff_seconds = 0\n",
        "watch_every_seconds = 2\n",  # seconds, not minutes: GitHub's limits want a minute
        "compact_at_percent = 0\n",  # Claude Code reads a share from 1 to 100
        "compact_at_percent = 101\n",
        'compact_at_percent = "a quarter"\n',
        "paralel = 2\n",  # a typo is said, not ignored
        "max_parallel = \n",  # not TOML
    ],
)
def test_a_wrong_setting_stops_the_start_and_says_which(tmp_path: Path, text: str) -> None:
    (tmp_path / "agent-manager.toml").write_text(text, encoding="utf-8")

    with pytest.raises(SystemExit, match="agent-manager.toml"):
        ManagerConfig.load(tmp_path)


# --- an agent's power ------------------------------------------------------------------------


def test_no_label_takes_the_defaults() -> None:
    assert DEFAULT.from_labels(["bug", "claude:bateks"]) == DEFAULT


def test_the_labels_set_model_and_effort_each_on_their_own() -> None:
    assert DEFAULT.from_labels(["model:haiku", "effort:high"]) == AgentPower("haiku", "high")
    assert DEFAULT.from_labels(["model:sonnet"]) == AgentPower("sonnet", "xhigh")
    assert DEFAULT.from_labels(["effort:max"]) == AgentPower("opus", "max")
    assert DEFAULT.from_labels(["model:fable"]) == AgentPower("fable", "xhigh")


def test_of_two_labels_in_a_family_the_stronger_wins() -> None:
    labels = ["model:haiku", "model:opus", "model:sonnet", "effort:max", "effort:high"]

    assert DEFAULT.from_labels(labels) == AgentPower("opus", "max")
    assert DEFAULT.from_labels(["model:opus", "model:fable"]) == AgentPower("fable", "xhigh")


def test_the_labels_are_claude_code_s_own_words() -> None:
    # #4: fable is the strongest model; low and medium are no efforts an agent runs with.
    assert AgentPower.labels() == [
        "model:haiku",
        "model:sonnet",
        "model:opus",
        "model:fable",
        "effort:high",
        "effort:xhigh",
        "effort:max",
    ]


def test_low_and_medium_are_no_efforts_any_more() -> None:
    with pytest.raises(ValueError, match="low"):
        AgentPower("opus", "low")
    with pytest.raises(ValueError, match="medium"):
        AgentPower("opus", "medium")


def test_without_an_unavailable_model_the_next_one_down_runs() -> None:
    # #4: Fable is on some accounts' plans only; an agent on an account that lacks it runs on
    # the strongest model left, with the effort its issue asked for.
    assert AgentPower("fable", "max").without({"fable"}) == AgentPower("opus", "max")
    assert AgentPower("fable", "high").without({"fable", "opus"}) == AgentPower("sonnet", "high")
    assert AgentPower("opus", "high").without({"fable"}) == AgentPower("opus", "high")
    assert AgentPower("fable", "max").without(set()) == AgentPower("fable", "max")
    assert AgentPower("haiku", "high").without({"haiku"}) == AgentPower("haiku", "high")


def test_a_priority_label_says_how_soon_an_issue_s_agent_starts() -> None:
    # #485: none is medium; of two, the higher wins, as the stronger power does.
    assert Priority.of(["bug", "model:opus"]) == Priority("medium")
    assert Priority.of(["priority:low"]) == Priority("low")
    assert Priority.of(["priority:low", "priority:high"]) == Priority("high")
    assert Priority("high").rank > Priority().rank > Priority("low").rank
    assert Priority.FAMILY.labels() == ["priority:low", "priority:medium", "priority:high"]
    with pytest.raises(ValueError, match="urgent"):
        Priority("urgent")


def test_the_label_families_are_the_manager_s_on_github() -> None:
    # What `scripts/agent_manager.py labels` makes, and what makes a task new to the watcher.
    assert [family.name for family in LABEL_FAMILIES] == ["model", "effort", "priority", "compact"]
    assert AgentPower.MODEL.label("opus") == "model:opus"
    assert Priority.FAMILY.description("high") == (
        "The agent manager starts this issue's agents at high priority; none is medium (#485)"
    )
    for family in LABEL_FAMILIES:  # GitHub's limit for a label's description
        assert all(len(family.description(value)) <= 100 for value in family.values)


def test_an_agent_knows_its_power_from_the_environment_the_manager_gave_it() -> None:
    power = AgentPower("sonnet", "high")

    assert AgentPower.of_agent(power.env()) == power
    assert str(power) == "sonnet/high"
    assert AgentPower.of_agent({}) is None  # a session in VS Code
    assert AgentPower.of_agent({**power.env(), "CLAUDE_AGENT_MODEL": "gpt"}) is None


# --- where Claude Code compacts --------------------------------------------------------------


def test_the_share_the_manager_sets_is_the_one_claude_code_reads() -> None:
    # #441: the manager puts it in an agent's environment, and the Stop hook (#349) reads
    # it from there as Claude Code does: the two agree on where a conversation is compacted.
    share = ManagerConfig().compaction

    assert share.env() == {PCT: "25"}
    assert CompactShare.from_env(share.env()) == share
    assert share.of(967_000) == 241_750  # of the window of the models with a 1M context
    assert str(share) == "25%"


def test_a_share_compacts_earlier() -> None:
    # #399: with 20 Claude Code compacts at a fifth of the window.
    assert CompactShare.from_env({PCT: "20"}).of(967_000) == 193_400
    assert CompactShare.from_env({PCT: "50.5"}).of(500_000) == 252_500
    assert CompactShare(50.5).env() == {PCT: "50.5"}


@pytest.mark.parametrize("value", ["", "0", "150", "-5", "soon"])
def test_a_share_claude_code_ignores_is_all_of_the_window(value: str) -> None:
    # It reads it as JavaScript's parseFloat, and only from above 0 to 100.
    assert CompactShare.from_env({PCT: value}) == CompactShare() == CompactShare.from_env({})
    assert CompactShare().of(967_000) == 967_000


def test_a_compact_label_gives_an_issue_s_agents_more_of_the_window() -> None:
    # #152: #26's agent read 300K tokens before it wrote a line, past a quarter of the window,
    # and compacted again and again. Its issue's label gives its agents more, and never less
    # than agent-manager.toml's share.
    share = CompactShare(25)

    assert share.from_labels(["bug", "model:opus"]) == share
    assert share.from_labels(["compact:50"]) == CompactShare(50)
    assert share.from_labels(["compact:50", "compact:100"]) == CompactShare(100)
    assert CompactShare(60).from_labels(["compact:50"]) == CompactShare(60)
    assert CompactShare.FAMILY.labels() == ["compact:50", "compact:100"]


def test_after_compacting_again_and_again_the_next_label_up_gives_more() -> None:
    assert CompactShare(25).more() == "compact:50"
    assert CompactShare(50).more() == "compact:100"
    assert CompactShare(60).more() == "compact:100"
    assert CompactShare(100).more() is None  # all of the window: none gives more


# --- the lock --------------------------------------------------------------------------------


def test_nobody_holds_the_lock_before_a_manager_takes_it(tmp_path: Path) -> None:
    assert ManagerLock(tmp_path / "manager.lock").holder() is None


def test_a_running_manager_holds_it_and_says_since_when(tmp_path: Path) -> None:
    path = tmp_path / ".agent-runs" / "manager.lock"
    manager = ManagerLock(path)

    assert manager.acquire(datetime(2026, 10, 12, 18, 2))
    try:
        held = ManagerLock(path).holder()
        assert held is not None and "since 2026-10-12 18:02" in held
        assert not ManagerLock(path).acquire(datetime(2026, 10, 12, 18, 3))  # a second one
    finally:
        manager.release()

    assert ManagerLock(path).holder() is None


def test_a_lock_left_by_a_manager_that_died_holds_nothing(tmp_path: Path) -> None:
    # The operating system lets go of a dead process's lock; the file alone means nothing.
    path = tmp_path / "manager.lock"
    path.write_text("pid 4242, since 2026-10-12 18:02", encoding="utf-8")

    assert ManagerLock(path).holder() is None


def test_a_session_s_watcher_holds_a_lock_of_its_own_naming_its_session(tmp_path: Path) -> None:
    # #597: a second session's watcher ends; `handoffs` in the first knows the watcher is its own.
    path = tmp_path / "watch.lock"
    mine = WatchLock(path, {"CLAUDE_CODE_SESSION_ID": "9fec4b62"})

    assert mine.acquire(datetime(2026, 10, 18, 20, 34))
    try:
        held = WatchLock(path, {}).holder()
        assert held is not None and held.endswith("session 9fec4b62, since 2026-10-18 20:34")
        assert WatchLock(path, {"CLAUDE_CODE_SESSION_ID": "9fec4b62"}).another() is None
        assert WatchLock(path, {"CLAUDE_CODE_SESSION_ID": "0ther"}).another() == held
        assert WatchLock(path, {}).another() == held  # outside a session, none is one's own
    finally:
        mine.release()

    assert WatchLock(path, {}).another() is None
