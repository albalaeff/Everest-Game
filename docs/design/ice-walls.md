# The Icefall's walls of ice

Built on 21–22 Nov 2026: issue #290. albalaeff asked, with a night's screenshot of the crux: "make the ice look more obviously like ice… At night, it's almost impossible to tell that you're supposed to pull out your ice axe and climb here. Even in daylight, it's barely clear. Make these ice walls steeper, taller, more intimidating, and more visually striking." The walls now look like the Icefall's ice in its photos, show at night, light up in a headlamp, and the three steps climbed on the tools are almost twice as tall.

## What was tried, and turned down

- **A flat blue face with white reflections and a bright edge.** albalaeff: "new look is bad still unrealistic, take inspiration from these pictures of icewalls, they can be icy, or covered by snow sometimes, uneven, different", with four photos: walls hung with fluted columns and icicles, pale white-blue with turquoise in the hollows; a wall of dripping flutes under a snow slope; ridges and slopes of ice pitted all over with scallops.
- **Columns drawn as shapes, each lit down one side.** albalaeff: "what are these lines. its really bad. icewalls are still unrealistic too": blue stripes ran down a crevasse, where a ladder too steep to walk had its crevasse drawn as two walls, and the columns were flat.
- **A relief worked out and lit**, the third try, is what's built; albalaeff on 22 Nov: "ice looks good".

So a wall's ice isn't drawn as shapes: it's worked out as a surface and lit, and judged against the photos.

## What the player sees

- **By day**: pale, scalloped ice, with curtains of columns hanging side by side, a crease between each two; tiers down the face, each ending in a fringe of thin icicles over a band in the overhang's shade, deep blue; snow under the lip and banked against the foot. No two walls alike: grey-white or aqua, more fluted or more scalloped, and some under snow, plastered tier by tier with the overhangs bare.
- **The steps climbed on the tools** are always bare ice, lean out under their lip in a bulge with icicles of its own, and carry the scars of the picks and front points of the climbers before: they say where to climb. They are 4.6 m (the Popcorn's), 5 m (the maze's) and 6 m (the crux's) high; they were 2.5, 2.5 and 3.5 m.
- **At night** the ice shows by what it throws back of the sky's light, a pale fluted face in the dark; where a headlamp falls on it, or spills its light near it, it shows in the day's colours, with glints at its highlights.

## How it works

- `IceRelief` (pure, on `Noise`): each pixel's height off the wall from the columns, the lobes, the scallops, the tiers and their icicles, then lit from above and the picture's left; two pictures come of it, the ice by day and what it throws back at night. `IceWall` lays the face out, keeps it in its own block of the glacier, and says how brightly the lamps light it height by height. `SlopeLayer` makes textures of the pictures and shows the day's again in strips where the lamps light it ([conventions/rendering.md](../conventions/rendering.md) → The ground is the glacier's).
- **The steps are taller by the ground before them lying lower**: the Popcorn's icy hummock runs level to its step's foot, the maze's ramp climbs less, the crux's ledge is 2.5 m lower and its ladder shorter. Nothing past the maze's step moves along the ground, and the route's rise is the same.
- **Refit to keep the outcomes** (`content/facts/technique.json`, fitted 22 Nov): the speeds up the ice and down its rope (`ice-climb-speed` 0.2 → 0.35 m/s, `rappel-speed` 0.6 → 1.05 m/s), so the crossing keeps the sources' hours; and the chances that a metre climbed and a swing of the axe alone slip (`ice-climb-slip` 0.004 → 0.0022, `axe-swing-slip` 0.01 → 0.0055), so a wall's metres and swings bring a careful climber off it as often as before.

## Open

- A careful climber on the axe alone still slips on a step more often than before, 0.42 times a crossing against 0.22 over 100 seeds: they stand longer on their front points, behind Pemba. Slips elsewhere fell from 0.92 to 0.45, the Popcorn's icy hummock now being level. Say if the steps should be gentler or harder.
- The reliefs take about a tenth of a second to work out for the whole route on a desk, once, as the slope is drawn; nobody has timed it on a phone.
- A novice was left hanging on their rope, never hauled out, in 2 crossings of 40 (none in 40 on the route before): not looked into here.
