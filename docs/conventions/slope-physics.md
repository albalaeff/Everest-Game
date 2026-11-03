# The slope physics

`src/physics/` moves the climbers over the ground and holds them on fixed ropes ([../../spec.md](../../spec.md) → Technical architecture: "our own simple physics, rope using Verlet integration"). It's a rule of the core, `SlopePhysics`, run inside its step ([simulation-core.md](simulation-core.md) → Rules), and it keeps the core's rules for the same result everywhere. It follows [../conventions.md](../conventions.md) → Modules, Objects, and Time and chance; these are its own rules.

## The slope

- **The ground** (`Terrain`) is a line of points in metres, from left to right: `x` across and `y` up. `x` never goes back, so a wall is two points at the same `x`, and an overhang can't be drawn. Past its ends the ground goes on flat.
- **A scenario lays out a section** (`SlopePhysics.start`): its ground, its ropes by where their anchors are along the ground, and the climbers standing on it. The physics works them out in the layout's order.
- **A climber is a point at their feet.** On their feet, they're somewhere `along` the ground; falling, they're a body under gravity. `climber(id)` is how the rendering and the rules above see them, `rope(id)` where a rope lies.

## Walking and falls

- **Walking goes by the steepness ahead.** `walkingSpeed` gives the speed along the ground, and a step stops at a corner, so the next one takes the new ground's speed. Ground steeper up than the curve's last point stops the climber; ground steeper down than its first is a fall.
- **A slip is a draw**, of `slipChance` per second scaled to the step, made only where that chance isn't zero: walking on flat ground draws nothing, and a change in where the physics draws changes every draw after it (simulation-core.md → The same result everywhere).
- **A fall is a body** under Verlet integration in `Slope.SUBSTEPS` sub-steps a step, starting at the walking speed. The ground pushes it back out, and friction takes from its slide what Coulomb's law gives, so a gentle slope stops it and a steep one doesn't. In the air it loses no speed: a climber hanging on a rope swings until the ground stops them.
- **A fall is over when the body lies still on the ground** for a whole step (`Slope.REST_SPEED`), and the climber stands where it lies. Its record (`Fall`: the step it began on, the drop and the top speed) stays in the climber's view, for the rules above to read.

## The rope

- **A fixed rope is a chain of points** about `Rope.LINK_METRES` apart, between two anchors. A link can only be shorter than its share of the rope, so the rope sags, lies on the ground with friction and swings, and never stretches. Each point is tethered to both anchors by the rope between, so a long chain holds in a few rounds. The ropes move once a step, after the falling bodies.
- **A cowstail clips to the nearest rope within its reach**, on a climber on their feet, through a carabiner that slides along it. Walking takes the climber only where every rope they're clipped to lets them.
- **The rope holds a climber by its length**: no further from its two anchors together than the rope and two cowstails, an ellipse around the anchors. That's a carabiner sliding on a rope without friction, and a heavy climber can't stretch it as they would a chain of light points. Each climber is held as if alone on the rope, and the rope follows them: the point nearest the carabiner is pulled to within a cowstail.
- **A rope over a bulge holds a little low**, since the ellipse goes straight from anchor to anchor: anchors go at the edges, as on the mountain.
- **A rope that lies still waits.** Once no point of it moves faster than `Slope.REST_SPEED` in a step, it skips its steps until a climber clips to it, so the ropes of a whole section cost nothing until used.

## Numbers

- **The mountain's numbers are handed in** through `SlopeSettings` (conventions.md → Data, not literals): gravity, friction, the cowstail's reach, and the walking speed and slip chance by steepness, as `[degrees, value]` points. Their facts records, and the first real ground, come with the first section of the route, the Khumbu Icefall (#26).
- **The engine's numbers are in the code**, as the core's step is: `Slope.SUBSTEPS`, `Slope.ITERATIONS`, `Slope.REST_SPEED` and `Rope.LINK_METRES`. No source states them; they're how finely the physics works the mountain out.
- **Steepness is a sine** (`Steepness`): `ofWay` divides, and `ofDegrees` sums a series of its own, since `Math.sin` rounds differently in each browser. A `SteepnessCurve` interpolates over the sine and holds its end values past its ends.

## The same result everywhere

The physics uses the core's maths alone, and imports only itself and the core. `physics-purity.test.ts` checks both, with the core's checks (`src/simulation/testing/module-code.ts`), and `npm run typecheck` checks it with no DOM in scope, as it does the core. A save is plain JSON: the tests save, go through `JSON.stringify` and back, and resume exactly.

## Tests

The tests play the physics through `Expedition`, on the made-up numbers and ground of `testing/test-mountain.ts`: no game code imports it. `slope.story.test.ts` is the story: two friends on a steep fixed rope, one of them careless.

Still to come: anchors between ropes, the jumar and ladders (#21), the pace (#22), the ice axe and crampons (#55), and the drawing (#19), which is where the physics first meets the page.
