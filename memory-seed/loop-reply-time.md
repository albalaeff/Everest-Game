---
name: loop-reply-time
description: "Status replies (after a watcher wake-up or a status check) quote the time of the check, e.g. \"Nothing to do (06:47): …\""
metadata:
  type: feedback
---

Each status reply quotes the time of the check (HH:MM, from the first line of `scripts/github.py status`, `watch` or `handoffs`, which print it), e.g. "Nothing to do (06:47): #213 is still waiting for your review."

**Why:** asked on PersonalExchangeBot, 2026-10-07 ("add the time of the check into the output"): identical one-line replies couldn't be told apart.

**How to apply:** every reply after a watcher wake-up or a status check, including the "nothing to do" line. See [[concise-replies]].
