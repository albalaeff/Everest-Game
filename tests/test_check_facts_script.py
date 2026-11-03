"""scripts/check_facts.py: no record in the knowledge base without a source or a check date (#9)."""

import json
from datetime import date
from pathlib import Path
from typing import Any

import pytest
from jsonschema import Draft202012Validator

from scripts.check_facts import ROOT, SCHEMA, Death, Fact, KnowledgeBase, main

TODAY = date(2026, 11, 2)
SOURCE = {"title": "Arnette", "url": "https://www.alanarnette.com/blog/?p=16718"}
DRUG = "medicine.a-drug"
DEATH = "deaths.1990-05-11-a-climber"  # made up, as is everything about it below


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


def question(id: str = "technique.re-clipping", **fields: Any) -> dict[str, Any]:
    return {"id": id, "kind": "question", "question": "Which cowstail first?"} | fields


def words(note: str = "Descend.", **fields: Any) -> dict[str, Any]:
    """What one source says in words only."""
    return {"note": note, "source": SOURCE, "checked": "2026-11-01"} | fields


def death_version(**fields: Any) -> dict[str, Any]:
    """What one source says of a death: on the South Summit, of exposure, on the way down."""
    found = {"date": "1990-05-11", "place": "South Summit", "altitude": 8750}
    found |= {"cause": "exposure", "phase": "descent"}
    return found | {"source": SOURCE, "checked": "2026-11-01"} | fields


def death(id: str = DEATH, **fields: Any) -> dict[str, Any]:
    record = {"id": id, "kind": "death", "name": "A. Climber", "citizenship": "Nowhere"}
    record |= {"hired": False, "status": "source only"}
    return record | {"versions": [death_version()]} | fields


def statement(what: str = "It snowed.", **fields: Any) -> dict[str, Any]:
    """What happened or held, and what one source says of it."""
    return {"what": what, "versions": [words()]} | fields


def accident(id: str = "accidents.1990-storm", **fields: Any) -> dict[str, Any]:
    record = {"id": id, "kind": "accident", "title": "A storm, made up", "status": "source only"}
    record |= {"date": "1990-05-10", "until": "1990-05-11"}
    record |= {"weather": statement("A storm came in during the afternoon.")}
    record |= {"crowd": statement("Three teams on the ridge.")}
    record |= {"chain": [statement("The turnaround time passed.", when="10 May, 14:00")]}
    record |= {"deaths": [DEATH], "lesson": "The turnaround time is not up for discussion."}
    return record | {"scenario": "A storm on the ridge"} | fields


def without(record: dict[str, Any], *names: str) -> dict[str, Any]:
    return {key: value for key, value in record.items() if key not in names}


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
            fact(versions=[version(estimate=True)]),
        ],
        ids=["range", "reviewed", "value", "two versions", "no number", "in words", "estimate"],
    )
    def test_a_fact_passes(self, tmp_path: Path, record: dict[str, Any]) -> None:
        assert problems(tmp_path, record) == []

    def test_a_coefficient_fitted_to_facts_passes(self, tmp_path: Path) -> None:
        assert problems(tmp_path, fact(), coefficient()) == []

    def test_a_coefficient_may_be_a_range(self, tmp_path: Path) -> None:
        tuned = without(coefficient(), "value") | {"range": {"min": 0.1, "max": 0.3}}
        assert problems(tmp_path, fact(), tuned) == []

    def test_a_question_passes(self, tmp_path: Path) -> None:
        assert problems(tmp_path, question()) == []

    def test_a_question_may_be_about_records(self, tmp_path: Path) -> None:
        about = question(about=["oxygen.usual-flow", "body.fatigue-rate"])
        assert problems(tmp_path, fact(), coefficient(), about) == []


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

    def test_an_estimate_is_of_a_number(self, tmp_path: Path) -> None:
        in_words = {"note": "About 3.", "estimate": True, "source": SOURCE, "checked": "2026-11-01"}
        found = problems(tmp_path, fact(versions=[in_words]))
        assert len(found) == 1
        assert "is not valid under any of the given schemas" in found[0]

    @pytest.mark.parametrize("estimate", [False, "yes"])
    def test_an_estimate_is_true_or_left_out(self, tmp_path: Path, estimate: object) -> None:
        found = problems(tmp_path, fact(versions=[version(estimate=estimate)]))
        assert len(found) == 1
        assert "True was expected" in found[0]

    def test_a_coefficient_is_no_estimate(self, tmp_path: Path) -> None:
        """No source states it: it's the model's own number, fitted to facts."""
        assert problems(tmp_path, fact(), coefficient(estimate=True)) != []

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

    def test_a_question_asks_something(self, tmp_path: Path) -> None:
        assert problems(tmp_path, without(question(), "question")) != []
        assert problems(tmp_path, question(question="")) != []

    def test_a_question_has_no_status(self, tmp_path: Path) -> None:
        """It's open until an expert answers it, and the answer is a fact."""
        assert problems(tmp_path, question(status="source only")) != []

    def test_a_question_is_about_something_or_nothing(self, tmp_path: Path) -> None:
        assert problems(tmp_path, fact(), question(about=[])) != []
        about = question(about=["oxygen.usual-flow", "oxygen.usual-flow"])
        assert problems(tmp_path, fact(), about) != []


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

    def test_a_question_is_about_records_that_exist(self, tmp_path: Path) -> None:
        found = problems(tmp_path, fact(), question(about=["oxygen.usual-flow", "route.camp-2"]))
        assert len(found) == 1
        assert "route.camp-2" in found[0]

    def test_a_coefficient_isn_t_fitted_to_a_question(self, tmp_path: Path) -> None:
        tuned = coefficient(fitted_to=["technique.re-clipping"])
        assert len(problems(tmp_path, question(), tuned)) == 1

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

    def test_a_fact_s_bounds_span_its_sources(self, tmp_path: Path) -> None:
        one = without(version(), "range") | {"value": 1}
        versions = [version(), version(range={"min": 3, "max": 5}), words(), one]
        [record] = base(tmp_path, fact(versions=versions)).records()
        assert isinstance(record, Fact)
        assert record.bounds == (1, 5)


# --- the chronicle: the dead, and the accidents (#14) ------------------------------------------


@pytest.mark.unit
class TestGoodChronicleRecords:
    @pytest.mark.parametrize(
        "record",
        [
            death(),
            death(hired=True, status="expert-reviewed"),
            death(versions=[death_version(), death_version(date="1990-05-10")]),
            death(versions=[death_version(), words("Found in 1999.")]),
            death(versions=[death_version(date="1990")]),
            death(versions=[death_version(date="1990-05")]),
            death(versions=[without(death_version(), "place", "altitude", "phase")]),
        ],
        ids=[
            "one source",
            "hired, reviewed",
            "dates differ",
            "a second in words",
            "the year only",
            "the month only",
            "the least",
        ],
    )
    def test_a_death_passes(self, tmp_path: Path, record: dict[str, Any]) -> None:
        assert problems(tmp_path, record) == []

    @pytest.mark.parametrize(
        "phase",
        ["approach", "base-camp", "route-preparation", "ascent", "descent", "evacuation", "other"],
    )
    def test_a_death_s_phase_is_one_the_database_names(self, tmp_path: Path, phase: str) -> None:
        assert problems(tmp_path, death(versions=[death_version(phase=phase)])) == []

    def test_an_accident_passes(self, tmp_path: Path) -> None:
        assert problems(tmp_path, death(), accident()) == []

    def test_an_accident_may_last_a_day(self, tmp_path: Path) -> None:
        assert problems(tmp_path, death(), without(accident(), "until")) == []

    def test_a_step_may_carry_a_number(self, tmp_path: Path) -> None:
        counted = without(version(), "range") | {"value": 200, "unit": "climbers"}
        crowd = statement("About this many on the ridge.", versions=[counted])
        assert problems(tmp_path, death(), accident(crowd=crowd)) == []

    def test_a_step_may_carry_both_versions(self, tmp_path: Path) -> None:
        disputed = statement("When the turnaround was.", versions=[words("14:00"), words("13:00")])
        assert problems(tmp_path, death(), accident(chain=[disputed])) == []


@pytest.mark.unit
class TestBadChronicleRecords:
    @pytest.mark.parametrize("name", ["name", "citizenship", "hired", "status", "versions"])
    def test_a_death_without_a_field_fails(self, tmp_path: Path, name: str) -> None:
        assert problems(tmp_path, without(death(), name)) != []

    @pytest.mark.parametrize("name", ["source", "checked"])
    def test_a_death_s_version_without_its_source_or_check_date_fails(
        self, tmp_path: Path, name: str
    ) -> None:
        found = problems(tmp_path, death(versions=[without(death_version(), name)]))
        assert len(found) == 1
        assert f"'{name}' is a required property" in found[0]

    @pytest.mark.parametrize("cause", ["storm", "Exposure", "HAPE", ""])
    def test_a_death_s_cause_is_one_the_database_names(self, tmp_path: Path, cause: str) -> None:
        assert problems(tmp_path, death(versions=[death_version(cause=cause)])) != []

    @pytest.mark.parametrize("phase", ["summit", "Descent", "camp", ""])
    def test_a_death_s_phase_is_no_other(self, tmp_path: Path, phase: str) -> None:
        assert problems(tmp_path, death(versions=[death_version(phase=phase)])) != []

    @pytest.mark.parametrize(
        "date_", ["11.05.1990", "1990-13", "1990-05-32", "1990-5", "May 1990", "199"]
    )
    def test_a_death_s_date_is_a_real_date(self, tmp_path: Path, date_: str) -> None:
        assert problems(tmp_path, death(versions=[death_version(date=date_)])) != []

    @pytest.mark.parametrize("hired", ["no", 0, None])
    def test_hired_is_yes_or_no(self, tmp_path: Path, hired: Any) -> None:
        assert problems(tmp_path, death(hired=hired)) != []

    def test_a_misspelt_field_fails(self, tmp_path: Path) -> None:
        assert problems(tmp_path, death(nam="A. Climber")) != []
        assert problems(tmp_path, death(versions=[death_version(plase="South Summit")])) != []
        assert problems(tmp_path, death(), accident(leson="Turn around.")) != []
        assert problems(tmp_path, death(), accident(chain=[statement(wen="14:00")])) != []

    @pytest.mark.parametrize(
        "name", ["title", "date", "weather", "crowd", "chain", "deaths", "lesson", "scenario"]
    )
    def test_an_accident_without_a_field_fails(self, tmp_path: Path, name: str) -> None:
        assert problems(tmp_path, death(), without(accident(), name)) != []

    def test_an_accident_s_chain_and_deaths_aren_t_empty(self, tmp_path: Path) -> None:
        assert problems(tmp_path, death(), accident(chain=[])) != []
        assert problems(tmp_path, death(), accident(deaths=[])) != []

    def test_a_step_needs_its_sources(self, tmp_path: Path) -> None:
        for step in ({"what": "It snowed."}, statement(versions=[])):
            assert problems(tmp_path, death(), accident(chain=[step])) != []
        unsourced = statement(versions=[without(words(), "source")])
        assert problems(tmp_path, death(), accident(weather=unsourced)) != []

    @pytest.mark.parametrize("date_", ["10.05.1990", "1990-05", "soon"])
    def test_an_accident_s_dates_are_real_dates(self, tmp_path: Path, date_: str) -> None:
        assert problems(tmp_path, death(), accident(date=date_)) != []
        assert problems(tmp_path, death(), accident(until=date_)) != []


@pytest.mark.unit
class TestAcrossTheChronicle:
    @pytest.mark.parametrize("name", ["date", "cause"])
    def test_some_source_says_a_death_s_date_and_cause(self, tmp_path: Path, name: str) -> None:
        versions = [without(death_version(), name), words("Also died.")]
        found = problems(tmp_path, death(versions=versions))
        assert len(found) == 1
        assert name in found[0]

    def test_a_death_no_source_places_passes(self, tmp_path: Path) -> None:
        """The Himalayan Database gives the altitude, and names the place only in its note."""
        assert problems(tmp_path, death(versions=[without(death_version(), "place")])) == []

    @pytest.mark.parametrize("date_", ["2026-11-04", "2026-12", "2027"])
    def test_a_death_s_date_in_the_future_fails(self, tmp_path: Path, date_: str) -> None:
        found = problems(tmp_path, death(versions=[death_version(date=date_)]))
        assert len(found) == 1
        assert date_ in found[0]

    def test_a_death_this_month_or_year_isn_t_in_the_future(self, tmp_path: Path) -> None:
        for date_ in ("2026-11", "2026"):
            assert problems(tmp_path, death(versions=[death_version(date=date_)])) == []

    def test_a_death_s_check_date_in_the_future_fails(self, tmp_path: Path) -> None:
        assert len(problems(tmp_path, death(versions=[death_version(checked="2027-01-01")]))) == 1

    def test_a_death_s_date_is_the_earliest_its_sources_give(self, tmp_path: Path) -> None:
        versions = [death_version(), death_version(date="1990-05-10"), words("Also died.")]
        [record] = base(tmp_path, death(versions=versions)).records()
        assert isinstance(record, Death)
        assert record.day == date(1990, 5, 10)

    @pytest.mark.parametrize(
        "date_, day", [("1990", date(1990, 1, 1)), ("1990-05", date(1990, 5, 1))]
    )
    def test_a_death_dated_by_its_year_or_month_counts_from_its_first_day(
        self, tmp_path: Path, date_: str, day: date
    ) -> None:
        [record] = base(tmp_path, death(versions=[death_version(date=date_)])).records()
        assert isinstance(record, Death)
        assert record.day == day

    def test_an_accident_names_deaths_that_are_here(self, tmp_path: Path) -> None:
        found = problems(tmp_path, accident())
        assert len(found) == 1
        assert DEATH in found[0]

    def test_an_accident_s_deaths_are_deaths(self, tmp_path: Path) -> None:
        found = problems(tmp_path, fact(), accident(deaths=["oxygen.usual-flow"]))
        assert len(found) == 1
        assert "oxygen.usual-flow" in found[0]

    def test_an_accident_ends_after_it_begins(self, tmp_path: Path) -> None:
        found = problems(tmp_path, death(), accident(until="1990-05-09"))
        assert len(found) == 1
        assert "1990-05-09" in found[0]

    def test_an_accident_s_dates_in_the_future_fail(self, tmp_path: Path) -> None:
        dated = accident(date="2026-11-04", until="2026-11-05")
        assert len(problems(tmp_path, death(), dated)) == 2

    def test_a_step_s_versions_share_a_unit(self, tmp_path: Path) -> None:
        mixed = statement("How much oxygen.", versions=[version(), version(unit="L/h")])
        found = problems(tmp_path, death(), accident(chain=[statement(), mixed]))
        assert len(found) == 1
        assert "step 2" in found[0]
        assert "units" in found[0]

    def test_a_step_s_range_runs_upwards(self, tmp_path: Path) -> None:
        upside_down = statement(versions=[version(range={"min": 4, "max": 2})])
        found = problems(tmp_path, death(), accident(crowd=upside_down))
        assert len(found) == 1
        assert "the crowd" in found[0]

    def test_a_step_s_check_date_in_the_future_fails(self, tmp_path: Path) -> None:
        late = statement(versions=[words(checked="2027-01-01")])
        assert len(problems(tmp_path, death(), accident(weather=late))) == 1

    def test_a_coefficient_isn_t_fitted_to_a_death(self, tmp_path: Path) -> None:
        found = problems(tmp_path, death(), coefficient(fitted_to=[DEATH]))
        assert len(found) == 1
        assert DEATH in found[0]

    def test_an_id_is_used_once_across_kinds(self, tmp_path: Path) -> None:
        found = problems(tmp_path, fact(DEATH), death())
        assert len(found) == 1
        assert "used twice" in found[0]


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
    FOLDER = ROOT / "content" / "facts"

    def test_every_record_passes(self) -> None:
        """This is CI's check: `pytest` fails on a record without a source or a check date."""
        assert [str(problem) for problem in KnowledgeBase(self.FOLDER, SCHEMA).problems()] == []

    @pytest.mark.parametrize(
        "total, first, last",
        [
            ("deaths.recorded-through-2025", date.min, date(2025, 12, 31)),
            ("deaths.recorded-spring-2026", date(2026, 1, 1), date(2026, 6, 30)),
        ],
        ids=["through 2025", "spring 2026"],
    )
    def test_every_recorded_death_is_here(self, total: str, first: date, last: date) -> None:
        """The chronicle holds every death the Himalayan Database records: as many dated
        between these days as the knowledge base's own total says (#14)."""
        base = KnowledgeBase(self.FOLDER, SCHEMA)
        assert base.problems() == []
        totals = {record.id: record for record in base.records() if isinstance(record, Fact)}
        assert total in totals, f"no fact {total} in the knowledge base"
        deaths = [record for record in base.records() if isinstance(record, Death)]
        found = sum(first <= record.day <= last for record in deaths)
        low, high = totals[total].bounds
        assert low <= found <= high, f"{found} deaths here, {total} says {low}–{high}"


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
