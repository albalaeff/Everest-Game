"""This template into a project (README → To start a project from it). Run once, in a fresh
clone of the new repository, then commit what it did.

    uv run python scripts/instantiate.py --name shopbot
    uv run python scripts/instantiate.py --name shopbot --prefix SHOP_ --no-db --no-bot
    uv run python scripts/instantiate.py --name shopbot --memory

It renames the package `myapp` and the settings' prefix `MYAPP_` in every text file and the
package's folder; drops the database pieces (`--no-db`: docker-compose.yml, docker/, CI's
PostgreSQL service) or keeps them; drops the Telegram bot's reference copies (`--no-bot`);
strips the template's own section from the README (unless `--keep-template-readme`); seeds
this machine's Claude Code memory from memory-seed/ (`--memory`); and deletes itself and its
tests. `uv.lock` is renamed too: `uv sync --locked` afterwards checks it still holds.
"""

import argparse
import io
import re
import shutil
import subprocess
import sys
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))  # run as a script, it still finds scripts

PACKAGE = "myapp"
PREFIX = "MYAPP_"
NAME = re.compile(r"^[a-z][a-z0-9_]*$")
SKIPPED = frozenset(
    {".git", ".venv", "__pycache__", ".agent-runs", ".mypy_cache", ".ruff_cache", ".pytest_cache"}
)
TEMPLATE_SECTION = re.compile(r"<!-- template -->.*?<!-- /template -->\n*", re.S)
DB_MARK = "#db"  # ci.yml: the lines of PostgreSQL's service, kept or dropped
DB_MARKED = re.compile(r"#db ?")
SELF = ("scripts/instantiate.py", "tests/test_instantiate_script.py")
DATABASE_PIECES = ("docker-compose.yml", "docker")
BOT_PIECES = ("optional/telegram-bot",)
Tidy = Callable[[Path], str | None]


def ruff_tidy(root: Path, which: Callable[[str], str | None] = shutil.which) -> str | None:
    """`ruff check --fix` and `ruff format` over the renamed files: a name longer than
    `myapp` puts a line over the limit, and the imports' order changes with the package's
    name. What it did; None when ruff isn't there to run (then `uv run ruff format` does)."""
    ruff = which("ruff")
    if ruff is None:
        return None
    for args in (("check", "--fix", "--quiet"), ("format", "--quiet")):
        subprocess.run([ruff, *args, "."], cwd=root, check=False, capture_output=True)
    return "ruff: imports sorted, long lines wrapped"


@dataclass(frozen=True, slots=True)
class Instantiation:
    """The template at `root` made into the project `name`, whose settings' prefix is
    `prefix`; with or without the database pieces and the bot's; the README's template
    section kept or stripped; the memory seed copied into `memory`, a machine's memory
    folder, when given; the renamed files tidied by `tidy`."""

    root: Path
    name: str
    prefix: str
    database: bool = True
    bot: bool = True
    keep_readme: bool = False
    memory: Path | None = None
    tidy: Tidy = ruff_tidy

    def __post_init__(self) -> None:
        if not NAME.match(self.name):
            raise ValueError(f"{self.name!r} isn't a package name: lowercase, digits, _")
        if not re.fullmatch(r"[A-Z][A-Z0-9_]*_", self.prefix):
            raise ValueError(f"{self.prefix!r} isn't a settings prefix: UPPERCASE, ending in _")

    @classmethod
    def of(
        cls,
        root: Path,
        name: str,
        prefix: str | None = None,
        *,
        database: bool = True,
        bot: bool = True,
        keep_readme: bool = False,
        memory: Path | None = None,
        tidy: Tidy = ruff_tidy,
    ) -> Instantiation:
        """With the prefix the name gives, unless one is named."""
        return cls(
            root, name, prefix or f"{name.upper()}_", database, bot, keep_readme, memory, tidy
        )

    def apply(self) -> list[str]:
        """Does it; what it did, a line each."""
        done = self._drop()
        done += self._readme()
        done += self._ci()
        done += self._rename_text()
        done += self._rename_package()
        done += self._seed_memory()
        done += self._remove_self()
        if (tidied := self.tidy(self.root)) is not None:
            done.append(tidied)
        return done

    def _drop(self) -> list[str]:
        gone = []
        pieces = (() if self.database else DATABASE_PIECES) + (() if self.bot else BOT_PIECES)
        for piece in pieces:
            path = self.root / piece
            if path.is_dir():
                shutil.rmtree(path)
            elif path.is_file():
                path.unlink()
            else:
                continue
            gone.append(f"removed {piece}")
            if path.parent != self.root and not any(path.parent.iterdir()):
                path.parent.rmdir()
        return gone

    def _readme(self) -> list[str]:
        readme = self.root / "README.md"
        if self.keep_readme or not readme.is_file():
            return []
        text = readme.read_text(encoding="utf-8")
        stripped = TEMPLATE_SECTION.sub("", text, count=1)
        if stripped == text:
            return []
        readme.write_text(stripped, encoding="utf-8", newline="\n")
        return ["README.md: the template's section stripped"]

    def _ci(self) -> list[str]:
        ci = self.root / ".github" / "workflows" / "ci.yml"
        if not ci.is_file():
            return []
        lines = ci.read_text(encoding="utf-8").splitlines(keepends=True)
        if not any(DB_MARK in line for line in lines):
            return []
        if self.database:
            kept = [self._unmarked(line) for line in lines]
            said = "ci.yml: PostgreSQL's service switched on"
        else:
            kept = [line for line in lines if DB_MARK not in line]
            said = "ci.yml: PostgreSQL's service dropped"
        ci.write_text("".join(kept), encoding="utf-8", newline="\n")
        return [said]

    @staticmethod
    def _unmarked(line: str) -> str:
        """The line without its mark; a marked line with nothing else is a blank one."""
        if DB_MARK not in line:
            return line
        bare = DB_MARKED.sub("", line, count=1)
        return "\n" if not bare.strip() else bare

    def _rename_text(self) -> list[str]:
        """`MYAPP_` → the prefix, `myapp` → the name, in every text file."""
        changed = 0
        for path in self._files():
            try:
                text = path.read_bytes().decode("utf-8")
            except UnicodeDecodeError:
                continue
            renamed = text.replace(PREFIX, self.prefix).replace(PACKAGE, self.name)
            if renamed != text:
                path.write_bytes(renamed.encode("utf-8"))
                changed += 1
        return [f"{PACKAGE} → {self.name}, {PREFIX} → {self.prefix} in {changed} files"]

    def _files(self) -> Iterator[Path]:
        for path in sorted(self.root.rglob("*")):
            if path.is_file() and not SKIPPED & set(path.relative_to(self.root).parts):
                yield path

    def _rename_package(self) -> list[str]:
        package = self.root / PACKAGE
        if self.name == PACKAGE or not package.is_dir():
            return []
        package.rename(self.root / self.name)
        return [f"{PACKAGE}/ → {self.name}/"]

    def _seed_memory(self) -> list[str]:
        """memory-seed/'s files into the machine's memory folder, those not there yet, and
        the index's missing lines into its MEMORY.md."""
        seed = self.root / "memory-seed"
        if self.memory is None or not seed.is_dir():
            return []
        self.memory.mkdir(parents=True, exist_ok=True)
        copied = []
        for path in sorted(seed.glob("*.md")):
            if path.name in ("MEMORY.md", "README.md") or (self.memory / path.name).exists():
                continue
            shutil.copyfile(path, self.memory / path.name)
            copied.append(path.name)
        index, seeded = self.memory / "MEMORY.md", seed / "MEMORY.md"
        if seeded.is_file():
            there = index.read_text(encoding="utf-8") if index.is_file() else ""
            missing = [
                line
                for line in seeded.read_text(encoding="utf-8").splitlines()
                if line.strip() and line not in there
            ]
            if missing:
                text = there.rstrip("\n") + ("\n" if there.strip() else "")
                index.write_text(text + "\n".join(missing) + "\n", encoding="utf-8", newline="\n")
        return [f"memory seeded in {self.memory}: {', '.join(copied) or 'nothing new'}"]

    def _remove_self(self) -> list[str]:
        gone = []
        for name in SELF:
            path = self.root / name
            if path.is_file():
                path.unlink()
                gone.append(name)
        return [f"removed {', '.join(gone)}"] if gone else []


def memory_folder(root: Path, logs: Path | None = None) -> Path:
    """This machine's memory folder for the checkout `root`, as Claude Code names it: the one
    there, whatever the case of its name (Windows: the drive letter as typed), else a new
    one."""
    from scripts.claude_cost import LOGS, log_folder  # here: the rest needs no dependency

    logs = LOGS if logs is None else logs
    wanted = log_folder(root).lower()
    if logs.is_dir():
        for project in logs.iterdir():
            if project.is_dir() and project.name.lower() == wanted:
                return project / "memory"
    return logs / log_folder(root) / "memory"


def main(argv: list[str] | None = None) -> None:
    if isinstance(sys.stdout, io.TextIOWrapper):  # piped on Windows: cp1252 (PEB#358)
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--name", required=True, help="the package's name: lowercase, digits, _")
    parser.add_argument("--prefix", help="the settings' prefix (default: the name, uppercase, _)")
    parser.add_argument("--no-db", action="store_true", help="the project has no database")
    parser.add_argument("--no-bot", action="store_true", help="drop the Telegram bot's copies")
    parser.add_argument(
        "--keep-template-readme", action="store_true", help="keep the README's template section"
    )
    parser.add_argument(
        "--memory", action="store_true", help="seed this machine's Claude Code memory"
    )
    args = parser.parse_args(argv)
    try:
        made = Instantiation.of(
            ROOT,
            args.name,
            args.prefix,
            database=not args.no_db,
            bot=not args.no_bot,
            keep_readme=args.keep_template_readme,
            memory=memory_folder(ROOT) if args.memory else None,
        )
    except ValueError as error:
        raise SystemExit(str(error)) from None
    for line in made.apply():
        print(line)
    print(
        "\nNext: `uv sync --locked` (or `uv lock` if it refuses); the checks (CLAUDE.md → Checks: "
        "a long name may leave a line too long for ruff, which says which); commit; push develop "
        "and master; then set the repository up on GitHub (README → Repository settings)."
    )


if __name__ == "__main__":
    main()
