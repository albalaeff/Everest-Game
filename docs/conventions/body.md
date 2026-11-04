# The body

`src/simulation/body/` is the climber's body ([../../spec.md](../../spec.md) → Simulation systems: Oxygen and Energy): their blood oxygen, how much of their endurance they've spent, and the pace they go at. It's a rule of the core, `Body`, and keeps the core's rules ([simulation-core.md](simulation-core.md)); `src/content/body-facts.ts` hands it its numbers. It follows [../conventions.md](../conventions.md) → Modules, Objects, and Data, not literals; these are its own rules.

## Blood oxygen

- **The body feels an altitude.** Breathing air, it's the climber's real one; on supplemental oxygen, lower by so many metres for each L/min: `body.oxygen-gain-climbing` on the move, and the far larger `body.oxygen-gain-resting` at rest, when slower breathing gets more of each litre. The flow is the oxygen system's (`Breathing`, #23); until it comes, everyone breathes air (`Body.AIR`).
- **SpO2 is read off the felt altitude**, along a `Curve` through the SpO2 measured at rest at sea level, Base Camp, Camp 2, the South Col and the Balcony, each at the route's altitude for its place. Past the Balcony it holds its 50% (a question for an expert: `body.summit-saturation`).
- **The capacity the altitude leaves**: VO2max falls by `body.capacity-decline` % for each 1,000 m felt above `body.vo2max-decline-onset`, in a straight line, down to none.

## The pace and the stride

- **Three paces**, from the player's `pace` action: the rest step, the steady pace and the faster one. Each has a speed and an effort, shares of the steady pace's (`body.rest-step-speed`, `body.faster-speed`, `body.rest-step-effort`, `body.faster-effort`).
- **The stride** is the pace's speed, times the capacity left at the altitude felt while climbing, times the climber's mass over their mass and their pack's. The body sets it on the slope physics each step (`Legs.stride`), which walks and climbs at its speed by steepness times the stride ([slope-physics.md](slope-physics.md) → Walking and falls). Exhausted, it's 0: the climber stops.

## Fatigue

- **Fatigue is the share of a climber's endurance spent**, from 0 to 1. On the move, it grows by the pace's effort over `body.steady-endurance` an hour, times the strain. At rest, it falls by all of it in `body.recovery-hours`, where the body still recovers: at a felt altitude at rest no higher than the death zone (`medicine.death-zone`). Above it, without oxygen, it stays as it is (a question: `body.death-zone-rest`).
- **The strain**: thirst, hunger and lost sleep each take a % of endurance, and a climber tires 1% faster for each. Thirst is the water lost past `body.dehydration-threshold` % of body mass, at `body.dehydration-cost` % for each 1% more; hunger, the days of energy short, at `body.hunger-cost` % a day; lost sleep, the hours awake past `body.sleepy-after`, at `body.sleep-loss-cost` % an hour. Water and energy run short at `body.water-loss` and `body.energy-expenditure` a day, and the hours awake grow, until drinking, eating and sleeping come with camp life (#53).
- **How tired**: tired from `body.tired`; profoundly tired from `body.profoundly-tired`, when they can only rest-step, whatever pace they chose; exhausted at 1, when they stop, until rest brings them back below profound fatigue.
- **On the move is the physics' word**: a climber who took a step in the last step (`ClimberView.moving`). The body runs before the physics in each step: it lives through the time since the last on what the physics did then, and sets the strides for this one. A scenario starts each climber's body (`BodyStart`): their mass and their pack's, their fatigue, and the water, energy and sleep they're short of.

## What the player sees

`Body.climber(id)` is how a climber feels (`BodyView`): their tiredness and their symptoms in words (out of breath at the faster pace, thirsty, hungry, sleepy), the pace they go at, and the one number a pulse oximeter on their finger reads, their SpO2 in whole %. Their fatigue, what they're short of and their capacity are never shown (spec.md → Simulation systems); the self-check shows the view (#25).

## Numbers

Every number is a record of `content/facts/body.json`, or of the route, time and medicine it's fitted to; `BodyFacts` reads them. `src/content/body-facts.test.ts` holds each coefficient to its facts through the model: the SpO2 measured on oxygen, at rest and climbing; the share of VO2max left at 3,000 m, 5,000 m and on the summit; the sections' spread of hours for the paces; and summit day for fatigue, tired by the survivors' summit hour, back at the South Col tired but able to go on, and profoundly tired on the way down from a summit at the hour of those who died. What no source answers is a question for an expert in the same file.

## Tests

The body's tests play it through `Expedition` on `testing/test-ridge.ts`, a rule that stands in for the slope physics and the oxygen system: climbers on a ridge at an altitude, on a flow, walking or not, with an hour of the mountain's time in each second of play. `testing/hike.ts` plays it, on the ridge's made-up numbers or, in `body-facts.test.ts`, on the game's. `src/content/body.story.test.ts` is the story on the mountain: a player at the faster pace gets ahead of their steady teammate, out of breath, and tires first.
