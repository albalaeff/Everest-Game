# myapp conventions

Every change to this codebase follows the rules in this file, and those of each area it touches: read them before starting.

| A change to | Also follows |
|---|---|
| <an area with rules of its own, such as the bot's screens, the database, the services> | [conventions/<area>.md](conventions/) |

A change to `scripts/` or to the docs alone follows this file only. (Fill the table in as areas get rules of their own, one file each in `docs/conventions/`; a Telegram bot's are in `optional/telegram-bot/`.)

## Git workflow

- Every task is a GitHub issue ([CLAUDE.md](../CLAUDE.md) → Working from GitHub issues).
- `develop` is the integration branch; `master` holds the releases confirmed live. Both change only through pull requests.
- For a task: branch from the latest `develop` as `feature/<issue>-<short-description>` (`fix/…` or `chore/…` where that fits), commit often, push the branch, and open a PR into `develop` whose description says `Closes #<issue>` (the template asks for it).
- CI runs on every PR and on every push to `develop` and `master`. Merge only when it's green, by **squash**: one commit per task on `develop`, titled after the PR, with its description as the body. Then delete the task branch.
- A task that builds on one not merged yet: branch from that one, and after the first merges, rebase onto `develop` (`git rebase --onto origin/develop <old base>`) before opening the PR. An automatic permission mode may refuse a force push after a rebase: merge `origin/develop` into the branch instead and push normally; the squash folds the merge away.
- A release is a PR into `master` from a `release/<date>-NN` branch cut at `develop`'s tip (`-01`, then `-02` for the day's next), never from `develop` itself: GitHub deletes a merged PR's head branch, and on PEB#339 that took `develop` with it. `scripts/github.py release` cuts the branch and opens the PR, and so does the label `release` on an issue, from GitHub (PEB#517). Once its checks pass, CI deploys it on trial; a person tries it, then merges it (a merge commit, so `master` keeps the task commits) to confirm it, or closes it to roll back ([production.md](production.md) → A release, PEB#510). Housekeeping goes in a small `chore/…` PR first; such PRs and release PRs need no issue.
- The repository's settings (README → Repository settings): `develop` is the default branch, so a merged PR's `Closes #<issue>` closes the issue (PEB#55); a ruleset lets `develop` and `master` change only through a PR with CI green, by squash or merge commit, with no force pushes or deletions; `git config core.hooksPath .githooks` makes `git push` refuse `develop` and `master` from your clone before GitHub does.

## Layers

```
domain  →  db  →  services  →  adapters (bot / web / worker / cli)
```

| Layer | Lives in | Rules |
|---|---|---|
| **domain** | `myapp/domain/` | Pure logic: values, state machines, rules. No I/O, no database, no network, no clock reads. Easy to unit-test. |
| **db** | `myapp/db/` | Models and repositories. No business rules beyond constraints. |
| **services** | `myapp/services/` | Use cases. Take a session and a `Clock`. Raise the app's own error classes, which carry a message key and params. Never call the outside world directly: write to an outbox a worker sends. |
| **adapters** | `myapp/bot/`, `myapp/web/`, `myapp/worker/`, `myapp/cli.py` | Thin: parse input → call a service → render the result. No business logic. |

Dependencies point one way only: adapters may import services, services may import db and domain, db may import domain. Never the other way round.

## Objects

Object-oriented, in every layer, in any JavaScript and in `scripts/` (PEB#320, PEB#393):

- **State and the behaviour on it live in one class.** No module-level state shared by loose functions (JS included: a `class Wheel`, not globals), and no free function passed the same five arguments: that's a class with those as its fields.
- **One thing, one class.** What's shown or done the same way in several places is one class that the callers use and never rebuild. Changing it is then one edit, in one place.
- **What differs, a subclass.** One class for what's shared, one per use for what isn't.
- **Values are frozen dataclasses** (`@dataclass(frozen=True, slots=True)`); a class's helpers are its `_methods`, not module functions beside it.
- **Leave it better.** A change shapes what it touches this way, and when it finds the same thing done twice, makes it one. Code nobody's change touches isn't rewritten just for this.

Text files use LF line endings on every OS (`.gitattributes`, and ruff formats with LF).

## Money

- `Decimal` only. Never `float`, not even in intermediate calculations or tests.
- Database columns for amounts and rates: `NUMERIC(24,8)`.
- Currency codes are validated against the ISO 4217 list, with each currency's minor units.
- Rounding to a currency's minor units uses `ROUND_HALF_UP`.
- Parse user input with one function (`parse_money("1 000,50 EUR")`) and display with its inverse (`format_money`): anything the app prints can be typed back in and parses to the same value. When both `.` and `,` appear, the last one is the decimal point and the other groups thousands. Always show the parsed amount back to the user before saving it.

## Time

- All datetimes are timezone-aware UTC. Naive datetimes are a bug.
- Get "now" from an injected `Clock`. Never call `datetime.now()` or `datetime.utcnow()` outside the one `SystemClock` (the scripts, which run on a person's machine, are the exception).
- Tests use a `FakeClock` and move time explicitly with `advance()` / `set()`.
- Database timestamp columns are `timestamptz`.

## Configuration

- All settings live in `myapp.config.Settings` and are read from `MYAPP_*` environment variables or `.env`. `MYAPP_ENV_FILE` picks another file (`""`: none); the test suite sets it to none, so tests never depend on a local `.env`.
- Business numbers (limits, timeouts, thresholds, prices) are settings, never literals in code.
- Secrets are `SecretStr`, so they never appear in `repr` or logs. Call `.get_secret_value()` only at the point of use.
- Every new setting is added to `.env.example` with a comment, and to the configuration table in `README.md`. In `.env.example` it's a commented line at its default, `# MYAPP_X=<default>`, so a copy doesn't pin it; a setting that's unset by default is a blank line to fill in (`tests/test_config.py` holds the template to the code, PEB#564).

## Logging

- Use `logging.getLogger(__name__)`. Pass context as `extra={...}`; it becomes fields of the line: `key=value` text, or JSON with `MYAPP_LOG_FORMAT=json` (production).
- Log at ERROR only what someone should be woken up for: production alerts on it.
- Never log secrets, tokens, or the content of users' messages.

## Tests

- Write the tests first, watch them fail, then implement.
- Deprecation warnings fail the test run (`filterwarnings` in `pyproject.toml`): fix them when they appear; ignore one only for third-party code, with a comment.
- Mark pure tests with `pytest.mark.unit` and tests that use the database with `pytest.mark.db`.
- Shared test helpers live in `tests/fakes.py` and `tests/factories.py`.
- Tests run in parallel (pytest-xdist; README → Tests), so a test never relies on another having run before it, and writes files only under its `tmp_path`.
- A project with a database: its tests need the docker compose database running (`docker compose up -d db`). They use `TEST_DATABASE_URL` (default `…localhost:5433/myapp_test`), whose database name **must end in `_test`**: the fixtures wipe its schema and rebuild it with the migrations once per run, and each pytest-xdist worker runs on a database of its own beside it (`myapp_gw0_test`, …, PEB#440), as each agent does (`myapp_<issue>_test`). Pick the right fixture: a session inside a transaction rolled back afterwards for almost everything (a `commit()` in the code under test only releases a savepoint); real committing sessions only for races and concurrency, with the rows deleted after the test.
- Tests must not depend on the developer's environment: clear `MYAPP_*` variables and pass `_env_file=None` when building `Settings`.
- End-to-end tests run the real parts together on one fake clock, as a story a user would recognise. Add one when a change crosses parts.

## Definition of done

A step is done when:

1. `uv run ruff check` passes.
2. `uv run ruff format --check` passes.
3. `uv run mypy myapp scripts` passes.
4. `uv run pytest` passes.
5. CI is green on the task's PR, and the PR is merged into `develop`.
6. Nothing is left unwired: every new piece of code is reachable from an entry point, or is used by the very next step.
7. The code it adds or touches follows **Objects** above.
