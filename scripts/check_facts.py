"""Checks the knowledge base: no record without a source or a check date (#9).

    uv run python scripts/check_facts.py

The records are the JSON files in content/facts/, and docs/conventions/knowledge-base.md says
how to write one. Each file must pass content/facts.schema.json; once they all do, this checks
what a schema can't see: an id used twice, a coefficient fitted to a fact that isn't there, a
range upside down, versions in different units, a date in the future. `pytest` runs it on the
real files (tests/test_check_facts_script.py), which is what fails CI.
"""

import json
import sys
from collections.abc import Iterator, Mapping, Set
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any, ClassVar

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[1]
FACTS = ROOT / "content" / "facts"
SCHEMA = ROOT / "content" / "facts.schema.json"


@dataclass(frozen=True, slots=True)
class Problem:
    """What's wrong, and where: `where` is a place in the file, or a record's id."""

    file: str
    where: str
    what: str

    def __str__(self) -> str:
        return ": ".join(part for part in (self.file, self.where, self.what) if part)


@dataclass(frozen=True, slots=True)
class Record:
    """A record that passed the schema."""

    file: str
    data: Mapping[str, Any]

    @property
    def id(self) -> str:
        return str(self.data["id"])

    def problems(self, facts: Set[str], latest: date) -> Iterator[Problem]:
        """What the schema can't see, given the ids of all the facts and the latest date that
        isn't in the future."""
        raise NotImplementedError

    def _problem(self, what: str) -> Problem:
        return Problem(self.file, self.id, what)

    def _range(self, measure: Mapping[str, Any]) -> Iterator[Problem]:
        bounds = measure.get("range")
        if bounds and bounds["min"] >= bounds["max"]:
            yield self._problem(f"the range {bounds['min']}–{bounds['max']} doesn't run upwards")

    def _date(self, text: str, latest: date) -> Iterator[Problem]:
        if date.fromisoformat(text) > latest:
            yield self._problem(f"the date {text} is in the future")


@dataclass(frozen=True, slots=True)
class Fact(Record):
    """What the sources say, a version for each that disagrees."""

    def problems(self, facts: Set[str], latest: date) -> Iterator[Problem]:
        versions = self.data["versions"]
        for version in versions:
            yield from self._range(version)
            yield from self._date(version["checked"], latest)
        units = sorted({version["unit"] for version in versions if "unit" in version})
        if len(units) > 1:
            yield self._problem(f"versions in different units: {', '.join(units)}")


@dataclass(frozen=True, slots=True)
class Coefficient(Record):
    """A number the model is tuned with that no source states, fitted to facts."""

    def problems(self, facts: Set[str], latest: date) -> Iterator[Problem]:
        yield from self._range(self.data)
        yield from self._date(self.data["fitted"], latest)
        for fact in self.data["fitted_to"]:
            if fact not in facts:
                yield self._problem(f"fitted to {fact}, which isn't a fact here")


class FactFile:
    """One JSON file of records."""

    KINDS: ClassVar[dict[str, type[Record]]] = {"fact": Fact, "coefficient": Coefficient}

    def __init__(self, path: Path, validator: Draft202012Validator) -> None:
        self._name = path.name
        self._problems: list[Problem] = []
        self._data: Any = None
        try:
            self._data = json.loads(path.read_text(encoding="utf-8"))
        except ValueError as error:  # not JSON, or not UTF-8
            self._problems = [Problem(self._name, "", f"doesn't read: {error}")]
            return
        self._problems = [
            Problem(self._name, error.json_path.removeprefix("$."), error.message)
            for error in validator.iter_errors(self._data)
        ]

    @property
    def problems(self) -> list[Problem]:
        return self._problems

    @property
    def records(self) -> list[Record]:
        """Its records, for a file with no problems."""
        return [self.KINDS[data["kind"]](self._name, data) for data in self._data["facts"]]


class KnowledgeBase:
    """The fact files of a folder."""

    # A check date is its author's: CI's UTC can still be on the day before.
    LEEWAY: ClassVar[timedelta] = timedelta(days=1)

    def __init__(self, folder: Path, schema: Path = SCHEMA, today: date | None = None) -> None:
        validator = Draft202012Validator(
            json.loads(schema.read_text(encoding="utf-8")),
            format_checker=Draft202012Validator.FORMAT_CHECKER,
        )
        self._folder = folder
        self._files = [FactFile(path, validator) for path in sorted(folder.glob("*.json"))]
        self._latest = (today or date.today()) + self.LEEWAY

    def problems(self) -> list[Problem]:
        """The files' problems; only once there are none, those between and within records."""
        if not self._files:
            return [Problem(str(self._folder), "", "no fact files here")]
        found = [problem for file in self._files for problem in file.problems]
        return found or list(self._between_records())

    def summary(self) -> str:
        records = len(self._records())
        files = len(self._files)
        return f"{records} records in {files} file{'' if files == 1 else 's'}: fine."

    def _records(self) -> list[Record]:
        return [record for file in self._files for record in file.records]

    def _between_records(self) -> Iterator[Problem]:
        records = self._records()
        facts = {record.id for record in records if isinstance(record, Fact)}
        seen: set[str] = set()
        for record in records:
            if record.id in seen:
                yield Problem(record.file, record.id, "this id is used twice")
            seen.add(record.id)
            yield from record.problems(facts, self._latest)


def main(base: KnowledgeBase | None = None) -> int:
    base = base or KnowledgeBase(FACTS)
    problems = base.problems()
    for problem in problems:
        print(problem)
    if problems:
        return 1
    print(base.summary())
    return 0


if __name__ == "__main__":
    sys.exit(main())
