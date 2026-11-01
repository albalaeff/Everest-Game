"""What this machine has and lacks for working on myapp, with the fix for each (PEB#342).

    uv run python scripts/check_setup.py
    uv run python scripts/check_setup.py --unless-recent   a session's start (PEB#597)

One line per piece, from Git's hooks to the GitHub token, then the fix for each one that's
missing. It ends with exit code 1 while anything required is missing; optional pieces
(poppler) and notes (what .env pins, PEB#564) don't count. It never prints a token or a
password. docs/developer-setup.md is the path from a bare machine, and Claude runs this at
the start of every session (.claude/skills/carryon/SKILL.md): with `--unless-recent`, which
says what the last check here found instead, within 8 hours of it (`LastCheck`).

The project's own pieces (its schema at head, a token the app needs in .env) go in
`PROJECT_CHECKS` below, each a function that returns a `Check`.
"""

import argparse
import functools
import json
import os
import re
import shutil
import socket
import subprocess
import sys
from collections.abc import Callable, Mapping, Sequence
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, ClassVar
from urllib.parse import urlsplit

from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))  # run as a script, it still finds the package and scripts

from myapp.config import ENV_PREFIX  # noqa: E402
from scripts import claude_prices as prices  # noqa: E402
from scripts import github  # noqa: E402
from scripts.handoff import plural  # noqa: E402

Run = Callable[..., subprocess.CompletedProcess[str]]
Which = Callable[[str], str | None]

DEFAULT_DATABASE_URL = "postgresql://myapp:myapp@localhost:5433/myapp"  # docker-compose.yml's


def has_database(root: Path = ROOT) -> bool:
    """Whether the project has a database: docker-compose.yml runs it for development
    (scripts/instantiate.py --no-db deletes the file)."""
    return (root / "docker-compose.yml").is_file()


@dataclass(frozen=True)
class Check:
    name: str
    ok: bool
    detail: str
    fix: str = ""
    required: bool = True
    note: bool = False  # something to know, never a missing piece

    @property
    def mark(self) -> str:
        if self.ok:
            return "[ok]"
        if self.note:
            return "[note]"
        return "[missing]" if self.required else "[optional]"

    @property
    def needed(self) -> bool:
        """Whether the machine isn't ready while this fails: a note never stops it."""
        return self.required and not self.note


def _run(run: Run, command: Sequence[str]) -> subprocess.CompletedProcess[str] | None:
    """The finished command, or None when its program isn't installed."""
    try:
        return run(list(command), capture_output=True, text=True, check=False, cwd=ROOT)
    except FileNotFoundError:
        return None


# --- the checks ------------------------------------------------------------------------------


def python(version: tuple[int, ...] = sys.version_info[:3]) -> Check:
    found = ".".join(map(str, version[:3]))
    if version[:2] >= (3, 14):
        return Check("Python", True, found)
    return Check("Python", False, f"{found}, needs 3.14", "uv sync (uv fetches Python 3.14)")


def uv(which: Which = shutil.which) -> Check:
    if which("uv"):
        return Check("uv", True, "installed")
    return Check(
        "uv",
        False,
        "not installed",
        "winget install --id astral-sh.uv (or see https://docs.astral.sh/uv/)",
    )


def git_hooks(run: Run = subprocess.run) -> Check:
    found = _run(run, ["git", "config", "core.hooksPath"])
    if found is not None and found.stdout.strip() == ".githooks":
        return Check("Git hooks", True, "on: pushes to develop and master are refused")
    return Check("Git hooks", False, "off", "git config core.hooksPath .githooks")


def docker(run: Run = subprocess.run) -> Check:
    found = _run(run, ["docker", "info"])
    if found is not None and found.returncode == 0:
        return Check("Docker", True, "running")
    detail = "not installed" if found is None else "not running"
    return Check(
        "Docker",
        False,
        detail,
        "install Docker Desktop (winget install --id Docker.DockerDesktop, needs an admin), "
        "then start it",
    )


def _answers(host: str, port: int) -> bool:
    try:
        with socket.create_connection((host, port), timeout=2):
            return True
    except OSError:
        return False


def database(url: str, connect: Callable[[str, int], bool] = _answers) -> Check:
    parts = urlsplit(url)
    host, port = parts.hostname or "localhost", parts.port or 5432
    where = f"{host}:{port}"
    if connect(host, port):
        return Check("Database", True, f"answering on {where}")
    return Check("Database", False, f"nothing answers on {where}", "docker compose up -d db")


@dataclass(frozen=True, slots=True)
class EnvFile:
    """A `.env`, or the `.env.example` it's copied from, as read: the settings it sets
    (`values`), the defaults a template states as commented lines, `# KEY=default`
    (`defaults`), and the keys it leaves blank to fill in, `KEY=` (`blank`)."""

    values: Mapping[str, str]
    defaults: Mapping[str, str]
    blank: tuple[str, ...]

    SETTING: ClassVar[re.Pattern[str]] = re.compile(
        r"^(?P<comment># )?(?P<key>[A-Z][A-Z0-9_]*)=(?P<value>.*)$"
    )

    @classmethod
    def read(cls, path: Path) -> EnvFile:
        """An empty one for a file that isn't there."""
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            return cls({}, {}, ())
        defaults: dict[str, str] = {}
        blank: list[str] = []
        for line in text.splitlines():
            found = cls.SETTING.match(line.strip())
            if found is None:
                continue
            if found["comment"]:
                defaults[found["key"]] = found["value"].strip()
            elif not found["value"].strip():
                blank.append(found["key"])
        values = {key: value for key, value in dotenv_values(path).items() if value}
        return cls(values, defaults, tuple(blank))


@dataclass(frozen=True, slots=True)
class Pins:
    """What a `.env` pins of the template's defaults (PEB#564): a line for a setting keeps
    that value when a release changes the default, so a copy of an older template holds the
    app to that day's values. `changed`: pinned at another value; `at_default`: lines at
    today's default, which would pin it once that changes; `unknown`: keys the template
    doesn't have, so the code ignores them."""

    changed: tuple[tuple[str, str, str], ...]  # (key, value, default)
    at_default: tuple[str, ...]
    unknown: tuple[str, ...]

    @classmethod
    def between(cls, env: EnvFile, template: EnvFile) -> Pins:
        changed: list[tuple[str, str, str]] = []
        same: list[str] = []
        unknown: list[str] = []
        for key, value in env.values.items():
            if key in template.defaults:
                default = template.defaults[key]
                if value == default:
                    same.append(key)
                else:
                    changed.append((key, value, default))
            elif key not in template.blank:
                unknown.append(key)
        return cls(tuple(changed), tuple(same), tuple(unknown))

    def __bool__(self) -> bool:
        return bool(self.changed or self.at_default or self.unknown)

    def describe(self, name: str) -> str:
        """For people, naming no value of a blank-by-default setting (a secret): those are
        never among the defaults."""
        parts = []
        if self.changed:
            pins = ", ".join(f"`{k}={v}` (by default `{d}`)" for k, v, d in self.changed)
            parts.append(f"`{name}` pins {pins}.")
        if self.at_default:
            lines = plural(len(self.at_default), "line")
            verb, it = ("is", "it") if len(self.at_default) == 1 else ("are", "they")
            parts.append(
                f"{lines} {verb} at today's default, and would pin it once that changes: "
                f"{it} could go."
            )
        if self.unknown:
            keys = ", ".join(f"`{key}`" for key in self.unknown)
            parts.append(f"Unknown to the code, so ignored: {keys}.")
        return " ".join(parts)


def env_file(path: Path, template: Path = ROOT / ".env.example") -> Check:
    """`.env` is there, and every line `.env.example` leaves blank to fill in is filled."""
    if not path.exists():
        return Check(
            ".env",
            False,
            "no .env",
            "cp .env.example .env, then fill in what's blank (a secret goes in by hand, never "
            "through the chat)",
        )
    needed = EnvFile.read(template).blank
    values = EnvFile.read(path).values
    missing = [key for key in needed if key not in values]
    if missing:
        return Check(
            ".env",
            False,
            f"not filled in: {', '.join(missing)}",
            "set each on its own line in .env (the last line for a key wins)",
        )
    detail = f"{', '.join(needed)} set" if needed else "there"
    return Check(".env", True, detail)


def env_pins(env: Path, template: Path = ROOT / ".env.example") -> Check:
    """What .env pins of .env.example's defaults (PEB#564): a note, never a missing piece,
    since pinning on purpose is allowed."""
    name = ".env's settings"
    if not env.exists():
        return Check(name, True, "no .env", note=True)
    pins = Pins.between(EnvFile.read(env), EnvFile.read(template))
    if not pins:
        return Check(name, True, "every setting follows the code", note=True)
    return Check(
        name,
        False,
        pins.describe(".env"),
        "delete the lines you don't mean to pin: an absent line follows the code, also when a"
        " default changes (README → Configuration)",
        note=True,
    )


def github_access(find_token: Callable[[], str], call: Callable[[str], Any]) -> Check:
    try:
        find_token()
    except SystemExit:
        return Check(
            "GitHub",
            False,
            "no token found",
            "run git fetch and sign in to GitHub in the window that opens "
            "(Git stores the token), or set GITHUB_TOKEN",
        )
    try:
        login = call("/user")["login"]
        can_push = call("").get("permissions", {}).get("push")
    except SystemExit as refused:  # the token is wrong or expired
        return Check(
            "GitHub",
            False,
            f"the token was refused: {str(refused).splitlines()[0]}",
            "set a fresh one",
        )
    if can_push:
        return Check("GitHub", True, f"as {login}, who can push to the repository")
    return Check(
        "GitHub",
        False,
        f"as {login}, who can't push to the repository",
        "ask the repository's owner to add this account as a collaborator",
    )


def claude_prices(history: Path = prices.HISTORY) -> Check:
    """Claude's prices (PEB#390), which `scripts/github.py cost` and the issues' title
    prefixes price the work with: in the repo, kept up to date by the watcher."""
    kept = prices.PriceHistory.load(history).current()
    if kept:
        models = len({model for model, _ in kept})
        return Check("Claude's prices", True, f"{models} models in {history.name}")
    return Check(
        "Claude's prices",
        False,
        f"none in {history.name}",
        "uv run python scripts/claude_prices.py refresh",
    )


def claude_cli(which: Which = shutil.which, run: Run = subprocess.run) -> Check:
    """Claude Code's command line, signed in as the developer: the agent manager's agents
    are it (PEB#387). The copy inside the VS Code extension moves with each update."""
    found = which("claude")
    if not found:
        install = (
            "irm https://claude.ai/install.ps1 | iex (in PowerShell; it installs to "
            "%USERPROFILE%\\.local\\bin, which goes on the user PATH)"
            if sys.platform == "win32"
            else "curl -fsSL https://claude.ai/install.sh | bash"
        )
        return Check(
            "Claude Code CLI",
            False,
            "not installed: the agent manager needs it",
            f"{install}, then a new terminal; `claude auth login` if it isn't signed in",
        )
    status = _run(run, [found, "auth", "status"])
    try:
        signed_in = status is not None and json.loads(status.stdout).get("loggedIn") is True
    except ValueError:
        signed_in = False
    if signed_in:
        return Check("Claude Code CLI", True, "installed, signed in")
    return Check(
        "Claude Code CLI",
        False,
        "not signed in",
        "claude auth login, with your own account (the one the VS Code extension uses)",
    )


CLAUDE_CONFIG = Path(os.environ.get("CLAUDE_CONFIG_DIR") or Path.home()) / ".claude.json"


def main_checkout(run: Run = subprocess.run) -> Path:
    """The repository's main checkout, also when this runs in one of its worktrees."""
    found = _run(run, ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"])
    if found is None or found.returncode != 0:
        return ROOT
    return Path(found.stdout.strip()).parent


def claude_trust(config: Path = CLAUDE_CONFIG, root: Path = ROOT) -> Check:
    """Whether Claude Code trusts the checkout `root`: only then does a headless agent take
    .claude/settings.json's allow list (PEB#387). Claude Code keys the trust on the main
    checkout, which covers its worktrees, and for `claude -p` a trusted parent folder
    doesn't count. The VS Code extension doesn't record it; `claude` run there once, with
    its trust dialog accepted, does."""
    try:
        projects = json.loads(config.read_text(encoding="utf-8")).get("projects") or {}
    except OSError, ValueError, AttributeError:
        projects = {}
    trusted = {
        os.path.normcase(Path(path))
        for path, project in projects.items()
        if isinstance(project, dict) and project.get("hasTrustDialogAccepted") is True
    }
    if os.path.normcase(root) in trusted:
        return Check("Claude Code trust", True, "this checkout is trusted")
    return Check(
        "Claude Code trust",
        False,
        "this checkout isn't trusted: agents ignore the allow list in .claude/settings.json",
        f"run `claude` in {root} once, accept the trust dialog, then /exit",
    )


HOME = Path.home()
CLAUDE_SETTINGS = Path(os.environ.get("CLAUDE_CONFIG_DIR") or HOME / ".claude") / "settings.json"
SCRATCHPAD_EXPORT = re.compile(r"^\s*export\s+CLAUDE_SCRATCHPAD\b", re.MULTILINE)


def claude_scratchpad(settings: Path = CLAUDE_SETTINGS, home: Path = HOME) -> Check:
    """Whether Claude's Bash commands have $CLAUDE_SCRATCHPAD, the folder Claude Code's prompt
    names for scratch files (PEB#530). Claude Code exports no such variable, and its Bash
    tool runs `bash -c`, which reads no profile but the file BASH_ENV names. Claude Code's
    user settings can set BASH_ENV; Claude may not change them itself."""
    name = "Claude's Bash scratchpad"
    snippet = "the snippet in docs/developer-setup.md (Claude's Bash scratchpad)"
    try:
        env = json.loads(settings.read_text(encoding="utf-8")).get("env")
        value = env.get("BASH_ENV") if isinstance(env, dict) else None
    except OSError, ValueError, AttributeError:
        value = None
    if not value or not isinstance(value, str):
        bashrc = (home / ".bashrc").as_posix()
        return Check(
            name,
            False,
            "Claude Code's settings set no BASH_ENV: its Bash commands have no $CLAUDE_SCRATCHPAD",
            f'put {snippet} in {bashrc}, then add "env": {{"BASH_ENV": "{bashrc}"}} to '
            f"{settings.as_posix()} yourself (Claude may not change its own settings) and "
            "start a new session",
        )
    profile, fix = Path(value), f"put {snippet} in {value}"
    if not profile.is_file():
        return Check(name, False, f"BASH_ENV names {value}, which doesn't exist", fix)
    if SCRATCHPAD_EXPORT.search(profile.read_text(encoding="utf-8", errors="replace")):
        return Check(name, True, f"BASH_ENV ({value}) exports CLAUDE_SCRATCHPAD")
    return Check(name, False, f"{value} doesn't export CLAUDE_SCRATCHPAD", fix)


INTERPRETER = Path(sys.executable)
WhichOn = Callable[[str, str], str | None]  # shutil.which on a PATH of one's own


def vscode_python(
    run: Run = subprocess.run,
    which: WhichOn = lambda program, path: shutil.which(program, path=path),
    environ: Mapping[str, str] = os.environ,
    interpreter: Path = INTERPRETER,
) -> Check:
    """Whether VS Code gives its terminals and Claude's commands .venv's Python (PEB#530).
    With uv's own Python chosen as the interpreter instead, every `uv` call warns that
    VIRTUAL_ENV doesn't match .venv, and `python` is the Microsoft Store's stub. `uv run` sets
    VIRTUAL_ENV for this script and puts .venv's folder first on the PATH, so the check reads
    the PATH behind that folder, where VS Code put the chosen interpreter's."""
    name = "VS Code's Python"
    fix = (
        "in VS Code, Python: Select Interpreter → .venv's python, then Developer: Reload "
        "Window, so that new terminals and Claude Code's panel take it"
    )
    folders = [folder for folder in environ.get("PATH", "").split(os.pathsep) if folder]
    if environ.get("UV") and folders and Path(folders[0]) == interpreter.parent:
        folders = folders[1:]  # `uv run` put it there
    found = _run(run, ["uv", "python", "dir"])
    if found is not None and found.returncode == 0 and found.stdout.strip():
        uv_pythons = Path(found.stdout.strip())
        stray = next((f for f in folders if Path(f).is_relative_to(uv_pythons)), None)
        if stray:
            return Check(
                name,
                False,
                f"uv's own Python is on the PATH ({stray}): each uv call warns that "
                "VIRTUAL_ENV doesn't match .venv",
                fix,
            )
    if environ.get("TERM_PROGRAM") != "vscode" and not any(
        key.startswith("VSCODE_") for key in environ
    ):
        return Check(name, True, "not in VS Code")
    python = which("python", os.pathsep.join(folders))
    if python and "windowsapps" in {part.lower() for part in Path(python).parts}:
        return Check(name, False, f"`python` is the Microsoft Store's stub ({python})", fix)
    return Check(name, True, f"`python` is {python}" if python else "no `python` on the PATH")


def poppler(which: Which = shutil.which) -> Check:
    """pdftoppm, which Claude Code's Read needs for a PDF (PEB#530)."""
    if which("pdftoppm"):
        return Check("poppler", True, "installed: Claude can read PDFs", required=False)
    return Check(
        "poppler",
        False,
        "not installed: Claude can't read PDFs",
        "winget install --id oschwartz10612.Poppler (or brew install poppler), then a new "
        "terminal; if pdftoppm still isn't found, put its Library/bin on the user PATH",
        required=False,
    )


# The project's own pieces, each a function that returns a Check, run after the generic ones.
# For instance, a schema held to its migrations:
#
#     def schema(run: Run = subprocess.run) -> Check:
#         found = _run(run, [sys.executable, "-m", "alembic", "current"])
#         if found is not None and "(head)" in found.stdout:
#             return Check("Schema", True, "at head")
#         return Check("Schema", False, "behind the migrations", "uv run alembic upgrade head")
#
#     PROJECT_CHECKS.append(schema)
PROJECT_CHECKS: list[Callable[[], Check]] = []


# --- the report ------------------------------------------------------------------------------


def report(checks: Sequence[Check]) -> tuple[str, bool]:
    """The lines to print, and whether everything required is there."""
    lines = []
    for check in checks:
        lines.append(f"{check.mark:<10} {check.name}: {check.detail}")
        if not check.ok and check.fix:
            lines.append(f"{'':<10} fix: {check.fix}")
    return "\n".join(lines), all(check.ok for check in checks if check.needed)


# --- the last check, for a session soon after another (PEB#597) -----------------------------


@dataclass(frozen=True)
class LastCheck:
    """The last full check of this checkout: when it ran and what it found, kept in
    `.claude/setup-checked` (gitignored, like `prices-checked`). A session opened within
    `RECENT` of it reads that instead of checking again (`--unless-recent`, PEB#597): within
    a working day a machine's pieces rarely change, and a reboot, which does, comes with a
    longer break. After a fix, a run without the flag checks again, and is the last check."""

    at: datetime
    checks: tuple[Check, ...]

    PATH: ClassVar[Path] = ROOT / ".claude" / "setup-checked"
    RECENT: ClassVar[timedelta] = timedelta(hours=8)

    @property
    def ready(self) -> bool:
        return all(check.ok for check in self.checks if check.needed)

    def recent(self, now: datetime) -> bool:
        """Within `RECENT` of `now`; one in the future (a clock set back) isn't."""
        return timedelta(0) <= now - self.at < self.RECENT

    def summary(self, now: datetime) -> str:
        """When it checked, and what wasn't there then, with its fix: the report's lines for
        those; one line when everything was."""
        minutes = int((now - self.at).total_seconds() // 60)
        ago = plural(minutes, "minute") if minutes < 60 else plural(minutes // 60, "hour")
        when = f"{self.at:%H:%M}" if self.at.date() == now.date() else f"{self.at:%Y-%m-%d %H:%M}"
        hours = int(self.RECENT.total_seconds() // 3600)
        flag = f"--unless-recent: not again within {plural(hours, 'hour')}"
        head = f"Checked at {when}, {ago} ago"
        missing = [check for check in self.checks if not check.ok]
        if not missing:
            return f"{head}: everything was there ({flag})."
        text, _ = report(missing)
        return f"{head}; not there then ({flag}):\n{text}"

    def save(self, path: Path = PATH) -> None:
        data = {
            "at": self.at.isoformat(timespec="seconds"),
            "checks": [asdict(check) for check in self.checks],
        }
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    @classmethod
    def load(cls, path: Path = PATH) -> LastCheck | None:
        """The one kept; None without one, or one that doesn't read."""
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            checks = tuple(Check(**check) for check in data["checks"])
            return cls(datetime.fromisoformat(data["at"]), checks)
        except OSError, ValueError, TypeError, KeyError:
            return None


@functools.cache
def _github() -> github.GitHub:
    remote = subprocess.run(
        ["git", "remote", "get-url", "origin"], capture_output=True, text=True, check=True
    ).stdout.strip()
    return github.GitHub(github.repo_slug(remote), github.token())


def all_checks() -> list[Check]:
    """Every check, run now: the generic ones, the database's when the project has one, then
    the project's own."""
    env = ROOT / ".env"
    checks = [python(), uv(), git_hooks()]
    if has_database():
        url = EnvFile.read(env).values.get(f"{ENV_PREFIX}DATABASE_URL")
        checks += [docker(), database(url or DEFAULT_DATABASE_URL)]
    checks += [
        env_file(env),
        env_pins(env),
        github_access(github.token, lambda path: _github().call("GET", path)),
        claude_prices(),
        claude_cli(),
        claude_trust(root=main_checkout()),
        claude_scratchpad(),
        vscode_python(),
        poppler(),
    ]
    return checks + [check() for check in PROJECT_CHECKS]


def main(argv: Sequence[str] | None = None) -> None:
    github.utf8_output()  # PEB#358
    parser = argparse.ArgumentParser(description="What this machine has and lacks for myapp.")
    parser.add_argument(
        "--unless-recent",
        action="store_true",
        help="checked here within the last 8 hours: what that found, instead (PEB#597)",
    )
    args = parser.parse_args(argv)
    now = datetime.now()
    last = LastCheck.load()
    if args.unless_recent and last is not None and last.recent(now):
        text, ready = last.summary(now), last.ready
    else:
        checks = all_checks()
        LastCheck(now, tuple(checks)).save()
        text, ready = report(checks)
    print(text)
    print("\nReady to work." if ready else "\nSome pieces are missing: see fix.")
    sys.exit(0 if ready else 1)


if __name__ == "__main__":
    main()
