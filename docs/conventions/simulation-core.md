# The simulation core

`src/simulation/` is one engine for the browser, the room server and the balance runner ([../../spec.md](../../spec.md) → Technical architecture). It follows [../conventions.md](../conventions.md) → Modules, Objects, and Time and chance; these are its own rules.

## Real time

The game is real-time, not turn-based: "step" here means a twentieth of a second, never a turn.

- **The step** is `SimulationClock.STEPS_PER_SECOND`, 20 a second. It's the one number in the core's code and not in the content data: it's the engine's, not the mountain's, so no source states it and no expert tunes it. A rule states its rates per second and scales them by `SimulationClock.STEP_SECONDS`.
- **Seconds are seconds of play.** `SimulationClock.seconds` counts them, and a rule states its rates in them.
- **The mountain's time is a rule**, `MountainClock`, handed the knowledge base's `time.compression`: it runs that many times faster than play, 36, an hour in 100 seconds, so that the spec's six to eight weeks fit about two hours (spec.md → Gameplay), and it jumps over what camp skips, a night or a rest day, through `skip` (#53). It counts the steps from the scenario's start date and time, so it never drifts, and one clock serves the whole expedition, in co-op too. The route is drawn at a third of that ratio, `route.drawn-scale`, and the climber goes three times as fast as in life over it ([slope-physics.md](slope-physics.md) → The slope, #167), so a section takes its real hours, and the body lives them.
- **The mountain never waits.** The page and the room server call `Expedition.advance` as the real clock says, through a `StepPacer` of their own, whether or not anyone acted. A slow phone and a fast PC take the same steps a second. Only a pause stops it, which the spec gives a single player on a call or a locked screen (spec.md → Phone and PC): the page stops calling.
- **Everyone moves at once.** One step takes every climber's actions together, and the scenario's order of climbers settles who goes first, never who reached the server first. A rule works out all the climbers in each step.
- **A held key is two actions.** `walk up` when it's pressed and `walk stop` when it's released: between them the climber goes on walking, and nothing is sent.

## The only door

`Expedition.advance(actions)` is how anything reaches the simulation. A `GameAction` (`game-action.ts`, the spec's controls table) says what a climber does, never with which key or finger: the input layer (#18) turns those into actions, and an NPC's agent sends the same ones. Which key does what is the input layer's business. Actions are plain data, because replays keep them and the room server sends them.

## Rules

The game's rules are classes behind the `Rule` interface: `load`, `save` and `advance`. The core knows only the interface, so the agents and the slope physics can sit above it and still run inside its step. The page, the room server and the tests each build the list of rules, handing them their content data, and an expedition runs them in that order.

- A rule keeps its whole state in plain data it can `save`: what `load` doesn't restore is lost from saves, and a replay goes wrong.
- `name` is its key in saves: never change it once saves exist.
- A rule has its numbers handed to it (conventions.md → Data, not literals), and reads neither the content files nor the rendering.
- A rule that sets what another reads comes before it in the list, and is handed it through an interface of the core: the body (`body/`, [body.md](body.md)) sets the slope physics' strides through `Legs`, so the physics walks this step at the stride the body gave.

`src/simulation/testing/test-slope.ts` is a small rule that stands in for the real ones in the core's tests, which import nothing above the core, and `testing/test-ridge.ts` stands in for the slope physics and the oxygen under the body's (`testing/hike.ts` plays it). They're no game code, and their numbers are made up.

## Objective hazards

`ObjectiveHazards` (`objective-hazards.ts`) is the spec's seracs, avalanches, crevasses and cornices: they can't be beaten, only avoided by spending less time under them (spec.md → Simulation systems).

- **A zone is a stretch of the ground** under a hazard, in metres along it, which the scenario lays with its section, beside the weather. Until the weather (#39) comes, the scenario sets that weather: `clear`, `cloud`, `snow` or `wind`.
- **Each step someone is in a zone, it may go**, at `HazardChance`: the kind's rate an hour in the cold of the night, raised by the day's warmth (a line up from `warmth.from` to `warmth.peak` and down to `warmth.until`, times the share of the sun the weather lets through), and by snow or wind. The hour is the `MountainClock`'s, and the chance a step is the rate times `MountainClock.secondsAStep`. A zone nobody is in draws nothing.
- **A serac or an avalanche warns first.** A zone that goes adds a `Warning`, and comes down its kind's `warning` mountain seconds later, rounded up to whole steps, whoever is in it then; the picture shows it with no words, its ice or snow coming down over the zone and the screen shaking ([rendering.md](rendering.md)), so whoever reads it and gets clear in time is spared. A kind whose `warning` is 0, a snow bridge or a cornice, comes down on the step it goes. A warning is saved, and so it resumes; it comes down even once everyone is clear, a near miss kept as a `Strike` with no climbers.
- **A zone that comes down knocks everyone in it** off their feet through its ground, a `HazardGround`: the slope physics in the game ([slope-physics.md](slope-physics.md) → Walking and falls), which the core can't import. Each climber caught may die outright instead, at the kind's `deadly` odds, or `deadlyClipped` for one on a rope: the rope saves from the fall, a snow bridge's or a cornice's, not from ice or burial. That draw is made only where the odds aren't nought, and the dead are no longer on the ground the hazards see. Each `Strike` is kept, with who it killed, for the debrief. Injury comes with the body model, and what follows a death with #44.
- **In the rules' order** it comes after the clock, which it reads, and before the physics, so a knock falls in the same step (`Mountain.rules`). Its numbers are the knowledge base's `hazards.*` coefficients.

## Scenarios, saves and replays

- **A scenario** is a seed, the climbers and each rule's start state, in the form of that rule's save. Conditions set in advance, such as harsh weather, are in the start state, and hold on every seed.
- **A new expedition** gets a new seed from the page (`crypto.getRandomValues`), so no two are alike. An old seed comes back only to replay.
- **A save** (`Expedition.save`) is the whole state as plain data, its action log included. `Expedition.resume` goes on from it exactly.
- **A replay** is a save's scenario and action log, played by a `HeadlessRunner`. A bug report needs nothing else.

## The same result everywhere

The same seed and actions must give the same numbers in every browser, in Node and on the room server, down to the last digit.

- Chance comes from `moment.random` alone. Every rule draws from that one generator, in the rules' order, and a change in what a rule draws changes everything after it: an old replay goes with its version of the game.
- Maths is `+ - * /` and `Math.sqrt`, `abs`, `floor`, `ceil`, `round`, `trunc`, `min`, `max` and `imul`. The language lets each browser round `Math.pow`, `**`, `exp`, `log` and the trigonometric functions its own way, so a curve one of those would give (an exponential in the body model, say) is a class of the core's own built from the operations above, or a table in the content data, read through `Curve`, which draws straight lines between its points and holds its end values past its ends: the body's SpO2 by altitude, the physics' speeds by steepness.
- Sorting uses a comparison of numbers, never `localeCompare`, which differs by device. Maps and arrays keep their order; don't depend on any other.

`npm run typecheck` checks the core alone with `tsconfig.core.json`, which has no DOM, Node or timers in scope, so using one fails there. `core-purity.test.ts` refuses what the language itself offers, in every folder of the core but `testing/`: `Math.random`, `Date`, the rounded maths, `localeCompare` and the like, and any import from outside `src/simulation/`. A rule that runs in the core's step keeps these rules too, and its folder gets the same checks: `testing/module-code.ts` makes them (`src/physics/physics-purity.test.ts`).

## Tests

Every test is on a seed, so a failure replays. A new rule's tests play it through `Expedition`, and `expedition.story.test.ts` is the end-to-end story, grown as the game grows (conventions.md → Tests). `seeded-random.test.ts` pins the generator's draws: they may only change along with every saved replay.
