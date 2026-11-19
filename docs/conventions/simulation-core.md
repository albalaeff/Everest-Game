# The simulation core

`src/simulation/` is one engine for the browser, the room server and the balance runner ([../../spec.md](../../spec.md) → Technical architecture). It follows [../conventions.md](../conventions.md) → Modules, Objects, and Time and chance; these are its own rules.

## Real time

The game is real-time, not turn-based: "step" here means a twentieth of a second, never a turn.

- **The step** is `SimulationClock.STEPS_PER_SECOND`, 20 a second. It's the one number in the core's code and not in the content data: it's the engine's, not the mountain's, so no source states it and no expert tunes it. A rule states its rates per second and scales them by `SimulationClock.STEP_SECONDS`.
- **Seconds are seconds of play.** `SimulationClock.seconds` counts them, and a rule states its rates in them.
- **The mountain's time is a rule**, `MountainClock`, handed the knowledge base's `time.compression`: it runs that many times faster than play, 72, an hour in 50 seconds (#278; 36 till then, which played too slowly), so that the spec's six to eight weeks fit about an hour (spec.md → Gameplay), and it jumps over what camp skips, a night or a rest day, through `skip` (#53). It counts the steps from the scenario's start date and time, so it never drifts, and one clock serves the whole expedition, in co-op too. The route is drawn at a sixth of that ratio, `route.drawn-scale`, and the climber goes six times as fast as in life over it ([slope-physics.md](slope-physics.md) → The slope, #167), so a section takes its real hours, and the body lives them.
- **The mountain never waits.** The page and the room server call `Expedition.advance` as the real clock says, through a `StepPacer` of their own, whether or not anyone acted. A slow phone and a fast PC take the same steps a second. Only a pause stops it, which the spec gives a single player on a call or a locked screen (spec.md → Phone and PC): the page stops calling.
- **Everyone moves at once.** One step takes every climber's actions together, and the scenario's order of climbers settles who goes first, never who reached the server first. A rule works out all the climbers in each step.
- **A held key is two actions.** `walk up` when it's pressed and `walk stop` when it's released: between them the climber goes on walking, and nothing is sent.

## The only door

`Expedition.advance(actions)` is how anything reaches the simulation. A `GameAction` (`game-action.ts`, the spec's controls table) says what a climber does, never with which key or finger: the input layer (#18) turns those into actions, and an NPC's agent sends the same ones. Which key does what is the input layer's business. Actions are plain data, because replays keep them and the room server sends them.

An agent is a rule with an `act` (#212, [agents.md](agents.md)): at the start of each step, before any rule advances, the expedition asks it what its NPCs do, from what the last step left, and every rule hears those actions with the players', in the scenario's order of climbers. The log keeps the players' alone, since the agents' come again from their state, on a replay too. The scenario names the climbers an agent steers (`Scenario.npcs`), which a room seats no player on.

The god mode (#245, [rendering.md](rendering.md)) is the one way round it, a tester's, alone and never in a room: between steps, it stages the climb as a scenario's start state does, through powers the rules keep for it and no step calls (`SlopePhysics.stand`, `stageBreak` and `injure`, `ObjectiveHazards.stageEvent` and `changeWeather`, `Jolts.bring`, `calm` and `changeWeather`, `Sherpa.afresh`), and sets the clock on by camp's `MountainClock.skip`. The save it makes goes on from there; a climb it touched doesn't replay from its scenario and its log.

## Rules

The game's rules are classes behind the `Rule` interface: `load`, `save` and `advance`. The core knows only the interface, so the agents and the slope physics can sit above it and still run inside its step. The page, the room server and the tests each build the list of rules, handing them their content data, and an expedition runs them in that order.

- A rule keeps its whole state in plain data it can `save`: what `load` doesn't restore is lost from saves, and a replay goes wrong.
- `name` is its key in saves: never change it once saves exist.
- A rule has its numbers handed to it (conventions.md → Data, not literals), and reads neither the content files nor the rendering.
- A rule added once saves exist says what a save from before it goes on with, `missing()` (#258): the expedition loads that where the save has nothing under the rule's name. Without it, such a save doesn't load.
- A rule that sets what another reads comes before it in the list, and is handed it through an interface of the core: the body (`body/`, [body.md](body.md)) sets the slope physics' strides through `Legs`, so the physics walks this step at the stride the body gave.

`src/simulation/testing/test-slope.ts` is a small rule that stands in for the real ones in the core's tests, which import nothing above the core, and `testing/test-ridge.ts` stands in for the slope physics and the oxygen under the body's (`testing/hike.ts` plays it). They're no game code, and their numbers are made up.

## Objective hazards

`ObjectiveHazards` (`objective-hazards.ts`) is the spec's seracs, avalanches, crevasses and cornices: they can't be beaten, only avoided by spending less time under them (spec.md → Simulation systems).

- **A zone is a stretch of the ground** under a hazard, in metres along it, which the scenario lays with its section, beside the weather. Until the weather (#39) comes, the scenario sets that weather: `clear`, `cloud`, `snow` or `wind`.
- **Each step someone is in a zone, it may go**, at `HazardChance`: the kind's rate an hour in the cold of the night, raised by the day's warmth (a line up from `warmth.from` to `warmth.peak` and down to `warmth.until`, times the share of the sun the weather lets through), and by snow or wind. The hour is the `MountainClock`'s, and the chance a step is the rate times `MountainClock.secondsAStep`. A zone nobody is in draws nothing.
- **A serac or an avalanche warns first.** A zone that goes adds a `Warning`, and comes down its kind's `warning` mountain seconds later, rounded up to whole steps, whoever is in it then; the picture shows it with no words, its ice or snow coming down over the zone and the screen shaking ([rendering.md](rendering.md)), so whoever reads it and gets clear in time is spared. What falls from high above takes its kind's `fall` seconds of play more to come down, life size, a serac's ice the 1.9 s it takes to fall about 18 m (`hazards.serac-fall`, #229): the warning says the step it `breaks` on, after its `warning`, and it `comes` that many steps later, rounded up; a kind whose `fall` is 0 has no `breaks`, nor does a warning saved before #229. A kind whose `warning` is 0, a snow bridge or a cornice, comes down on the step it goes. A warning is saved, and so it resumes; it comes down even once everyone is clear, a near miss kept as a `Strike` with no climbers.
- **A zone that comes down knocks everyone in it** off their feet through its ground, a `HazardGround`: the slope physics in the game ([slope-physics.md](slope-physics.md) → Walking and falls), which the core can't import. Each climber caught may die outright instead, at the kind's `deadly` odds, or `deadlyClipped` for one on a rope: the rope saves from the fall, a snow bridge's or a cornice's, not from ice or burial. That draw is made only where the odds aren't nought, and the dead are no longer on the ground the hazards see. Each `Strike` is kept, with who it killed, for the debrief. Injury comes with the body model, and what follows a death with #44.
- **A training event** (`HazardEvent`, #209) is a collapse staged on a stretch of the ground, as a flight simulator stages an engine failure, not the real odds: it draws nothing to go. It's staged for the players, its `trainees` (#212): a Sherpa leading them doesn't set it off. It cracks once the first of them comes within its `lead` metres of the stretch, from either side or onto it, for the training's `crack` mountain seconds, long enough to stop or back off, then breaks and falls for its kind's `fall` and comes down on the stretch as a zone does, once; its strike says `training`. The section stages one a climb from the seed (`Section.staged`), on a stretch of one of its serac zones, unless the scenario is made without training; a save keeps its events, and one from before them has none.
- **In the rules' order** it comes after the clock, which it reads, and before the physics, so a knock falls in the same step (`Mountain.rules`). Its numbers are the knowledge base's `hazards.*` coefficients. The day's warmth is `DayWarmth`'s, which the jolts share.

## Jolts

`Jolts` (`jolts.ts`, #197) is what a climber can't prevent but can read, so that standing still isn't a sure refuge and a rope at every changeover is: a gust across the open slope, and a lashed ladder twisting under whoever is on it.

- **A zone is a stretch of the ground**, as a hazard's: a `gust` over the slope it blows across, a `twist` over a lashed ladder's from end to end, which catches only who stands on that ladder (`JoltGround.onALadder`). The section lays them (`jolts` in its file), in the hazards' weather.
- **Each step someone is in a zone, a jolt may come**, at its kind's rate an hour raised by the sun's warmth (`DayWarmth`: the morning's thermals, the anchors loosening as the ice softens) and by snow or wind, from time to time as the sources have it (`route.icefall-wind`, `route.icefall-ladders-shift`). It warns its kind's `warning` mountain seconds first, long enough to stop and brace (`comingTo(id)` says which is on its way to a climber, for the coach and the picture), then slips each climber it catches at its `slip` times their `unsteadiness`, drawn only where that isn't nought, through `upset`: the physics is its ground, the rope holds whoever is clipped. Each `Jolt` is kept, with whom it caught and slipped; a save keeps the warnings and the jolts.
- **In the rules' order** it comes after the hazards and before the physics, so an upset falls in the same step. Its numbers are the knowledge base's `hazards.gust-*` and `hazards.twist-*` coefficients.

## Packs

What a climber chooses to carry is a rule, `Packs` (`src/simulation/packs.ts`): the jumar, a second ice tool, litres of water, bars of food, bottles of oxygen, a first-aid kit and a rescue kit (#241). What everyone wears and carries anyway is the body's own load.

- **A pack changes at a camp only.** `pack` (an item, `take` or `leave`) moves one of an item between the pack and the store of the camp the climber stands in, on their feet, up to the most of it one climber carries (`PackNumbers.most`). A camp's store keeps what's left there for whoever comes back, and never runs out of its `endless` items: everything at Base Camp. Higher up, water is snow melted on a tent's stove (Tents, below). Anywhere else the action does nothing.
- **`use` drinks and eats anywhere**: `water` takes `PackNumbers.sip` litres off what the body is short of, `food` a bar's kcal, and the pack is that much lighter.
- **The rule runs first after the clock**, and each step tells the body its load (`Shoulders.carry`: what they carry besides, plus the pack's weight) and the slope physics its gear (`Harness.equip`: the jumar, the tools, and whether a first-aid kit and a rescue kit are in it), so the body's stride and the physics' techniques read this step what the pack holds. A kit a rescue used up (`Harness.kitsSpent`: one first-aid kit a casualty treated, one rescue kit a line anchored) comes off the pack the step after, and a pack saved before the kits has none. The bottles are the oxygen system's to count (`Bottles.stock`): the pack shows and weighs what it has.
- **The numbers are the knowledge base's** (`content/facts/gear.json`, read by `PackFacts`): each item's weight with its source, the most of each, the drink and the bar. A section's file has each climber's pack as they set off (`packs`) and its camps' `endless` stores; the player's own choice at Base Camp replaces theirs (`Mountain.scenario`'s `pack`).
- **The pack's screens** are the page's: `PackScreen` at Base Camp, between Your climber and the gear check, and `InventoryPanel` on the climb, both drawing `PackList`'s tiles with index.html's `#art-…` symbols. Their words are `content/pack.json`'s.

## Tents

A camp's tents are a rule, `Tents` (`src/simulation/tents.ts`, #258): who's in which tent, the chore each has in hand, and the gas and the meals each camp has left.

- **A climber goes in at a door.** `tent` (`in` or `out`) takes a climber on their feet within `TentNumbers.reach` of a tent's door into it, or out of the one they're in; the doors are the section's, in metres along the ground. Inside they're under cover: the slope physics keeps them where they are whatever their keys say and takes them off the rope (`Campground.shelter`, `ClimberView.sheltered`). One knocked off their feet, or moved from the door, is out.
- **A chore at a time** (`chore`: `melt`, `cook`, `nap`, `sleep`, `guitar`, or `stop`). The stove melts a litre of snow into the bottles (`Flasks.pour`) and cooks a meal, burning the camp's gas as it goes: a flame that runs out leaves the pot as it was. A meal takes its water and one of the camp's meals as it begins, and feeds the body when it's done (`Sleeper.eat`). A chore that lacks something doesn't begin, and `TentView.lacks` says what: gas, a meal, the water, room in the bottles, a guitar. The guitar only passes the time; Base Camp alone has one, and its kitchen never runs out of gas or meals (`null`).
- **Sleep is the body's and the clock's.** A sleeper sleeps through the mountain's time (`Sleeper.sleep`, [body.md](body.md)) while any living player is awake; once all of them sleep, the clock skips to the first to wake (`MountainClock.skip`), and the climbers an agent steers sleep through it. So alone a night passes at once, and in a room when the last player lies down. A nap is `time.nap` long; a sleep ends at the alarm, a breakfast (`time.breakfast`) before the hour climbers leave Base Camp. A section's time is the time played, `MountainClock.played`, which leaves a skipped night out.
- **In the rules' order** it comes after the clock and the packs, whose bottles it fills, and before the body, which sleeps this step, and the physics. A chore in hand lives through a step before a new one begins in it.
- **The numbers are the knowledge base's** (`content/facts/gear.json` and `time.json`, read by `TentFacts`): the tent's sizes, a three-person expedition dome's (`gear.tent-*`) and Base Camp's big dome's; the gas and the minutes a litre of snow and a meal take (`gear.melt-*`, `gear.meal-*`), coefficients fitted to the stove's records; the meal's water and energy; a canister's gas. A section's file pitches each camp's tents and stocks it (`tents`, `larder`, `guitar`).
- **The tent's screens are the page's** ([rendering.md](rendering.md) → the tent's inside). Their words are `content/tent.json`'s.

## Devices

The electronics a climber carries are a rule, `Devices` (`src/simulation/devices.ts`, #260): a handheld radio and a satellite tracker. The GPS watch and the weather meter keep nothing, so they aren't in the core: the page reads them off the climb (`src/interface/gps-watch.ts`; the meter's `wind-meter.ts`, `air-temperature.ts` and `wind-chill.ts`).

- **The weather meter's numbers are the knowledge base's too** (`content/facts/weather.json` and `cold.json`, read by `Mountain.windSpeeds`, `airSettings` and `windChill`), fitted to what the Everest weather stations and the climbers measured: the wind's speeds, named by the Beaufort scale's forces; the air's day at Base Camp's station in each weather, coldest as the sun comes up and warmest at midday, `weather.premonsoon-lapse-rate` colder for every kilometre higher; the wind chill index's terms, with the meter's factor for the wind 10 m up; and Canada's bands of the risk of frostbite. The air has the core's four operations only, so the core can take it when the body feels the cold; the wind chill raises the wind to a power, so it stays the meter's.

- **Three actions.** `radio` is a call with a ready phrase on a channel; `tracker` starts or stops its tracking, sends a check-in or raises its SOS; `device` takes one of the four out into the hand, in place of the one in it, or with `none` puts it away (#271). All are a living climber's: a dead one's are ignored, and a tracker goes on tracking for them.
- **A device in the hand is the rule's state** (`hand(id)`: the device, the one before it, the seconds of play since it was taken out or put away, and the seconds since their last call), so a teammate in a room and a replay see what the player's own picture does. The card that shows a device sends the action; the picture shows it in the hand while a hand is free ([rendering.md](rendering.md)). It changes nothing else: a hand that holds a device is as sure as an empty one, for want of a source. A save from before it goes on with empty hands.
- **A call is kept, heard or not.** It gets out unless the climber hangs on their rope, in a crevasse or under a lip, where ice stands between the radio and Base Camp (`DeviceGround`, the slope physics). The rule keeps the call; the page gives Base Camp its words (`src/interface/base-camp.ts`), from the mountain as it was when the phrase was said.
- **A tracker needs the sky**, the same way: tracking, it sends a point every `interval` and its battery runs down over `life`; a check-in or an SOS takes `delivery` seconds of sky to leave. An SOS turns the tracking on, and is raised once.
- **The numbers are the knowledge base's** (`content/facts/gear.json`, read by `Mountain.deviceNumbers`): `gear.tracker-interval`, `gear.tracker-battery`, `gear.messenger-delivery-time`. The rule runs after the slope physics and draws nothing from chance.
- **Not yet:** the radio's guide and group channels, a radio's own battery and one left in the tent (#79), the forecast (#39), the body feeling the cold and the wind chill (frostbite, hypothermia), and anyone setting out from Base Camp on an SOS: the rescue on the route is the team's own (#241).

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
