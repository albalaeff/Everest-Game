"""Checks the knowledge base: no record without a source or a check date (#9).

    uv run python scripts/check_facts.py

The records are the JSON files in content/facts/, and docs/conventions/knowledge-base.md says
how to write one. Each file must pass content/facts.schema.json; once they all do, this checks
what a schema can't see: an id used twice, a coefficient fitted to a fact that isn't there, a
question about a record that isn't, a range upside down, versions in different units, a date
in the future, a medicine's dose, a death no source dates or places, an accident naming a death
that isn't there (#14). `pytest` runs it on the real files (tests/test_check_facts_script.py),
which is what fails CI, and holds the chronicle to the Himalayan Database's totals there. Each
record also says how it reads on an expert's list (scripts/expert_questions.py, #15).
"""

import json
import re
import sys
from collections.abc import Iterable, Iterator, Mapping
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any, ClassVar

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[1]
FACTS = ROOT / "content" / "facts"
SCHEMA = ROOT / "content" / "facts.schema.json"

# An amount of a medicine, alone or per something (mg/kg): 2 L/min of oxygen isn't one
DOSE_UNIT = re.compile(r"(?:mg|mcg|µg|μg|g|ml|IU)(?:/\S+)?", re.IGNORECASE)
DOSE = re.compile(rf"\d\s*{DOSE_UNIT.pattern}\b", re.IGNORECASE)


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

    def _said(self, version: Mapping[str, Any]) -> str:
        """What one source says, in a number or in words, where it has them."""
        return ", ".join(part for part in (self._number(version), version.get("note")) if part)

    def _told(self, version: Mapping[str, Any]) -> str:
        """What one source says, and the source with its check date."""
        said = self._said(version)
        source = f"[{version['source']['title']}]({version['source']['url']})"
        return f"{said + ': ' if said else ''}{source}, checked {version['checked']}"

    def _problem(self, what: str, about: str = "") -> Problem:
        return Problem(self.file, self.id, f"{about}: {what}" if about else what)

    def _versions(
        self, versions: list[Mapping[str, Any]], latest: date, about: str = ""
    ) -> Iterator[Problem]:
        """What the sources say, as versions: each range upwards, each check date past, all in
        one unit."""
        for version in versions:
            yield from self._range(version, about)
            yield from self._date(version["checked"], latest, about)
        units = sorted({version["unit"] for version in versions if "unit" in version})
        if len(units) > 1:
            yield self._problem(f"versions in different units: {', '.join(units)}", about)

    def _range(self, measure: Mapping[str, Any], about: str = "") -> Iterator[Problem]:
        bounds = measure.get("range")
        if bounds and bounds["min"] >= bounds["max"]:
            what = f"the range {bounds['min']}–{bounds['max']} doesn't run upwards"
            yield self._problem(what, about)

    def _date(self, text: str, latest: date, about: str = "") -> Iterator[Problem]:
        if date.fromisoformat(text) > latest:
            yield self._problem(f"the date {text} is in the future", about)

    def _doses(self, texts: Iterable[str], units: Iterable[str]) -> Iterator[Problem]:
        """Never a dose (docs/conventions/knowledge-base.md): a doctor prescribes those."""
        found = [match.group() for text in texts for match in DOSE.finditer(text)]
        found += [unit for unit in units if DOSE_UNIT.fullmatch(unit)]
        if found:
            yield self._problem(f"a dose, which the knowledge base never gives: {', '.join(found)}")


@dataclass(frozen=True, slots=True)
class Fact(Record):
    """What the sources say, a version for each that disagrees."""

    def problems(self, records: Mapping[str, Record], latest: date) -> Iterator[Problem]:
        versions = self.data["versions"]
        yield from self._versions(versions, latest)
        units = sorted({version["unit"] for version in versions if "unit" in version})
        notes = [version["note"] for version in versions if "note" in version]
        yield from self._doses([self.data["claim"], *notes], units)

    @property
    def bounds(self) -> tuple[float, float]:
        """The lowest and the highest number its sources give."""
        lows: list[float] = []
        highs: list[float] = []
        for version in self.data["versions"]:
            if "value" in version:
                lows.append(version["value"])
                highs.append(version["value"])
            elif "range" in version:
                lows.append(version["range"]["min"])
                highs.append(version["range"]["max"])
        return min(lows), max(highs)

    def _details(self) -> Iterator[str]:
        for version in self.data["versions"]:
            yield self._told(version)


@dataclass(frozen=True, slots=True)
class Coefficient(Record):
    """A number the model is tuned with that no source states, fitted to facts."""

    KIND: ClassVar[str] = "a coefficient"

    def problems(self, records: Mapping[str, Record], latest: date) -> Iterator[Problem]:
        yield from self._range(self.data)
        yield from self._date(self.data["fitted"], latest)
        yield from self._doses([self.data["claim"]], [self.data["unit"]])
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


@dataclass(frozen=True, slots=True)
class Death(Record):
    """One of the recorded dead: what each source says of the death (#14)."""

    KIND: ClassVar[str] = "a death"
    TOLD: ClassVar[tuple[str, ...]] = ("date", "place", "cause")

    def problems(self, records: Mapping[str, Record], latest: date) -> Iterator[Problem]:
        versions = self.data["versions"]
        yield from self._versions(versions, latest)
        for version in versions:
            if "date" in version:
                yield from self._date(version["date"], latest)
        for field in self.TOLD:
            if not any(field in version for version in versions):
                yield self._problem(f"no source says the {field}")

    @property
    def day(self) -> date:
        """The earliest day its sources give."""
        return min(
            date.fromisoformat(version["date"])
            for version in self.data["versions"]
            if "date" in version
        )

    def _text(self) -> str:
        hired = ", hired" if self.data["hired"] else ""
        return f"{self.data['name']}, {self.data['citizenship']}{hired}"

    def _details(self) -> Iterator[str]:
        for version in self.data["versions"]:
            yield self._told(version)

    def _said(self, version: Mapping[str, Any]) -> str:
        """When, where, how high, of what, where on the climb, and the words: what it has."""
        parts = [version.get("date"), version.get("place")]
        if "altitude" in version:
            parts.append(f"{version['altitude']} m")
        parts += [version.get("cause"), version.get("phase"), version.get("note")]
        return ", ".join(str(part) for part in parts if part)


@dataclass(frozen=True, slots=True)
class Accident(Record):
    """An accident told in full: its dates, weather, crowd, chain of decisions and its dead
    (#14)."""

    KIND: ClassVar[str] = "an accident"

    def problems(self, records: Mapping[str, Record], latest: date) -> Iterator[Problem]:
        began, until = self.data["date"], self.data.get("until")
        yield from self._date(began, latest)
        if until:
            yield from self._date(until, latest)
            if until < began:
                yield self._problem(f"it ends on {until}, before it begins on {began}")
        yield from self._versions(self.data["weather"]["versions"], latest, "the weather")
        yield from self._versions(self.data["crowd"]["versions"], latest, "the crowd")
        for number, step in enumerate(self.data["chain"], 1):
            yield from self._versions(step["versions"], latest, f"step {number}")
        for death in self.data["deaths"]:
            if not isinstance(records.get(death), Death):
                yield self._problem(f"names {death}, which isn't a death here")

    def _text(self) -> str:
        until = f" to {self.data['until']}" if "until" in self.data else ""
        return f"{self.data['title']}, {self.data['date']}{until}"

    def _details(self) -> Iterator[str]:
        yield self._statement("Weather", self.data["weather"])
        yield self._statement("Crowd", self.data["crowd"])
        for number, step in enumerate(self.data["chain"], 1):
            when = f", {step['when']}" if "when" in step else ""
            yield self._statement(f"Step {number}{when}", step)
        yield f"Dead: {', '.join(self.data['deaths'])}"
        yield f"Lesson: {self.data['lesson']} Scenario: {self.data['scenario']}"

    def _statement(self, name: str, statement: Mapping[str, Any]) -> str:
        """What happened or held, and what each source says of it."""
        told = "; ".join(self._told(version) for version in statement["versions"])
        return f"{name}: {statement['what']} ({told})"


class FactFile:
    """One JSON file of records."""

    KINDS: ClassVar[dict[str, type[Record]]] = {
        "fact": Fact,
        "coefficient": Coefficient,
        "question": Question,
        "death": Death,
        "accident": Accident,
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
