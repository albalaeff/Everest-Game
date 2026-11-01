---
name: handoff
description: Hand the work off so that the next session carries on without asking anything, on this machine or any other, whoever's Claude it is. Run it before /compact or closing a session, when the Stop hook asks for it (PEB#349), and when your user says they're stopping or moving to another machine.
---

Hand off this session's work (PEB#399). The next session may be this one after compaction, a new one on this machine, one on another machine, or the other developer's Claude after a `claude:<login>` hand-over. Claude Code's memory stays on the machine that wrote it, so the work goes to GitHub, and only this machine's own facts stay in memory. Follow CLAUDE.md.

**When** (PEB#349): nobody needs to type `/compact` or `/handoff`. Claude Code compacts the conversation by itself when it fills the auto-compact window (about 967K tokens, or what `/autocompact` sets; a share of it with `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`), and before that the Stop hook (`scripts/handoff_due.py`, set in `.claude/settings.json`) asks for the handoff once the conversation passes 80% of where it compacts: run this then, unasked. Closing VS Code gives no warning, so the milestone comments carry the handoff (CLAUDE.md → Working from GitHub issues, step 4): a closed session then loses little. Before moving to another machine, close the session here: two sessions as one login would both start the same new issue.

In order:

1. **See where things stand:** `uv run python scripts/github.py handoffs`. It shows your open issues with their latest handoffs, PRs, CI and branches, and what's only on this machine.

2. **Leave nothing that matters only here.** For each line under "Only on this machine":
   - finished work: commit it on its task branch and push;
   - unfinished work: commit it as `wip: <what's half done>` on its task branch and push. If the issue has no branch yet, create it (docs/conventions.md → Git workflow). Never commit to `develop` or `master`. With a PR open, CI runs on the WIP; nothing merges before the work is done and green anyway;
   - a stash: apply it on its branch and commit it as WIP, or drop it if it's stale;
   - a branch never pushed: push it, or delete it if it's dead.

   Whatever has to stay (a secret, a database only this machine has), the handoff names, and says why.

3. **A handoff on each issue whose state isn't on GitHub yet:** the one in progress, and any where this session learned what the next one needs (a code map, a decision from the chat). Write it in the issue's language, as below, and post it with `uv run python scripts/github.py comment <n> <file> --handoff`, adding `--closing` when this session is about to close. The script signs it and adds a mark people don't see: this machine, the time, what the issue's work has cost here (so `title --done` counts every machine), and whether the session was closing. A milestone comment (plan, PR opened, CI result, merged) is the handoff when it ends with these parts, so it needs no second one.

   ```markdown
   <what happened, for people: a few lines>

   **Next:** <the next step> (<whose move: Claude's, <login>'s, CI's>). **Waiting on:** <what, and where it was asked>, or nothing.

   <details><summary>For the next session</summary>

   - Branch: `feature/<n>-…` at <short sha>: <ready for a PR / `wip:` what's half done> (or: no branch yet)
   - PR: #<pr>, CI <result> (or: none yet)
   - Decisions from the chat: …
   - Notes: what this session worked out that the next would otherwise redo: files, functions, line numbers
   - Traps: what went wrong and how it was got round, until it's in the docs

   </details>
   ```

   On a Russian or Ukrainian issue the two fields are in its language, and the scripts read them as the English (PEB#593): `**Дальше:** <шаг> (ход Claude). **Ждём:** <что и где>, или ничего.`, `**Далі:** <крок> (хід Claude). **Чекаємо:** <що й де>, або нічого.` Whose move is `ход` or `хід` and one name (ход bateks, ход CI); a **Next** that's the merge says «слить» or «злити».

   Name a person in **Waiting on** by their login (bateks's answer, albalaeff's review): the command puts `waiting:<login>` on the issue, so they find what waits for them, and their reply takes it off; nothing, CI or Claude's move takes these labels off (PEB#449). With `--closing`, a **Next** that's Claude's and nothing waited on make the issue "Claude's move": the next session, or the agent manager's next agent, starts on it.

   The command refuses while a reply waits unread (PEB#208): act on the reply first, or leave that issue alone; `status` shows the reply anyway.

4. **The rest, where it belongs:**
   - a rule or decision for both Claudes, a trap any machine would fall into, a quirk of an OS: a small `chore/…` PR to CLAUDE.md, docs/workflow.md, docs/conventions.md (or one of its areas) or docs/developer-setup.md, at the next idle point; until then, the handoff's Traps carry it;
   - something about another issue: a comment there, or a new issue;
   - how your user likes Claude to work, and facts about this machine only: this machine's memory (step 5). They stay per machine.

5. **This machine's memory:** `handoff.md` (type `project`), replacing the last one, with its line in `MEMORY.md`:
   - when, and as whom (the GitHub login);
   - the links to the handoffs just posted;
   - what runs on this machine, with the exact command of each: not the watcher, which `/carryon` starts; the app's dev runner only if it ran here;
   - this machine's facts: what's installed where, what fails here and how it's got round, when a token expires.

   Nothing that GitHub or the docs already record.

6. **Reply** in five lines or fewer: which issues got a handoff, that nothing is left only on this machine (or what is, and why), and how to go on: a new session on any machine carries on by itself (`/carryon`). When the Stop hook asked for the handoff, there's nothing to type: say it's saved, and go on with what you were doing.
