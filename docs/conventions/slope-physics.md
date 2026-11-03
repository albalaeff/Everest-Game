# The slope physics

`src/physics/` moves the climbers over the ground and holds them on fixed ropes ([../../spec.md](../../spec.md) → Technical architecture: "our own simple physics, rope using Verlet integration"). It's a rule of the core, `SlopePhysics`, run inside its step ([simulation-core.md](simulation-core.md) → Rules), and it keeps the core's rules for the same result everywhere. It follows [../conventions.md](../conventions.md) → Modules, Objects, and Time and chance; these are its own rules.

## The slope

- **The ground** (`Terrain`) is a line of points in metres, from left to right: `x` across and `y` up. `x` never goes back, so a wall is two points at the same `x`, and an overhang can't be drawn. Past its ends the ground goes on flat.
- **A scenario lays out a section** (`SlopePhysics.start`): its ground, its ropes by where their anchors are along the ground, its ladders by where their ends are, and the climbers standing on it. The physics works them out in the layout's order.
- **A section is drawn at 1/`time.compression` of life**, its length and its height, so a climber walking at real speed takes its real hours, as the mountain's clock runs ([simulation-core.md](simulation-core.md) → Real time). The layout gives the real altitude of its two ends (`SlopeLayout.altitude`), and `SectionScale` reads the altimeter from it: the real rise by the share of the section's width crossed, and the drawn ground's own ups and downs at life size, so a 10 m fall reads 10 m. `climber(id).altitude` is that reading. Each section's test holds its drawn rise to the ratio (`SectionScale.compression`).
- **A climber is a point at their feet.** On their feet, they're somewhere `along` the ground or on a ladder; falling, they're a body under gravity. `climber(id)` is how the rendering and the rules above see them, `ropes` and `ladders` name what's laid, and `rope(id)` and `ladder(id)` say where a rope or a ladder lies.

## Walking and falls

- **Walking goes by the steepness ahead.** `walkingSpeed` gives the speed along the ground, and a step stops at a corner, so the next one takes the new ground's speed. Ground steeper up than the curve's last point stops the climber; ground steeper down than its first is a fall.
- **A slip is a draw**, of `slipChance` per second scaled to the step, made only where that chance isn't zero: walking on flat ground draws nothing, and a change in where the physics draws changes every draw after it (simulation-core.md → The same result everywhere).
- **A fall is a body** under Verlet integration in `Slope.SUBSTEPS` sub-steps a step, starting at the walking speed. The ground pushes it back out, and friction takes from its slide what Coulomb's law gives, so a gentle slope stops it and a steep one doesn't. In the air it loses no speed: a climber hanging on a rope swings until the ground stops them.
- **A fall is over when the body lies still on the ground** for a whole step (`Slope.REST_SPEED`), and the climber stands where it lies. Its record (`Fall`: the step it began on, the drop and the top speed) stays in the climber's view, for the rules above to read.

## Ladders

- **A ladder joins two points of the ground** (`Ladder`), across a crevasse or up a wall, its ends laid by how far along the ground they are, `from` the one further back. Walking crosses on it, not on the ground between its ends: at its end, the ground under it is no way on, so nobody walks off the edge beside it.
- **A key moves a climber along a ladder when it points more along it than across**, toward the end it points to: left and right across a crevasse, up and down (W/S) up a wall, and a diagonal on either. A ladder's ends stop a step, as the ground's corners do, and a climber who reaches an end steps off onto the ground there.
- **On a ladder a climber goes at `ladderSpeed` and slips at `ladderSlipChance`**, by its steepness the way they go. A slip is a fall past it, since a falling body meets only the ground: off a ladder over a crevasse, the climber falls in unless a rope holds them, as a Sherpa fell in 2012.

## The rope

- **A fixed rope is a chain of points** about `Rope.LINK_METRES` apart, between two anchors. A link can only be shorter than its share of the rope, so the rope sags, lies on the ground with friction and swings, and never stretches. Each point is tethered to both anchors by the rope between, so a long chain holds in a few rounds. The ropes move once a step, after the falling bodies.
- **A cowstail clips to the nearest rope within its reach**, on a climber on their feet, and `unclip` takes it off. Walking takes the climber only where every rope they're clipped to lets them.
- **The first cowstail ends in the jumar, the second in a carabiner**, as climbers rig them. The carabiner always runs along its rope. The jumar runs only while the climber's hand slides it (the `jumar` action, held) and they're on their feet; otherwise it grips the rope where it is, in a fall too.
- **The rope holds a climber by its length**: no further from its two anchors together than the rope and two cowstails, an ellipse around the anchors. That's a carabiner sliding on a rope without friction, and a heavy climber can't stretch it as they would a chain of light points. Each climber is held as if alone on the rope, and the rope follows them: the point nearest the carabiner is pulled to within a cowstail.
- **A jumar that grips holds the climber by the rope on each side of it**: no further from each anchor than the rope between and a cowstail, a circle around each. A slip on the jumar stops a cowstail and its share of the slack below it; on the carabiner alone, it slides down to the anchor below.
- **Ropes in a line share their anchors**: the next rope starts where one ends. A clipped climber is stopped past the anchor, where the next rope is the nearest, so `clip` takes it. The safe way on is the second cowstail onto the next rope before the first comes off the old one. Taking the last one off is allowed, and a slip after that isn't held.
- **A rope over a bulge holds a little low**, since the ellipse goes straight from anchor to anchor: anchors go at the edges, as on the mountain.
- **A rope that lies still waits.** Once no point of it moves faster than `Slope.REST_SPEED` in a step, it skips its steps until a climber clips to it, so the ropes of a whole section cost nothing until used.

## Numbers

- **The mountain's numbers are handed in** through `SlopeSettings` (conventions.md → Data, not literals): gravity, friction, the cowstail's reach, and the speed and slip chance by steepness on the ground and on a ladder, as `[degrees, value]` points; and through the layout, the altitude of the section's ends. Their facts records, and the first real ground, come with the first section of the route, the Khumbu Icefall (#26); until then the speeds and slips are questions for the guide (`technique.speed-by-steepness`, `technique.slips-by-steepness`), and so are each section's hours and length (`time.section-hours`).
- **The engine's numbers are in the code**, as the core's step is: `Slope.SUBSTEPS`, `Slope.ITERATIONS`, `Slope.REST_SPEED` and `Rope.LINK_METRES`. No source states them; they're how finely the physics works the mountain out.
- **Steepness is a sine** (`Steepness`): `ofWay` divides, and `ofDegrees` sums a series of its own, since `Math.sin` rounds differently in each browser. A `SteepnessCurve` interpolates over the sine and holds its end values past its ends.

## The same result everywhere

The physics uses the core's maths alone, and imports only itself and the core. `physics-purity.test.ts` checks both, with the core's checks (`src/simulation/testing/module-code.ts`), and `npm run typecheck` checks it with no DOM in scope, as it does the core. A save is plain JSON: the tests save, go through `JSON.stringify` and back, and resume exactly.

## Tests

The tests play the physics through `Expedition` (`testing/climb.ts`), on the made-up numbers and ground of `testing/test-mountain.ts`: no game code imports either. A test mountain is drawn at life size from `TestMountain.FOOT` unless the test says otherwise. `Climb.under` goes on from a save on other numbers, a gust that makes every step a slip, say. The stories: `slope.story.test.ts`, two friends on a steep fixed rope, one of them careless; and `fixed-ropes.story.test.ts`, two Sherpas on a ladder over a crevasse, one unclipped, and two clients going up a line of fixed ropes on the jumar, one careless at the anchor.

Still to come: climbing a rope where there's no ground (up a wall, out of a crevasse), the pace (#22) and the ice axe and crampons (#55). The rendering draws what the physics shows ([rendering.md](rendering.md)).
