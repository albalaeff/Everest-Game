"""scripts/handoff.py: the handoff on GitHub, so a session on any machine carries on (#399)."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

import pytest

from scripts.handoff import (
    STALE,
    Git,
    Handoff,
    HandoffMark,
    IssueBranch,
    IssueCarry,
    LocalWork,
    Machine,
    Move,
)
from tests.fakes import FakeGit

pytestmark = pytest.mark.unit

ME = "bateks"
HERE = Machine("DESKTOP-1", "c--git-personalexchangebot")
ELSEWHERE = Machine("LAPTOP-2", "c--users-batek-fxbot")
AT = datetime(2026, 10, 12, 16, 20, tzinfo=timezone(timedelta(hours=2)))
URL = "https://github.com/bateks/PersonalExchangeBot/issues/399#issuecomment-1"
CHECKOUT = "C:/git/PersonalExchangeBot"


def git(answers: dict[str, str]) -> Git:
    return Git(Path(CHECKOUT), FakeGit(answers))


# --- where Claude worked ---------------------------------------------------------------------


def test_the_machine_is_the_computer_and_the_main_checkout() -> None:
    # A worktree (#387's agents) is the checkout it belongs to: their logs count together.
    in_a_worktree = Git(
        Path("C:/git/worktrees/387"),
        FakeGit({"rev-parse --path-format=absolute --git-common-dir": f"{CHECKOUT}/.git"}),
    )

    assert Machine.here(in_a_worktree, host="DESKTOP-1") == HERE
    assert str(HERE) == "DESKTOP-1 (c--git-personalexchangebot)"


# --- the mark at the end of a handoff --------------------------------------------------------


def test_a_mark_reads_back_as_it_was_written() -> None:
    mark = HandoffMark(HERE, AT, Decimal("12.40"), closing=True)

    assert HandoffMark.found_in(f"Next: the PR.\n\n{mark}") == mark
    assert HandoffMark.found_in(str(HandoffMark(ELSEWHERE, AT))) == HandoffMark(ELSEWHERE, AT)


def test_the_mark_is_one_line_people_dont_see() -> None:
    # An HTML comment on a line of its own: GitHub shows nothing of it.
    text = str(HandoffMark(HERE, AT, Decimal(3)))

    assert text.startswith("<!-- handoff ") and text.endswith(" -->")
    assert "\n" not in text


def test_the_mark_ends_the_text() -> None:
    mark = HandoffMark(HERE, AT)

    assert mark.ending("Next: tests.\n") == f"Next: tests.\n\n{mark}"


def test_a_comment_without_a_whole_mark_is_no_handoff() -> None:
    assert HandoffMark.found_in("Plan: ...") is None
    assert HandoffMark.found_in("<!-- handoff host=DESKTOP-1 -->") is None  # no checkout, time
    assert HandoffMark.found_in("a `<!-- handoff host=x checkout=y at=z -->` quoted") is None


# --- the handoffs on an issue ----------------------------------------------------------------


def comment(body: str, login: str = ME, url: str = URL) -> dict[str, object]:
    return {"body": body, "user": {"login": login}, "html_url": url}


def test_the_latest_handoff_on_an_issue_is_the_one_to_carry_on_from() -> None:
    first = HandoffMark(HERE, AT, Decimal(3))
    later = HandoffMark(ELSEWHERE, AT + timedelta(hours=1), Decimal(5), closing=True)
    comments = [
        comment(f"_Claude Code (bateks)_\n\nPlan.\n\n{first}"),
        comment("ok"),
        comment(f"_Claude Code (bateks)_\n\nPR opened.\n\n{later}", url=f"{URL}3"),
        comment("thanks"),
    ]

    found = Handoff.latest(comments)

    assert found is not None
    assert (found.mark, found.position, found.url, found.login) == (later, 2, f"{URL}3", ME)
    assert found.text == "_Claude Code (bateks)_\n\nPR opened."
    assert Handoff.latest([comment("nothing handed off")]) is None


def test_each_other_machine_counts_with_its_latest_share() -> None:
    # #390 reads only this machine's logs: the others' share comes from their handoffs.
    comments = [
        comment(f"a\n\n{HandoffMark(ELSEWHERE, AT, Decimal('2.00'))}"),
        comment(f"b\n\n{HandoffMark(HERE, AT, Decimal('9.00'))}"),  # here: its logs count
        comment(f"c\n\n{HandoffMark(ELSEWHERE, AT, Decimal('3.50'))}"),  # replaces 2.00
        comment(f"d\n\n{HandoffMark(HERE, AT, Decimal('1.00'))}", login="albalaeff"),
        comment(f"e\n\n{HandoffMark(ELSEWHERE, AT)}"),  # no cost known: the last known stays
    ]

    assert Handoff.shares(comments, ME, HERE) == {
        f"bateks on {ELSEWHERE}": Decimal("3.50"),
        f"albalaeff on {HERE}": Decimal("1.00"),
    }


# --- whose move it is (#449) -----------------------------------------------------------------


PROPOSAL = (
    "_Claude Code (bateks)_\n\nA long proposal.\n\nWith a mockup.\n\n"
    "**Next:** your answer to the preview (bateks's). **Waiting on:** bateks's answer, on #431."
    "\n\n<details><summary>For the next session</summary>\n\n"
    "- Branch: `feature/431-x` at abc1234\n- PR: none yet\n\n</details>"
)


def test_a_handoff_says_whose_move_is_next_and_what_it_waits_on() -> None:
    move = Move.of(PROPOSAL)

    assert move == Move(
        "your answer to the preview (bateks's).", "bateks's", "bateks's answer, on #431."
    )
    assert move.waits and not move.goes_on
    assert move.people(["albalaeff", "bateks"]) == ("bateks",)


@pytest.mark.parametrize(
    ("line", "goes_on"),
    [
        ("**Next:** the PR (Claude's). **Waiting on:** nothing.", True),
        ("**Next:** tests, then the PR (Claude’s).  **Waiting on:** Nothing", True),
        ("**Next:** the PR (Claude's).\n**Waiting on:** nothing.", True),
        ("**Next:** merge once it's green (CI's). **Waiting on:** CI on PR #452.", False),
        ("**Next:** the PR (Claude's). **Waiting on:** albalaeff's review.", False),
        ("**Next:** the PR (Claude's).", False),  # what it waits on, unsaid
    ],
    ids=["one line", "typed apostrophe", "two lines", "CI's", "a review", "no waiting"],
)
def test_claude_goes_on_when_the_move_is_claude_s_and_nothing_is_waited_on(
    line: str, goes_on: bool
) -> None:
    move = Move.of(f"Done.\n\n{line}")

    assert move is not None and move.goes_on is goes_on


def test_a_comment_without_a_next_states_no_move() -> None:
    assert Move.of("Plan: A, B or C?") is None


def test_the_people_waited_on_are_named_by_their_logins() -> None:
    both = Move.of(
        "**Next:** reviews (theirs). **Waiting on:** @albalaeff's review and Bateks's answer; "
        "not the bateks-bot."
    )
    nobody = Move.of("**Next:** the PR (Claude's). **Waiting on:** nothing from bateks.")

    assert both is not None and both.people(["bateks", "albalaeff", "bot"]) == (
        "bateks",
        "albalaeff",
    )
    assert nobody is not None and nobody.people(["bateks"]) == ()


PR_297 = "https://github.com/albalaeff/Everest-Game/pull/297"


@pytest.mark.parametrize(
    ("waiting", "people"),
    [
        (f"CI on [#297]({PR_297}).", ()),
        (f"CI on {PR_297}.", ()),
        (f"CI on <{PR_297}>.", ()),
        ("CI on albalaeff/Everest-Game#297.", ()),
        (f"albalaeff's review of [#297]({PR_297}).", ("albalaeff",)),
        ("[@bateks](https://github.com/bateks)'s answer.", ("bateks",)),
    ],
    ids=["a link", "a URL", "an autolink", "owner/repo#n", "a review", "a link to a person"],
)
def test_a_link_names_nobody_but_its_text_does(waiting: str, people: tuple[str, ...]) -> None:
    # On #284 a handoff waiting on "CI on [#297](…/albalaeff/…)" put waiting:albalaeff on it:
    # every link to the repository holds its owner's login.
    move = Move.of(f"**Next:** merge once it's green (CI's). **Waiting on:** {waiting}")

    assert move is not None and move.people(["albalaeff", "bateks"]) == people


@pytest.mark.parametrize(
    ("waiting", "on_ci"),
    [
        ("CI on #528.", True),
        ("CI's result on PR #452, then bateks's review.", True),
        ("bateks's review of the ci.yml change.", False),
        ("albalaeff's review.", False),
        ("nothing; CI is green.", False),
    ],
    ids=["CI on a PR", "CI's result", "a file named ci", "a review", "nothing"],
)
def test_a_move_waits_on_ci_when_its_waiting_on_names_ci(waiting: str, on_ci: bool) -> None:
    # #534: a handoff waiting on CI was written before CI's result, whenever it was posted.
    move = Move.of(f"**Next:** merge once it's green (CI's). **Waiting on:** {waiting}")

    assert move is not None and move.waits_on_ci is on_ci


@pytest.mark.parametrize(("closing", "moves"), [(True, True), (False, False)])
def test_claude_s_move_needs_the_session_that_said_it_to_have_closed(
    closing: bool, moves: bool
) -> None:
    # A session still open goes on by itself: an agent started as well would do it twice.
    said = "**Next:** the PR (Claude's). **Waiting on:** nothing."
    handoff = Handoff(ME, URL, said, HandoffMark(HERE, AT, closing=closing), 0)

    assert handoff.claude_s_move is moves


def test_a_handoff_in_brief_is_its_move_and_its_details() -> None:
    # #449: at a session start, #431's whole proposal scrolled by.
    handoff = Handoff(ME, URL, PROPOSAL, HandoffMark(HERE, AT), 0)

    assert handoff.brief().splitlines() == [
        "**Next:** your answer to the preview (bateks's). **Waiting on:** bateks's answer, on "
        "#431.",
        "For the next session:",
        "- Branch: `feature/431-x` at abc1234",
        "- PR: none yet",
    ]


def test_a_handoff_with_neither_is_whole_in_brief() -> None:
    handoff = Handoff(ME, URL, "Where it stands.", HandoffMark(HERE, AT), 0)

    assert handoff.brief() == "Where it stands."


# --- the move in the issue's language (#593) -------------------------------------------------


# #294's handoffs in Russian: the second took waiting:bateks off.
ON_294 = {
    "2026-10-13": (
        "**Дальше:** bateks оплачивает домен, добавляет запись A `bot` и создаёт прод-бота в "
        "@BotFather (ход bateks). Потом шаг 4 плана: бот на сервере (`master`, `.env.prod`, "
        "Caddy, `docker compose … up`). **Ждём:** bateks."
    ),
    "2026-10-18": (
        "**Дальше:** ответы на 1, 2, 4–8, потом закрытие задачи (ход bateks, потом Claude). "
        "**Ждём:** bateks, здесь."
    ),
}
UKRAINIAN = "**Далі:** відповіді на питання 1–3 (хід bateks). **Чекаємо:** відповіді bateks тут."


@pytest.mark.parametrize("line", [*ON_294.values(), UKRAINIAN], ids=[*ON_294, "Ukrainian"])
def test_a_handoff_in_russian_or_ukrainian_waits_on_whom_it_names(line: str) -> None:
    text = (
        f"_Claude Code (bateks)_\n\nСделано.\n\n{line}\n\n"
        "<details><summary>Для следующей сессии</summary>\n\n- Ветка: нет.\n\n</details>"
    )

    move = Move.of(text)

    assert move is not None and move.waits and not move.goes_on
    assert move.people(["albalaeff", "bateks"]) == ("bateks",)
    assert move.line == line  # in its language, as written


@pytest.mark.parametrize(
    ("said", "whose"),
    [
        ("(ход Claude)", "Claude's"),
        ("(Ход bateks)", "bateks's"),
        ("(ход CI)", "CI's"),
        ("(хід Claude)", "Claude's"),
        ("(ход bateks, потом Claude)", "ход bateks, потом Claude"),
    ],
    ids=["Claude's", "bateks's", "CI's", "Ukrainian", "two moves"],
)
def test_whose_move_it_is_reads_in_russian_and_ukrainian(said: str, whose: str) -> None:
    move = Move.of(f"**Дальше:** PR {said}. **Ждём:** ничего.")

    assert move is not None and move.whose == whose


@pytest.mark.parametrize(
    ("line", "goes_on"),
    [
        ("**Дальше:** тесты и PR (ход Claude). **Ждём:** ничего.", True),
        ("**Дальше:** тесты и PR (ход Claude). **Ждем:** Ничего", True),
        ("**Далі:** тести й PR (хід Claude).\n**Чекаємо:** нічого.", True),
        ("**Дальше:** тесты и PR (ход Claude). **Ждём:** ревью albalaeff.", False),
        ("**Дальше:** тесты и PR (ход Claude).", False),  # what it waits on, unsaid
    ],
    ids=["Russian", "e for yo, capital", "Ukrainian", "a review", "no waiting"],
)
def test_claude_goes_on_in_russian_and_ukrainian(line: str, goes_on: bool) -> None:
    move = Move.of(f"Сделано.\n\n{line}")

    assert move is not None and move.goes_on is goes_on


# --- the closing comment a handoff carries (#550) --------------------------------------------


READY = (
    "_Claude Code agent (bateks, opus/xhigh)_\n\nPR #9 is open; CI runs.\n\n"
    "**Next:** merge #9 once CI is green (the manager's). **Waiting on:** CI on #9.\n\n"
    "<details><summary>For the next session</summary>\n\n"
    "- Branch: `feature/7-x` at abc1234, pushed\n- PR: #9, CI running\n"
    "- Closing comment:\n"
    "  <!-- closing -->\n"
    "  Done: the location rule is finer.\n\n"
    "  - To check by hand: nothing in the browser.\n"
    "  <!-- /closing -->\n\n"
    "</details>"
)


def test_a_handoff_carries_the_closing_comment_the_merge_posts() -> None:
    # Indented under its list item, it comes out as written.
    handoff = Handoff(ME, URL, READY, HandoffMark(HERE, AT), 0)

    assert handoff.closing_comment == (
        "Done: the location rule is finer.\n\n- To check by hand: nothing in the browser."
    )


@pytest.mark.parametrize(
    "text",
    [PROPOSAL, "Done.\n\n<!-- closing -->\n  \n<!-- /closing -->", "<!-- closing -->\nDone."],
    ids=["none", "an empty one", "one not ended"],
)
def test_a_handoff_without_a_whole_closing_comment_carries_none(text: str) -> None:
    assert Handoff(ME, URL, text, HandoffMark(HERE, AT), 0).closing_comment is None


@pytest.mark.parametrize(
    ("next_", "names_merge"),
    [
        ("merge #9 once CI is green (the manager's).", True),
        ("Merge it (Claude's).", True),
        ("the PR (Claude's).", False),
        ("the emergency fix (Claude's).", False),
    ],
    ids=["merge #9", "Merge", "the PR", "a word with merge in it"],
)
def test_a_move_names_the_merge_when_its_next_says_so(next_: str, names_merge: bool) -> None:
    move = Move.of(f"**Next:** {next_} **Waiting on:** CI on #9.")

    assert move is not None and move.names_merge is names_merge


@pytest.mark.parametrize(
    ("line", "names_merge"),
    [
        ("**Дальше:** слить #9, когда CI зелёный (ход менеджера). **Ждём:** CI на #9.", True),
        ("**Дальше:** влить #9 (ход Claude). **Ждём:** CI на #9.", True),
        ("**Далі:** злити #9, коли CI зелений (хід менеджера). **Чекаємо:** CI на #9.", True),
        ("**Дальше:** осмыслить отзыв (ход Claude). **Ждём:** CI на #9.", False),
    ],
    ids=["Russian", "Russian, the other word", "Ukrainian", "a word with it in it"],
)
def test_a_move_in_russian_or_ukrainian_names_the_merge_and_waits_on_ci(
    line: str, names_merge: bool
) -> None:
    move = Move.of(line)

    assert move is not None and move.waits_on_ci and move.names_merge is names_merge


# --- what's only on this machine -------------------------------------------------------------


BRANCHES = " ".join(LocalWork.BRANCHES)
ONE_WORKTREE = f"worktree {CHECKOUT}\nHEAD {'a' * 40}\nbranch refs/heads/main\n"


def test_nothing_is_only_here() -> None:
    work = LocalWork.collect(
        git(
            {
                "worktree list --porcelain": ONE_WORKTREE,
                "status --porcelain": "",
                BRANCHES: "main\torigin/main\t",
                "stash list": "",
            }
        )
    )

    assert work.lines == ()
    assert work.text() == "Nothing is only on this machine."


def test_what_is_only_here_in_every_worktree() -> None:
    worktrees = (
        f"worktree {CHECKOUT}\nHEAD {'a' * 40}\nbranch refs/heads/feature/399-handoff\n\n"
        f"worktree C:/git/worktrees/387\nHEAD {'b' * 40}\nbranch refs/heads/feature/387-agents\n"
    )
    branches = "\n".join(
        [
            "main\torigin/main\t",
            "feature/399-handoff\torigin/feature/399-handoff\t[ahead 2]",
            "feature/387-agents\torigin/feature/387-agents\t[ahead 1, behind 3]",
            "feature/372-rule\t\t",  # never pushed, with commits of its own
            "feature/380-empty\t\t",  # never pushed, nothing of its own yet
            "screenshots\t\t",  # no upstream set, but its commits are on origin
            "feature/393-ui\torigin/feature/393-ui\t[gone]",  # merged, deleted on GitHub
        ]
    )
    unpushed = {"feature/399-handoff": 2, "feature/387-agents": 1, "feature/372-rule": 3}
    own = {
        f"rev-list --count {name} --not --remotes=origin": str(unpushed.get(name, 0))
        for name in ("main", "feature/399-handoff", "feature/387-agents")
        + ("feature/372-rule", "feature/380-empty", "screenshots")
    }
    work = LocalWork.collect(
        git(
            {
                "worktree list --porcelain": worktrees,
                f"{CHECKOUT}: status --porcelain": " M scripts/handoff.py\n?? notes.md",
                "C:/git/worktrees/387: status --porcelain": "",
                BRANCHES: branches,
                **own,
                "stash list": "stash@{0}: WIP on main: 9c17d9f Prices",
            }
        )
    )

    assert work.lines == (
        f"2 uncommitted changes on feature/399-handoff, in {CHECKOUT}",
        "feature/399-handoff: 2 commits not pushed",
        "feature/387-agents: 1 commit not pushed (and origin has 3 more)",
        "feature/372-rule: never pushed, 3 commits of its own",
        "stash@{0}: WIP on main: 9c17d9f Prices",
    )
    assert work.text().splitlines()[0] == "Only on this machine:"


def test_what_of_an_issue_s_is_only_here_names_its_branch() -> None:
    work = LocalWork(
        (
            f"2 uncommitted changes on feature/399-handoff, in {CHECKOUT}",
            "feature/1399-other: never pushed, 1 commit of its own",
            "feature/387-agents: 1 commit not pushed",
            "stash@{0}: WIP on fix/399-marks: 9c17d9f Marks",
        )
    )

    assert work.about(399).lines == (work.lines[0], work.lines[3])
    assert work.about(372).text() == "Nothing of #372's is only on this machine."


# --- an issue's branch -----------------------------------------------------------------------


REFS = " ".join(IssueBranch.REFS)


def test_an_issue_s_branch_on_origin_and_here() -> None:
    origin, here = "a" * 40, "b" * 40
    refs = "\n".join(
        [
            "refs/heads/main",
            "refs/heads/feature/399-handoff",
            "refs/remotes/origin/feature/399-handoff",
            "refs/remotes/origin/feature/3990-another-issue",
        ]
    )
    found = IssueBranch.find(
        399,
        git(
            {
                REFS: refs,
                "rev-parse --verify -q refs/remotes/origin/feature/399-handoff": origin,
                "rev-parse --verify -q refs/heads/feature/399-handoff": here,
                f"rev-list --left-right --count {origin}...{here}": "1\t2",
                f"log -1 --format=%s {origin}": "wip: the carryon skill",
                f"rev-list --count {origin}..origin/main": "4",
            }
        ),
    )

    assert found == (
        IssueBranch("feature/399-handoff", origin, here, "wip: the carryon skill", 2, 1, 4),
    )
    assert str(found[0]) == (
        "feature/399-handoff: on origin at aaaaaaa (wip: the carryon skill); "
        "here 2 commits ahead and 1 behind; main has 4 commits it hasn't"
    )


def test_a_branch_only_here_or_only_on_origin() -> None:
    tip = "c" * 40
    only_here = IssueBranch("feature/372-rule", None, tip, "Drop the rule", 0, 0, 0)
    only_there = IssueBranch("feature/372-rule", tip, None, "Drop the rule", 0, 0, 0)

    assert str(only_here) == "feature/372-rule: only here, never pushed, at ccccccc (Drop the rule)"
    assert str(only_there) == "feature/372-rule: on origin at ccccccc (Drop the rule); not here"
    assert IssueBranch.find(372, git({REFS: "refs/heads/main"})) == ()


# --- one issue, as a session finds it ---------------------------------------------------------


def test_an_issue_handed_off_on_another_machine_whose_session_went_on() -> None:
    said = "_Claude Code (bateks)_\n\n**Next:** tests (Claude's)."
    handoff = Handoff(ME, URL, said, HandoffMark(ELSEWHERE, AT), 0)
    carry = IssueCarry(
        399,
        "Handoff and carryon",
        "reply waiting",
        handoff,
        since=("bateks",),
        pulls=("PR #400 open [CI: success]",),
        branches=(),
        last_word=None,
    )

    text = "\n".join(carry.lines(HERE))

    assert text.splitlines()[0] == "#399 [reply waiting] Handoff and carryon"
    assert f"handed off 2026-10-12 16:20 by bateks's Claude on {ELSEWHERE}" in text
    assert "another machine, and that session went on" in text
    assert "since: 1 comment (bateks)" in text
    assert "PR #400 open [CI: success]" in text
    assert "no branch" in text
    assert "**Next:** tests (Claude's)." in text
    assert STALE not in text


def test_an_issue_s_handoff_is_shown_in_brief_or_whole() -> None:
    carry = IssueCarry(
        431, "Proposal", "in progress", Handoff(ME, URL, PROPOSAL, HandoffMark(HERE, AT), 0)
    )

    brief, whole = carry.lines(HERE), carry.lines(HERE, full=True)

    assert f"  {URL} (in brief: `handoffs --full` has it whole)" in brief
    assert "    For the next session:" in brief and "    A long proposal." not in brief
    assert f"  {URL}" in whole and "    A long proposal." in whole


def test_a_stale_issue_says_so() -> None:
    # #449: #293 was "in progress" from 2026-10-09 on, with no handoff.
    carry = IssueCarry(293, "Old", "in progress", None, last_word=f"{URL}9", stale=True)

    assert carry.lines(HERE)[:3] == [
        "#293 [in progress] Old",
        f"  {STALE}",
        f"  no handoff yet; Claude's last comment: {URL}9",
    ]


def test_an_issue_handed_off_here_or_by_a_session_that_closed() -> None:
    closed = Handoff(ME, URL, "Next: the PR.", HandoffMark(ELSEWHERE, AT, closing=True), 0)
    here = Handoff(ME, URL, "Next: the PR.", HandoffMark(HERE, AT), 0)

    def carry(handoff: Handoff) -> str:
        return "\n".join(IssueCarry(7, "x", "in progress", handoff, (), (), (), None).lines(HERE))

    assert "another machine, whose session closed" in carry(closed)
    assert "this machine" in carry(here)
    assert "since: nothing" in carry(here)


def test_an_issue_s_handoff_without_its_text_says_where_it_is() -> None:
    # `handoffs <n>`, an agent's: `show <n>` prints the text with the other comments.
    handoff = Handoff(ME, URL, "**Next:** tests (Claude's).", HandoffMark(HERE, AT), 0)
    carry = IssueCarry(399, "Handoff and carryon", "in progress", handoff, (), (), (), None)

    lines = carry.lines(HERE, quoted=False)

    assert lines[-1] == f"  {URL}: its text is in `show 399`"
    assert "**Next:**" not in "\n".join(lines)


def test_an_issue_without_a_handoff_points_to_claude_s_last_word() -> None:
    lines = IssueCarry(387, "Agents", "in progress", None, (), (), (), f"{URL}9").lines(HERE)

    assert f"no handoff yet; Claude's last comment: {URL}9" in "\n".join(lines)
    assert IssueCarry(390, "Prices", "to start", None, (), (), (), None).lines(HERE) == [
        "#390 [to start] Prices",
        "  no handoff yet; nothing from Claude",
        "  no branch",
    ]


def test_an_issue_waiting_on_someone_is_shown_as_its_move_alone() -> None:
    # #597: a session starting leaves it alone; `handoffs <n>` has its details.
    handoff = Handoff(ME, URL, PROPOSAL, HandoffMark(HERE, AT), 0)
    carry = IssueCarry(
        431,
        "Proposal",
        "in progress",
        handoff,
        pulls=("PR #432 open [CI: success]",),
        to_move=False,
    )

    assert carry.lines(HERE) == [
        "#431 [in progress] Proposal",
        "  PR #432 open [CI: success]",
        "  **Next:** your answer to the preview (bateks's). "
        "**Waiting on:** bateks's answer, on #431.",
        f"  {URL} (`handoffs 431` has the rest)",
    ]
    assert "    A long proposal." in carry.lines(HERE, full=True)
    assert f"  {URL}: its text is in `show 431`" in carry.lines(HERE, quoted=False)
