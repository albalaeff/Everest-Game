---
name: comment-on-pickup
description: "Comment on an issue the moment it's taken into work, before reading code; the full plan can follow"
metadata:
  type: feedback
---

When an issue is taken into work, comment on it right away ("Taking this", a first plan), before investigating the code; a fuller plan or questions can follow in a later comment. On an untaken issue, that comment is a closing handoff with **Next** Claude's (CLAUDE.md → Working from GitHub issues, step 1), or no agent starts on it.

**Why:** on PersonalExchangeBot (2026-10-06) Claude spent several minutes reading code before the plan comment, and the user said: "When you take the issue into work you must put a comment into it."

**How to apply:** the first action after `status` lists an issue "to start" is `scripts/github.py comment <n>`. See [[merge-without-asking]].
