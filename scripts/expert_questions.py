"""Lists what the guide and the doctor are to check, by area (#15).

    uv run python scripts/expert_questions.py           # both lists
    uv run python scripts/expert_questions.py guide     # the mountain guide's: technique
    uv run python scripts/expert_questions.py doctor    # the doctor's: physiology

Each list is Markdown, made from the knowledge base as it stands (content/facts/,
docs/conventions/knowledge-base.md): every question, and every other record still
`source only`, with its values, sources and check dates. A record an expert has reviewed drops
out, so the list is never copied by hand and never falls behind. Each area goes to the experts
`ExpertList.EXPERTS` names for it; `pytest` fails on a record in an area no expert reviews
(tests/test_expert_questions_script.py), so a new area waits for someone to say whose it is.
"""

import argparse
import io
import sys
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import ClassVar

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))  # run as a script, it still finds scripts

from scripts.check_facts import FACTS, KnowledgeBase, Question, Record  # noqa: E402
from scripts.handoff import plural  # noqa: E402


@dataclass(frozen=True, slots=True)
class Expert:
    """Who reviews which areas: `name` is how the command line calls them."""

    name: str
    title: str
    areas: frozenset[str]

    def reviews(self, record: Record) -> bool:
        return record.area in self.areas

    def markdown(self, records: Sequence[Record]) -> str:
        """Their list: the open records of their areas, by area, the questions first in each."""
        mine = [record for record in records if record.open and self.reviews(record)]
        areas = sorted({record.area for record in mine})
        text = f"# For {self.title}\n\n"
        if not mine:
            return text + "Nothing to check.\n"
        text += (
            "What the game takes from open sources alone, and what no source answers. "
            f"Is each right, and what's missing? {len(mine)} to check, "
            f"in {plural(len(areas), 'area')}.\n"
        )
        for area in areas:
            here = [record for record in mine if record.area == area]
            here.sort(key=lambda record: not isinstance(record, Question))
            text += f"\n## {area}\n\n" + "".join(record.listing() for record in here)
        return text


class ExpertList:
    """The experts' lists for a knowledge base."""

    EXPERTS: ClassVar[tuple[Expert, ...]] = (
        Expert(
            "guide",
            "the mountain guide: technique",
            frozenset(
                {
                    "technique",
                    "route",
                    "hazards",
                    "oxygen",
                    "weather",
                    "cold",
                    "time",
                    "crowds",
                    "gear",
                    "tours",
                    "rules",
                    "accidents",
                    "deaths",
                }
            ),
        ),
        Expert(
            "doctor",
            "the mountain medicine doctor: physiology",
            frozenset({"medicine", "acclimatization", "body", "oxygen", "cold"}),
        ),
    )

    def __init__(self, base: KnowledgeBase) -> None:
        self._base = base

    def problems(self) -> list[str]:
        """The knowledge base's problems; only once there are none, a record no expert reviews."""
        found = [str(problem) for problem in self._base.problems()]
        return found or [
            f"{record.file}: {record.id}: no expert reviews the area {record.area}: "
            "name one in ExpertList.EXPERTS, scripts/expert_questions.py"
            for record in self._base.records()
            if not any(expert.reviews(record) for expert in self.EXPERTS)
        ]

    def markdown(self, name: str) -> str:
        """The list of the expert called `name`."""
        expert = next(expert for expert in self.EXPERTS if expert.name == name)
        return expert.markdown(self._base.records())


def main(argv: Sequence[str] | None = None, experts: ExpertList | None = None) -> int:
    if isinstance(sys.stdout, io.TextIOWrapper):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    names = [expert.name for expert in ExpertList.EXPERTS]
    parser = argparse.ArgumentParser(
        prog="scripts/expert_questions.py", description=__doc__.split("\n")[0]
    )
    parser.add_argument("expert", nargs="?", choices=names, help="one expert's list only")
    args = parser.parse_args(argv)
    experts = experts or ExpertList(KnowledgeBase(FACTS))
    problems = experts.problems()
    for problem in problems:
        print(problem)
    if problems:
        return 1
    print("\n".join(experts.markdown(name) for name in ([args.expert] if args.expert else names)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
