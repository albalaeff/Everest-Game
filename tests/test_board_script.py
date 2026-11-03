"""scripts/board.py: the project board kept current, iteration by iteration (#118)."""

import json
import re
from datetime import date, timedelta
from typing import Any

import httpx
import pytest

from scripts.board import Board, Card, Graph, Iteration, IterationPlan, StatusRule
from scripts.github import GitHub

pytestmark = pytest.mark.unit

START = date(2026, 10, 31)  # iteration 1, as on the real board
DAYS = 14


def iterations(count: int, titled: str = "Iteration {n} · Goal {n}") -> list[dict[str, Any]]:
    return [
        {
            "id": f"it-{n}",
            "title": titled.format(n=n),
            "startDate": str(START + timedelta(days=DAYS * (n - 1))),
            "duration": DAYS,
        }
        for n in range(1, count + 1)
    ]


def card(
    number: int,
    *,
    state: str = "OPEN",
    labels: tuple[str, ...] = (),
    comments: int = 0,
    prs: int = 0,
    status: str | None = "Backlog",
    iteration: str | None = "it-1",
) -> dict[str, Any]:
    return {
        "id": f"item-{number}",
        "content": {
            "number": number,
            "state": state,
            "labels": {"nodes": [{"name": name} for name in labels]},
            "comments": {"totalCount": comments},
            "closedByPullRequestsReferences": {"totalCount": prs},
        },
        "status": {"name": status} if status else None,
        "iteration": {"iterationId": iteration} if iteration else None,
    }


class FakeBoard:
    """A stand-in for GitHub's GraphQL API with one project on it: its Status and Iteration
    fields and its cards. It answers scripts/board.py's operations by name, splits the
    iterations into coming and completed as GitHub does on `today`, and applies the
    mutations, keeping each one it was sent."""

    STATUSES = ("Backlog", "Ready", "In progress", "In review", "Done")

    def __init__(
        self, today: date, its: list[dict[str, Any]], cards: list[dict[str, Any]], page: int = 2
    ) -> None:
        self.today = today
        self.iterations = its
        self.cards = cards
        self.page = page
        self.sent: list[tuple[str, dict[str, Any]]] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/graphql"
        body = json.loads(request.content)
        found = re.match(r"\s*(?:query|mutation) (\w+)", body["query"])
        assert found, body["query"]
        answer = getattr(self, found.group(1))(body["variables"])
        return httpx.Response(200, json={"data": answer})

    def card(self, number: int) -> dict[str, Any]:
        return next(c for c in self.cards if c["content"] and c["content"]["number"] == number)

    def status(self, number: int) -> str | None:
        return (self.card(number)["status"] or {}).get("name")

    def iteration(self, number: int) -> str | None:
        return (self.card(number)["iteration"] or {}).get("iterationId")

    # --- the operations ------------------------------------------------------------------

    def BoardFields(self, variables: dict[str, Any]) -> dict[str, Any]:
        assert variables == {"owner": "albalaeff", "number": 2}
        fields = [
            {"id": "f-title", "name": "Title"},
            {
                "id": "f-status",
                "name": "Status",
                "options": [{"id": f"opt-{name}", "name": name} for name in self.STATUSES],
            },
            self._iteration_field(),
        ]
        return {"repositoryOwner": {"projectV2": {"id": "project", "fields": {"nodes": fields}}}}

    def BoardCards(self, variables: dict[str, Any]) -> dict[str, Any]:
        first = int(variables["after"] or 0)
        nodes = self.cards[first : first + self.page]
        more = first + self.page < len(self.cards)
        items = {
            "pageInfo": {"hasNextPage": more, "endCursor": str(first + self.page)},
            "nodes": nodes,
        }
        return {"repositoryOwner": {"projectV2": {"items": items}}}

    def SetIterations(self, variables: dict[str, Any]) -> dict[str, Any]:
        self.sent.append(("SetIterations", variables))
        assert variables["field"] == "f-iteration"
        made = []
        for n, iteration in enumerate(variables["config"]["iterations"], start=1):
            made.append({"id": iteration.get("id", f"it-new-{n}"), **iteration})
        self.iterations = made
        return {"updateProjectV2Field": {"projectV2Field": self._iteration_field()}}

    def SetValue(self, variables: dict[str, Any]) -> dict[str, Any]:
        self.sent.append(("SetValue", variables))
        assert variables["project"] == "project"
        item = next(c for c in self.cards if c["id"] == variables["item"])
        value = variables["value"]
        if variables["field"] == "f-status":
            name = value["singleSelectOptionId"].removeprefix("opt-")
            item["status"] = {"name": name}
        else:
            assert variables["field"] == "f-iteration"
            item["iteration"] = {"iterationId": value["iterationId"]}
        return {"updateProjectV2ItemFieldValue": {"clientMutationId": None}}

    def _iteration_field(self) -> dict[str, Any]:
        def ended(it: dict[str, Any]) -> bool:
            end = date.fromisoformat(it["startDate"]) + timedelta(days=it["duration"])
            return end <= self.today

        return {
            "id": "f-iteration",
            "name": "Iteration",
            "configuration": {
                "duration": DAYS,
                "iterations": [it for it in self.iterations if not ended(it)],
                "completedIterations": [it for it in self.iterations if ended(it)],
            },
        }


def board_on(fake: FakeBoard) -> Board:
    github = GitHub("albalaeff/Everest-Game", "a-token", httpx.MockTransport(fake))
    return Board(Graph(github), "albalaeff", 2)


# --- the iterations -------------------------------------------------------------------------


def plan_of(its: list[dict[str, Any]]) -> IterationPlan:
    return IterationPlan("f-iteration", tuple(Iteration.from_graph(it) for it in its), DAYS)


def test_an_iteration_holds_its_days_and_has_ended_the_day_after() -> None:
    first = Iteration.from_graph(iterations(1)[0])

    assert first.holds(date(2026, 10, 31))
    assert first.holds(date(2026, 11, 13))
    assert not first.holds(date(2026, 11, 14))
    assert first.ended(date(2026, 11, 14))
    assert not first.ended(date(2026, 11, 13))


def test_the_current_iteration_is_the_one_holding_today() -> None:
    plan = plan_of(iterations(3))

    assert plan.current(date(2026, 11, 14)) == Iteration.from_graph(iterations(3)[1])
    assert plan.current(date(2027, 1, 1)) is None  # past the last one


def test_two_iterations_ahead_are_left_as_they_are() -> None:
    plan = plan_of(iterations(8))

    assert plan.kept_ahead(date(2027, 1, 9)) == plan  # iteration 6: 7 and 8 lie ahead


def test_with_one_iteration_ahead_another_comes_after_the_last() -> None:
    plan = plan_of(iterations(8, titled="Iteration {n} · Goal"))

    kept = plan.kept_ahead(date(2027, 1, 23))  # iteration 7: only 8 lies ahead

    assert kept.iterations[:8] == plan.iterations
    assert kept.iterations[8:] == (Iteration(None, "Iteration 9", date(2027, 2, 20), DAYS),)


def test_past_the_last_iteration_the_gap_is_filled_up_to_two_ahead() -> None:
    # The workflow was off for a while: the iterations run on, one after another, to today.
    plan = plan_of(iterations(2, titled="Iteration {n}"))

    kept = plan.kept_ahead(date(2026, 12, 15))  # iteration 4's days

    assert [it.title for it in kept.iterations] == [f"Iteration {n}" for n in range(1, 7)]
    current = kept.current(date(2026, 12, 15))
    assert current is not None and current.title == "Iteration 4"
    assert [it.title for it in kept.ahead(date(2026, 12, 15))] == ["Iteration 5", "Iteration 6"]


def test_the_iterations_go_back_whole_with_their_ids() -> None:
    # GitHub replaces the iterations it's sent: an ended one left out would take its cards'
    # history with it.
    plan = plan_of(iterations(1)).kept_ahead(date(2026, 11, 1))

    assert plan.sent() == {
        "startDate": "2026-10-31",
        "duration": DAYS,
        "iterations": [
            {
                "id": "it-1",
                "title": "Iteration 1 · Goal 1",
                "startDate": "2026-10-31",
                "duration": 14,
            },
            {"title": "Iteration 2", "startDate": "2026-11-14", "duration": 14},
            {"title": "Iteration 3", "startDate": "2026-11-28", "duration": 14},
        ],
    }


# --- the statuses ---------------------------------------------------------------------------


def a_card(**fields: Any) -> Card:
    found = Card.from_graph(card(7, **fields))
    assert found is not None
    return found


@pytest.mark.parametrize(
    ("fields", "status"),
    [
        ({"state": "CLOSED"}, "Done"),
        ({"prs": 1, "labels": ("claude:bateks",), "comments": 3}, "In review"),
        ({"labels": ("claude:bateks",), "comments": 2}, "In progress"),
        ({"labels": ("claude:albalaeff",)}, "Ready"),
        ({"iteration": "it-2"}, "Ready"),  # in the current iteration
        ({"iteration": "it-3"}, "Backlog"),
        ({"iteration": "it-3", "comments": 4}, "Backlog"),  # talked about, handed to nobody
        ({"iteration": "it-2", "labels": ("postponed",)}, "Backlog"),  # nobody may start it
        ({"iteration": "it-2", "labels": ("postponed", "question")}, "Ready"),  # for the author
    ],
)
def test_a_status_follows_the_issue(fields: dict[str, Any], status: str) -> None:
    rule = StatusRule("it-2")
    found = a_card(status=None, **fields)

    assert rule.wanted(found, found.iteration) == status
    assert rule.next(found, found.iteration) == status


def test_a_status_a_person_moved_ahead_stays() -> None:
    rule = StatusRule("it-2")

    assert rule.next(a_card(status="In progress", iteration="it-3"), "it-3") is None
    assert rule.next(a_card(status="Ready", iteration="it-3"), "it-3") is None


def test_a_status_already_right_is_left_alone() -> None:
    assert StatusRule("it-2").next(a_card(status="Ready", iteration="it-2"), "it-2") is None


def test_a_reopened_issue_leaves_done() -> None:
    reopened = a_card(status="Done", labels=("claude:bateks",), comments=5)

    assert StatusRule("it-2").next(reopened, "it-2") == "In progress"


def test_a_pr_closed_unmerged_takes_the_card_out_of_review() -> None:
    left = a_card(status="In review", labels=("claude:bateks",), comments=5, prs=0)

    assert StatusRule("it-2").next(left, "it-2") == "In progress"


def test_an_item_that_isnt_an_issue_is_no_card() -> None:
    assert (
        Card.from_graph({"id": "item-x", "content": {}, "status": None, "iteration": None}) is None
    )
    assert (
        Card.from_graph({"id": "item-y", "content": None, "status": None, "iteration": None})
        is None
    )


# --- the board, as the workflow runs it -----------------------------------------------------


def iteration_1_ended() -> FakeBoard:
    """14 November 2026: iteration 1 has ended, and iteration 2 is under way."""
    return FakeBoard(
        date(2026, 11, 14),
        iterations(8),
        [
            card(10, state="CLOSED", status="In review"),  # merged on the last day
            card(26, labels=("claude:bateks",), comments=2, status="In progress"),  # not done
            card(31, labels=("postponed",), status="Backlog"),  # the playtest, nobody's yet
            card(34, iteration="it-2", labels=("postponed", "question"), status="Backlog"),
            card(35, iteration="it-2", status="Backlog"),  # the summit push
            card(52, iteration="it-3", status="Backlog"),  # the trek
            {"id": "item-draft", "content": {}, "status": None, "iteration": None},
        ],
    )


def test_when_an_iteration_ends_its_open_cards_move_into_the_next_and_the_new_one_is_ready() -> (
    None
):
    fake = iteration_1_ended()

    said = board_on(fake).keep(date(2026, 11, 14))

    assert fake.iteration(10) == "it-1" and fake.status(10) == "Done"  # where it was done
    assert fake.iteration(26) == "it-2" and fake.status(26) == "In progress"
    assert fake.iteration(31) == "it-2" and fake.status(31) == "Backlog"  # still postponed
    assert fake.status(34) == "Ready"  # the author's question, to answer now
    assert fake.iteration(35) == "it-2" and fake.status(35) == "Ready"
    assert fake.iteration(52) == "it-3" and fake.status(52) == "Backlog"
    assert said == [
        "#10: In review → Done",
        "#26: into Iteration 2 · Goal 2",
        "#31: into Iteration 2 · Goal 2",
        "#34: Backlog → Ready",
        "#35: Backlog → Ready",
    ]
    assert not [sent for sent in fake.sent if sent[0] == "SetIterations"]  # 3 to 8 lie ahead


def test_a_second_run_changes_nothing() -> None:
    fake = iteration_1_ended()
    board_on(fake).keep(date(2026, 11, 14))
    fake.sent.clear()

    assert board_on(fake).keep(date(2026, 11, 14)) == []
    assert fake.sent == []


def test_a_dry_run_says_the_same_and_changes_nothing() -> None:
    fake = iteration_1_ended()

    said = board_on(fake).keep(date(2026, 11, 14), dry_run=True)

    assert said[0] == "#10: In review → Done"
    assert len(said) == 5
    assert fake.sent == []


def test_near_the_last_iteration_the_board_gets_more_and_the_open_cards_move_into_them() -> None:
    fake = FakeBoard(
        date(2027, 2, 20),  # iteration 8 has ended: none lies ahead
        iterations(8),
        [card(96, iteration="it-8", status="Ready")],
    )

    said = board_on(fake).keep(date(2027, 2, 20))

    titles = [it["title"] for it in fake.iterations]
    assert titles[8:] == ["Iteration 9", "Iteration 10", "Iteration 11"]
    assert {it["id"] for it in fake.iterations[:8]} == {f"it-{n}" for n in range(1, 9)}
    assert fake.iteration(96) == "it-new-9"
    assert said == [
        "Iterations added: Iteration 9, Iteration 10, Iteration 11",
        "#96: into Iteration 9",
    ]


def test_a_status_missing_from_the_board_is_named() -> None:
    fake = iteration_1_ended()
    fake.STATUSES = ("Todo", "In progress", "Done")  # a board set up otherwise

    with pytest.raises(SystemExit, match="Backlog, Ready, In review"):
        board_on(fake).keep(date(2026, 11, 14))


def test_an_error_from_github_stops_it_with_github_s_words() -> None:
    def server(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"errors": [{"message": "Something went wrong"}]})

    github = GitHub("albalaeff/Everest-Game", "a-token", httpx.MockTransport(server))

    with pytest.raises(SystemExit, match="Something went wrong"):
        Board(Graph(github), "albalaeff", 2).keep(date(2026, 11, 14))
