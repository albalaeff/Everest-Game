---
name: issue-hyperlinks
description: "The user wants every issue and PR named in chat shown as a hyperlink to its GitHub page, not a bare #number"
metadata:
  type: feedback
---

When a chat reply names an issue or a PR, make it a link: `[#449](https://github.com/<owner>/<repo>/issues/449)`, `[PR #454](https://github.com/<owner>/<repo>/pull/454)`. Bare `#449` is not enough. Asked on PersonalExchangeBot, 2026-10-14.

**Why:** the user reads the replies in VS Code and opens the issues from them; a bare number means searching GitHub by hand.

**How to apply:** in every reply that lists or mentions issues (the session start summary, status replies, handoffs in chat), link each one on its first mention in the reply; `issues/<n>` works for PRs too, GitHub redirects. See also [[concise-replies]] and [[loop-reply-time]].
