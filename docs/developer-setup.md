# Developer setup

From a bare machine to a working checkout, whether you're new to the project or moving to a
new workstation. You need three things yourself; Claude does the rest with you.

1. **VS Code** with Anthropic's **Claude Code** extension, signed in.
2. **The repository**: in VS Code, *Clone Git Repository* → this repository's URL. The
   repository is public: the clone asks for nothing.
3. **Claude**: open the Claude Code panel in the cloned folder and say hello. Its first check
   asks Git for a GitHub token, and Git Credential Manager opens GitHub's window: sign in
   there, or paste a classic token with the `repo` scope; the scripts keep what the window
   took, as a `git push` would. `gh auth login`, or `GITHUB_TOKEN`, is found first and asks
   nothing. Claude uses the token to work with issues as you.

Claude starts every session by checking the machine (the carryon skill, `/carryon`), unless
a session checked it within the last 8 hours (PEB#597). When something is missing, it says
what, does what it can itself, and asks you only for what needs a person. Type `/setup` to
run the whole walk-through again at any time.

## What Claude checks

`uv run python scripts/check_setup.py` prints one line per piece and the fix for each
missing one, and never prints a secret. Without uv yet, Claude installs it first.

| Piece | Why | Who fixes it |
|---|---|---|
| uv and Python 3.14 | runs the workflow's scripts; `uv sync` fetches Python and the dependencies | Claude: `winget install --id astral-sh.uv`, `uv sync` |
| Node 24 | runs the game's type check and tests; `npm install` fetches their tools | Claude: `winget install --id OpenJS.NodeJS.LTS`, then a new terminal and `npm install` |
| Git hooks | refuse pushes to `develop` and `master` from your clone | Claude: `git config core.hooksPath .githooks` |
| GitHub | a token for the scripts (`GITHUB_TOKEN`, else `gh auth token`, else the one Git stores for github.com), and push access to the repository | **You**: sign in when asked; the owner adds new collaborators. A fine-grained token of yours can't write to a repository another person owns (403 on a push, an issue or a label, though the check says you can push): sign in through GitHub's window instead, or use a classic token with the `repo` scope |
| Claude's prices | `docs/claude-prices.csv`, which prices Claude's work on each issue (PEB#390); in the repo, kept current by the watcher | Claude: `uv run python scripts/claude_prices.py refresh` |
| Claude Code CLI | `claude`, which the agent manager runs each agent with (PEB#387); signed in with your own account, the one the extension uses | Claude: Anthropic's installer (`irm https://claude.ai/install.ps1 \| iex` in PowerShell, `curl -fsSL https://claude.ai/install.sh \| bash` elsewhere); **you** sign in if `claude auth login` asks |
| Claude Code trust | the checkout trusted, so the agents get the allow list in `.claude/settings.json`; the extension doesn't record it | **You**: run `claude` in the checkout once, accept the trust dialog, then `/exit` |
| Claude's Bash scratchpad | `$CLAUDE_SCRATCHPAD` in Claude's Bash commands, the folder Claude Code's prompt names for scratch files: Claude Code exports no variable, and a guessed one put a file in Git's folder (PEB#530) | Claude puts the snippet below in `~/.bashrc`; **you** add `"env": {"BASH_ENV": "C:/Users/<you>/.bashrc"}` to `~/.claude/settings.json` (Claude may not change its own settings), then start a new session |
| VS Code's Python | `.venv` as VS Code's interpreter: with uv's own Python chosen, every `uv` call warns that `VIRTUAL_ENV` doesn't match `.venv`, and `python` is the Microsoft Store's stub; checked only inside VS Code | **You**: *Python: Select Interpreter* → `.venv\Scripts\python.exe`, then *Developer: Reload Window* |
| poppler (optional) | `pdftoppm`, which Claude's Read needs for a PDF | Claude: `winget install --id oschwartz10612.Poppler`; if `pdftoppm` still isn't found in a new terminal, its `Library\bin` goes on the user PATH |

The project's own pieces (a token the game's tooling needs, once there is one) are added to
`PROJECT_CHECKS` in `scripts/check_setup.py`, and to this table; an `.env` is checked by
itself once the project has an `.env.example` to copy it from.

Claude's Bash tool runs `bash -c`, which reads no profile but the file `BASH_ENV` names. This
snippet, for Git Bash, exports the scratchpad's path, the same one Claude Code's prompt names:

```bash
# Claude Code's scratchpad, which its prompt names but no variable does (PEB#530)
if [ -n "${CLAUDE_CODE_SESSION_ID:-}" ]; then
  _cwd=$(pwd -W)  # C:/git/Everest-Game: the slug is C--git-Everest-Game
  export CLAUDE_SCRATCHPAD="$(cygpath -m "$TEMP")/claude/${_cwd//[^[:alnum:]]/-}/$CLAUDE_CODE_SESSION_ID/scratchpad"
  unset _cwd
fi
```

## Secrets of your own

The project's only secrets so far are the room server's deploy token and account ID, which
live in the repository's Actions secrets ([production.md](production.md) → The hosting): no
developer needs them on a machine. When a secret does belong on your machine, it goes into a
gitignored file there, which you fill in yourself: don't paste it into the chat, and it never
goes into commits, issues or PRs. Each developer uses their own (a sandbox account, a test
key), never production's.

## Running it

The game has no page to open yet: `npm install`, then `npm test`, plays its simulation core.
README → Local development will say how to start the page once it's in.

## What Claude keeps running

At the start of every session, after the check, Claude reads `scripts/github.py status`,
acts on it, and starts `scripts/github.py watch` in the background. It watches as the
account whose token it found, so it sees your issues and those labelled
`claude:<your login>`, and it starts on them as they come. It tells you this in a line or
two. The watcher is the only way Claude watches: no `/loop`, no scheduled task, no
hourly scan. It runs while the session is open, so a session left open (screen locked is
fine, not asleep) keeps working while you're away.

The watcher also keeps your `develop` up to date while Claude is idle (on `develop`, with
nothing uncommitted), so a change either developer's Claude merges reaches both machines
within about ten minutes, with nobody pulling by hand.

Once a day the watcher also reads Claude's API prices (claude.com/pricing, or the docs'
pricing page when that fails) into `docs/claude-prices.csv`; when they change, it wakes
Claude to commit the new rows in a PR. Each issue's title shows what its work is expected
to cost and, once done, what it cost on your machine, from Claude Code's own logs
(`scripts/github.py cost <issue>`, PEB#390).

## Or: the agent manager

Instead of a session taking each issue, the agent manager can (PEB#387): it starts one
headless Claude Code agent per task, each in its own worktree, and you talk to the agents on
the issues. `scripts/setup.sh` (in Git Bash on Windows) sets a machine up for it, ending with
the command that starts it; README → *Agents* covers the rest. While it runs, a session in VS
Code doesn't watch: its watcher ends, saying so.

## Carrying on from another machine

Claude's memory stays on the machine that wrote it, so the work doesn't live there (PEB#399).
At each milestone, and before a session compacts or closes (`/handoff`), Claude leaves a
handoff on each issue it works on: where it stands, the next step and whose move it is, and,
folded away, what the next session needs. Unfinished code goes to the issue's branch as a
`wip:` commit. A session on any machine starts by carrying on from those handoffs
(`/carryon`): it checks them against GitHub, checks out the branch and goes on. The same
works for the other developer's Claude after an issue is handed over with `claude:<login>`.

So to move to another machine, close the session on the old one first: two sessions as one
login would both start the same new issue. On one machine, a second session beside one that
watches takes no issue: its watcher ends, saying so, and it does only what you ask (PEB#597).
Then open the repository on the new one and say hello. What stays with each machine: how you
like Claude to work (its memory; `memory-seed/` has a starting set) and what runs there.
`scripts/github.py cost` counts every machine, from what each one's handoffs recorded.

## On Windows

What trips Claude up on Windows, whoever's machine it is:

- Git Bash heredocs turn `\n` in the text into a line break and can garble non-ASCII
  characters, and the Bash tool collapses `\\` to `\` even in a quoted heredoc: write files,
  JSON above all, with Claude's own Write and Edit tools, and use forward slashes in Windows
  paths. A command with several quoted heredocs of prose (apostrophes, backticks) can fail
  to parse: one file per command.
- Python writes CRLF unless told otherwise (`Path.write_text`): pass `newline="\n"`, since
  the repository keeps LF.
- The console's code page is cp1252, where an arrow or Cyrillic crashes a script's print:
  run one-off scripts with `PYTHONIOENCODING=utf-8` (`scripts/github.py` writes UTF-8 by
  itself, PEB#358).
- `sed` eats the backslashes of a Windows path in its replacement: use forward slashes.
- `scripts/github.py api` output piped in PowerShell gets a BOM: strip it before `json.loads`.
- Git Bash rewrites an argument that starts with `/` into a path under its own folder
  (`/user/repos` → `C:/Program Files/Git/user/repos`) before the program sees it.
  `scripts/github.py api` undoes that for a path from the API's root, so `api GET /user`
  works from the Bash tool; a script of your own needs `MSYS_NO_PATHCONV=1` in front.
- A fine-grained token can't re-run a CI job (403): push an empty commit instead.
