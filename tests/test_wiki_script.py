"""scripts/wiki.py: what the wiki lacks of main, and its pages pushed (#126)."""

import subprocess
from collections.abc import Mapping
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest

from scripts.handoff import Git
from scripts.wiki import Covered, WikiCheck, WikiClone, WikiNews, WikiUnpublished, wiki_url

pytestmark = pytest.mark.unit

NOW = datetime(2026, 11, 3, 18, 0)
FEATURE, CHORE, OLD = "1" * 40, "2" * 40, "3" * 40  # main's merges


def git(at: Path, *args: str) -> str:
    done = subprocess.run(["git", "-C", str(at), *args], capture_output=True, text=True, check=True)
    return done.stdout.strip()


class Wiki:
    """Real git: the wiki on GitHub (a bare repository beside the project's), and a clone of
    it to commit to, as a person does."""

    def __init__(self, root: Path) -> None:
        self.origin = str(root / "Everest-Game.git")
        self.remote = root / "Everest-Game.wiki.git"
        self.person = root / "person"
        git(root, "init", "-q", "--bare", "-b", "master", str(self.remote))
        git(root, "clone", "-q", str(self.remote), str(self.person))

    def commit(self, files: Mapping[str, str], *message: str) -> None:
        for name, text in files.items():
            (self.person / name).write_text(text, encoding="utf-8", newline="\n")
        git(self.person, "add", "-A")
        git(self.person, "commit", "-q", *(part for line in message for part in ("-m", line)))
        git(self.person, "push", "-q", "origin", "HEAD")

    def log(self) -> list[str]:
        """The wiki's commits on GitHub, the latest first: each subject, and its trailer."""
        found = git(self.remote, "log", "--format=%s|%(trailers:key=Main,key=Develop,valueonly)")
        return [line for line in found.splitlines() if line]  # the trailer ends in a newline


@pytest.fixture
def wiki(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Wiki:
    """With none of the developer's git settings, and a name to commit as."""
    settings = tmp_path / "gitconfig"
    settings.write_text("", encoding="utf-8")
    monkeypatch.setenv("GIT_CONFIG_GLOBAL", str(settings))
    monkeypatch.setenv("GIT_CONFIG_NOSYSTEM", "1")
    for who in ("AUTHOR", "COMMITTER"):
        monkeypatch.setenv(f"GIT_{who}_NAME", "Claude")
        monkeypatch.setenv(f"GIT_{who}_EMAIL", "claude@example.com")
    return Wiki(tmp_path)


class MainGitHub:
    """Main's commits since a wiki's (`compare`), and the PRs merged into it."""

    def __init__(self) -> None:
        self.asked: list[str] = []
        self.commits = [FEATURE, CHORE]  # since the commit the wiki covers, oldest first
        self.pulls: list[dict[str, Any]] = [
            pull(127, FEATURE, "feature/127-scale", "2026-11-03T12:00:00Z"),
            pull(128, CHORE, "chore/claude-prices", "2026-11-03T13:00:00Z"),
            pull(115, OLD, "feature/115-medicine", "2026-11-02T09:00:00Z"),  # covered already
            {**pull(129, None, "feature/129-x", None), "merged_at": None},  # closed unmerged
        ]

    def call(
        self, method: str, path: str, body: object | None = None, missing_ok: bool = False
    ) -> object:
        self.asked.append(path)
        if path.startswith("compare/"):
            return {"commits": [{"sha": sha} for sha in self.commits]}
        if path.startswith("commits?"):
            return [{"sha": OLD}]
        if path.startswith("pulls?"):
            return self.pulls
        raise AssertionError(path)


def pull(number: int, sha: str | None, branch: str, merged: str | None) -> dict[str, Any]:
    return {"number": number, "merge_commit_sha": sha, "head": {"ref": branch}, "merged_at": merged}


def check(wiki: Wiki, github: MainGitHub, tmp_path: Path, hours: float = 6) -> WikiCheck:
    runs = tmp_path / ".agent-runs"
    return WikiCheck(github, wiki.origin, hours, Git(tmp_path), runs / "wiki.git", runs / "checked")


def test_the_wiki_is_the_project_s_remote_with_wiki_before_git() -> None:
    assert wiki_url("https://github.com/o/r.git") == "https://github.com/o/r.wiki.git"
    assert wiki_url("git@github.com:o/r.git") == "git@github.com:o/r.wiki.git"
    assert wiki_url("https://github.com/o/r") == "https://github.com/o/r.wiki.git"


def test_the_wiki_covers_its_latest_trailer_and_a_person_s_edit_since_moves_nothing() -> None:
    log = (
        "2026-11-03T15:00:00+01:00\nA person's edit\n\x1e"
        f"2026-11-03T12:00:00+01:00\nUp to date with main: #127\n\nMain: {FEATURE}\n\x1e"
        f"2026-11-02T12:00:00+01:00\nUp to date with main\n\nMain: {OLD}\n\x1e"
    )

    assert Covered.read(log) == Covered(FEATURE, datetime.fromisoformat("2026-11-03T15:00+01:00"))


def test_a_trailer_from_before_the_branch_was_main_still_counts() -> None:
    # #300: the wiki's commits named the commit covered `Develop:` while the branch was develop.
    log = f"2026-11-03T12:00:00+01:00\nUp to date with develop: #127\n\nDevelop: {FEATURE}\n\x1e"

    assert Covered.read(log).sha == FEATURE


def test_a_wiki_with_no_trailer_covers_main_as_it_was_at_its_latest_commit(
    wiki: Wiki, tmp_path: Path
) -> None:
    # #126: the wiki was written by hand, from the repository as it was then.
    wiki.commit({"Home.md": "# Everest\n"}, "The game's wiki")
    github = MainGitHub()

    news = check(wiki, github, tmp_path).run(NOW)

    until = next(path for path in github.asked if path.startswith("commits?"))
    assert until.startswith("commits?sha=main&until=2") and until.endswith("Z&per_page=1")
    assert f"compare/{OLD}...main" in github.asked
    assert news == WikiNews(
        f"The wiki is behind main: 1 PR merged since {OLD[:7]} (#127).", CHORE, OLD, (127,)
    )


def test_the_check_starts_from_the_trailer_and_reads_the_wiki_again_once_it_moved(
    wiki: Wiki, tmp_path: Path
) -> None:
    wiki.commit({"Home.md": "# Everest\n"}, "Up to date with main", f"Develop: {OLD}")
    github = MainGitHub()
    made = check(wiki, github, tmp_path)
    assert made.run(NOW).pulls == (127,)

    wiki.commit({"Home.md": "# Everest, scaled\n"}, "Up to date", f"Develop: {FEATURE}")
    github.commits = [CHORE]

    news = made.run(NOW)

    assert f"compare/{FEATURE}...main" in github.asked
    assert news == WikiNews(f"The wiki: nothing merged into main since {FEATURE[:7]}.")
    assert not news.failed
    assert not any(path.startswith("commits?") for path in github.asked)


def test_it_looks_every_few_hours_a_failure_too(wiki: Wiki, tmp_path: Path) -> None:
    made = check(wiki, MainGitHub(), tmp_path, hours=6)  # the wiki has no commit yet

    first = made(lambda: NOW)

    assert first is not None and first.text.startswith("The wiki: couldn't tell what's new")
    assert first.failed  # #295: a run of its own says it failed; nothing new isn't a failure
    assert made(lambda: NOW.replace(hour=23)) is None
    assert made(lambda: NOW.replace(day=4)) is not None


def test_news_goes_to_the_manager_and_back_as_it_was() -> None:
    news = WikiNews("The wiki is behind main: …", FEATURE, OLD, (124, 127))

    assert news.key == f"wiki: {FEATURE}"
    assert WikiNews.of(news.data()) == news
    assert news.data()["type"] == "wiki"


def test_the_pages_are_pushed_with_the_main_commit_they_cover(wiki: Wiki, tmp_path: Path) -> None:
    wiki.commit({"Home.md": "# Everest\n"}, "The game's wiki")
    clone = WikiClone(tmp_path / "worktree" / ".agent-runs" / "wiki", Git(tmp_path))
    assert clone.make(wiki.origin) == "the wiki cloned"
    (clone.path / "Home.md").write_text("# Everest, to scale\n", encoding="utf-8")
    (clone.path / "Changelog.md").write_text("# Changelog\n", encoding="utf-8")
    wiki.commit({"Glossary.md": "# Glossary\n"}, "A person's edit meanwhile")

    said = clone.publish(FEATURE, (124, 127))

    assert said == f"the wiki pushed (2 files changed, main at {FEATURE[:7]})"
    assert wiki.log() == [
        f"Up to date with main: #124, #127|{FEATURE}",
        "A person's edit meanwhile|",
        "The game's wiki|",
    ]
    assert clone.make(wiki.origin) == "the wiki's clone kept from before"


def test_with_nothing_to_change_the_main_commit_covered_is_pushed_still(
    wiki: Wiki, tmp_path: Path
) -> None:
    # Else the next check finds the same PRs, and another agent reads them again.
    wiki.commit({"Home.md": "# Everest\n"}, "The game's wiki")
    clone = WikiClone(tmp_path / "wiki", Git(tmp_path))
    clone.make(wiki.origin)

    assert clone.publish(FEATURE, (128,)) == f"the wiki pushed (no change, main at {FEATURE[:7]})"
    assert wiki.log()[0] == f"Up to date with main: #128|{FEATURE}"


def test_a_wiki_that_can_t_be_cloned_or_pushed_says_why(wiki: Wiki, tmp_path: Path) -> None:
    with pytest.raises(WikiUnpublished, match="git clone of the wiki"):
        WikiClone(tmp_path / "nowhere", Git(tmp_path)).make(str(tmp_path / "missing.git"))
    wiki.commit({"Home.md": "# Everest\n"}, "The game's wiki")
    clone = WikiClone(tmp_path / "wiki", Git(tmp_path))
    clone.make(wiki.origin)
    git(clone.path, "remote", "set-url", "origin", str(tmp_path / "missing.git"))

    with pytest.raises(WikiUnpublished, match="git fetch in the wiki's clone"):
        clone.publish(FEATURE, (127,))


def test_pages_another_run_has_pushed_meanwhile_are_dropped_not_said_twice(
    wiki: Wiki, tmp_path: Path
) -> None:
    # Two machines' managers, each with a wiki agent on the same PRs: the first push wins.
    wiki.commit({"Home.md": "# Everest\n"}, "The game's wiki")
    clone = WikiClone(tmp_path / "wiki", Git(tmp_path))
    clone.make(wiki.origin)
    (clone.path / "Changelog.md").write_text("- #127\n", encoding="utf-8")
    wiki.commit({"Changelog.md": "- #127 (theirs)\n"}, "Up to date", f"Develop: {FEATURE}")

    said = clone.publish(FEATURE, (127,))

    assert said == "the wiki's pages dropped: another run updated it meanwhile"
    assert wiki.log() == [f"Up to date|{FEATURE}", "The game's wiki|"]


def test_a_time_with_an_offset_is_asked_of_github_in_utc(wiki: Wiki, tmp_path: Path) -> None:
    # A "+01:00" in a query string reads as a space.
    github = MainGitHub()

    check(wiki, github, tmp_path)._main_at(datetime(2026, 11, 3, 12, 13, tzinfo=UTC))

    assert github.asked == ["commits?sha=main&until=2026-11-03T12:13:00Z&per_page=1"]
