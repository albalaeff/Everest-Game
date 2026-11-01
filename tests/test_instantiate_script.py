"""scripts/instantiate.py: this template into a project."""

from pathlib import Path

import pytest

from scripts.instantiate import Instantiation, memory_folder, ruff_tidy

pytestmark = pytest.mark.unit

CI = """jobs:
  checks:
    runs-on: ubuntu-latest
    #db services:
    #db   postgres:
    #db     image: postgres:16
    #db
    #db env:
    #db   TEST_DATABASE_URL: postgresql://myapp:myapp@localhost:5433/myapp_test
    steps:
      - run: uv run mypy myapp scripts
"""
README = """<!-- template -->
# claude-workflow-template

How to use it.
<!-- /template -->

# myapp

What it is.
"""


def template(tmp_path: Path) -> Path:
    root = tmp_path / "repo"
    files = {
        "README.md": README,
        "pyproject.toml": 'name = "myapp"\npackages = ["myapp"]\n',
        "uv.lock": '[[package]]\nname = "myapp"\n',
        "myapp/__init__.py": '"""myapp."""\n',
        "myapp/config.py": 'ENV_PREFIX = "MYAPP_"\n',
        ".env.example": "# MYAPP_LOG_LEVEL=INFO\n",
        ".github/workflows/ci.yml": CI,
        "docker-compose.yml": "name: myapp\n",
        "docker/postgres-init/db.sql": "CREATE DATABASE myapp_test;\n",
        "optional/telegram-bot/bot.md": "# Bot\n",
        "optional/README.md": "# Optional\n",
        "scripts/instantiate.py": "# me\n",
        "tests/test_instantiate_script.py": "# my tests\n",
        "memory-seed/MEMORY.md": "- [A](a.md) — a\n- [B](b.md) — b\n",
        "memory-seed/a.md": "a\n",
        "memory-seed/b.md": "b\n",
        "memory-seed/README.md": "how\n",
        ".git/HEAD": "ref: refs/heads/develop\n",
        "logo.png": "",
    }
    for name, text in files.items():
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8", newline="\n")
    (root / "logo.png").write_bytes(b"\x89PNG\xff\xfe")
    return root


def read(root: Path, name: str) -> str:
    return (root / name).read_text(encoding="utf-8")


def untidy(root: Path) -> str | None:
    """No ruff over the fake trees: the real step has a test of its own."""
    return None


def test_the_package_and_the_prefix_are_renamed_everywhere(tmp_path: Path) -> None:
    root = template(tmp_path)

    done = Instantiation.of(root, "shopbot", tidy=untidy).apply()

    assert (root / "shopbot" / "config.py").is_file() and not (root / "myapp").exists()
    assert read(root, "shopbot/config.py") == 'ENV_PREFIX = "SHOPBOT_"\n'
    assert read(root, "pyproject.toml") == 'name = "shopbot"\npackages = ["shopbot"]\n'
    assert read(root, "uv.lock") == '[[package]]\nname = "shopbot"\n'
    assert read(root, ".env.example") == "# SHOPBOT_LOG_LEVEL=INFO\n"
    assert read(root, ".git/HEAD") == "ref: refs/heads/develop\n"  # .git is never touched
    assert (root / "logo.png").read_bytes() == b"\x89PNG\xff\xfe"  # nor a binary
    assert "myapp/ → shopbot/" in done
    assert any(line.startswith("myapp → shopbot, MYAPP_ → SHOPBOT_ in ") for line in done)


def test_a_prefix_of_one_s_own(tmp_path: Path) -> None:
    root = template(tmp_path)

    Instantiation.of(root, "shopbot", "SHOP_", tidy=untidy).apply()

    assert read(root, "shopbot/config.py") == 'ENV_PREFIX = "SHOP_"\n'


@pytest.mark.parametrize(
    ("name", "prefix"), [("Shop", None), ("1shop", None), ("shop-bot", None), ("shop", "shop_")]
)
def test_a_wrong_name_or_prefix_is_refused(tmp_path: Path, name: str, prefix: str | None) -> None:
    with pytest.raises(ValueError):
        Instantiation.of(template(tmp_path), name, prefix)


def test_with_the_database_ci_s_postgres_service_is_switched_on(tmp_path: Path) -> None:
    root = template(tmp_path)

    done = Instantiation.of(root, "shopbot", tidy=untidy).apply()

    assert "ci.yml: PostgreSQL's service switched on" in done
    assert read(root, ".github/workflows/ci.yml") == (
        "jobs:\n"
        "  checks:\n"
        "    runs-on: ubuntu-latest\n"
        "    services:\n"
        "      postgres:\n"
        "        image: postgres:16\n"
        "\n"
        "    env:\n"
        "      TEST_DATABASE_URL: postgresql://shopbot:shopbot@localhost:5433/shopbot_test\n"
        "    steps:\n"
        "      - run: uv run mypy shopbot scripts\n"
    )
    assert (root / "docker-compose.yml").is_file()


def test_without_the_database_its_pieces_go(tmp_path: Path) -> None:
    root = template(tmp_path)

    done = Instantiation.of(root, "shopbot", database=False, tidy=untidy).apply()

    assert "removed docker-compose.yml" in done and "removed docker" in done
    assert not (root / "docker-compose.yml").exists() and not (root / "docker").exists()
    assert "#db" not in read(root, ".github/workflows/ci.yml")
    assert "postgres" not in read(root, ".github/workflows/ci.yml")
    assert "ci.yml: PostgreSQL's service dropped" in done


def test_without_the_bot_its_copies_go_and_the_rest_of_optional_stays(tmp_path: Path) -> None:
    root = template(tmp_path)

    done = Instantiation.of(root, "shopbot", bot=False, tidy=untidy).apply()

    assert "removed optional/telegram-bot" in done
    assert not (root / "optional" / "telegram-bot").exists()
    assert (root / "optional" / "README.md").is_file()


def test_the_readme_s_template_section_is_stripped_unless_kept(tmp_path: Path) -> None:
    root = template(tmp_path)
    Instantiation.of(root, "shopbot", tidy=untidy).apply()
    assert read(root, "README.md") == "# shopbot\n\nWhat it is.\n"

    root = template(tmp_path / "kept")
    Instantiation.of(root, "shopbot", keep_readme=True, tidy=untidy).apply()
    assert read(root, "README.md").startswith("<!-- template -->\n# claude-workflow-template")


def test_the_script_and_its_tests_remove_themselves(tmp_path: Path) -> None:
    root = template(tmp_path)

    done = Instantiation.of(root, "shopbot", tidy=untidy).apply()

    assert not (root / "scripts" / "instantiate.py").exists()
    assert not (root / "tests" / "test_instantiate_script.py").exists()
    assert "removed scripts/instantiate.py, tests/test_instantiate_script.py" in done


def test_the_memory_seed_goes_to_the_machine_s_memory_once(tmp_path: Path) -> None:
    root = template(tmp_path)
    memory = tmp_path / "memory"
    memory.mkdir()
    (memory / "a.md").write_text("mine\n", encoding="utf-8")  # already there: kept
    (memory / "MEMORY.md").write_text("- [A](a.md) — a\n- [Mine](mine.md) — mine\n", "utf-8")

    done = Instantiation.of(root, "shopbot", memory=memory, tidy=untidy).apply()

    assert read(memory, "a.md") == "mine\n"
    assert read(memory, "b.md") == "b\n"
    assert not (memory / "README.md").exists()
    index = "- [A](a.md) — a\n- [Mine](mine.md) — mine\n- [B](b.md) — b\n"
    assert read(memory, "MEMORY.md") == index  # the line already there isn't added again
    assert f"memory seeded in {memory}: b.md" in done
    assert (root / "memory-seed" / "a.md").is_file()  # the seed stays in the repository


def test_a_new_machine_s_memory_starts_from_the_whole_seed(tmp_path: Path) -> None:
    root = template(tmp_path)
    memory = tmp_path / "fresh" / "memory"

    Instantiation.of(root, "shopbot", memory=memory, tidy=untidy).apply()

    assert read(memory, "MEMORY.md") == "- [A](a.md) — a\n- [B](b.md) — b\n"
    assert read(memory, "a.md") == "a\n"


def test_the_memory_folder_is_claude_code_s_for_the_checkout(tmp_path: Path) -> None:
    logs = tmp_path / "projects"
    (logs / "c--git-shopbot").mkdir(parents=True)  # as Claude Code made it, in its case

    assert memory_folder(Path("C:/git/shopbot"), logs) == logs / "c--git-shopbot" / "memory"
    assert memory_folder(Path("/home/dev/shopbot"), logs) == (logs / "-home-dev-shopbot" / "memory")
    assert memory_folder(Path("/x"), tmp_path / "none") == tmp_path / "none" / "-x" / "memory"


def test_the_renamed_files_are_tidied_last(tmp_path: Path) -> None:
    root = template(tmp_path)
    seen: list[bool] = []

    def tidy(at: Path) -> str | None:
        renamed = (root / "shopbot").is_dir() and not (root / "scripts" / "instantiate.py").exists()
        seen.append(at == root and renamed)
        return "tidied"

    done = Instantiation.of(root, "shopbot", tidy=tidy).apply()

    assert seen == [True]
    assert done[-1] == "tidied"
    quiet = Instantiation.of(template(tmp_path / "quiet"), "shopbot", tidy=untidy).apply()
    assert quiet[-1] != "tidied"  # nothing said for nothing done


def test_ruff_sorts_the_imports_and_formats_the_renamed_files(tmp_path: Path) -> None:
    # A longer name than myapp puts a line over the limit, and `from shopbot.config import …`
    # sorts after `from scripts …` where `from myapp.config …` sorted before it.
    (tmp_path / "pyproject.toml").write_text(
        '[tool.ruff.lint]\nselect = ["E", "F", "I"]\n', encoding="utf-8"
    )
    code = tmp_path / "x.py"
    code.write_text("import sys\nimport os\nprint( os, sys )\n", encoding="utf-8")

    said = ruff_tidy(tmp_path)

    assert said == "ruff: imports sorted, long lines wrapped"
    assert code.read_text(encoding="utf-8") == "import os\nimport sys\n\nprint(os, sys)\n"
    assert ruff_tidy(tmp_path, which=lambda name: None) is None  # no ruff: nothing done
