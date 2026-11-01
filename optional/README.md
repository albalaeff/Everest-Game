# Optional pieces

Reference copies from [bateks/PersonalExchangeBot](https://github.com/bateks/PersonalExchangeBot), to adapt into a project that needs them, or to delete. They aren't linted, type-checked or tested here (`pyproject.toml` excludes this folder), and they import that project's own modules (`fxbot.…`), so each is a starting point, not a drop-in. `scripts/instantiate.py --no-bot` deletes `telegram-bot/`.

## telegram-bot/

For a Telegram bot on aiogram, with screens users name by ID:

- **`screen_ids.py`**: every screen of the bot has an ID such as `ST-1` or `DL-9`, and people name screens by them ("DL-9: make the warning shorter"). This module is their one list, a tree of screens with their names, texts and buttons, which the tests hold to the code and the docs. Adapt the tree; keep the idea: one list, IDs in every conversation about the UI.
- **`bot.md`**: the conventions of the bot layer: handlers, screens and their IDs, buttons, conversations, the preview a UI issue starts with, and what to run after changing an English text.
- **`texts.md`**: the conventions of what users read: Fluent message files per language, the same messages and variables in every locale, plural forms, no gendered speech, and the tests that hold it all together.
- **`run_dev.py`**: a dev runner that starts the bot and the worker from the checkout, restarts them when a change lands on `develop` (the watcher pulls it), runs the migrations first, and opens a Cloudflare tunnel for a Mini App that needs public HTTPS.
- **`build_screen_map.py`**: an HTML map of every screen and its transitions, built from `screen_ids.py`, for the docs.

How they fit the workflow: a UI issue's first comment is a preview (CLAUDE.md → Working from GitHub issues, step 1) that names screens by ID; a change to an English text goes with the other languages' in the same PR, and the dev runner picks the merge up on both developers' machines within ten minutes.
