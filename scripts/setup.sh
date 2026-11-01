#!/usr/bin/env bash
# One entry point for a developer's machine (PEB#387): what the app needs, then what the
# agent manager needs. Safe to run again: each step looks before it acts. On Windows, run it
# in Git Bash, which comes with Git.
#
#     scripts/setup.sh
#
# It checks for Git and uv (which fetches Python 3.14 and the dependencies), installs the
# dependencies, turns Git's hooks on and makes .env from .env.example when there's none, runs
# the machine check (scripts/check_setup.py: Docker and the database when the project has
# one, .env, the GitHub token, Claude Code's command line and its sign-in, …) and says how to
# fix what's missing, puts the model:*, effort:* and priority:* labels on the repository, and
# ends with the command that starts the manager.
# Each developer signs in with their own accounts: nothing secret is kept in the repository.

set -u
cd "$(dirname "$0")/.."

missing=0
need() {
  if command -v "$1" >/dev/null 2>&1; then
    echo "[ok]       $1: installed"
  else
    echo "[missing]  $1: not installed"
    echo "           fix: $2"
    missing=1
  fi
}

need git "https://git-scm.com/downloads (Windows: winget install --id Git.Git)"
need uv "https://docs.astral.sh/uv/ (Windows: winget install --id astral-sh.uv)"
if [ "$missing" -ne 0 ]; then
  echo
  echo "Install what's missing, open a new terminal, and run scripts/setup.sh again."
  exit 1
fi

echo
echo "Installing the dependencies (uv sync) ..."
uv sync --quiet || exit 1
git config core.hooksPath .githooks  # pushes to develop and master are refused
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Made .env from .env.example: fill in what's blank in it."
fi

echo
uv run python scripts/check_setup.py
checked=$?

echo
uv run python scripts/agent_manager.py labels || exit 1

echo
if [ "$checked" -ne 0 ]; then
  echo "Fix what the check says is missing, then run scripts/setup.sh again."
  exit 1
fi
echo "Ready. Start the agent manager, and leave it running (Ctrl+C stops it):"
echo
echo "    uv run python scripts/agent_manager.py"
