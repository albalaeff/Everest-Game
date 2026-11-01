---
name: review-to-issues
description: "How the user wants a review's findings turned into GitHub issues: grouped by the piece they touch, one agent per issue, effort:max, every finding kept"
metadata:
  type: feedback
---

When the user asks for a review and then for "tasks", the findings become a few issues grouped by the piece of code they touch (the loading path, the poll, the map, the pick, …), labelled `effort:max`, with every finding kept, the small ones too. Each issue is sized for one agent to finish without its conversation overflowing (agents compact at about 240K tokens): about 5–7 items, each with file:line, the evidence and the fix direction, and a closing line naming the sibling issues that touch the same files (rebase before the PR). Done this way for a Mini App review on PersonalExchangeBot, 2026-10-14 (PEB#468–PEB#471).

**Why:** "I need this to be perfect": one agent owning a whole piece makes coherent changes; many tiny issues spam the list and lose context; one huge issue overflows the agent. Facts an agent can't get itself (hashes it can't compute, measurements, a service's behaviour) go into the issue.

**How to apply:** group by piece, not by severity; keep every finding; put the specifics in the issue; cross-link siblings; label `effort:max`. See [[merge-without-asking]], [[concise-replies]].
