"""Checks the medical library: the medical records cite only its sources, and cite them all (#130).

    uv run python scripts/check_library.py

content/library.json lists the open sources the game's medicine rests on, each read in full
(docs/conventions/knowledge-base.md → The medical library). Its `areas` are the knowledge
base's areas bound to it: a record there with a source outside the library fails, and so does
a source of the library that no record cites, read but left unused. A version's title names
the section it read, so its link alone ties it to the library. `pytest` runs it on the real
files (tests/test_check_library_script.py), which is what fails CI.
"""

import json
import sys
from collections.abc import Iterator
from datetime import date
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))  # run as a script, it still finds scripts

from scripts.check_facts import FACTS, KnowledgeBase, Problem, Record  # noqa: E402

LIBRARY = ROOT / "content" / "library.json"
LIBRARY_SCHEMA = ROOT / "content" / "library.schema.json"


def cited(record: Record) -> list[str]:
    """The links a record's versions cite: a fact's; a coefficient or a question has none."""
    return [str(version["source"]["url"]) for version in record.data.get("versions", [])]


class Library:
    """The library's file, and the knowledge base it's checked against."""

    def __init__(
        self,
        path: Path = LIBRARY,
        schema: Path = LIBRARY_SCHEMA,
        base: KnowledgeBase | None = None,
        today: date | None = None,
    ) -> None:
        self._name = path.name
        self.base = base or KnowledgeBase(FACTS, today=today)
        self._latest = (today or date.today()) + KnowledgeBase.LEEWAY
        self._data: Any = None
        try:
            self._data = json.loads(path.read_text(encoding="utf-8"))
        except ValueError as error:  # not JSON, or not UTF-8
            self._problems = [Problem(self._name, "", f"doesn't read: {error}")]
            return
        validator = Draft202012Validator(
            json.loads(schema.read_text(encoding="utf-8")),
            format_checker=Draft202012Validator.FORMAT_CHECKER,
        )
        self._problems = [
            Problem(self._name, error.json_path.removeprefix("$."), error.message)
            for error in validator.iter_errors(self._data)
        ]

    def problems(self) -> list[Problem]:
        """The file's problems; once there are none, the knowledge base's, if it has any; and
        only once it has none, those between the records and the library."""
        if self._problems:
            return self._problems
        if self.base.problems():
            command = "uv run python scripts/check_facts.py"
            return [Problem("", "", f"the knowledge base has problems first: {command}")]
        return list(self._sources()) + list(self._records())

    def summary(self) -> str:
        areas = set(self._data["areas"])
        records = [r for r in self.base.records() if r.area in areas and cited(r)]
        sources = len(self._data["sources"])
        return f"{sources} sources, cited by {len(records)} records: fine."

    def _sources(self) -> Iterator[Problem]:
        cited_anywhere = {url for record in self.base.records() for url in cited(record)}
        seen: set[str] = set()
        for source in self._data["sources"]:
            title, url = source["title"], source["url"]
            if url in seen:
                yield Problem(self._name, title, f"{url} is listed twice")
            seen.add(url)
            if date.fromisoformat(source["read"]) > self._latest:
                yield Problem(self._name, title, f"the date {source['read']} is in the future")
            if url not in cited_anywhere:
                yield Problem(self._name, title, "no record cites it")

    def _records(self) -> Iterator[Problem]:
        areas = set(self._data["areas"])
        books = {source["url"] for source in self._data["sources"]}
        for record in self.base.records():
            if record.area not in areas:
                continue
            for url in cited(record):
                if url not in books:
                    yield Problem(
                        record.file, record.id, f"cites {url}, which isn't in the library"
                    )


def main(library: Library | None = None) -> int:
    library = library or Library()
    problems = library.problems()
    for problem in problems:
        print(problem)
    if problems:
        return 1
    print(library.summary())
    return 0


if __name__ == "__main__":
    sys.exit(main())
