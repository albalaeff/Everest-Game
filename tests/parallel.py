"""How many pytest-xdist workers `-n auto` starts (pyproject.toml, #440): tests/conftest.py's
`pytest_xdist_auto_num_workers` asks `WorkerCount`."""

import os
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import ClassVar, Self

import psutil  # type: ignore[import-untyped]

MiB = 1024**2


@dataclass(frozen=True, slots=True)
class WorkerCount:
    """A run of the suite, or of a folder of it, gets two workers, and more while there are
    cores and memory for them: each imports and collects all it runs (aiogram alone is
    seconds of CPU) and holds about half a GiB, and a laptop's memory runs out long before its
    cores do. Two run the suite about twice as fast even then (#440). Starting a worker costs
    seconds, so a run of files or tests stays in one process, as it does on one core."""

    cores: int
    available: int  # bytes of memory free
    targeted: bool  # only files or tests were named

    PER_WORKER: ClassVar[int] = 512 * MiB
    RESERVE: ClassVar[int] = 1024 * MiB  # left for the rest: Postgres, the editor, the agents

    @classmethod
    def of(cls, args: Sequence[str], at: Path) -> Self:
        """For the paths or test ids pytest was given, from the folder it was run in."""
        targeted = all((at / arg.split("::", 1)[0]).is_file() for arg in args)
        return cls(os.process_cpu_count() or 1, psutil.virtual_memory().available, targeted)

    @property
    def workers(self) -> int:
        """0: no workers, the tests run in pytest's own process."""
        if self.targeted or self.cores < 2:
            return 0
        return min(self.cores, max(2, (self.available - self.RESERVE) // self.PER_WORKER))
