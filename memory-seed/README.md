# A memory seed

Claude Code keeps a memory per project and per machine, in `~/.claude/projects/<slug>/memory/` (`<slug>` is the checkout's path with every non-alphanumeric character as `-`: `C:\git\myapp` → `C--git-myapp`). `MEMORY.md` there is the index, one line per file, loaded into every session; each other file is one fact, with its frontmatter.

The files here are how one developer (bateks) likes Claude to work, learned on PersonalExchangeBot, as a starting set for a new project: what a chat reply looks like, when to comment on an issue, how a review becomes issues. They're personal: the rules both developers' Claudes obey are in CLAUDE.md and the docs, not here. `scripts/instantiate.py --memory` copies them into this machine's memory folder (files already there are left alone, and the index gets the missing lines); or copy them by hand. Then delete, change or add as you like: Claude updates them as you give feedback.
