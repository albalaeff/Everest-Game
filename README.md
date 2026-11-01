<!-- template -->
# claude-workflow-template

A GitHub template for a repository two developers work on with their own Claude Code, from GitHub issues: sessions in VS Code that carry the work on across machines through handoffs, and headless agents that take the issues by themselves. It was taken from [bateks/PersonalExchangeBot](https://github.com/bateks/PersonalExchangeBot) after six weeks of use; [docs/lessons.md](docs/lessons.md) says what was learned where.

**What's in it:**

- [CLAUDE.md](CLAUDE.md): the rules every turn of Claude's obeys, lean; [docs/workflow.md](docs/workflow.md) is the long form, with the reasons.
- `.claude/skills/`: `/carryon` (a session's start), `/handoff` (its close), `/setup` (a new machine); `.claude/settings.json`: the allow list agents run with, and the Stop hook that asks for the handoff in time.
- `scripts/`: `github.py` (GitHub without `gh`: status, the watcher, handoffs, comments, PRs, merges, releases, costs), `agent_manager.py` (one headless agent per task), `check_setup.py` (the machine check), `claude_prices.py` and `claude_cost.py` (what the work cost), `handoff_due.py` (the Stop hook), `setup.sh` (a developer's machine), `instantiate.py` (this template into a project).
- `.github/`: CI (lint, format, types, tests, gitleaks), a dependency audit, the release cut by label, a release's deploy, confirm and rollback through a stub to fill in; the PR template.
- `docs/`: the conventions, the workflow, the developer setup, a production stub, the lessons, Claude's prices.
- `myapp/` and `tests/`: a minimal package with settings, the scripts' tests, and the test infrastructure (parallel workers).
- `memory-seed/`: Claude Code memory files for a developer's own preferences, copied into the machine's memory folder on request.
- `optional/telegram-bot/`: reference copies for a Telegram bot (screen IDs, the bot and text conventions, the dev runner, the screen map), to adapt or delete.

**To start a project from it:**

1. On GitHub, *Use this template* → a new repository (private or not). Clone it.
2. In the clone, name the project (the package, the `MYAPP_` prefix of the settings) and drop what it doesn't need:

       uv run python scripts/instantiate.py --name shopbot [--no-db] [--no-bot] [--keep-template-readme]

   It renames `myapp` → `shopbot` and `MYAPP_` → `SHOPBOT_` everywhere, removes the database pieces with `--no-db` and `optional/telegram-bot/` with `--no-bot`, strips this template section from the README, and deletes itself. Commit the result.
3. On GitHub: make `develop` the default branch (push it first), the rulesets and the secrets (Repository settings, below). `scripts/setup.sh` makes the labels.
4. Fill in CLAUDE.md's first line, README's Architecture, `docs/conventions.md`'s table of areas and `docs/production.md` as the project grows. Each developer: `scripts/setup.sh`, then open the folder in VS Code and say hello to Claude.
<!-- /template -->

# myapp

<What the app is, in a paragraph: what people do with it, what it never does, where the spec is.>

## Contents

- [Architecture](#architecture)
- [Local development](#local-development)
- [Agents](#agents)
- [Tests](#tests)
- [Deployment](#deployment)
- [Configuration](#configuration)
- [Repository settings](#repository-settings)

## Architecture

<The parts, the layers ([docs/conventions.md](docs/conventions.md) → Layers), the data, what talks to what.>

## Local development

New here, or on a new workstation? [docs/developer-setup.md](docs/developer-setup.md) goes from a bare machine to a running app, with Claude Code doing most of it, and `uv run python scripts/check_setup.py` shows what's still missing.

You need Python 3.14 and [uv](https://docs.astral.sh/uv/); Docker when the project has a database.

```
uv sync                              # dependencies, including the dev tools
cp .env.example .env                 # then fill in what's blank
docker compose up -d db              # PostgreSQL on localhost:5433, plus the myapp_test database (a project with one)
```

<How to run the app locally, each process in its own terminal.>

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

An agent in a new worktree doesn't start cold: the manager first copies the checkout's caches
into it (mypy's, and hypothesis's examples) and makes its `.venv` (`uv sync --locked`), and
the log's first line says so. Without the cache, `mypy` took an agent a minute or more.

**How strong an agent is.** An issue's labels choose the agent's model and effort, in Claude
Code's own words: `model:haiku`, `model:sonnet` or `model:opus`, and `effort:low`,
`effort:medium`, `effort:high`, `effort:xhigh` or `effort:max`. With none, an agent runs on
`opus` with `xhigh` effort. With two in one family, the stronger wins. The defaults, how
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
uv run pytest -m unit         # only the tests that need no database
uv run pytest tests/x.py      # files or tests named: in one process, as with -n 0
uv run ruff check && uv run ruff format --check && uv run mypy myapp scripts
```

- **In parallel.** A run of the suite, or of a folder of it, goes to pytest-xdist workers:
  two, and more while there are cores and memory for them, at about half a GiB each
  (`tests/parallel.py`). So tests run in any order, at once: none may rely on another's
  leftovers or write outside its `tmp_path`. A worker takes seconds to start, so a run
  naming files or tests stays in one process.
- **The test database** (a project with one). Tests use `TEST_DATABASE_URL` (default: the
  compose `myapp_test` database, whose name must end in `_test`). The suite rebuilds its
  schema on every run, and each worker runs on a database of its own beside it
  (`myapp_gw0_test`, …), made at its start and dropped at its end. The `db` mark names the
  tests that need it; the template's own `db` test is skipped without `TEST_DATABASE_URL`.

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

Two failures aren't the change's:

- **Docker Hub's 429.** CI fails while setting up ("Initialize containers") when Docker Hub
  refuses with 429, its pull rate limit. A fine-grained token can't re-run jobs, so push an
  empty commit to the branch (`git commit --allow-empty`) to start CI again.
- **Actions billing.** When every run on every branch fails within seconds, its jobs never
  given a runner, it's the account's billing: the run's page on GitHub says "recent account
  payments have failed or your spending limit needs to be increased". Only the repository's
  owner can fix it, in GitHub's billing settings; once they have, an empty commit starts CI
  again.

## Deployment

A release is a PR from a `release/<date>-NN` branch into `master`, cut by `scripts/github.py release` or the label `release` on an issue. Once its checks pass, CI runs the deploy step of `.github/workflows/release-tool.yml`, which is a stub until the project has a host: it says so on the PR and passes. Merging the PR confirms the release, closing it rolls back: the same workflow's `confirm` and `rollback`. [docs/production.md](docs/production.md) is where the host, the pipeline and its secrets get written down.

## Configuration

Every setting is read from a `MYAPP_*` environment variable or `.env` (`myapp/config.py`); `.env.example` lists them at their defaults.

| Setting | Default | What it is |
|---|---|---|
| `MYAPP_LOG_LEVEL` | `INFO` | DEBUG, INFO, WARNING, ERROR or CRITICAL |
| `MYAPP_LOG_FORMAT` | `text` | `text` (key=value lines) or `json` (one object per line) |
| `MYAPP_DATABASE_URL` | unset | the database, as a SQLAlchemy-style URL; unset for a project without one |

## Repository settings

Set once on GitHub, by the owner:

- **Default branch `develop`**, so a merged PR's `Closes #n` closes the issue and the scripts' `status` reads the right thing. Push `develop` and `master` first.
- **Rulesets:** "develop and master": both change only through a PR with the `checks` job green, by squash or merge commit, no force pushes or deletions. "master: deployed": `master` also wants `deploy / release-tool` green, so a release is merged only once it's live (add the check once it has run on the first release PR).
- **Labels:** `scripts/setup.sh` makes `model:*`, `effort:*` and `priority:*`; `claude:<login>` for each developer (hand an issue to their Claude); `postponed`; `release`. The `waiting:<login>` labels are made by the scripts.
- **Secrets** (Settings → Secrets and variables → Actions): `RELEASE_TOKEN`, a person's fine-grained token with read and write access to Contents, Issues and Pull requests, for `release-cut.yml` (a PR opened with Actions' own token starts no CI); the deploy's own once the stub in `release-tool.yml` is filled in.
- **Each clone:** `git config core.hooksPath .githooks` refuses pushes to `develop` and `master` before GitHub does (`scripts/setup.sh` does it).
