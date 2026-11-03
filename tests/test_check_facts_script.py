"""scripts/check_facts.py: no record in the knowledge base without a source or a check date (#9)."""

import json
from datetime import date
from pathlib import Path
from typing import Any

import pytest
from jsonschema import Draft202012Validator

from scripts.check_facts import ROOT, SCHEMA, KnowledgeBase, main

TODAY = date(2026, 11, 2)
SOURCE = {"title": "Arnette", "url": "https://www.alanarnette.com/blog/?p=16718"}
DRUG = "medicine.a-drug"


def version(**fields: Any) -> dict[str, Any]:
    """What one source says: 2–4 L/min, checked on the day before TODAY."""
    found = {"range": {"min": 2, "max": 4}, "unit": "L/min"}
    return {**found, "source": SOURCE, "checked": "2026-11-01"} | fields


def fact(id: str = "oxygen.usual-flow", **fields: Any) -> dict[str, Any]:
    record = {"id": id, "kind": "fact", "claim": "The usual flow.", "status": "source only"}
    return record | {"versions": [version()]} | fields


def coefficient(id: str = "body.fatigue-rate", **fields: Any) -> dict[str, Any]:
    record = {
        "id": id,
        "kind": "coefficient",
        "claim": "Fatigue per hour.",
        "status": "source only",
    }
    fit = {"value": 0.2, "unit": "1/h", "fitted_to": ["oxygen.usual-flow"], "fitted": "2026-11-01"}
    return record | fit | fields


def without(record: dict[str, Any], name: str) -> dict[str, Any]:
    return {key: value for key, value in record.items() if key != name}


def base(folder: Path, *records: dict[str, Any], name: str = "facts.json") -> KnowledgeBase:
    """The knowledge base of a folder with these records, against the real schema."""
    folder.mkdir(exist_ok=True)
    (folder / name).write_text(json.dumps({"facts": list(records)}), encoding="utf-8")
    return KnowledgeBase(folder, SCHEMA, TODAY)


def problems(tmp_path: Path, *records: dict[str, Any]) -> list[str]:
    return [str(problem) for problem in base(tmp_path, *records).problems()]


# --- what a record may be ----------------------------------------------------------------------


@pytest.mark.unit
class TestGoodRecords:
    @pytest.mark.parametrize(
        "record",
        [
            fact(),
            fact(status="expert-reviewed"),
            fact(versions=[without(version(), "range") | {"value": 48, "unit": "km/h"}]),
            fact(versions=[version(), version(range={"min": 3, "max": 5})]),
            fact(versions=[{"source": SOURCE, "checked": "2026-11-01"}]),
            fact(versions=[{"note": "Descend.", "source": SOURCE, "checked": "2026-11-01"}]),
        ],
        ids=["range", "reviewed", "value", "two versions", "no number", "in words"],
    )
    def test_a_fact_passes(self, tmp_path: Path, record: dict[str, Any]) -> None:
        assert problems(tmp_path, record) == []

    def test_a_coefficient_fitted_to_facts_passes(self, tmp_path: Path) -> None:
        assert problems(tmp_path, fact(), coefficient()) == []

    def test_a_coefficient_may_be_a_range(self, tmp_path: Path) -> None:
        tuned = without(coefficient(), "value") | {"range": {"min": 0.1, "max": 0.3}}
        assert problems(tmp_path, fact(), tuned) == []


@pytest.mark.unit
class TestBadRecords:
    @pytest.mark.parametrize("name", ["source", "checked"])
    def test_a_version_without_its_source_or_check_date_fails(
        self, tmp_path: Path, name: str
    ) -> None:
        found = problems(tmp_path, fact(versions=[without(version(), name)]))
        assert len(found) == 1
        assert f"'{name}' is a required property" in found[0]

    def test_one_bad_version_among_good_ones_fails(self, tmp_path: Path) -> None:
        versions = [version(), without(version(), "source")]
        assert problems(tmp_path, fact(versions=versions)) != []

    @pytest.mark.parametrize("name", ["id", "kind", "claim", "status"])
    def test_a_record_without_a_field_fails(self, tmp_path: Path, name: str) -> None:
        assert problems(tmp_path, without(fact(), name)) != []

    def test_a_fact_without_versions_fails(self, tmp_path: Path) -> None:
        assert problems(tmp_path, without(fact(), "versions")) != []
        assert problems(tmp_path, fact(versions=[])) != []

    @pytest.mark.parametrize("status", ["reviewed", "source-only", ""])
    def test_only_the_two_statuses_pass(self, tmp_path: Path, status: str) -> None:
        assert problems(tmp_path, fact(status=status)) != []

    def test_a_source_needs_a_title_and_a_web_link(self, tmp_path: Path) -> None:
        for source in ({"url": SOURCE["url"]}, {"title": "A", "url": "the book on my shelf"}):
            assert problems(tmp_path, fact(versions=[version(source=source)])) != []

    @pytest.mark.parametrize("checked", ["01.11.2026", "2026-13-01", "20261101", "soon"])
    def test_a_check_date_is_a_real_date(self, tmp_path: Path, checked: str) -> None:
        assert problems(tmp_path, fact(versions=[version(checked=checked)])) != []

    def test_a_version_has_a_value_or_a_range_not_both(self, tmp_path: Path) -> None:
        assert problems(tmp_path, fact(versions=[version(value=3)])) != []

    def test_a_number_needs_its_unit(self, tmp_path: Path) -> None:
        assert problems(tmp_path, fact(versions=[without(version(), "unit")])) != []

    def test_a_misspelt_field_fails(self, tmp_path: Path) -> None:
        assert problems(tmp_path, fact(sorce="Arnette")) != []
        assert problems(tmp_path, fact(versions=[version(chekced="2026-11-01")])) != []

    @pytest.mark.parametrize("name", ["fitted_to", "fitted", "unit"])
    def test_a_coefficient_without_its_fit_fails(self, tmp_path: Path, name: str) -> None:
        assert problems(tmp_path, fact(), without(coefficient(), name)) != []

    def test_a_coefficient_has_a_number(self, tmp_path: Path) -> None:
        assert problems(tmp_path, fact(), without(coefficient(), "value")) != []

    def test_a_coefficient_names_at_least_one_fact(self, tmp_path: Path) -> None:
        assert problems(tmp_path, fact(), coefficient(fitted_to=[])) != []


# --- what the schema can't see -----------------------------------------------------------------


@pytest.mark.unit
class TestAcrossRecords:
    def test_an_id_is_used_once_in_a_file(self, tmp_path: Path) -> None:
        assert any("used twice" in problem for problem in problems(tmp_path, fact(), fact()))

    def test_an_id_is_used_once_across_files(self, tmp_path: Path) -> None:
        base(tmp_path, fact(), name="one.json")
        found = [str(problem) for problem in base(tmp_path, fact(), name="two.json").problems()]
        assert len(found) == 1
        assert "used twice" in found[0]

    def test_a_coefficient_is_fitted_to_a_fact_that_exists(self, tmp_path: Path) -> None:
        found = problems(tmp_path, coefficient())
        assert len(found) == 1
        assert "oxygen.usual-flow" in found[0]

    def test_a_coefficient_isn_t_fitted_to_a_coefficient(self, tmp_path: Path) -> None:
        tuned = coefficient("body.pace-rate", fitted_to=["body.fatigue-rate"])
        assert len(problems(tmp_path, fact(), coefficient(), tuned)) == 1

    @pytest.mark.parametrize(
        "record",
        [
            fact(DRUG, claim="Doctors give 125 mg of it."),
            fact(DRUG, versions=[version(note="A dose of 0.15mg/kg.")]),
            fact(DRUG, versions=[version(note="4 µg a day.")]),
            fact(DRUG, versions=[without(version(), "range") | {"value": 250, "unit": "mg"}]),
            fact(DRUG, versions=[without(version(), "range") | {"value": 1, "unit": "mg/kg"}]),
            coefficient(unit="mL"),
        ],
        ids=["claim", "note", "micrograms", "value", "per kilo", "coefficient"],
    )
    def test_a_dose_fails(self, tmp_path: Path, record: dict[str, Any]) -> None:
        """docs/conventions/knowledge-base.md: never a dose, in a value, a claim or a note."""
        found = problems(tmp_path, fact(), record)
        assert len(found) == 1
        assert "dose" in found[0]

    @pytest.mark.parametrize(
        "claim",
        ["Sleep no more than 500 m higher.", "Breathe 2–4 L/min.", "Above 8,000 m.", "A gamow."],
    )
    def test_other_numbers_aren_t_doses(self, tmp_path: Path, claim: str) -> None:
        assert problems(tmp_path, fact(claim=claim)) == []

    def test_a_range_runs_upwards(self, tmp_path: Path) -> None:
        for bounds in ({"min": 4, "max": 2}, {"min": 3, "max": 3}):
            found = problems(tmp_path, fact(versions=[version(range=bounds)]))
            assert len(found) == 1
            assert "range" in found[0]

    def test_a_coefficient_s_range_runs_upwards(self, tmp_path: Path) -> None:
        tuned = without(coefficient(), "value") | {"range": {"min": 0.3, "max": 0.1}}
        assert len(problems(tmp_path, fact(), tuned)) == 1

    def test_versions_share_a_unit(self, tmp_path: Path) -> None:
        versions = [version(), version(unit="L/h")]
        found = problems(tmp_path, fact(versions=versions))
        assert len(found) == 1
        assert "units" in found[0]

    def test_a_version_in_words_shares_any_unit(self, tmp_path: Path) -> None:
        in_words = {"note": "About 3.", "source": SOURCE, "checked": "2026-11-01"}
        assert problems(tmp_path, fact(versions=[version(), in_words])) == []

    @pytest.mark.parametrize("checked", ["2026-11-02", "2026-11-03"])
    def test_a_check_date_may_be_today_where_its_author_is(
        self, tmp_path: Path, checked: str
    ) -> None:
        """CI runs in UTC: a check made that day in Nepal can read as tomorrow there."""
        assert problems(tmp_path, fact(versions=[version(checked=checked)])) == []

    def test_a_check_date_in_the_future_fails(self, tmp_path: Path) -> None:
        found = problems(tmp_path, fact(versions=[version(checked="2026-11-04")]))
        assert len(found) == 1
        assert "2026-11-04" in found[0]

    def test_a_fit_date_in_the_future_fails(self, tmp_path: Path) -> None:
        assert len(problems(tmp_path, fact(), coefficient(fitted="2027-01-01"))) == 1

    def test_the_rest_waits_for_the_schema(self, tmp_path: Path) -> None:
        """A record the schema refuses has no shape to check, and must not read as missing."""
        found = problems(tmp_path, without(fact(), "status"), coefficient())
        assert len(found) == 1
        assert "'status' is a required property" in found[0]


# --- the files ---------------------------------------------------------------------------------


@pytest.mark.unit
class TestFiles:
    def test_a_problem_names_its_file_and_record(self, tmp_path: Path) -> None:
        found = problems(tmp_path, fact(versions=[without(version(), "checked")]))
        assert found[0].startswith("facts.json: facts[0].versions[0]: ")

    def test_a_folder_with_no_files_fails(self, tmp_path: Path) -> None:
        found = list(KnowledgeBase(tmp_path, SCHEMA, TODAY).problems())
        assert [problem.what for problem in found] == ["no fact files here"]

    def test_a_file_with_no_records_fails(self, tmp_path: Path) -> None:
        assert problems(tmp_path) != []

    @pytest.mark.parametrize("text", [b"{ not json", b"\xff\xfe"], ids=["broken", "not UTF-8"])
    def test_a_file_that_doesn_t_read_is_a_problem(self, tmp_path: Path, text: bytes) -> None:
        (tmp_path / "broken.json").write_bytes(text)
        found = list(KnowledgeBase(tmp_path, SCHEMA, TODAY).problems())
        assert len(found) == 1
        assert found[0].file == "broken.json"

    def test_the_schema_is_a_schema(self) -> None:
        Draft202012Validator.check_schema(json.loads(SCHEMA.read_text(encoding="utf-8")))


class TestTheRealFiles:
    def test_every_record_passes(self) -> None:
        """This is CI's check: `pytest` fails on a record without a source or a check date."""
        folder = ROOT / "content" / "facts"
        assert [str(problem) for problem in KnowledgeBase(folder, SCHEMA).problems()] == []


@pytest.mark.unit
class TestMain:
    def test_it_says_how_many_records_passed(
        self, tmp_path: Path, capsys: pytest.CaptureFixture[str]
    ) -> None:
        assert main(base(tmp_path, fact(), coefficient())) == 0
        assert capsys.readouterr().out == "2 records in 1 file: fine.\n"

    def test_it_lists_the_problems_and_fails(
        self, tmp_path: Path, capsys: pytest.CaptureFixture[str]
    ) -> None:
        assert main(base(tmp_path, fact(versions=[without(version(), "source")]))) == 1
        assert "'source' is a required property" in capsys.readouterr().out
