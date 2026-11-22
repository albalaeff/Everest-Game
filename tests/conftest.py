"""How many pytest-xdist workers run the tests (`WorkerCount`, #440), and the fixtures tests
of several scripts share: real git of a test's own (`plain_git`, `worktrees`).

A project whose tests use a database adds its fixtures here (an engine on TEST_DATABASE_URL,
a session rolled back after each test, one database per worker, #440).
"""

import os
from pathlib import Path

import pytest

from tests.fakes import Worktrees
from tests.parallel import WorkerCount


@pytest.fixture
def plain_git(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Real git with none of the developer's settings (a signing key, hooks), and a name to
    commit as."""
    settings = tmp_path / "gitconfig"
    settings.write_text("", encoding="utf-8")
    monkeypatch.setenv("GIT_CONFIG_GLOBAL", str(settings))
    monkeypatch.setenv("GIT_CONFIG_NOSYSTEM", "1")
    for who in ("AUTHOR", "COMMITTER"):
        monkeypatch.setenv(f"GIT_{who}_NAME", "Claude")
        monkeypatch.setenv(f"GIT_{who}_EMAIL", "claude@example.com")


@pytest.fixture
def worktrees(tmp_path: Path, plain_git: None) -> Worktrees:
    """A main checkout and two worktrees of it, in the test's `tmp_path` (`Worktrees`)."""
    return Worktrees.make(tmp_path)


@pytest.hookimpl(tryfirst=True, optionalhook=True)
def pytest_xdist_auto_num_workers(config: pytest.Config) -> int | None:
    """`-n auto`, as `WorkerCount` says; None leaves it to pytest-xdist, which then reads
    PYTEST_XDIST_AUTO_NUM_WORKERS when it's set."""
    if os.environ.get("PYTEST_XDIST_AUTO_NUM_WORKERS"):
        return None
    return WorkerCount.of(config.args, config.invocation_params.dir).workers
