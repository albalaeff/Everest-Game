"""Checks the knowledge base: no record without a source or a check date (#9).

    uv run python scripts/check_facts.py

The records are the JSON files in content/facts/, and docs/conventions/knowledge-base.md says
how to write one. Each file must pass content/facts.schema.json; once they all do, this checks
what a schema can't see: an id used twice, a coefficient fitted to a fact that isn't there, a
question about a record that isn't, a range upside down, versions in different units, a date
in the future. `pytest` runs it on the real files (tests/test_check_facts_script.py), which is
what fails CI. Each record also says how it reads on an expert's list
(scripts/expert_questions.py, #15).
"""

import json
import sys
from collections.abc import Iterator, Mapping
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

    # How an expert's list names the kind: a fact goes unnamed.
    KIND: ClassVar[str] = ""

    @property
    def id(self) -> str:
        return str(self.data["id"])

    @property
    def area(self) -> str:
        return self.id.split(".")[0]

    @property
    def open(self) -> bool:
        """Whether an expert is still to check it."""
        return bool(self.data["status"] == "source only")

    def problems(self, records: Mapping[str, Record], latest: date) -> Iterator[Problem]:
        """What the schema can't see, given all the records by id and the latest date that
        isn't in the future."""
        raise NotImplementedError

    def listing(self) -> str:
        """The record on an expert's list, as Markdown."""
        kind = f" ({self.KIND})" if self.KIND else ""
        lines = [f"- **{self.id}**{kind}: {self._text()}"]
        lines += [f"  - {detail}" for detail in self._details()]
        return "\n".join(lines) + "\n"

    def _text(self) -> str:
        return str(self.data["claim"])

    def _details(self) -> Iterator[str]:
        raise NotImplementedError

    def _number(self, measure: Mapping[str, Any]) -> str:
        """A value or a range with its unit, or nothing."""
        if "value" in measure:
            return f"{measure['value']} {measure['unit']}"
        if "range" in measure:
            return f"{measure['range']['min']}–{measure['range']['max']} {measure['unit']}"
        return ""

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

    def problems(self, records: Mapping[str, Record], latest: date) -> Iterator[Problem]:
        versions = self.data["versions"]
        for version in versions:
            yield from self._range(version)
            yield from self._date(version["checked"], latest)
        units = sorted({version["unit"] for version in versions if "unit" in version})
        if len(units) > 1:
            yield self._problem(f"versions in different units: {', '.join(units)}")

    def _details(self) -> Iterator[str]:
        for version in self.data["versions"]:
            said = ", ".join(part for part in (self._number(version), version.get("note")) if part)
            source = f"[{version['source']['title']}]({version['source']['url']})"
            yield f"{said + ': ' if said else ''}{source}, checked {version['checked']}"


@dataclass(frozen=True, slots=True)
class Coefficient(Record):
    """A number the model is tuned with that no source states, fitted to facts."""

    KIND: ClassVar[str] = "a coefficient"

    def problems(self, records: Mapping[str, Record], latest: date) -> Iterator[Problem]:
        yield from self._range(self.data)
        yield from self._date(self.data["fitted"], latest)
        for fact in self.data["fitted_to"]:
            if not isinstance(records.get(fact), Fact):
                yield self._problem(f"fitted to {fact}, which isn't a fact here")

    def _details(self) -> Iterator[str]:
        facts = ", ".join(self.data["fitted_to"])
        yield f"{self._number(self.data)}, fitted to {facts} on {self.data['fitted']}"


@dataclass(frozen=True, slots=True)
class Question(Record):
    """What no source answers, open until an expert answers it."""

    KIND: ClassVar[str] = "a question"

    @property
    def open(self) -> bool:
        return True

    def problems(self, records: Mapping[str, Record], latest: date) -> Iterator[Problem]:
        for about in self.data.get("about", []):
            if about not in records:
                yield self._problem(f"about {about}, which isn't a record here")

    def _text(self) -> str:
        return str(self.data["question"])

    def _details(self) -> Iterator[str]:
        if "about" in self.data:
            yield f"About: {', '.join(self.data['about'])}"


class FactFile:
    """One JSON file of records."""

    KINDS: ClassVar[dict[str, type[Record]]] = {
        "fact": Fact,
        "coefficient": Coefficient,
        "question": Question,
    }

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
        records = len(self.records())
        files = len(self._files)
        return f"{records} records in {files} file{'' if files == 1 else 's'}: fine."

    def records(self) -> list[Record]:
        """All the files' records, in the files' order, once there are no problems."""
        return [record for file in self._files for record in file.records]

    def _between_records(self) -> Iterator[Problem]:
        records = self.records()
        by_id = {record.id: record for record in records}
        seen: set[str] = set()
        for record in records:
            if record.id in seen:
                yield Problem(record.file, record.id, "this id is used twice")
            seen.add(record.id)
            yield from record.problems(by_id, self._latest)


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
