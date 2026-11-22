---
name: carryon
description: Start a session: check the machine, carry on the work where the last session left it (from its handoffs on GitHub, on any machine, whoever's Claude wrote them) and start the watcher. Runs first in every session (CLAUDE.md), and whenever your user says "carry on", "continue" or "where were we".
---

Start the session: check the machine, pick up the work where the last session left it, whatever machine it ran on and whoever's Claude it was (PEB#399), and start the watcher (PEB#342). The handoffs are on GitHub (`/handoff`); this machine's memory, if it has one, only adds the machine's own facts. Ask nothing the handoffs or GitHub already answer. A session opened soon after another one on this machine, or beside it, repeats none of its checks: the commands below say what was done here recently, or runs here still, and the session goes on from that (PEB#597). In order:

1. **The machine:** `uv run python scripts/check_setup.py --unless-recent` (no uv yet: install it first). Checked within the last 8 hours, it says when, and what wasn't there then, instead of checking again. If it reports anything missing, walk your user through docs/developer-setup.md: do what you can yourself, and ask them only for what needs a person (signing in to GitHub or to Claude Code, the trust dialog, a secret they put into a gitignored file themselves). After a fix, run it without the flag: it checks again, and that is the last check. A new developer, or one on a new workstation, gets from a fresh clone to a working checkout this way; `/setup` runs the walk-through on request. Mid-session ("carry on"), skip this.

2. **Look:** `uv run python scripts/github.py handoffs`. It fetches origin, then shows what `status` shows; for each of your open issues that needs a move (to start, a reply waiting, Claude's move, stale, or its handoff says Claude goes on), the latest handoff and what has changed since (comments, its PRs and CI, its branch on origin and here); for one that waits on someone, a person or CI, only its PRs and whose move it is (`handoffs <n>` has the rest); and what's only on this machine. While the agent manager, or another session's watcher, runs on this machine, it says so first and shows no handoff: that one takes the issues, and this session takes none: go to step 7. Read this machine's `handoff.md` too, if its memory has one: what ran here, and the machine's own facts.

3. **A session elsewhere:** if a handoff you'd carry on from came from another machine and doesn't say its session closed, ask your user whether that session is closed (once, for all such issues), and only look until they answer. Two sessions as one login would both start the same new issue and push to the same branch.

4. **Whose move it is**, issue by issue:
   - to start, or a reply waiting: as CLAUDE.md says (read the issue and all its comments first);
   - Claude's move (a closing handoff says Claude goes on, waiting on nothing, PEB#449), or in progress with Claude's move next (the handoff's **Next**): carry it on, from step 5;
   - in progress and waiting for someone (a reply, a review, CI still running): leave it;
   - marked stale (Claude's word is over 3 days old and waits on nothing, PEB#449): close it if its work is done; otherwise carry it on, or hand it off saying what it waits on.

   Where the handoff and GitHub disagree, GitHub wins (a PR merged since, a branch gone, a new reply): go by what's true now, and say what changed. For an issue without a handoff, its last comments say where it stands.

5. **Restore the issue's work before carrying it on:**
   - its branch: `git switch <branch>` (it tracks origin's), or `git pull --ff-only` if it's here already;
   - commits or changes of this machine's own on it (the "Only on this machine" lines) come from a session here: keep them; if origin has moved too, rebase onto it, and ask when they conflict;
   - a `wip:` commit on top is half-done work: go on from it; the squash merge folds it away;
   - when `main` has moved on, rebase onto `origin/main` before the PR (docs/conventions.md → Git workflow);
   - the handoff's notes are where to start, not the truth: read again the files they name.

6. **What this machine runs:**
   - **The watcher**, unless step 2 said the manager or another session's watcher runs here: `uv run python scripts/github.py watch` in the background, the Bash tool's `run_in_background` with `timeout: 7200000` (the default 30 minutes would stop it early). It runs only while the session is open, and one runs per machine (PEB#597).
     - If the agent manager, or another session's watcher, runs on this machine, the watcher ends at once and says so: don't start it again, and take no issue yourself; the manager's agents, or that session, take them (README → Agents). Two sessions as one login would both start the same new issue, on one machine as on two.
     - It looks every 2 minutes by itself (PEB#445) and ends only when something new needs doing, printing it as `status` does: act on it, then start it again. So Claude is woken only when there's something to do (PEB#314). After 110 minutes it ends anyway with "Nothing new to do (…)": start it again, every time, unasked.
     - Every ten minutes it also pulls `main` while the machine is idle (`main` checked out, nothing uncommitted, no local commits of its own), so a merge from either machine reaches what runs here within ten minutes (PEB#347). Work on a task branch is never touched; a line in its output says what it pulled, or why it couldn't. So go back to `develop` when a task is done: on a task branch, nothing is pulled.
     - Once a day it also reads Claude's API prices into `docs/claude-prices.csv` (PEB#390); when they've changed it ends with that: commit the new rows in a small `chore/…` PR.
   - **The app's dev runner**, if the project has one (README → Local development), when this machine's memory says it ran here, or your user asks.

7. **Tell your user** in a few lines: the login you act as; what you found (from which machine, and when), what you're carrying on, and what waits, and for whom; and what runs now. With the watcher: that you watch their issues and those labelled `claude:<login>` and start on them as they come, for as long as the session stays open (a locked screen is fine; sleep or a closed VS Code stops it). With the manager, or another session, watching: that it takes the issues, and this session only what they ask. When nothing is to carry on, two or three lines do. Then carry on.
