# Everest

A 2D browser game: a simulator-trainer for climbing Everest by the South route. The player completes a whole expedition in 5–7 hours and learns the decisions that save lives in real mountains: the turnaround time, the symptoms of altitude illness, the oxygen arithmetic, staying clipped in. Every number and piece of advice comes from an open source and says so; the game replaces no course, instructor or doctor, and says that too. [spec.md](spec.md) is the plan: the concept, the systems, the gameplay, co-op, the training, the real accidents, the architecture and the development plan.

## Contents

- [Architecture](#architecture)
- [Local development](#local-development)
- [Agents](#agents)
- [Tests](#tests)
- [Deployment](#deployment)
- [Repository settings](#repository-settings)

## Architecture

The game is a static TypeScript site that runs in the browser ([spec.md](spec.md) → Technical architecture): a simulation core (body, oxygen, weather, time, hazards; the same result for the same seed), agents and slope physics on it, PixiJS rendering with HTML and CSS for the interface and Web Audio for sound, and JSON content: the route, the scenarios, and the knowledge base of facts with their sources. For co-op, a room server on Cloudflare Workers runs the same core. [docs/conventions.md](docs/conventions.md) → Modules has the rules between them.

So far the game is its simulation core, in `src/simulation/` ([docs/conventions/simulation-core.md](docs/conventions/simulation-core.md)), with no page yet. Beside it the repository holds the spec, the workflow ([CLAUDE.md](CLAUDE.md), `scripts/`, `.claude/`), the docs and the knowledge base: the fact records in `content/facts/` ([docs/conventions/knowledge-base.md](docs/conventions/knowledge-base.md)).

## Local development

New here, or on a new workstation? [docs/developer-setup.md](docs/developer-setup.md) goes from a bare machine to a working checkout, with Claude Code doing most of it, and `uv run python scripts/check_setup.py` shows what's still missing.

You need Python 3.14 and [uv](https://docs.astral.sh/uv/) for the workflow's scripts, and Node 24 with its npm for the game.

```
uv sync                              # the scripts' dependencies, including the dev tools
npm install                          # the game's
```

The game has no page to open yet: `npm test` plays its simulation core (Tests below). This section says how to run the page once it's in.

## Agents

Work happens on GitHub issues ([CLAUDE.md](CLAUDE.md)). Instead of a Claude Code session in
VS Code taking each one, the **agent manager** can: it watches your issues and starts one
headless Claude Code agent per task, each in its own git worktree. An agent works as a session
would: it posts its plan or preview on the issue, stops, and your reply there starts the next
agent, which goes on to the PR, CI, the merge and the issue's closing. You talk to the agents
on the issues; there's no session to restart and no handoff to watch.

**Setting up.** On a fresh clone, in a terminal (Git Bash on Windows):

```
scripts/setup.sh
```

It checks for Git and uv, installs the dependencies, runs the machine check
(`scripts/check_setup.py`, which includes Claude Code's command line and its sign-in), puts
the `model:*`, `effort:*` and `priority:*` labels on the repository, and prints the command
that starts the manager. It's safe to run again. Each developer signs in with their own accounts: Git
keeps your GitHub token, and `claude` uses the account your VS Code extension uses (`claude
auth login` if it asks). No secret goes into the repository.

Once per machine, run `claude` in the checkout, accept its trust dialog, then `/exit`. Until
you do, Claude Code ignores the allow list in `.claude/settings.json`, so each agent is
refused nearly every command. The VS Code extension doesn't record this trust, and the
machine check says when it's missing.

**Running it.** Leave it running in a terminal of its own:

```
uv run python scripts/agent_manager.py             # until Ctrl+C
uv run python scripts/agent_manager.py --dry-run   # what it would run now, running nothing
uv run python scripts/agent_manager.py --once      # what needs doing now, then ends
uv run python scripts/agent_manager.py --issue 7   # a trial: only issue 7's tasks
```

`--once` starts the agents for what needs doing now and ends once they've all stopped, instead
of watching on.

A task whose agent can't start is tried again at the watcher's next look, two minutes later,
and the manager says why once. Most often its branch is checked out in the checkout, after you
ran commands an agent asked for: `git switch develop` there, and the next try starts it.

When the account hits Claude's usage limit, an agent ends at once, having done nothing. The
manager keeps its task and starts no agent until the time the limit names, saying so once
("Usage limit: agents wait until 12:00."), or for an hour when it names none. Agents still
running go on, and the next agent on that task carries on in its worktree.

An agent in a new worktree doesn't start cold: the manager first copies the checkout's mypy
cache into it and makes its `.venv` (`uv sync --locked`), and the log's first line says so.
Without the cache, `mypy` took an agent a minute or more.

**How strong an agent is.** An issue's labels choose the agent's model and effort, in Claude
Code's own words: `model:haiku`, `model:sonnet`, `model:opus` or `model:fable`, and
`effort:high`, `effort:xhigh` or `effort:max`. With none, an agent runs on `opus` with
`xhigh` effort. With two in one family, the stronger wins. Fable is on some accounts' plans
only: when a run ends at once because the account lacks its model, the manager starts the job
again on the next model down (`opus`), runs that model's agents on it for the rest of the run,
and says so once; the issue's label stays. The defaults, how
many agents run at once (`max_parallel`, 3), where the worktrees go (`../worktrees`), the
tests' database server (`test_database_url`, for a project with one) and how often the
watcher looks at GitHub (`watch_every_seconds`, 120) are in
[agent-manager.toml](agent-manager.toml). A look that finds nothing changed costs nothing
against GitHub's rate limit: it only asks whether each answer changed.

**Which goes first.** A PR whose CI is green has a lane of its own beside the
`max_parallel` agents, one merge at a time ("at most 3 agents and a merge"), so a merge never
waits behind code work. The rest start in turn: by the issue's `priority:high`,
`priority:medium` or `priority:low` (none is medium), then mid-work (Claude has spoken on it,
or an agent left its worktree) before new, then first come first served. A label changed while
a task waits counts at the next look; a running agent is never stopped for a higher one.

**What an issue builds on.** An issue with a `Depends on #16` line or an `after:16` label is
blocked while #16 is open: no agent starts on it or its PR, and the console says what it waits
on. When #16 closes, the next look wakes it, and its agent merges `develop` in first
(docs/workflow.md → What an issue builds on).

**A green PR's merge.** The agent that opens a PR leaves the closing comment in its
handoff, so once CI is green the manager merges with no agent. First it checks that the PR is
open and mergeable, every CI run passed, and its description closes the issue; that neither
the issue nor the PR is postponed or waits on a person; and that the last word on them is that
handoff, with no review since. Then it does what the agent would: `title --done`, the closing
comment with the cost line (signed `_Claude Code agent manager (<login>)_`), the squash merge,
and the worktree's removal. When a check fails, an agent merges as before, and its prompt and
the console line say which check failed. `--dry-run` says which merges the manager would do
itself.

**How much it reads.** Every reply of an agent's reads its whole conversation again, so Claude
Code compacts an agent's early, and a long run costs less: at a quarter of the window, about
240K tokens, where a session's waits for about 967K (`compact_at_percent` in
agent-manager.toml). For the same reason `scripts/github.py` prints it little:
`api` answers in brief (`--full` for the whole JSON), `pr`, `merge`
and `close` say what they did in a line or a few, and `show <n> --new` prints only the
comments since Claude's last. And an agent is offered only what it can use: Claude
Code's tools for files and commands (`Agent.TOOLS` in `scripts/agent_manager.py`), the
project's settings and hooks, none of yours (`--setting-sources project,local`), and no MCP
server or web (`WebSearch`, `WebFetch`). No Skill tool, PowerShell or auto-memory either:
a skill it needs it reads as a file, such as the handoff's format in
`.claude/skills/handoff/SKILL.md`. CLAUDE.md keeps only what agents and sessions both obey;
a session's start and close are in the carryon and handoff skills, and the long form of the
rules in [docs/workflow.md](docs/workflow.md).

**What it leaves.** Each agent's run goes to `.agent-runs/<issue>.log`: its command,
everything it did, and at the end what it cost, how many tokens its first reply read (what
it's offered, before any work) and any command it was refused (those it may run unasked are
listed in `.claude/settings.json`; one it needs is added there by a person, in a PR). An
agent's comments are signed `_Claude Code agent (<login>, <model>/<effort>)_`. Its worktree
goes when it's done, unless something in it isn't on GitHub yet: then it stays, the log says
why, and the next agent on that issue goes on in it.

**Stopping it.** Ctrl+C stops it softly: the watcher stops and no agent starts, the
agents running finish their work, and the manager ends once they have. Ctrl+C again stops
them too; their worktrees stay as they are. Esc meanwhile cancels the soft stop, for a
Ctrl+C pressed by mistake: the watcher starts again, and what waited is taken again at its
first look. Esc needs a terminal: in a pipe or a service the soft stop can't be cancelled.
While the manager runs, a Claude Code session in VS Code doesn't watch or take issues (its
watcher ends, saying so), so the two never start the same issue; it watches again once the
manager is stopped. A second session beside one that watches takes none either: one watcher
runs per machine. To move to another machine, stop the manager here first.

## Tests

```
uv run pytest                 # everything, in parallel
uv run pytest -m unit         # only the pure tests
uv run pytest tests/x.py      # files or tests named: in one process, as with -n 0
uv run ruff check && uv run ruff format --check && uv run mypy scripts
npm run typecheck             # the game's types, and the simulation core alone: no DOM, no Node
npm test                      # the game's tests, with Vitest
```

- **In parallel.** A run of the suite, or of a folder of it, goes to pytest-xdist workers:
  two, and more while there are cores and memory for them, at about half a GiB each
  (`tests/parallel.py`). So tests run in any order, at once: none may rely on another's
  leftovers or write outside its `tmp_path`. A worker takes seconds to start, so a run
  naming files or tests stays in one process.
- **The knowledge base** is checked with the tests: `uv run pytest` fails on a record in
  `content/facts/` without a source or a check date, and `uv run python scripts/check_facts.py`
  lists every problem by file and record
  ([docs/conventions/knowledge-base.md](docs/conventions/knowledge-base.md)).
- **The game's checks** are `npm run typecheck` and `npm test`, which CI runs beside these;
  its lint and Playwright for the page join them with #16.
- **The `db` test.** The agent manager's one `db` test, for a project whose agents get test
  databases of their own, is skipped without `TEST_DATABASE_URL`.

How to write code and tests here, and the definition of done, are in
[docs/conventions.md](docs/conventions.md). Every change goes through a pull request into
`develop`, and CI runs all of the above.

CI also scans for what mustn't be in the repository:

- **Secrets.** Every PR and every push to `develop` and `master` runs gitleaks over the
  branch's whole history, a PR's with `develop`'s (the job `secrets` in `ci.yml`), and prints
  what it finds redacted. Not every branch's, so a finding on one branch fails only
  that branch's PR. `.gitleaksignore` lists the findings that aren't secrets, by fingerprint.
  By hand, every branch: `gitleaks git --log-opts=--all`.
- **Vulnerable dependencies.** `audit.yml` runs pip-audit over `uv.lock`'s packages every
  Monday and on a PR that changes `uv.lock`. A vulnerability found on a Monday
  isn't a PR's fault, so no PR needs this check: GitHub mails a failed scheduled run to
  whoever last changed its schedule. Actions → Dependency audit → Run workflow runs it now.

### When CI fails

One failure isn't the change's:

- **Actions billing.** When every run on every branch fails within seconds, its jobs never
  given a runner, it's the account's billing: the run's page on GitHub says "recent account
  payments have failed or your spending limit needs to be increased". Only the repository's
  owner can fix it, in GitHub's billing settings; once they have, an empty commit starts CI
  again.

## Deployment

The game is a static site, to be published free on GitHub Pages or itch.io, with a small room server on Cloudflare for co-op ([spec.md](spec.md) → Technical architecture). The release flow is in place already: a release is a PR from a `release/<date>-NN` branch into `master`, cut by `scripts/github.py release` or the label `release` on an issue. Once its checks pass, CI runs the deploy step of `.github/workflows/release-tool.yml`, which is a stub until the game has a build to publish: it says so on the PR and passes. Merging the PR confirms the release, closing it rolls back: the same workflow's `confirm` and `rollback`. [docs/production.md](docs/production.md) is where the hosting, the pipeline and its secrets get written down.

## Repository settings

Set once on GitHub, by the owner:

- **Default branch `develop`**, so a merged PR's `Closes #n` closes the issue and the scripts' `status` reads the right thing. Push `develop` and `master` first.
- **Rulesets:** "develop and master": both change only through a PR with the `checks` job green, by squash or merge commit, no force pushes or deletions. "master: deployed": `master` also wants `deploy / release-tool` green, so a release is merged only once it's live (add the check once it has run on the first release PR).
- **Labels:** `scripts/setup.sh` makes `model:*`, `effort:*` and `priority:*`; `claude:<login>` for each developer (hand an issue to their Claude); `postponed`; `release`. The `waiting:<login>` labels are made by the scripts.
- **Secrets** (Settings → Secrets and variables → Actions): `RELEASE_TOKEN`, a person's fine-grained token with read and write access to Contents, Issues and Pull requests, for `release-cut.yml` (a PR opened with Actions' own token starts no CI); the deploy's own once the stub in `release-tool.yml` is filled in.
- **Each clone:** `git config core.hooksPath .githooks` refuses pushes to `develop` and `master` before GitHub does (`scripts/setup.sh` does it).
