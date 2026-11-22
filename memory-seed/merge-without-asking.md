---
name: merge-without-asking
description: "The user wants issues picked up, PR'd and merged into main without asking each time; one write per call where an automatic permission mode refuses batches"
metadata:
  type: feedback
---

The user explicitly authorized merging into the integration branch without asking each time (PersonalExchangeBot, 2026-10-06, `develop` there). Since #300 that branch is `main`, the only long-lived one, and every merge into it is published, as every merge into `develop` was before.

Where an automatic permission mode runs (auto mode): a force push after a rebase is refused as destructive: merge `origin/main` into the branch instead and push normally (the squash folds the merge away). A script that posts several issues at once is refused as a batch of external writes: one issue per `scripts/github.py api POST issues <file>` call, each from a JSON file written with the Write tool. Starting `claude -p` from a session is refused: don't work around it.

**Why:** these are the user's standing decisions about what Claude does unasked, not rules of the repo.

**How to apply:** take an issue listed "to start", comment, work, open the PR, merge when green, as CLAUDE.md says, without a question in chat at each step; ask only where the issue itself is unclear, on the issue. See [[comment-on-pickup]].
