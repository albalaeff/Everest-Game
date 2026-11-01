"""The bot and the worker for development, restarted when `develop` moves (#228).

    uv run python scripts/run_dev.py            the bot and the worker
    uv run python scripts/run_dev.py --admin    and the dashboard

They run in this console from this checkout, from whatever is checked out. Every few
seconds the runner looks at it: once `develop` is checked out at a commit other than the
one they were started from (Claude pulls it after each merge), the commit is the same as
at the last look and nothing is uncommitted, it runs `uv sync` and `alembic upgrade head`
and starts them again. On any other branch it waits: the processes keep the code they
loaded. A process that exits on its own is started again with the next change. Ctrl+C
stops them all.

On Windows a stop is immediate (a console process can't be asked to stop gently from
another one); conversations are kept in Postgres, so a restart loses none.

The meeting-place map (#297) is a Telegram Mini App, which Telegram opens only over public
HTTPS. With cloudflared installed (`winget install --id Cloudflare.cloudflared`) and no
FXBOT_WEBAPP_URL of your own, the runner opens a quick Cloudflare tunnel to the bot's web
server (no account, no open port: cloudflared connects out) and hands its address to the
bot, which then listens on 127.0.0.1 only. The address is new each time the runner starts.
"""

import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

FOLLOWED = "develop"
ROLES = {
    "bot": ["-m", "fxbot", "bot"],
    "worker": ["-m", "fxbot", "worker"],
    "admin": ["-m", "fxbot", "admin", "serve"],
}
STOP_SECONDS = 10  # how long a process may take to stop before it's killed
TUNNEL_ADDRESS = re.compile(r"https://[a-z0-9-]+\.trycloudflare\.com")
TUNNEL_WAIT_SECONDS = 30  # cloudflared says its address within a few seconds
TUNNEL_LOG = Path(tempfile.gettempdir()) / "fxbot-cloudflared.log"
WEB_PORT = 8080  # the bot's web server (FXBOT_WEB_PORT's default)

Run = Callable[..., subprocess.CompletedProcess[str]]


class Process(Protocol):
    def poll(self) -> int | None: ...
    def terminate(self) -> None: ...
    def wait(self, timeout: float | None = None) -> int: ...
    def kill(self) -> None: ...


Popen = Callable[..., Process]


def say(text: str) -> None:
    print(f"[run_dev] {text}", flush=True)


# --- this checkout ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class Checkout:
    branch: str  # "HEAD" when detached
    commit: str
    clean: bool  # no uncommitted changes to tracked files: no merge or pull halfway


def look(run: Run) -> Checkout:
    def git(*args: str) -> str:
        return str(run(["git", *args], capture_output=True, text=True, check=True).stdout).strip()

    return Checkout(
        branch=git("rev-parse", "--abbrev-ref", "HEAD"),
        commit=git("rev-parse", "HEAD"),
        clean=git("status", "--porcelain", "--untracked-files=no") == "",
    )


def due(now: Checkout, before: Checkout | None, running: str) -> bool:
    """Restart: `develop` checked out at a commit other than the running one, settled (the
    same as at the last look, so a checkout and then a pull restart once) and clean."""
    return now.branch == FOLLOWED and now.commit != running and now == before and now.clean


# --- the processes ---------------------------------------------------------------------------


def apart() -> dict[str, Any]:
    """Their own process group: Ctrl+C reaches the runner only, which stops them."""
    if sys.platform == "win32":
        return {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP}
    return {"start_new_session": True}


class Processes:
    def __init__(
        self, roles: Sequence[str], popen: Popen, env: dict[str, str] | None = None
    ) -> None:
        self._roles = roles
        self._popen = popen
        self._env = env  # None: the runner's own
        self._running: dict[str, Process] = {}
        self._reported: set[str] = set()

    def start(self) -> None:
        self._reported.clear()
        extra = {"env": self._env} if self._env is not None else {}
        for role in self._roles:
            self._running[role] = self._popen([sys.executable, *ROLES[role]], **apart(), **extra)

    def stop(self) -> None:
        for process in self._running.values():
            if process.poll() is None:
                process.terminate()
        for process in self._running.values():
            try:
                process.wait(timeout=STOP_SECONDS)
            except subprocess.TimeoutExpired:
                process.kill()
        self._running.clear()

    def exited(self) -> list[tuple[str, int]]:
        """The processes that have exited on their own since the last start, once each."""
        gone = []
        for role, process in self._running.items():
            code = process.poll()
            if code is not None and role not in self._reported:
                self._reported.add(role)
                gone.append((role, code))
        return gone


# --- the tunnel (#297) ----------------------------------------------------------------------


def own_webapp_url(env: dict[str, str], dotenv: Path) -> bool:
    """FXBOT_WEBAPP_URL set already, in the environment or in .env: a tunnel of one's own."""
    if env.get("FXBOT_WEBAPP_URL"):
        return True
    try:
        lines = dotenv.read_text(encoding="utf-8").splitlines()
    except OSError:
        return False
    return any(re.match(r"\s*FXBOT_WEBAPP_URL\s*=\s*\S", line) for line in lines)


def open_tunnel(
    which: Callable[[str], str | None],
    popen: Popen,
    sleep: Callable[[float], None],
    log: Path,
) -> tuple[Process, str] | None:
    """A quick Cloudflare tunnel to the bot's web server, and its public address; None
    without cloudflared, or when it gives no address."""
    cloudflared = which("cloudflared")
    if cloudflared is None:
        say("cloudflared isn't installed: no meeting-place map (#297)")
        return None
    url = f"http://127.0.0.1:{WEB_PORT}"
    with log.open("w", encoding="utf-8") as output:
        tunnel = popen(
            [cloudflared, "tunnel", "--no-autoupdate", "--url", url],
            stdout=output,
            stderr=subprocess.STDOUT,
            **apart(),
        )
    for _ in range(TUNNEL_WAIT_SECONDS):
        found = TUNNEL_ADDRESS.search(log.read_text(encoding="utf-8", errors="replace"))
        if found:
            return tunnel, found[0]
        if tunnel.poll() is not None:
            break
        sleep(1)
    say(f"the tunnel gave no address: no meeting-place map (see {log})")
    if tunnel.poll() is None:
        tunnel.terminate()
    return None


def prepare(run: Run) -> None:
    """New packages and new tables before the new code starts."""
    uv = os.environ.get("UV") or shutil.which("uv") or "uv"  # `uv run` sets UV
    for step in ([uv, "sync"], [sys.executable, "-m", "alembic", "upgrade", "head"]):
        try:
            done = run(step, check=False)
        except FileNotFoundError:
            say(f"{step[0]} not found: skipped {' '.join(step[1:])}")
            continue
        if done.returncode != 0:
            say(f"{' '.join(step[1:])} failed (exit code {done.returncode}); starting anyway")


# --- the loop --------------------------------------------------------------------------------


def main(
    argv: Sequence[str] | None = None,
    *,
    run: Run = subprocess.run,
    popen: Popen = subprocess.Popen,
    sleep: Callable[[float], None] = time.sleep,
    which: Callable[[str], str | None] = shutil.which,
    tunnel_log: Path = TUNNEL_LOG,
    dotenv: Path = Path(".env"),
) -> None:
    parser = argparse.ArgumentParser(prog="scripts/run_dev.py", description=__doc__.split("\n")[0])
    parser.add_argument("--admin", action="store_true", help="the dashboard too")
    parser.add_argument("--every", type=float, default=5, help="seconds between looks")
    args = parser.parse_args(argv)

    roles = ["bot", "worker", *(["admin"] if args.admin else [])]
    env: dict[str, str] | None = None
    tunnel = None
    if not own_webapp_url(dict(os.environ), dotenv):
        tunnel = open_tunnel(which, popen, sleep, tunnel_log)
        if tunnel is not None:
            say(f"the meeting-place map is at {tunnel[1]}")
            env = {**os.environ, "FXBOT_WEBAPP_URL": tunnel[1], "FXBOT_WEB_HOST": "127.0.0.1"}
    processes = Processes(roles, popen, env)
    first = look(run)
    running = first.commit
    say(f"starting {', '.join(roles)} at {running[:7]} ({first.branch}); Ctrl+C stops them")
    processes.start()
    before: Checkout | None = None
    try:
        while True:
            sleep(args.every)
            for role, code in processes.exited():
                say(f"{role} exited with code {code}; it starts again with the next change")
            try:
                now = look(run)
            except subprocess.CalledProcessError:  # git busy (a lock mid-pull): look again
                before = None
                continue
            if due(now, before, running):
                say(f"{FOLLOWED} {running[:7]} → {now.commit[:7]}: restarting")
                processes.stop()
                prepare(run)
                running = now.commit
                processes.start()
            before = now
    except KeyboardInterrupt:
        say("stopping")
        processes.stop()
        if tunnel is not None and tunnel[0].poll() is None:
            tunnel[0].terminate()


if __name__ == "__main__":
    main()
