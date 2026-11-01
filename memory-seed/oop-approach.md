---
name: oop-approach
description: "The user wants object-oriented code everywhere; the shared rule is docs/conventions.md → Objects"
metadata:
  type: feedback
---

The user keeps asking for OOP ("it feels like we need to remind you"; "Remember the OOP!", "OOP and stuff, always look for improvement", on PersonalExchangeBot, 2026-10-10 and 2026-10-12). The rule lives in the repo so that both developers' Claudes read it: `docs/conventions.md` → **Objects**, and Definition of done item 7.

**Why:** they want changes to be one edit in one place (a thing shown the same way everywhere is one class), and code that reads as objects with responsibilities.

**How to apply:** before writing code, check it against conventions.md → Objects; in each PR, refactor what the change touches and merge duplicates it finds. Say in the PR what was made one class. Related: [[merge-without-asking]].
