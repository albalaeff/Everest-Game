# The workflow, in full

[CLAUDE.md](../CLAUDE.md) says what Claude does on every turn, in brief, because every reply of every agent reads it again. This file is the long form: the same rules with their reasons, the details a step needs when it comes, and the traps that cost a day once. `PEB#n` is an issue of [bateks/PersonalExchangeBot](https://github.com/bateks/PersonalExchangeBot), where the rule was learned; [lessons.md](lessons.md) lists them.

## What `status` shows

`scripts/github.py status` sorts every open issue and PR of the repository:

- **to start**: yours, no comment from Claude yet;
- **a reply waiting**: someone wrote after Claude's last comment;
- **Claude's move**: Claude's last comment is a closing handoff that says Claude goes on (**Next** is Claude's, **Waiting on** is nothing, and the session that wrote it closed, PEB#449);
- **unblocked**: in progress, and what it builds on has closed since Claude's last word (#107, below);
- **in progress**: Claude's comment is the last: it waits for a person, a review or CI;
- **blocked**: what it builds on is open; its PRs are held with it, CI's result included (#107, below);
- **stale**: in progress, Claude's last word over 3 days old and waiting on nothing (PEB#449): close it if its work is done, else carry it on or hand it off saying what it waits on;
- **others'**: a teammate's: leave alone;
- **releases**: a release PR into `master`: a person's to merge or close, never Claude's (PEB#510).

The first four need doing. Issues labelled `postponed` are left out (PEB#309), and so are those labelled `release`, which cut a release (PEB#517); their PRs go with them, CI's result included, until the label goes (PEB#540). Yours are the issues you opened and those labelled `claude:<your login>` (PEB#222): either developer can put that label on an issue of theirs or the other's, and the other's session lists it "to start", its plan comment saying it was handed over.

Every look the watcher takes asks GitHub only whether each answer changed (an ETag), which costs nothing against the rate limit, so it looks every two minutes (PEB#445). It ends only when something new needs doing, printing it as `status` does, so Claude is woken only then (PEB#314); after 110 minutes it ends anyway. Every ten minutes it also pulls `develop` while the machine is idle (`develop` checked out, nothing uncommitted), so a merge from either machine reaches what runs here (PEB#347). Once a day it reads Claude's API prices into `docs/claude-prices.csv` (PEB#390); when they've changed it ends with that, and the new rows go in a small `chore/…` PR.

## Working from GitHub issues

### Whose issue it is, and whose Claude is talking

Two people work on a repository, each with their own Claude, and each Claude posts under its user's account. So:

- an issue belongs to whoever opened it, unless a `claude:<login>` label hands it over (PEB#222); a session works only on the issues of the account its token belongs to, and leaves a teammate's alone, even untouched, unless its user asks for a takeover, said on the issue first;
- everything Claude writes starts with `_Claude Code (<login>)_` on a line of its own (PEB#226, PEB#298): that is how people see whose Claude is talking, and how `status` tells Claude's comments from its user's. An agent's comments are signed `_Claude Code agent (<login>, <model>/<effort>)_`, and the manager's own merges `_Claude Code agent manager (<login>)_` (PEB#387, PEB#550). The `comment` and `pr open` commands add the line; an issue body, or a PR description changed through `api`, gets it written by hand;
- an issue that waits for a person carries `waiting:<login>` (PEB#449): the `comment` command puts it on when a handoff's **Waiting on** names that login, and their reply takes it off, so filtering the issues by `waiting:<login>` lists what waits for them. Never add or remove these labels by hand.

### How Claude writes

**Short** (PEB#419). Comments, issues and PR descriptions say each thing once. No preamble ("Here's the preview, as I understood the issue"), no announcing what follows ("answer the three questions at the end"), and nothing the handoff's **Next** already says ("I'll start the code once you confirm"). A preview is the mockup and numbered questions, nothing around them.

**The essence first** (PEB#458). Everything Claude writes for a person opens with its essence: two to four lines, in plain words, that say what this is, why it matters, and what the reader should do or decide. Someone who reads nothing else has the point. The detail follows, in bullets. This holds for an issue, a PR description, a comment, a preview and a reply in chat, an agent's as much as a session's, on any model. The check before posting: cover everything but the first lines; if the reader still knows what it's about and what's asked of them, it's right.

### The steps

1. **The first comment, when starting: the plan**, in a few lines. Comment the moment the issue is taken, before reading code: a fuller plan or questions can follow. If the issue changes what users see (screens, texts, buttons), that first comment is a **preview** instead: a mockup of the screens as you understood them, the texts and the `[buttons]`, so the user can check it before any code (PEB#246). Replies to later comments need no new preview unless one is asked for. If the issue is unclear, ask in that comment and wait for the answer before writing code. An answer given in chat goes on the issue too, as a comment, so the decisions stay with it.

   On an issue nobody has started on yet, a plain comment of Claude's makes the issue "in progress" for `status`, so no agent starts on it (PEB#575: two decision comments left an issue untouched for a night). So that comment is a handoff posted with `--handoff --closing`, ending **Next:** … (Claude's) and **Waiting on:** nothing; after posting, `status` shows the issue "to start" or "Claude's move".

   With the first comment, put an estimate of what the whole issue will cost in front of its title, in dollars at the API's prices: `scripts/github.py title <n> --estimate 40` makes it `[~$40] …` (PEB#390). The whole issue: reading, plan, code, tests, CI, replies to review; not the issues it waits on. One significant figure (~$5, ~$40, ~$300): precision would be false. If the work turns out about twice as big or half as small, set it again and say why in the next milestone comment; otherwise the first estimate stays, to compare.

2. **Before every comment, read the new ones.** Read the issue's comments, not only its description, and before posting read what came since your last comment (`scripts/github.py show <n> --new` shows only those, PEB#442): a comment posted over an unread reply hides it from `status` (PEB#208). `scripts/github.py comment` refuses while such a reply is there, and shows it: answer it in the comment you post, and pass `--read` with it.

3. **The work**, as [conventions.md](conventions.md) says: a `feature/<issue>-<short-description>` branch from the latest `develop`, tests first, then the PR into `develop`: `scripts/github.py pr open <file>` with `title`, `head`, `base` (`develop`) and a `body` that is `.github/pull_request_template.md` filled in, with `Closes #<issue>` (`pr open` puts the signature line first). Not a draft: a draft PR can't be merged, and marking it ready needs GraphQL.

   Only a `Closes #n` meant to close the issue goes in a PR body. A chore PR that says "closes #n's loose end" becomes n's PR for the scripts and for GitHub: the manager starts an agent on the closed issue when CI finishes, and GitHub would close the issue at the merge. Name an issue as "after #n" or "from #n" instead.

4. **Milestone comments, not one per commit:** the plan (step 1), the PR opened, CI's result, and the closing comment (step 5). Each is a handoff: post it with `scripts/github.py comment <n> <file> --handoff`, ending with **Next**, **Waiting on** and the folded "For the next session" block, in the format of the handoff skill. A session on any machine then carries on from the latest one (PEB#399). The one that leaves CI as the only wait (the PR opened, a fix pushed) names the merge as **Next**, and ends its folded block with the closing comment step 5 posts (what changed, what to check by hand; not the cost), between `<!-- closing -->` and `<!-- /closing -->`: once CI is green, the agent manager posts it and merges, with no agent (PEB#550: 14 of 16 green-CI runs were an agent doing just that, for $0.35 each).

5. **When CI is green, merge**, in this order, because `develop` is the default branch (PEB#55) and GitHub closes the issue at the merge of a PR that says `Closes #<issue>`:
   1. `scripts/github.py title <n> --done` puts what the work cost in front of the estimate (`[$62] [~$40] …`): Claude Code's logs on this machine plus what the other machines' handoffs recorded (`scripts/github.py cost <n>` shows the same, with the PRs').
   2. The closing comment: what changed, anything to check by hand, and what it cost.
   3. The squash merge: `scripts/github.py merge <pr>`, one commit titled after the PR, with its description as the body. Never merge into `master`: a release happens only when the user asks for one. `scripts/github.py release` then cuts its branch and opens its PR into `master` (the label `release` on an issue does the same from GitHub, PEB#517); CI puts it live on trial, and merging or closing it is the user's call ([production.md](production.md) → A release). `merge` refuses any base but `develop`.
   4. GitHub deletes the PR's branch by itself (deleting it again answers 422): delete only the local one: `git switch develop`, `git pull --ff-only`, `git branch -D <branch>`.
   5. A PR that closes no issue leaves the issue open: after the closing comment, close it with `scripts/github.py close <n>`.

### What an issue builds on

An issue whose work builds on another's says so, and nobody starts it before that one merges (#107: #18 built on #16 and #17 with nothing to hold it, so its PR carried their commits and couldn't merge, and nothing woke its agent when they merged):

- **Declare it** with a line of the issue's body that starts `Depends on #16` (several: `Depends on #16, #17`), or a label `after:16`. A line that only mentions the words, in a sentence, doesn't count. Either developer, or Claude writing the issue up, adds it; a label works on an issue already started.
- **While #16 is open** the issue is **blocked**: `status` lists it so (`[waits on #16]`), the agent manager starts no agent on it or its PRs, and its log says `Issue #18 is blocked: it waits on #16, …` once, and again when it's newly so. A chain holds by itself: #18 waits on #17, which waits on #16.
- **When #16 closes** (its PR merged), the next look wakes the issue, with no person's word: one never started is to start, and its branch comes from `develop`; one in progress since before the merge is **unblocked**, Claude's move. Its agent's prompt names what merged, and the agent begins by merging `origin/develop` into the branch ([conventions.md](conventions.md) → Git workflow); the squash folds the merge away. What closed before Claude's last word wakes nothing.

### The scripts' answers

`scripts/github.py` prints little on purpose (PEB#442): an agent reads every character again on each later reply. `api` answers in brief (an issue or PR as a headline, its link and labels; `--full` for the whole JSON, 22K characters for a PR), `pr`, `merge` and `close` say what they did in a line or a few, and `show <n> --new` prints only the comments since Claude's last. So:

- a `POST` or `PATCH` that prints nothing through a filter for JSON keys has still gone through: read the command's raw output, and before repeating any POST list the latest issues (`api GET "issues?state=open&per_page=5&sort=created&direction=desc"`). A duplicate is closed with `api PATCH issues/<n>` and `{"state": "closed", "state_reason": "not_planned", "labels": ["duplicate"], "title": "Duplicate of #<m>"}`: dropping the `model:`/`effort:`/`priority:` labels stops the manager;
- a script that posts several issues at once is the kind of batch an automatic permission mode refuses: one issue per call, each from a JSON file.

### A review's findings as issues

When a review of a piece of code is asked for and then "tasks": the findings become a few issues grouped by the piece they touch (the loading path, the poll, the map), not by severity, with every finding kept, the small ones too. Each issue is sized for one agent to finish without its conversation overflowing (agents compact at about 240K tokens): about 5 to 7 items, each with file:line, the evidence and the fix direction, the facts an agent can't get itself (measurements, hashes, a service's behaviour), and a closing line naming the sibling issues that touch the same files (rebase before the PR). Label them `effort:max` (PEB#468 to PEB#471).

## How agents work here

The agent manager (`uv run python scripts/agent_manager.py`, PEB#387) gives each task its watcher finds to an **agent**: headless Claude Code in a worktree of its own, `<worktree_dir>/<issue>`, on the issue's branch. How it picks an agent's power (the `model:*` and `effort:*` labels), its turn (`priority:*`, PEB#485) and the green PRs it merges itself (PEB#550), what an agent is offered (PEB#443) and what its run leaves: README → Agents.

- **An agent** skips "Sessions" (no machine check, no watcher) and works on its issue only. It reads the issue and all of its comments with `scripts/github.py show <n>` (not `api GET issues/<n>`, which says only its title, link and labels), and before each comment only those since its last with `show <n> --new`, carries on from `scripts/github.py handoffs <n>` (its issue's alone: its PRs, CI and branch, and what of it is only on this machine), takes the next step of "Working from GitHub issues", and stops when the next move is someone else's: an answer, a review, CI. Its last comment then is a handoff posted with `--handoff --closing`, and that comment is its whole handoff: an agent has no Claude memory, which is its sessions' notes on the machine (PEB#551). The reply, the review or CI's result starts the next agent, which carries on from that comment. Nobody answers a dialog or a permission prompt: questions go on the issue. An agent writes the files it comments from in `.agent-runs/` of its worktree (gitignored), and its tests use databases of their own (`TEST_DATABASE_URL`, `<name>_<issue>_test`, and each pytest-xdist worker's beside it) when the project has a database, so they run beside other agents' tests.
- **An agent's conversation** is compacted at a quarter of the window, about 240K tokens (PEB#441); after that the agent carries on from the summary, `show <n>` and `handoffs <n>`.
- **An agent's commands** run unasked only when every part of them is allowed, so an agent runs one command per call in Bash: no `;` or `&&` chains, no `> file` redirects. It filters output through Bash's read-only commands (`grep`, `head`, `wc`: built into Claude Code; `ls`, `cat`, `tail`, `sed -n` and git's and docker's reads: the allow list in `.claude/settings.json`, PEB#545). A background task, such as the full `pytest`, wakes it when it ends, so it doesn't wait with `Monitor`. It tries an idea as a test, not with `python -c` or a script of its own: those stay refused, because they'd run any code (PEB#411).
- **What an agent needs of a person** goes on the issue (PEB#415). Commands it asks someone to run on the issue's branch end with `git switch develop`: a branch is checked out in one place at a time, so a checkout left on it keeps the manager from making the next agent's worktree (the manager then tries again every two minutes, and says what's in the way, PEB#409). An agent never changes `.claude/settings.json`, which Claude Code refuses anyway: for a command it needs and isn't allowed, it asks on the issue, giving the exact rules to add, `Bash(…)` and `PowerShell(…)`, and its user adds them. The rules reach an agent through its worktree's `.claude/settings.json`, on the issue's branch: the next agent merges `origin/develop` into the branch first, and Claude Code reads the merged file at once (#17). Claude Code refuses an agent anything else under `.claude/` too, the skills included: a change there goes on the issue as a diff, for its user or a session of theirs to commit on the branch (PEB#449).
- **A session beside the manager** takes no issue (PEB#597), and doesn't touch a branch an agent's worktree has checked out: `git switch` to it fails ("already checked out at …/worktrees/<n>"); work in that worktree, or leave it to the agent. While the manager runs, its watcher pulls `develop` into the checkout every ten minutes: make the task branch before reading line numbers or editing.

## Compacting

When the conversation is compacted (by `/compact`, or by itself when it gets long), the summary keeps:
- the issue, branch and PR being worked on, the step reached and the next step, and the link to its latest handoff;
- decisions and answers from the chat that aren't on GitHub yet;
- questions waiting for an answer, and where they were asked;
- the background processes, with the exact command of each (the watcher, a dev runner): they end with the session;
- what's been learned about the machine (what's installed, what fails and how it was got round).

It can drop: tool output that's been acted on, files that were read (read them again), and anything git, GitHub, CLAUDE.md or the docs already record.

## Costs

Each issue's title shows what its work was expected to cost and, once done, what it cost (PEB#390): `[~$40]` from the first comment, `[$62] [~$40]` once merged. `scripts/github.py cost <n>` prices every reply of Claude's that named the issue (a command on it, its branch) from Claude Code's own session logs on this machine, at the prices in `docs/claude-prices.csv` on the reply's day, plus what the other machines' handoffs recorded; the watcher keeps the prices current. An agent's startup is about 14K tokens a reply with a lean CLAUDE.md, and was 25K before the cuts (PEB#551, PEB#552): CLAUDE.md keeps what agents and sessions both obey on every turn, and the rest lives here and in the skills, read when needed.
