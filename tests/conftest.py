"""How many pytest-xdist workers run the tests (`WorkerCount`, #440).

A project whose tests use a database adds its fixtures here (an engine on TEST_DATABASE_URL,
a session rolled back after each test, one database per worker, #440).
"""

import os

import pytest

from tests.parallel import WorkerCount


@pytest.hookimpl(tryfirst=True, optionalhook=True)
def pytest_xdist_auto_num_workers(config: pytest.Config) -> int | None:
    """`-n auto`, as `WorkerCount` says; None leaves it to pytest-xdist, which then reads
    PYTEST_XDIST_AUTO_NUM_WORKERS when it's set."""
    if os.environ.get("PYTEST_XDIST_AUTO_NUM_WORKERS"):
        return None
    return WorkerCount.of(config.args, config.invocation_params.dir).workers
