"""scripts/check_setup.py: what this machine has and lacks for working here (PEB#342)."""

import json
import os
import subprocess
from collections.abc import Sequence
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import pytest

from scripts.check_setup import (
    ROOT,
    Check,
    EnvFile,
    LastCheck,
    Pins,
    claude_cli,
    claude_prices,
    claude_scratchpad,
    claude_trust,
    database,
    docker,
    env_file,
    env_pins,
    git_hooks,
    github_access,
    has_database,
    has_settings,
    main_checkout,
    node,
    poppler,
    python,
    report,
    uv,
    vscode_python,
)

pytestmark = pytest.mark.unit


def runner(answers: dict[str, tuple[int, str]]) -> Any:
    """A fake `subprocess.run`: the answer for a command with those words in it, and
    FileNotFoundError for a program that isn't there."""

    def run(command: Sequence[str], **_: Any) -> subprocess.CompletedProcess[str]:
        for words, (code, out) in answers.items():
            if words in " ".join(command):
                return subprocess.CompletedProcess(command, code, out, "")
        raise FileNotFoundError(command[0])

    return run


# --- the checks ------------------------------------------------------------------------------


def test_python_3_14() -> None:
    assert python((3, 14, 0)).ok
    assert not python((3, 13, 7)).ok
    assert "uv sync" in python((3, 13, 7)).fix


def test_uv() -> None:
    assert uv(lambda name: "/usr/bin/uv").ok
    assert "astral" in uv(lambda name: None).fix


def test_git_hooks_on() -> None:
    assert git_hooks(runner({"git config": (0, ".githooks\n")})).ok


def test_git_hooks_off_says_how_to_turn_them_on() -> None:
    check = git_hooks(runner({"git config": (1, "")}))

    assert not check.ok
    assert "git config core.hooksPath .githooks" in check.fix


def test_docker_running() -> None:
    assert docker(runner({"docker info": (0, "")})).ok


@pytest.mark.parametrize(
    "answers", [{"docker info": (1, "")}, {}], ids=["not running", "not installed"]
)
def test_docker_missing_or_stopped(answers: dict[str, tuple[int, str]]) -> None:
    check = docker(runner(answers))

    assert not check.ok
    assert "Docker Desktop" in check.fix


def test_the_project_has_a_database_while_the_compose_file_is_there(tmp_path: Path) -> None:
    # all_checks() runs the database checks only while it's there.
    assert not has_database()  # this project has no database
    assert not has_database(tmp_path)
    (tmp_path / "docker-compose.yml").write_text("services: {}\n", encoding="utf-8")
    assert has_database(tmp_path)


def test_has_settings_means_an_env_example_to_copy(tmp_path: Path) -> None:
    assert not has_settings()  # this project has no settings to fill in yet
    assert not has_settings(tmp_path)
    (tmp_path / ".env.example").write_text("# X=1\n", encoding="utf-8")
    assert has_settings(tmp_path)


def test_database_answering() -> None:
    assert database("postgresql://u:p@localhost:5433/everest", lambda host, port: True).ok


def test_database_not_answering_says_where_and_how_to_start_it() -> None:
    tried: list[tuple[str, int]] = []

    def connect(host: str, port: int) -> bool:
        tried.append((host, port))
        return False

    check = database("postgresql://u:p@db.local:6000/everest", connect)

    assert tried == [("db.local", 6000)]
    assert not check.ok
    assert "docker compose up -d db" in check.fix
    assert "p@" not in check.detail  # never the password


def env_files(tmp_path: Path, env: str | None, template: str) -> tuple[Path, Path]:
    example = tmp_path / ".env.example"
    example.write_text(template, encoding="utf-8")
    path = tmp_path / ".env"
    if env is not None:
        path.write_text(env, encoding="utf-8")
    return path, example


def test_an_env_example_is_read_as_defaults_and_blanks(tmp_path: Path) -> None:
    _, example = env_files(
        tmp_path,
        None,
        "# Copy to .env.\n# EVEREST_LOG_LEVEL=INFO\nEVEREST_TOKEN=\n# A note: python -c x\n",
    )

    found = EnvFile.read(example)

    assert found.defaults == {"EVEREST_LOG_LEVEL": "INFO"}
    assert found.blank == ("EVEREST_TOKEN",)
    assert found.values == {}
    assert EnvFile.read(tmp_path / "none") == EnvFile({}, {}, ())


def test_no_env_file_says_to_copy_the_example(tmp_path: Path) -> None:
    path, example = env_files(tmp_path, None, "EVEREST_TOKEN=\n")

    check = env_file(path, example)

    assert not check.ok
    assert ".env.example" in check.fix and "never" in check.fix


def test_a_blank_line_of_the_example_must_be_filled_in(tmp_path: Path) -> None:
    path, example = env_files(
        tmp_path, "EVEREST_TOKEN=\nEVEREST_LOG_LEVEL=DEBUG\n", "EVEREST_TOKEN=\n"
    )

    check = env_file(path, example)

    assert not check.ok
    assert check.detail == "not filled in: EVEREST_TOKEN"
    assert "the last line for a key wins" in check.fix


def test_a_filled_env_names_no_value(tmp_path: Path) -> None:
    path, example = env_files(tmp_path, "EVEREST_TOKEN=123:abc\n", "EVEREST_TOKEN=\n")

    check = env_file(path, example)

    assert check.ok
    assert check.detail == "EVEREST_TOKEN set"
    assert "123:abc" not in check.detail + check.fix  # never the secret


def test_the_last_value_of_a_key_counts(tmp_path: Path) -> None:
    """As python-dotenv reads it, the last line for a key wins: a token pasted at the top loses
    to the template's empty line."""
    path, example = env_files(
        tmp_path, "EVEREST_TOKEN=123:abc\n\nEVEREST_TOKEN=\n", "EVEREST_TOKEN=\n"
    )

    assert not env_file(path, example).ok


def test_an_env_without_blank_lines_to_fill_is_just_there(tmp_path: Path) -> None:
    path, example = env_files(tmp_path, "", "# EVEREST_LOG_LEVEL=INFO\n")

    assert env_file(path, example).detail == "there"


def test_what_env_pins_is_a_note(tmp_path: Path) -> None:
    # PEB#564: a copy of an older .env.example keeps that day's values when the defaults move.
    path, example = env_files(
        tmp_path,
        "EVEREST_TOKEN=123:abc\nEVEREST_COUNTRIES=CZ\nEVEREST_LOG_LEVEL=INFO\nEVEREST_OLD_URL=x\n",
        "EVEREST_TOKEN=\n# EVEREST_COUNTRIES=CZ,TR\n# EVEREST_LOG_LEVEL=INFO\n",
    )

    check = env_pins(path, example)

    assert not check.ok and check.note  # never "missing": pinning on purpose is allowed
    assert check.detail == (
        "`.env` pins `EVEREST_COUNTRIES=CZ` (by default `CZ,TR`). 1 line is at today's default,"
        " and would pin it once that changes: it could go. Unknown to the code, so ignored:"
        " `EVEREST_OLD_URL`."
    )
    assert "an absent line follows the code" in check.fix
    assert "123:abc" not in check.detail + check.fix  # never the token


def test_pins_between_two_env_files() -> None:
    env = EnvFile({"A": "1", "B": "2", "C": "3", "D": "4"}, {}, ())
    template = EnvFile({}, {"A": "1", "B": "20"}, ("C",))

    pins = Pins.between(env, template)

    assert pins == Pins((("B", "2", "20"),), ("A",), ("D",))
    assert pins
    assert not Pins.between(EnvFile({"C": "3"}, {}, ()), template)


def test_a_fresh_copy_of_the_env_example_pins_nothing(tmp_path: Path) -> None:
    template = "EVEREST_TOKEN=\n# EVEREST_LOG_LEVEL=INFO\n"
    path, example = env_files(tmp_path, template, template)

    assert env_pins(path, example).ok
    assert env_pins(tmp_path / "none", example).ok  # no .env yet: the .env check says so


def test_github_access_names_the_account() -> None:
    def call(path: str) -> Any:
        return {"login": "albalaeff"} if path == "/user" else {"permissions": {"push": True}}

    check = github_access(lambda: "secret", call)

    assert check.ok
    assert "albalaeff" in check.detail
    assert "secret" not in check.detail


def test_github_without_push_access() -> None:
    def call(path: str) -> Any:
        return {"login": "newcomer"} if path == "/user" else {"permissions": {"push": False}}

    check = github_access(lambda: "secret", call)

    assert not check.ok
    assert "newcomer" in check.detail


def test_no_github_token() -> None:
    def no_token() -> str:
        raise SystemExit("No GitHub token")

    check = github_access(no_token, lambda path: {})

    assert not check.ok
    assert "sign in to GitHub" in check.fix


def test_claude_s_prices_are_in_the_repository() -> None:
    # PEB#390: a fresh clone has them; the watcher keeps them current.
    check = claude_prices()

    assert check.ok and "models in claude-prices.csv" in check.detail


def test_without_claude_s_prices_it_says_how_to_read_them(tmp_path: Path) -> None:
    check = claude_prices(tmp_path / "claude-prices.csv")

    assert not check.ok
    assert check.fix == "uv run python scripts/claude_prices.py refresh"


def test_claude_code_s_command_line_signed_in() -> None:
    # PEB#387: the agent manager's agents are it, signed in as the developer.
    check = claude_cli(
        lambda name: "/usr/local/bin/claude",
        runner({"auth status": (0, '{\n  "loggedIn": true,\n  "authMethod": "claude.ai"\n}')}),
    )

    assert check.ok and check.detail == "installed, signed in"


def test_without_claude_code_s_command_line_it_says_how_to_install_it() -> None:
    check = claude_cli(lambda name: None)

    assert not check.ok and check.required
    assert "https://claude.ai/install." in check.fix


def test_claude_code_s_command_line_signed_out_says_how_to_sign_in() -> None:
    check = claude_cli(lambda name: "claude", runner({"auth status": (1, '{"loggedIn": false}')}))

    assert not check.ok
    assert "claude auth login" in check.fix


def claude_config(tmp_path: Path, projects: dict[str, Any]) -> Path:
    config = tmp_path / ".claude.json"
    config.write_text(json.dumps({"projects": projects}), encoding="utf-8")
    return config


def test_a_trusted_checkout_gives_agents_the_allow_list(tmp_path: Path) -> None:
    # PEB#387's trial: in a checkout Claude Code hasn't been trusted in, a headless agent
    # ignores .claude/settings.json's allow list and is refused nearly everything.
    root = tmp_path / "git" / "everest"
    config = claude_config(tmp_path, {root.as_posix(): {"hasTrustDialogAccepted": True}})

    check = claude_trust(config, root)

    assert check.ok and check.required
    assert "trusted" in check.detail


def test_the_trust_is_the_main_checkout_s_also_in_a_worktree() -> None:
    found = main_checkout(runner({"--git-common-dir": (0, "C:/git/everest/.git\n")}))

    assert found == Path("C:/git/everest")
    assert main_checkout(runner({})) == ROOT  # without git: this checkout


@pytest.mark.parametrize(
    "projects",
    [
        {},
        {"elsewhere": {"hasTrustDialogAccepted": True}},
        {"PARENT": {"hasTrustDialogAccepted": True}},  # doesn't count for `claude -p`
        {"ROOT": {"hasTrustDialogAccepted": False}},
        {"ROOT": {}},
    ],
)
def test_an_untrusted_checkout_says_how_to_trust_it(
    tmp_path: Path, projects: dict[str, Any]
) -> None:
    root = tmp_path / "git" / "everest"
    names = {"ROOT": root.as_posix(), "PARENT": root.parent.as_posix()}
    projects = {names.get(key, key): value for key, value in projects.items()}

    check = claude_trust(claude_config(tmp_path, projects), root)

    assert not check.ok
    assert "allow list" in check.detail
    assert f"run `claude` in {root} once" in check.fix


@pytest.mark.parametrize("text", [None, "not json", "[]"])
def test_without_a_readable_claude_config_the_checkout_is_untrusted(
    tmp_path: Path, text: str | None
) -> None:
    config = tmp_path / ".claude.json"
    if text is not None:
        config.write_text(text, encoding="utf-8")

    assert not claude_trust(config, tmp_path).ok


def claude_settings(tmp_path: Path, text: str | None) -> Path:
    settings = tmp_path / "settings.json"
    if text is not None:
        settings.write_text(text, encoding="utf-8")
    return settings


def bash_env(tmp_path: Path, profile: Path) -> Path:
    return claude_settings(tmp_path, json.dumps({"env": {"BASH_ENV": profile.as_posix()}}))


def test_claude_s_bash_commands_get_the_scratchpad(tmp_path: Path) -> None:
    # PEB#530: Claude Code names its scratchpad only in its prompt, so a guessed variable
    # expanded to nothing and a file went to Git's folder. `bash -c` reads only the file
    # BASH_ENV names.
    profile = tmp_path / ".bashrc"
    profile.write_text(
        "alias ll='ls -l'\n  export CLAUDE_SCRATCHPAD=\"$TEMP/x\"\n", encoding="utf-8"
    )

    check = claude_scratchpad(bash_env(tmp_path, profile))

    assert check.ok and check.required
    assert profile.as_posix() in check.detail


@pytest.mark.parametrize(
    "text",
    [None, "not json", "[]", "{}", '{"env": {"OTHER": "1"}}', '{"env": []}'],
    ids=["no settings", "not json", "a list", "no env", "no BASH_ENV", "env a list"],
)
def test_without_bash_env_it_says_what_to_add_to_claude_s_settings(
    tmp_path: Path, text: str | None
) -> None:
    check = claude_scratchpad(claude_settings(tmp_path, text), home=tmp_path)

    assert not check.ok
    assert "BASH_ENV" in check.detail
    assert f'"env": {{"BASH_ENV": "{tmp_path.as_posix()}/.bashrc"}}' in check.fix
    assert "docs/developer-setup.md" in check.fix


def test_bash_env_naming_no_file_says_to_write_it(tmp_path: Path) -> None:
    profile = tmp_path / ".bashrc"

    check = claude_scratchpad(bash_env(tmp_path, profile))

    assert not check.ok
    assert "doesn't exist" in check.detail
    assert profile.as_posix() in check.fix and "docs/developer-setup.md" in check.fix


def test_a_profile_without_the_variable_says_to_add_the_snippet(tmp_path: Path) -> None:
    profile = tmp_path / ".bashrc"
    profile.write_text(
        '# CLAUDE_SCRATCHPAD is set elsewhere\nexport PATH="$PATH"\n', encoding="utf-8"
    )

    check = claude_scratchpad(bash_env(tmp_path, profile))

    assert not check.ok
    assert "doesn't export CLAUDE_SCRATCHPAD" in check.detail
    assert profile.as_posix() in check.fix


UV_PYTHONS = "/home/dev/.local/share/uv/python"  # what `uv python dir` says
VENV = "/work/everest/.venv/bin"  # this script's interpreter's folder
STORE = "/Users/dev/AppData/Local/Microsoft/WindowsApps"  # no C: in a PATH split on ":"


def first_python(name: str, path: str) -> str | None:
    """A fake `shutil.which`: the PATH's first folder has the program."""
    folders = [folder for folder in path.split(os.pathsep) if folder]
    return f"{folders[0]}/{name}" if folders else None


def vscode_check(*path: str, **environ: str) -> Check:
    run = runner({"python dir": (0, UV_PYTHONS + "\n")})
    environ = {"PATH": os.pathsep.join(path), **environ}
    return vscode_python(run, first_python, environ, Path(VENV) / "python")


def test_vscode_with_the_venv_chosen() -> None:
    # `uv run` put .venv's folder first, VS Code put it next.
    check = vscode_check(VENV, VENV, STORE, UV="uv", TERM_PROGRAM="vscode")

    assert check.ok and check.required
    assert f"{VENV}/python" in check.detail


def test_vscode_with_uv_s_own_python_chosen_says_to_choose_the_venv() -> None:
    # PEB#530: 637 warnings that VIRTUAL_ENV doesn't match .venv, one on every `uv` call.
    stray = f"{UV_PYTHONS}/cpython-3.14.8-windows-x86_64-none/Scripts"

    check = vscode_check(VENV, stray, STORE, UV="uv", TERM_PROGRAM="vscode")

    assert not check.ok
    assert "cpython-3.14.8" in check.detail
    assert "Select Interpreter" in check.fix and ".venv" in check.fix


@pytest.mark.parametrize("marker", [{"TERM_PROGRAM": "vscode"}, {"VSCODE_PID": "42"}])
def test_vscode_with_python_the_store_s_stub_says_to_choose_the_venv(
    marker: dict[str, str],
) -> None:
    # What `uv run` put first isn't what Claude's `python` finds.
    check = vscode_check(VENV, STORE, UV="uv", **marker)

    assert not check.ok
    assert "Microsoft Store" in check.detail
    assert "Select Interpreter" in check.fix


def test_outside_vscode_the_store_s_stub_is_no_matter() -> None:
    assert vscode_check(VENV, STORE, UV="uv").ok


def test_without_uv_run_the_path_s_first_folder_counts() -> None:
    # Run with .venv's Python directly, in a terminal VS Code activated .venv in.
    assert vscode_check(VENV, STORE, TERM_PROGRAM="vscode").ok


def test_poppler_is_optional() -> None:
    # PEB#530: without pdftoppm, Claude's Read refuses PDFs.
    check = poppler(lambda name: None)

    assert not check.ok and not check.required
    assert "winget install --id oschwartz10612.Poppler" in check.fix
    assert poppler(lambda name: f"/usr/bin/{name}").ok


def test_node_24_or_later() -> None:
    check = node(runner({"node --version": (0, "v24.11.0\n")}))

    assert check.ok
    assert check.detail == "v24.11.0"
    assert node(runner({"node --version": (0, "v26.1.0\n")})).ok


def test_an_older_node_says_which_it_needs() -> None:
    check = node(runner({"node --version": (0, "v22.20.0\n")}))

    assert not check.ok
    assert check.detail == "v22.20.0, needs 24"
    assert "winget install --id OpenJS.NodeJS.LTS" in check.fix


def test_no_node_says_how_to_install_it() -> None:
    # The Check is required: the game can't be built or tested without it.
    check = node(runner({}))

    assert not check.ok and check.required
    assert check.detail == "not installed"
    assert "winget install --id OpenJS.NodeJS.LTS" in check.fix


# --- the report ------------------------------------------------------------------------------


def test_report_lists_each_check_and_the_fixes_for_what_is_missing() -> None:
    text, ready = report(
        [
            Check("Docker", True, "running"),
            Check(".env", False, "no .env", fix="cp .env.example .env"),
            Check("poppler", False, "not installed", fix="winget …", required=False),
            Check(".env's settings", False, "`.env` pins …", fix="delete …", note=True),
        ]
    )

    assert text.splitlines() == [
        "[ok]       Docker: running",
        "[missing]  .env: no .env",
        "           fix: cp .env.example .env",
        "[optional] poppler: not installed",
        "           fix: winget …",
        "[note]     .env's settings: `.env` pins …",
        "           fix: delete …",
    ]
    assert not ready


def test_ready_when_only_optional_pieces_are_missing() -> None:
    _, ready = report(
        [
            Check("Docker", True, "running"),
            Check("poppler", False, "", "", False),
            Check(".env's settings", False, "`.env` pins …", note=True),
        ]
    )

    assert ready


# --- the last check, for a session soon after another (PEB#597) -----------------------------


AT = datetime(2026, 10, 18, 20, 34)


def test_the_last_check_is_kept_and_read_back(tmp_path: Path) -> None:
    path = tmp_path / ".claude" / "setup-checked"
    checks = (
        Check("Docker", True, "running"),
        Check(".env's settings", False, "`.env` pins …", fix="delete …", note=True),
    )

    LastCheck(AT, checks).save(path)

    assert LastCheck.load(path) == LastCheck(AT, checks)
    assert LastCheck.load(tmp_path / "none") is None
    path.write_text("{", encoding="utf-8")
    assert LastCheck.load(path) is None


def test_a_check_within_eight_hours_is_recent() -> None:
    last = LastCheck(AT, ())

    assert last.recent(AT + timedelta(minutes=12))
    assert last.recent(AT + timedelta(hours=7, minutes=59))
    assert not last.recent(AT + timedelta(hours=8))
    assert not last.recent(AT - timedelta(minutes=1))  # a clock set back: check again


def test_the_summary_says_when_it_checked_and_what_was_missing_then() -> None:
    checks = (
        Check("Docker", True, "running"),
        Check("Schema", False, "behind the migrations", fix="uv run alembic upgrade head"),
        Check("poppler", False, "not installed", fix="winget …", required=False),
    )
    last = LastCheck(AT, checks)

    assert last.summary(AT + timedelta(minutes=12)).splitlines() == [
        "Checked at 20:34, 12 minutes ago; not there then "
        "(--unless-recent: not again within 8 hours):",
        "[missing]  Schema: behind the migrations",
        "           fix: uv run alembic upgrade head",
        "[optional] poppler: not installed",
        "           fix: winget …",
    ]
    assert not last.ready


def test_the_summary_of_a_clean_check_is_a_line() -> None:
    last = LastCheck(AT, (Check("Docker", True, "running"),))

    assert last.summary(AT + timedelta(hours=3)) == (
        "Checked at 20:34, 3 hours ago: everything was there "
        "(--unless-recent: not again within 8 hours)."
    )
    assert last.summary(datetime(2026, 10, 19, 1, 0)).startswith(
        "Checked at 2026-10-18 20:34, 4 hours ago"
    )
    assert last.ready
