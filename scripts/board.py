"""Keeps the project board current (#118): an iteration's open cards move into the next once
it ends, two iterations always lie ahead, and each card's status follows its issue.

    uv run python scripts/board.py 2             once, saying what it changed
    uv run python scripts/board.py 2 --dry-run   what it would change, changing nothing

The number is the project's, among the projects of the repository's owner. The board's
Current iteration and Next iteration views switch by themselves (`iteration:@current`,
`iteration:@next`), but GitHub moves no card and adds no iteration: this does both.
`.github/workflows/board.yml` runs it every hour with the secret PROJECT_TOKEN, a classic
token with the `project` scope: a fine-grained token can't reach a project a user owns. On a
person's machine it acts with the token `scripts/github.py` finds; `gh auth login --scopes
project` gives one that can.
"""

import argparse
import re
import subprocess
import sys
from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass, replace
from datetime import date, timedelta
from pathlib import Path
from typing import Any, ClassVar

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.github import GitHub, repo_slug, token, utf8_output  # noqa: E402


class Graph:
    """GitHub's GraphQL API, through `scripts/github.py`'s client. An answer with errors
    stops the run with GitHub's words: the next hour's run tries again."""

    def __init__(self, github: GitHub) -> None:
        self._github = github

    def ask(self, query: str, **variables: Any) -> Any:
        answer = self._github.call("POST", "/graphql", {"query": query, "variables": variables})
        if errors := answer.get("errors"):
            said = "; ".join(str(error.get("message", error)) for error in errors)
            raise SystemExit(f"GitHub's GraphQL API: {said}")
        return answer["data"]


@dataclass(frozen=True, slots=True)
class Iteration:
    """One of the board's iterations; `id` is None until GitHub has made it."""

    id: str | None
    title: str
    start: date
    days: int

    NUMBERED: ClassVar[re.Pattern[str]] = re.compile(r"Iteration (\d+)")

    @classmethod
    def from_graph(cls, node: Mapping[str, Any]) -> Iteration:
        return cls(
            node.get("id"), node["title"], date.fromisoformat(node["startDate"]), node["duration"]
        )

    @property
    def end(self) -> date:
        """The day after its last."""
        return self.start + timedelta(days=self.days)

    def holds(self, day: date) -> bool:
        return self.start <= day < self.end

    def ended(self, day: date) -> bool:
        return self.end <= day

    def number(self) -> int | None:
        found = self.NUMBERED.match(self.title)
        return int(found.group(1)) if found else None

    def sent(self) -> dict[str, Any]:
        """As GitHub takes it back: with its id, or without for a new one."""
        known = {"id": self.id} if self.id else {}
        return known | {"title": self.title, "startDate": str(self.start), "duration": self.days}


@dataclass(frozen=True, slots=True)
class IterationPlan:
    """The Iteration field's iterations, ended and coming, by start."""

    field_id: str
    iterations: tuple[Iteration, ...]
    days: int

    AHEAD: ClassVar[int] = 2  # so Next iteration always has one, and the one after waits

    @classmethod
    def from_graph(cls, field: Mapping[str, Any]) -> IterationPlan:
        config = field["configuration"]
        nodes = [*config["completedIterations"], *config["iterations"]]
        its = sorted((Iteration.from_graph(node) for node in nodes), key=lambda it: it.start)
        return cls(field["id"], tuple(its), config["duration"])

    def current(self, day: date) -> Iteration | None:
        return next((it for it in self.iterations if it.holds(day)), None)

    def ahead(self, day: date) -> tuple[Iteration, ...]:
        return tuple(it for it in self.iterations if it.start > day)

    def kept_ahead(self, day: date) -> IterationPlan:
        """This plan, or one with iterations added after the last, two weeks each, until
        `AHEAD` lie ahead of `day`: past the last one, they run on to it first."""
        plan = self
        while len(plan.ahead(day)) < self.AHEAD:
            plan = replace(plan, iterations=(*plan.iterations, plan._following(day)))
        return plan

    def sent(self) -> dict[str, Any]:
        """The configuration GitHub takes. It replaces the iterations it's sent, so the ended
        ones go too, with their ids: one left out would take its cards' history with it."""
        return {
            "startDate": str(self.iterations[0].start),
            "duration": self.days,
            "iterations": [it.sent() for it in self.iterations],
        }

    def placeholders(self) -> IterationPlan:
        """For a dry run: the iterations not made yet, given ids of their own."""
        its = tuple(it if it.id else replace(it, id=f"(new) {it.title}") for it in self.iterations)
        return replace(self, iterations=its)

    def _following(self, day: date) -> Iteration:
        if not self.iterations:
            return Iteration(None, "Iteration 1", day, self.days)
        last = self.iterations[-1]
        number = (last.number() or len(self.iterations)) + 1
        return Iteration(None, f"Iteration {number}", last.end, self.days)


@dataclass(frozen=True, slots=True)
class Card:
    """A card of an issue, with what its status follows."""

    item: str
    number: int
    open: bool
    handed: bool  # a `claude:<login>` label: someone's Claude has it
    held: bool  # `postponed`, and not a question for the author: nobody may start it yet
    commented: bool
    in_review: bool  # an open PR closes it
    status: str | None
    iteration: str | None

    HANDED: ClassVar[str] = "claude:"
    HELD: ClassVar[str] = "postponed"
    QUESTION: ClassVar[str] = "question"  # answered by the author, postponed or not

    @classmethod
    def from_graph(cls, node: Mapping[str, Any]) -> Card | None:
        """None for an item that isn't an issue: a draft, a PR."""
        issue = node.get("content") or {}
        if "number" not in issue:
            return None
        labels = [label["name"] for label in issue["labels"]["nodes"]]
        return cls(
            node["id"],
            issue["number"],
            issue["state"] == "OPEN",
            any(name.startswith(cls.HANDED) for name in labels),
            cls.HELD in labels and cls.QUESTION not in labels,
            issue["comments"]["totalCount"] > 0,
            issue["closedByPullRequestsReferences"]["totalCount"] > 0,
            (node.get("status") or {}).get("name"),
            (node.get("iteration") or {}).get("iterationId"),
        )


class StatusRule:
    """A card's status, from its issue. It only moves a card forward, so one a person moved
    ahead stays; it moves one back only out of Done when the issue is reopened, and out of In
    review when the PR closed unmerged."""

    ORDER: ClassVar[tuple[str, ...]] = ("Backlog", "Ready", "In progress", "In review", "Done")

    def __init__(self, current: str | None) -> None:
        self._current = current  # the iteration under way's id

    def wanted(self, card: Card, iteration: str | None) -> str:
        if not card.open:
            return "Done"
        if card.in_review:
            return "In review"
        if card.handed and card.commented:
            return "In progress"
        if card.handed:
            return "Ready"
        if not card.held and self._current is not None and iteration == self._current:
            return "Ready"
        return "Backlog"

    def next(self, card: Card, iteration: str | None) -> str | None:
        """The status to set, or None to leave the card as it is."""
        wanted = self.wanted(card, iteration)
        if card.status == wanted:
            return None
        if card.status not in self.ORDER:
            return wanted
        if card.open and card.status == "Done":
            return wanted
        if card.open and card.status == "In review" and not card.in_review:
            return wanted
        return wanted if self.ORDER.index(wanted) > self.ORDER.index(card.status) else None


@dataclass(frozen=True, slots=True)
class Fields:
    """The board's Status and Iteration fields, as GitHub names them."""

    project: str
    status: str
    options: Mapping[str, str]  # a status's name: its option's id
    plan: IterationPlan

    STATUS: ClassVar[str] = "Status"
    ITERATION: ClassVar[str] = "Iteration"

    @classmethod
    def from_graph(cls, project: Mapping[str, Any]) -> Fields:
        fields = {field.get("name"): field for field in project["fields"]["nodes"]}
        for name in (cls.STATUS, cls.ITERATION):
            if name not in fields:
                raise SystemExit(f"The board has no field named {name}.")
        options = {option["name"]: option["id"] for option in fields[cls.STATUS]["options"]}
        if missing := [name for name in StatusRule.ORDER if name not in options]:
            raise SystemExit(f"The board's Status has no {', '.join(missing)}: name them so.")
        plan = IterationPlan.from_graph(fields[cls.ITERATION])
        return cls(project["id"], fields[cls.STATUS]["id"], options, plan)


class Board:
    """A user's or organisation's project board, kept current on a given day."""

    OWNER: ClassVar[str] = (
        "repositoryOwner(login: $owner) { ... on ProjectV2Owner { projectV2(number: $number) {"
    )
    ITERATION_FIELD: ClassVar[str] = """... on ProjectV2IterationField { id name configuration {
        duration iterations { id title startDate duration }
        completedIterations { id title startDate duration } } }"""
    FIELDS: ClassVar[str] = f"""query BoardFields($owner: String!, $number: Int!) {{ {OWNER} id
        fields(first: 50) {{ nodes {{ ... on ProjectV2FieldCommon {{ id name }}
          ... on ProjectV2SingleSelectField {{ options {{ id name }} }}
          {ITERATION_FIELD} }} }} }} }} }} }}"""
    CARDS: ClassVar[str] = f"""query BoardCards($owner: String!, $number: Int!, $after: String) {{
        {OWNER} items(first: 100, after: $after) {{ pageInfo {{ hasNextPage endCursor }}
          nodes {{ id content {{ ... on Issue {{ number state
            labels(first: 50) {{ nodes {{ name }} }} comments {{ totalCount }}
            closedByPullRequestsReferences(first: 1) {{ totalCount }} }} }}
          status: fieldValueByName(name: "{Fields.STATUS}") {{
            ... on ProjectV2ItemFieldSingleSelectValue {{ name }} }}
          iteration: fieldValueByName(name: "{Fields.ITERATION}") {{
            ... on ProjectV2ItemFieldIterationValue {{ iterationId }} }} }} }} }} }} }} }}"""
    SET_ITERATIONS: ClassVar[str] = f"""mutation SetIterations($field: ID!,
        $config: ProjectV2IterationFieldConfigurationInput!) {{
        updateProjectV2Field(input: {{fieldId: $field, iterationConfiguration: $config}}) {{
          projectV2Field {{ {ITERATION_FIELD} }} }} }}"""
    SET_VALUE: ClassVar[str] = """mutation SetValue($project: ID!, $item: ID!, $field: ID!,
        $value: ProjectV2FieldValue!) {
        updateProjectV2ItemFieldValue(input: {projectId: $project, itemId: $item,
          fieldId: $field, value: $value}) { clientMutationId } }"""

    def __init__(self, graph: Graph, owner: str, number: int) -> None:
        self._graph = graph
        self._owner = owner
        self._number = number

    def keep(self, day: date, dry_run: bool = False) -> list[str]:
        """Keeps the board current on `day`, and says what it changed, a line each; a dry
        run says the same and changes nothing."""
        fields = self._fields()
        said: list[str] = []
        plan = fields.plan.kept_ahead(day)
        if plan != fields.plan:
            added = plan.iterations[len(fields.plan.iterations) :]
            said.append(f"Iterations added: {', '.join(it.title for it in added)}")
            plan = plan.placeholders() if dry_run else self._send(plan)
        current = plan.current(day)
        ended = {it.id for it in plan.iterations if it.ended(day)}
        rule = StatusRule(current.id if current else None)
        for card in self._cards():
            iteration = card.iteration
            if card.open and iteration in ended and current is not None and current.id:
                iteration = current.id
                said.append(f"#{card.number}: into {current.title}")
                if not dry_run:
                    self._set(fields, card, plan.field_id, {"iterationId": iteration})
            if status := rule.next(card, iteration):
                said.append(f"#{card.number}: {card.status or 'no status'} → {status}")
                if not dry_run:
                    self._set(
                        fields,
                        card,
                        fields.status,
                        {"singleSelectOptionId": fields.options[status]},
                    )
        return said

    def _project(self, query: str, **variables: Any) -> Mapping[str, Any]:
        owner = self._graph.ask(query, owner=self._owner, number=self._number, **variables)
        project: Mapping[str, Any] | None = (owner.get("repositoryOwner") or {}).get("projectV2")
        if project is None:
            raise SystemExit(
                f"{self._owner} has no project {self._number}, or the token can't see it."
            )
        return project

    def _fields(self) -> Fields:
        return Fields.from_graph(self._project(self.FIELDS))

    def _cards(self) -> Iterator[Card]:
        after: str | None = None
        while True:
            items = self._project(self.CARDS, after=after)["items"]
            for node in items["nodes"]:
                if (card := Card.from_graph(node)) is not None:
                    yield card
            if not items["pageInfo"]["hasNextPage"]:
                return
            after = items["pageInfo"]["endCursor"]

    def _send(self, plan: IterationPlan) -> IterationPlan:
        answer = self._graph.ask(self.SET_ITERATIONS, field=plan.field_id, config=plan.sent())
        return IterationPlan.from_graph(answer["updateProjectV2Field"]["projectV2Field"])

    def _set(self, fields: Fields, card: Card, field: str, value: Mapping[str, str]) -> None:
        self._graph.ask(
            self.SET_VALUE, project=fields.project, item=card.item, field=field, value=value
        )


def main(argv: Sequence[str] | None = None) -> None:
    utf8_output()
    parser = argparse.ArgumentParser(prog="scripts/board.py", description=__doc__.split("\n")[0])
    parser.add_argument("number", type=int, help="the project's number, of the repository's owner")
    parser.add_argument(
        "--dry-run", action="store_true", help="say what would change, change nothing"
    )
    args = parser.parse_args(argv)
    remote = subprocess.run(
        ["git", "remote", "get-url", "origin"], capture_output=True, text=True, check=True
    ).stdout.strip()
    slug = repo_slug(remote)
    board = Board(Graph(GitHub(slug, token())), slug.split("/")[0], args.number)
    said = board.keep(date.today(), args.dry_run)
    print("\n".join(said) if said else "Nothing to change.")
    if said and args.dry_run:
        print("A dry run: nothing changed.")


if __name__ == "__main__":
    main()
