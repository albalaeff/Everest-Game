# Everest conventions

Every change to this codebase follows the rules in this file, and those of each area it touches: read them before starting.

| A change to | Also follows |
|---|---|
| the knowledge base: `content/facts/`, `content/library.json` | [conventions/knowledge-base.md](conventions/knowledge-base.md) |
| the simulation core: `src/simulation/` | [conventions/simulation-core.md](conventions/simulation-core.md) |
| the body: `src/simulation/body/`, and the numbers `src/content/body-facts.ts` hands it | [conventions/body.md](conventions/body.md) |
| the input layer: `src/input/` | [conventions/input.md](conventions/input.md) |
| the slope physics: `src/physics/` | [conventions/slope-physics.md](conventions/slope-physics.md) |
| the agents: `src/agents/` | [conventions/agents.md](conventions/agents.md) |
| the rendering and the page: `src/rendering/`, `src/page/` | [conventions/rendering.md](conventions/rendering.md) |
| the room server: `src/room/`, and the page's `RoomClient` | [conventions/room-server.md](conventions/room-server.md) |
| what the player sees, hears or touches: `src/rendering/`, `src/interface/`, `src/input/`, `src/page/`, `index.html`, `src/style.css`, the texts in `content/` | [guidelines.md](guidelines.md), the design guidelines, and its page for the change |
| the game's other areas, once they have rules of their own | their file in `docs/conventions/`, named here when it comes |

A change to `scripts/` or to the docs alone follows this file only. (Fill the table in as areas get rules of their own, one file each in `docs/conventions/`; [../spec.md](../spec.md) is what the game's areas implement.)

## Git workflow

- Every task is a GitHub issue ([CLAUDE.md](../CLAUDE.md) → Working from GitHub issues).
- `develop` is the integration branch; `master` holds the releases confirmed live. Both change only through pull requests.
- For a task: branch from the latest `develop` as `feature/<issue>-<short-description>` (`fix/…` or `chore/…` where that fits), commit often, push the branch, and open a PR into `develop` whose description says `Closes #<issue>` (the template asks for it).
- CI runs on every PR and on every push to `develop` and `master`. Merge only when it's green, by **squash**: one commit per task on `develop`, titled after the PR, with its description as the body. Then delete the task branch.
- A task that builds on one not merged yet says so, with GitHub's own "blocked by" (`scripts/github.py blocked <issue> --by <n>`), `Depends on #<n>` in its issue or an `after:<n>` label, and waits for it ([workflow.md](workflow.md) → What an issue builds on). Begun before that one merged: branch from that one, and after the first merges, rebase onto `develop` (`git rebase --onto origin/develop <old base>`) before opening the PR. An automatic permission mode may refuse a force push after a rebase: merge `origin/develop` into the branch instead and push normally; the squash folds the merge away.
- A release is a PR into `master` from a `release/<date>-NN` branch cut at `develop`'s tip (`-01`, then `-02` for the day's next), never from `develop` itself: GitHub deletes a merged PR's head branch, and on PEB#339 that took `develop` with it. `scripts/github.py release` cuts the branch and opens the PR, and so does the label `release` on an issue, from GitHub (PEB#517). Once its checks pass, CI deploys it on trial; a person tries it, then merges it (a merge commit, so `master` keeps the task commits) to confirm it, or closes it to roll back ([production.md](production.md) → A release, PEB#510). Housekeeping goes in a small `chore/…` PR first; such PRs and release PRs need no issue.
- The repository's settings (README → Repository settings): `develop` is the default branch, so a merged PR's `Closes #<issue>` closes the issue (PEB#55); a ruleset lets `develop` and `master` change only through a PR with CI green, by squash or merge commit, with no force pushes or deletions; `git config core.hooksPath .githooks` makes `git push` refuse `develop` and `master` from your clone before GitHub does.

## Modules

The game is a static TypeScript site; the Python under `scripts/` runs the workflow, not the game ([../spec.md](../spec.md) → Technical architecture). Its code is in `src/`, which Vite bundles from `index.html`; a module below gets its folder there with its first issue.

```
simulation core  →  agents, slope physics  →  rendering, interface, sound  →  the page
simulation core  →  agents, slope physics  →  the room server
```

| Module | Rules |
|---|---|
| **Simulation core** | Body, oxygen, weather, time, hazards. Pure: no DOM, no network, no wall clock, no randomness but the seeded generator it's given, and the content data handed to it, not read by it. A fixed time step; the same seed and actions give the same expedition in a browser, in a test and on the room server. |
| **Agents and slope physics** | Sherpas, clients, other expeditions and queues; movement, ropes, falls. On the core's state only. |
| **Rendering, interface, sound** | PixiJS, HTML and CSS, Web Audio. They read the simulation and send it the player's actions, and hold no game state of their own. |
| **Content and knowledge base** | JSON data: the route, scenarios, events, the facts with their sources and check dates, the RU and EN texts. Written by people, never by code; `src/content/` reads it (`Mountain`: the route and the rules with their numbers), and the page and the room server hand it to the core and the interface. |
| **Saves** | IndexedDB in the browser for progress, settings and the expedition history (`src/saves/`: the climb alone, so far); the room server for co-op expeditions. A save is the core's state and its seed, so the core's state serialises whole. |
| **Room server** | Cloudflare Workers and Durable Objects. Runs the same core and agents, with no rendering; the browsers send actions and receive every step to take, after a save to start from ([conventions/room-server.md](conventions/room-server.md)). |

Dependencies point one way only: the page may import everything below it, and of the room server only its protocol and codes; the room server imports the simulation core, the agents, the slope physics and `src/content/`, never the page, the input or the rendering (a Worker has no DOM, WebGL or Web Audio); the rendering may import the simulation and the slope physics; the simulation core imports none of the others. The core runs headless, so tests can play thousands of expeditions.

## Objects

Object-oriented, in every module, in TypeScript as in `scripts/` (PEB#320, PEB#393):

- **State and the behaviour on it live in one class.** No module-level state shared by loose functions (a `class Rope`, not globals), and no free function passed the same five arguments: that's a class with those as its fields.
- **One thing, one class.** What's shown or done the same way in several places is one class that the callers use and never rebuild. Changing it is then one edit, in one place.
- **What differs, a subclass.** One class for what's shared, one per use for what isn't.
- **Values are frozen.** Python: `@dataclass(frozen=True, slots=True)`; TypeScript: `readonly` fields, and a change makes a new value. A class's helpers are its private methods, not module functions beside it.
- **Leave it better.** A change shapes what it touches this way, and when it finds the same thing done twice, makes it one. Code nobody's change touches isn't rewritten just for this.

Text files use LF line endings on every OS (`.gitattributes`, and ruff formats with LF).

## Time and chance

- The simulation never reads the wall clock or `Math.random()`: it advances by its fixed step when told to, and draws from the seeded generator it was given. The page and the room server pace the steps from the real clock; the core only counts them.
- A scenario is a seed and a start state. A replay is those plus the players' actions in order, which the page and the room server record, so a playtest, a bug or a debrief replays exactly.
- Every time the player sees (the clock, the turnaround time, the forecast) comes from the simulation's clock, never the browser's.
- The scripts under `scripts/`, which run on a person's machine, may read the real clock.

## Data, not literals

- Every number the player meets or the model uses (altitudes, oxygen flows, prices, coefficients, probabilities) lives in the content data with its source and check date ([../spec.md](../spec.md) → Realism and accuracy principles), never as a literal in code. An expert then changes a number without a programmer.
- Where sources disagree, the data holds the range, and the game shows the range; the model uses the middle of it, and may move within it from season to season ([../spec.md](../spec.md) → Route and world).
- A tuning coefficient no source states (a fatigue rate, a hazard probability) names the facts it was fitted to and the date of the fit, and is kept to them by the balance check (Tests below).
- A fact's record says whether it is expert-reviewed or source-only, and the game tells the player so until an expert has reviewed it.
- Medicines appear as actions in the first-aid kit, never with doses, in the training as in the simulation.

## Tests

- Write the tests first, watch them fail, then implement.
- The game's tests: Vitest for the simulation, the agents and the physics, each on a seed, so a failure replays; Playwright for the page, as a story a player would recognise; and a balance check that plays many seeded expeditions headless and holds the outcomes to the knowledge base (the summit times and death rates the spec cites). A Vitest test sits beside its code as `<name>.test.ts`; a Playwright story goes in `e2e/`, and runs on a PC and on each phone of `playwright.config.ts`. CI runs them beside the scripts' checks (README → Tests has the commands); the balance check comes with #47.
- The scripts' tests, in `tests/`: mark pure tests `pytest.mark.unit`; the agent manager's database test is `pytest.mark.db`, skipped without `TEST_DATABASE_URL`. Deprecation warnings fail the run (`filterwarnings` in `pyproject.toml`): fix them when they appear; ignore one only for third-party code, with a comment. Shared helpers live in `tests/fakes.py`.
- Tests run in parallel (pytest-xdist; README → Tests), so a test never relies on another having run before it, writes files only under its `tmp_path`, and never depends on the developer's environment.
- End-to-end tests run the real parts together: the game's on one seed and a recorded sequence of actions, as a story a player would recognise; the scripts' on a fake clock and a fake GitHub, as a story a user would recognise. Add one when a change crosses modules.

## Definition of done

A step is done when:

1. `uv run ruff check` passes.
2. `uv run ruff format --check` passes.
3. `uv run mypy scripts` passes.
4. `uv run pytest` passes.
5. The game's own checks pass (its lint, format, type check, Vitest and Playwright); README → Tests names them.
6. CI is green on the task's PR, and the PR is merged into `develop`.
7. Nothing is left unwired: every new piece of code is reachable from an entry point, or is used by the very next step.
8. The code it adds or touches follows **Objects** above.
