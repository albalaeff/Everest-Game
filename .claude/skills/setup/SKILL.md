---
name: setup
description: Walk through setting up this machine, from a fresh clone to a working checkout
---

Set up this machine for Everest, as [docs/developer-setup.md](../../../docs/developer-setup.md) describes:

1. Run `uv run python scripts/check_setup.py` (no uv yet: install it first, `winget install --id astral-sh.uv` on Windows, `curl -LsSf https://astral.sh/uv/install.sh | sh` elsewhere).
2. For each missing piece, in the order listed: fix it yourself when you can (`uv sync`, `git config core.hooksPath .githooks`, Claude Code's CLI, the prices). Otherwise tell your user exactly what to do: signing in to GitHub or to Claude Code, accepting the trust dialog, choosing VS Code's interpreter; a secret they put into a gitignored file themselves, never into the chat. Run the check again after each fix.
3. When it reports everything required, start the app's dev runner if the project has one (README → Local development) and ask your user to try it.
4. Make sure the watcher is running (the carryon skill, step 6), and tell your user in a few lines what is set up, what is running and what was left optional.
5. Carry on (`/carryon`): the work handed off on another machine comes along from GitHub (PEB#399).
