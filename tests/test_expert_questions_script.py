"""scripts/expert_questions.py: what the guide and the doctor are to check, by area (#15)."""

import json
from datetime import date
from itertools import takewhile
from pathlib import Path
from typing import Any

import pytest

from scripts.check_facts import FACTS, SCHEMA, KnowledgeBase
from scripts.expert_questions import ExpertList, main

TODAY = date(2026, 11, 2)
SOURCE = {"title": "Arnette", "url": "https://www.alanarnette.com/blog/?p=16718"}


def version(**fields: Any) -> dict[str, Any]:
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


def death(id: str = "deaths.1990-05-11-a-climber", **fields: Any) -> dict[str, Any]:
    """One of the dead, made up: on the South Summit, of exposure, on the way down (#14)."""
    said = {"date": "1990-05-11", "place": "South Summit", "altitude": 8750, "cause": "exposure"}
    told = said | {"phase": "descent", "source": SOURCE, "checked": "2026-11-01"}
    record = {"id": id, "kind": "death", "name": "A. Climber", "citizenship": "Nowhere"}
    return record | {"hired": False, "status": "source only", "versions": [told]} | fields


def accident(id: str = "accidents.1990-storm", **fields: Any) -> dict[str, Any]:
    """An accident, made up, with the death above (#14)."""
    told = {"note": "From 15:00.", "source": SOURCE, "checked": "2026-11-01"}
    counted = {"value": 30, "unit": "climbers", "source": SOURCE, "checked": "2026-11-01"}
    record = {"id": id, "kind": "accident", "title": "The storm", "status": "source only"}
    record |= {"date": "1990-05-10", "until": "1990-05-11"}
    record |= {"weather": {"what": "A storm came in.", "versions": [told]}}
    record |= {"crowd": {"what": "Three teams on the ridge.", "versions": [counted]}}
    record |= {"chain": [{"when": "14:00", "what": "The turnaround passed.", "versions": [told]}]}
    record |= {"deaths": ["deaths.1990-05-11-a-climber"], "lesson": "Turn around on time."}
    return record | {"scenario": "A storm on the ridge"} | fields


def experts(tmp_path: Path, *records: dict[str, Any]) -> ExpertList:
    """The lists for a knowledge base of these records, in one file."""
    (tmp_path / "facts.json").write_text(json.dumps({"facts": list(records)}), encoding="utf-8")
    return ExpertList(KnowledgeBase(tmp_path, SCHEMA, TODAY))


def ids(text: str) -> list[str]:
    """The records a list names, in its order."""
    return [line.split("**")[1] for line in text.splitlines() if line.startswith("- **")]


def areas(text: str) -> list[str]:
    return [line.removeprefix("## ") for line in text.splitlines() if line.startswith("## ")]


# --- what goes on a list -----------------------------------------------------------------------


@pytest.mark.unit
class TestWhatsListed:
    def test_a_list_reads_as_markdown(self, tmp_path: Path) -> None:
        record = fact("medicine.hace-descent", claim="Descend.")
        assert experts(tmp_path, record).markdown("doctor") == (
            "# For the mountain medicine doctor: physiology\n"
            "\n"
            "What the game takes from open sources alone, and what no source answers. "
            "Is each right, and what's missing? 1 to check, in 1 area.\n"
            "\n"
            "## medicine\n"
            "\n"
            "- **medicine.hace-descent**: Descend.\n"
            "  - 2–4 L/min: [Arnette](https://www.alanarnette.com/blog/?p=16718), "
            "checked 2026-11-01\n"
        )

    def test_a_reviewed_record_is_off_the_list(self, tmp_path: Path) -> None:
        listed = experts(tmp_path, fact(), fact("oxygen.peak-flow", status="expert-reviewed"))
        assert ids(listed.markdown("doctor")) == ["oxygen.usual-flow"]

    def test_a_question_is_always_on_it_with_what_it_s_about(self, tmp_path: Path) -> None:
        about = question(about=["oxygen.usual-flow"])
        listed = experts(tmp_path, fact(status="expert-reviewed"), about).markdown("guide")
        assert ids(listed) == ["technique.re-clipping"]
        assert "- **technique.re-clipping** (a question): Which cowstail first?\n" in listed
        assert "  - About: oxygen.usual-flow\n" in listed

    def test_a_coefficient_shows_its_fit(self, tmp_path: Path) -> None:
        listed = experts(tmp_path, fact(), coefficient()).markdown("doctor")
        assert "- **body.fatigue-rate** (a coefficient): Fatigue per hour.\n" in listed
        assert "  - 0.2 1/h, fitted to oxygen.usual-flow on 2026-11-01\n" in listed

    def test_each_version_is_a_line(self, tmp_path: Path) -> None:
        versions = [
            version(),
            {"value": 3, "unit": "L/min", "source": SOURCE, "checked": "2026-10-30"},
            {"note": "About 3.", "source": SOURCE, "checked": "2026-10-31"},
            {"source": SOURCE, "checked": "2026-11-01"},
        ]
        listed = experts(tmp_path, fact(versions=versions)).markdown("guide")
        link = "[Arnette](https://www.alanarnette.com/blog/?p=16718)"
        assert [line for line in listed.splitlines() if line.startswith("  - ")] == [
            f"  - 2–4 L/min: {link}, checked 2026-11-01",
            f"  - 3 L/min: {link}, checked 2026-10-30",
            f"  - About 3.: {link}, checked 2026-10-31",
            f"  - {link}, checked 2026-11-01",
        ]

    def test_a_death_shows_what_each_source_says(self, tmp_path: Path) -> None:
        listed = experts(tmp_path, death()).markdown("guide")
        assert "- **deaths.1990-05-11-a-climber** (a death): A. Climber, Nowhere\n" in listed
        assert (
            "  - 1990-05-11, South Summit, 8750 m, exposure, descent: "
            "[Arnette](https://www.alanarnette.com/blog/?p=16718), checked 2026-11-01\n"
        ) in listed

    def test_a_hired_climber_s_death_says_so(self, tmp_path: Path) -> None:
        listed = experts(tmp_path, death(hired=True)).markdown("guide")
        assert "(a death): A. Climber, Nowhere, hired\n" in listed

    def test_an_accident_shows_its_chain(self, tmp_path: Path) -> None:
        listed = experts(tmp_path, death(), accident()).markdown("guide")
        link = "[Arnette](https://www.alanarnette.com/blog/?p=16718), checked 2026-11-01"
        header = "- **accidents.1990-storm** (an accident): The storm, 1990-05-10 to 1990-05-11\n"
        assert header in listed
        after = listed.split(header)[1].splitlines()
        assert list(takewhile(lambda line: line.startswith("  - "), after)) == [
            f"  - Weather: A storm came in. (From 15:00.: {link})",
            f"  - Crowd: Three teams on the ridge. (30 climbers: {link})",
            f"  - Step 1, 14:00: The turnaround passed. (From 15:00.: {link})",
            "  - Dead: deaths.1990-05-11-a-climber",
            "  - Lesson: Turn around on time. Scenario: A storm on the ridge",
        ]

    def test_an_expert_with_nothing_to_check_says_so(self, tmp_path: Path) -> None:
        listed = experts(tmp_path, fact("medicine.hace-descent", status="expert-reviewed"))
        assert "Nothing to check." in listed.markdown("doctor")
        assert areas(listed.markdown("doctor")) == []


@pytest.mark.unit
class TestByArea:
    def test_each_expert_gets_their_areas_only(self, tmp_path: Path) -> None:
        listed = experts(tmp_path, fact("medicine.hace-descent"), question())
        assert ids(listed.markdown("doctor")) == ["medicine.hace-descent"]
        assert ids(listed.markdown("guide")) == ["technique.re-clipping"]

    def test_an_area_both_review_is_on_both_lists(self, tmp_path: Path) -> None:
        listed = experts(tmp_path, fact())
        assert (
            ids(listed.markdown("doctor")) == ids(listed.markdown("guide")) == ["oxygen.usual-flow"]
        )

    def test_areas_go_in_order_and_questions_first_within_one(self, tmp_path: Path) -> None:
        records = [
            fact("weather.safe-summit-wind"),
            fact(),
            question("technique.jumar"),
            question("oxygen.bottle-swap"),
        ]
        listed = experts(tmp_path, *records).markdown("guide")
        assert areas(listed) == ["oxygen", "technique", "weather"]
        assert ids(listed) == [
            "oxygen.bottle-swap",
            "oxygen.usual-flow",
            "technique.jumar",
            "weather.safe-summit-wind",
        ]
        assert "4 to check, in 3 areas." in listed

    def test_the_chronicle_is_the_guide_s(self, tmp_path: Path) -> None:
        """The deaths, the accidents and the totals (#14), until reviewed, as any record."""
        reviewed = death("deaths.1990-05-12-b-climber", status="expert-reviewed")
        total = fact("deaths.recorded-through-2025")
        listed = experts(tmp_path, death(), reviewed, accident(), total)
        assert ids(listed.markdown("guide")) == [
            "accidents.1990-storm",
            "deaths.1990-05-11-a-climber",
            "deaths.recorded-through-2025",
        ]
        assert ids(listed.markdown("doctor")) == []

    def test_an_area_no_expert_reviews_is_a_problem(self, tmp_path: Path) -> None:
        found = experts(tmp_path, fact(), fact("nowhere.thing")).problems()
        assert len(found) == 1
        assert "nowhere.thing" in found[0]

    def test_the_knowledge_base_s_problems_come_first(self, tmp_path: Path) -> None:
        found = experts(tmp_path, question(about=["route.camp-2"])).problems()
        assert len(found) == 1
        assert "route.camp-2" in found[0]


class TestTheRealFiles:
    def test_every_area_has_its_expert(self) -> None:
        """CI's check: a record in a new area waits for someone to say who reviews it."""
        assert ExpertList(KnowledgeBase(FACTS)).problems() == []

    def test_the_spec_s_technique_is_on_the_guide_s_list(self) -> None:
        listed = ids(ExpertList(KnowledgeBase(FACTS)).markdown("guide"))
        assert {"technique.re-clipping", "technique.jumar", "oxygen.bottle-swap"} <= set(listed)


@pytest.mark.unit
class TestMain:
    def test_it_prints_both_lists(self, tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
        assert main([], experts(tmp_path, fact("medicine.hace-descent"), question())) == 0
        out = capsys.readouterr().out
        assert out.index("# For the mountain guide") < out.index("# For the mountain medicine")

    @pytest.mark.parametrize("name", ["guide", "doctor"])
    def test_it_prints_one_expert_s_list(
        self, tmp_path: Path, capsys: pytest.CaptureFixture[str], name: str
    ) -> None:
        assert main([name], experts(tmp_path, fact())) == 0
        assert capsys.readouterr().out.count("# For ") == 1

    def test_it_lists_the_problems_and_fails(
        self, tmp_path: Path, capsys: pytest.CaptureFixture[str]
    ) -> None:
        assert main([], experts(tmp_path, fact("nowhere.thing"))) == 1
        out = capsys.readouterr().out
        assert "nowhere.thing" in out
        assert "# For" not in out
