"""scripts/check_library.py: the medical records cite the library, and it's all cited (#130)."""

import json
from datetime import date
from pathlib import Path
from typing import Any

import pytest
from jsonschema import Draft202012Validator

from scripts.check_facts import SCHEMA, KnowledgeBase
from scripts.check_library import LIBRARY_SCHEMA, Library, main

TODAY = date(2026, 11, 3)
CDC = "https://www.cdc.gov/yellow-book/altitude.html"
UIAA = "https://www.theuiaa.org/documents/rec-2.pdf"


def book(url: str = CDC, **fields: Any) -> dict[str, Any]:
    """A source of the library, read on TODAY."""
    found = {"title": "CDC Yellow Book 2026", "url": url, "published": 2026, "use": "Guidance."}
    return found | {"read": "2026-11-03"} | fields


def fact(id: str = "medicine.ams-symptoms", *urls: str) -> dict[str, Any]:
    """A fact with a version for each link, CDC's by default."""
    versions = [
        {"source": {"title": "A section", "url": url}, "checked": "2026-11-03"}
        for url in urls or (CDC,)
    ]
    record = {"id": id, "kind": "fact", "claim": "Headache and more.", "status": "source only"}
    return record | {"versions": versions}


def library(
    tmp_path: Path, sources: list[dict[str, Any]], *records: dict[str, Any], **fields: Any
) -> Library:
    """The library of these sources, against a knowledge base of these records."""
    facts = tmp_path / "facts"
    facts.mkdir()
    (facts / "facts.json").write_text(json.dumps({"facts": list(records)}), encoding="utf-8")
    path = tmp_path / "library.json"
    data = {"areas": ["medicine"], "sources": sources} | fields
    path.write_text(json.dumps(data), encoding="utf-8")
    return Library(path, LIBRARY_SCHEMA, KnowledgeBase(facts, SCHEMA, TODAY), TODAY)


def problems(tmp_path: Path, sources: list[dict[str, Any]], *records: dict[str, Any]) -> list[str]:
    return [str(problem) for problem in library(tmp_path, sources, *records).problems()]


@pytest.mark.unit
class TestTheLibrary:
    def test_records_citing_its_sources_pass(self, tmp_path: Path) -> None:
        both = fact("medicine.hace-symptoms", CDC, UIAA)
        assert problems(tmp_path, [book(), book(UIAA)], fact(), both) == []

    def test_a_section_s_title_may_differ_from_the_book_s(self, tmp_path: Path) -> None:
        """A version names the section it read: the link alone ties it to the library."""
        assert problems(tmp_path, [book()], fact()) == []

    def test_a_medical_record_citing_another_source_fails(self, tmp_path: Path) -> None:
        found = problems(tmp_path, [book()], fact(), fact("medicine.hape", "https://blog.example"))
        assert found == [
            "facts.json: medicine.hape: cites https://blog.example, which isn't in the library"
        ]

    def test_a_record_of_another_area_may_cite_anything(self, tmp_path: Path) -> None:
        other = fact("acclimatization.everest-rotations", "https://www.alanarnette.com/")
        assert problems(tmp_path, [book()], fact(), other) == []

    def test_a_source_no_record_cites_fails(self, tmp_path: Path) -> None:
        found = problems(tmp_path, [book(), book(UIAA, title="UIAA No 2")], fact())
        assert found == ["library.json: UIAA No 2: no record cites it"]

    def test_a_source_cited_from_another_area_counts(self, tmp_path: Path) -> None:
        assert problems(tmp_path, [book()], fact("acclimatization.threshold", CDC)) == []

    def test_a_source_listed_twice_fails(self, tmp_path: Path) -> None:
        found = problems(tmp_path, [book(), book()], fact())
        assert found == [f"library.json: CDC Yellow Book 2026: {CDC} is listed twice"]

    @pytest.mark.parametrize("read", ["2026-11-05", "2027-01-01"])
    def test_a_reading_in_the_future_fails(self, tmp_path: Path, read: str) -> None:
        found = problems(tmp_path, [book(read=read)], fact())
        assert found == [f"library.json: CDC Yellow Book 2026: the date {read} is in the future"]

    def test_a_reading_on_the_next_day_passes(self, tmp_path: Path) -> None:
        """The reader's day: CI's UTC can still be on the day before."""
        assert problems(tmp_path, [book(read="2026-11-04")], fact()) == []

    def test_a_knowledge_base_with_problems_is_checked_first(self, tmp_path: Path) -> None:
        broken = {"id": "medicine.ams-symptoms", "kind": "fact"}
        found = problems(tmp_path, [book()], broken)
        assert found == [
            "the knowledge base has problems first: uv run python scripts/check_facts.py"
        ]


@pytest.mark.unit
class TestTheFile:
    @pytest.mark.parametrize("name", ["title", "url", "published", "use", "read"])
    def test_a_source_without_a_field_fails(self, tmp_path: Path, name: str) -> None:
        source = {key: value for key, value in book().items() if key != name}
        found = problems(tmp_path, [source], fact())
        assert len(found) == 1
        assert f"'{name}' is a required property" in found[0]

    def test_a_source_s_link_is_a_web_link(self, tmp_path: Path) -> None:
        assert problems(tmp_path, [book(url="cdc.gov/altitude")], fact()) != []

    def test_a_field_the_format_doesn_t_know_fails(self, tmp_path: Path) -> None:
        assert problems(tmp_path, [book(pages=12)], fact()) != []

    def test_the_library_binds_an_area_or_more(self, tmp_path: Path) -> None:
        found = [str(p) for p in library(tmp_path, [book()], fact(), areas=[]).problems()]
        assert found and "should be non-empty" in found[0]

    def test_a_file_that_isn_t_json_fails(self, tmp_path: Path) -> None:
        bound = library(tmp_path, [book()], fact())
        (tmp_path / "library.json").write_text("{", encoding="utf-8")
        reread = Library(tmp_path / "library.json", LIBRARY_SCHEMA, bound.base, TODAY)
        assert [str(p).split(":")[0] for p in reread.problems()] == ["library.json"]

    def test_the_schema_is_a_schema(self) -> None:
        Draft202012Validator.check_schema(json.loads(LIBRARY_SCHEMA.read_text(encoding="utf-8")))


class TestTheRealFiles:
    def test_the_medical_records_and_the_library_agree(self) -> None:
        """This is CI's check: a medical record outside the library, or a source unused, fails."""
        assert [str(problem) for problem in Library().problems()] == []


@pytest.mark.unit
class TestMain:
    def test_it_says_how_many_sources_are_cited(
        self, tmp_path: Path, capsys: pytest.CaptureFixture[str]
    ) -> None:
        both = fact("medicine.hace-symptoms", CDC, UIAA)
        assert main(library(tmp_path, [book(), book(UIAA)], fact(), both)) == 0
        assert capsys.readouterr().out == "2 sources, cited by 2 records: fine.\n"

    def test_it_lists_the_problems_and_fails(
        self, tmp_path: Path, capsys: pytest.CaptureFixture[str]
    ) -> None:
        assert main(library(tmp_path, [book(), book(UIAA, title="UIAA No 2")], fact())) == 1
        assert capsys.readouterr().out == "library.json: UIAA No 2: no record cites it\n"
