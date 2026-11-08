# Where the rules came from

This template was taken from [bateks/PersonalExchangeBot](https://github.com/bateks/PersonalExchangeBot) (fxbot, a Telegram currency-exchange board) on 2026-10-19, after six weeks of two developers and their Claudes, sessions and agents, working from GitHub issues. `PEB#n` anywhere in CLAUDE.md, the docs and the skills is that repository's issue n; the scripts' and tests' comments say the same issues as a bare `#n`. Each line below is a lesson, with the issue it was learned on. A rule the new repository learns on its own cites its own issues as `#n`.

## Sessions and handoffs

- [PEB#342](https://github.com/bateks/PersonalExchangeBot/issues/342): a session starts by checking the machine (`scripts/check_setup.py`), so a new developer, or a new workstation, gets from a bare clone to a running app with Claude walking them through.
- [PEB#399](https://github.com/bateks/PersonalExchangeBot/issues/399): Claude Code's memory stays on the machine that wrote it, so the work's state lives on GitHub, in handoff comments, and a session on any machine carries on from them (`/carryon`, `/handoff`). Unfinished code goes to the branch as a `wip:` commit.
- [PEB#349](https://github.com/bateks/PersonalExchangeBot/issues/349): a Stop hook (`scripts/handoff_due.py`) asks for the handoff once the conversation passes 80% of where Claude Code compacts it, so nobody types `/compact`.
- [PEB#314](https://github.com/bateks/PersonalExchangeBot/issues/314), [PEB#445](https://github.com/bateks/PersonalExchangeBot/issues/445): a watcher that ends only when something needs doing replaces a `/loop`: Claude is woken only then, and a look with ETags costs nothing against GitHub's rate limit, so it looks every two minutes.
- [PEB#347](https://github.com/bateks/PersonalExchangeBot/issues/347): the watcher pulls `develop` while the machine is idle, so a merge from either machine reaches every running dev instance without anyone pulling.
- [PEB#230](https://github.com/bateks/PersonalExchangeBot/issues/230): every status line quotes the time of the check, or identical replies can't be told apart.
- [PEB#449](https://github.com/bateks/PersonalExchangeBot/issues/449): **Next** and **Waiting on** in a handoff say whose move it is; `waiting:<login>` labels follow from them; a closing handoff whose move is Claude's makes the issue "Claude's move"; an issue nobody moves on for 3 days is stale.
- [PEB#593](https://github.com/bateks/PersonalExchangeBot/issues/593): a handoff in Russian or Ukrainian is read like an English one (Дальше / Ждём, Далі / Чекаємо).
- [PEB#597](https://github.com/bateks/PersonalExchangeBot/issues/597): a session opened right after, or beside, another one on the machine repeats none of its checks: the machine check is kept 8 hours, handoffs are shown in brief for what waits, one watcher runs per machine, and a second session takes no issue.
- [PEB#575](https://github.com/bateks/PersonalExchangeBot/issues/575): a plain comment of Claude's on an untaken issue makes it "in progress", so no agent starts on it: chat decisions are posted as a closing handoff with **Next** Claude's.

## Issues, comments and PRs

- [PEB#208](https://github.com/bateks/PersonalExchangeBot/issues/208): a comment posted over an unread reply hides it from `status`: `comment` refuses while a reply is unread, and shows it.
- [PEB#222](https://github.com/bateks/PersonalExchangeBot/issues/222): an issue belongs to whoever opened it; `claude:<login>` hands it to the other developer's Claude.
- [PEB#226](https://github.com/bateks/PersonalExchangeBot/issues/226), [PEB#298](https://github.com/bateks/PersonalExchangeBot/issues/298): everything Claude posts is signed with whose Claude it is, first, since it appears under its user's account.
- [PEB#246](https://github.com/bateks/PersonalExchangeBot/issues/246): a UI change starts with a preview (a mockup of the screens, texts and buttons), before any code.
- [PEB#419](https://github.com/bateks/PersonalExchangeBot/issues/419): comments, issues and PR descriptions are short: each thing once, no preamble.
- [PEB#458](https://github.com/bateks/PersonalExchangeBot/issues/458): the essence first, two to four lines, in everything written for a person.
- [PEB#390](https://github.com/bateks/PersonalExchangeBot/issues/390): an estimate in the issue's title from the first comment, the cost once done, priced from Claude Code's own logs at the day's prices (`docs/claude-prices.csv`, refreshed by the watcher).
- [PEB#442](https://github.com/bateks/PersonalExchangeBot/issues/442): the scripts print little, since an agent reads every character again on each later reply: `api` in brief, `show --new`, `pr`, `merge` and `close` in a line.
- [PEB#309](https://github.com/bateks/PersonalExchangeBot/issues/309), [PEB#540](https://github.com/bateks/PersonalExchangeBot/issues/540): a `postponed` issue is nobody's task, and its PRs wait with it.
- [PEB#55](https://github.com/bateks/PersonalExchangeBot/issues/55): `develop` as the default branch, so a merged PR's `Closes #n` closes the issue; rulesets instead of trust.
- [PEB#339](https://github.com/bateks/PersonalExchangeBot/issues/339): a release PR comes from a `release/<date>-NN` branch, never from `develop`: GitHub deletes a merged PR's head branch.
- [PEB#510](https://github.com/bateks/PersonalExchangeBot/issues/510), [PEB#517](https://github.com/bateks/PersonalExchangeBot/issues/517): a release PR goes live on trial once CI passes; merging confirms it, closing rolls back; the label `release` on an issue cuts one from anywhere.
- [PEB#566](https://github.com/bateks/PersonalExchangeBot/issues/566): `api POST` prints a summary, not JSON; a filtered-away output isn't a failure, and a repeated POST made a duplicate issue an agent then started on.
- [PEB#520](https://github.com/bateks/PersonalExchangeBot/pull/520): a chore PR that says "closes #n" becomes n's PR: an agent started on the closed issue when CI finished.
- [PEB#468](https://github.com/bateks/PersonalExchangeBot/issues/468) to [PEB#471](https://github.com/bateks/PersonalExchangeBot/issues/471): a review's findings become a few issues grouped by the piece they touch, one agent each, every finding kept.
- [template#1](https://github.com/bateks/claude-workflow-template/issues/1), from #17 and #18: what an issue builds on is declared with GitHub's own "blocked by" too, the relation GitHub shows on both issues, beside a `Depends on` line and an `after:` label (#107).

## Agents

- [PEB#387](https://github.com/bateks/PersonalExchangeBot/issues/387): the agent manager: one headless Claude Code per task, each in its own worktree, power from `model:*` and `effort:*` labels, logs in `.agent-runs/`, `scripts/setup.sh` for a machine.
- [PEB#409](https://github.com/bateks/PersonalExchangeBot/issues/409): a branch checked out in the checkout keeps the manager from making the worktree: commands asked of a person end with `git switch develop`.
- [PEB#411](https://github.com/bateks/PersonalExchangeBot/issues/411): agents try ideas as tests, never with `python -c` or ad-hoc scripts, which would run any code.
- [PEB#415](https://github.com/bateks/PersonalExchangeBot/issues/415): what an agent needs of a person goes on the issue: permissions as exact rules, `.claude/` changes as diffs.
- [PEB#436](https://github.com/bateks/PersonalExchangeBot/issues/436): a worktree whose branch was squash-merged without an upstream of its own holds nothing GitHub hasn't: compare its changed files with `develop`.
- [PEB#441](https://github.com/bateks/PersonalExchangeBot/issues/441): an agent's conversation is compacted at a quarter of the window, since every reply reads all of it again.
- [PEB#443](https://github.com/bateks/PersonalExchangeBot/issues/443), [PEB#551](https://github.com/bateks/PersonalExchangeBot/issues/551), [PEB#552](https://github.com/bateks/PersonalExchangeBot/issues/552): an agent is offered only what it uses: the file and command tools, the project's settings, no MCP, no web, no Skill, no PowerShell, no auto-memory; CLAUDE.md keeps only what every turn needs. Measured: 25K tokens a reply down to 14K.
- [PEB#444](https://github.com/bateks/PersonalExchangeBot/issues/444): a new worktree gets the checkout's caches and a `.venv` first, or `mypy` takes a minute.
- [PEB#456](https://github.com/bateks/PersonalExchangeBot/issues/456), [PEB#534](https://github.com/bateks/PersonalExchangeBot/issues/534): CI's result is a task until Claude has spoken after it; a handoff that waits on CI hasn't read the result, whenever it was posted.
- [PEB#476](https://github.com/bateks/PersonalExchangeBot/issues/476): a run that ends on the account's usage limit did nothing: the manager waits until the time the limit names.
- [PEB#485](https://github.com/bateks/PersonalExchangeBot/issues/485): `priority:*` labels, a lane of its own for merges, mid-work before new, a soft stop on Ctrl+C; [PEB#574](https://github.com/bateks/PersonalExchangeBot/issues/574): Esc cancels the soft stop.
- [PEB#522](https://github.com/bateks/PersonalExchangeBot/issues/522): the manager's console stamps every line with the time.
- [PEB#545](https://github.com/bateks/PersonalExchangeBot/issues/545): the allow list holds the read-only commands the logs showed agents refused.
- [PEB#550](https://github.com/bateks/PersonalExchangeBot/issues/550): the manager merges a green PR itself, from the closing comment the agent left in its handoff: no agent for the most common run.

## CI and the repository

- [PEB#59](https://github.com/bateks/PersonalExchangeBot/issues/59), [PEB#538](https://github.com/bateks/PersonalExchangeBot/issues/538), [PEB#546](https://github.com/bateks/PersonalExchangeBot/issues/546): gitleaks over the branch's history on every PR (not every branch's: a stray branch's finding would fail every PR), pip-audit over the lock file every Monday.
- [PEB#440](https://github.com/bateks/PersonalExchangeBot/issues/440): tests in parallel, each worker on a database of its own, as many workers as cores and memory allow.
- [PEB#564](https://github.com/bateks/PersonalExchangeBot/issues/564): a line in `.env` pins its setting, so `.env.example` is commented lines at the defaults, and the machine check says what a `.env` pins.
- [PEB#556](https://github.com/bateks/PersonalExchangeBot/issues/556): CLAUDE.md keeps what agents and sessions both obey; a session's start and close live in the skills.
- [template#5](https://github.com/bateks/claude-workflow-template/issues/5), from [Everest#18](https://github.com/albalaeff/Everest-Game/issues/18): a job's log is a redirect `api` doesn't follow; `logs <job>` follows it, and `ci` names the failed jobs.

## The machine and the OS

- [PEB#358](https://github.com/bateks/PersonalExchangeBot/issues/358): piped on Windows, Python writes cp1252: the scripts write UTF-8 themselves.
- [PEB#530](https://github.com/bateks/PersonalExchangeBot/issues/530): Claude Code names its scratchpad only in its prompt; `$CLAUDE_SCRATCHPAD` exists only once `~/.bashrc` exports it and the user settings set `BASH_ENV`. VS Code's interpreter must be `.venv`'s, or every `uv` call warns. Claude's Read needs poppler for PDFs.
- The Bash tool collapses `\\` to `\` even in a quoted heredoc: write JSON with the Write tool, or use forward slashes in Windows paths; several quoted heredocs of prose in one command can fail to parse. (developer-setup.md → On Windows)
- Git Bash rewrites an argument starting with `/` into a path under its own folder: `api POST /user/repos` once reached GitHub as `/repos/…/C:/Program Files/Git/user/repos` (a 404, while making this template). `scripts/github.py` undoes the rewrite; a script of one's own needs `MSYS_NO_PATHCONV=1`.
- A fine-grained token can't re-run CI jobs: push an empty commit. Actions billing fails CI for a reason that isn't the change's (README → When CI fails); on PersonalExchangeBot, Docker Hub's 429 on its PostgreSQL image did too.
