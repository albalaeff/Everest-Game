# Graphics

The picture: silhouettes and gradients in layers, with light and weather that tell the time and the wind ([../../spec.md](../../spec.md) → Graphics, sound and interface). #125's scene is the target for its beauty; these rules keep it readable and kind, on a phone as on a PC ([../guidelines.md](../guidelines.md) has the principles). The code is `src/rendering/`, whose own rules are in [../conventions/rendering.md](../conventions/rendering.md).

## Readable first

- **The play plane reads first: the climber, the rope, the anchors, the ladders.** What the player acts on has the clearest silhouette and the strongest contrast of light and dark on the screen, and the background the least; colour comes after. Valve made each of Team Fortress 2's characters read by its silhouette, and led the eye with light and dark ([Mitchell, Francke and Eng, Illustrative rendering in Team Fortress 2](https://www.cs.princeton.edu/courses/archive/fall07/cos597B/papers/mitchell-team-fortress.pdf)).
  - *In Everest:* `SlopeLayer` and `ClimberFigure`, until the final style (#86, #87).
  - *Check:* the screen in greyscale (Chrome DevTools → Rendering → Emulate vision deficiencies → Achromatopsia), and blurred: the climber, the rope and the next anchor are found within a second.
- **A line the player follows is at least 2 CSS px wide, whatever its real width, and 3:1 against the snow and the rock** ([WCAG 2.2, 1.4.11](https://www.w3.org/TR/WCAG22/#non-text-contrast): 3:1 for the graphics needed to understand). A thin line gets a dark edge, like a road on a map, so it reads on snow and on rock alike.
  - *In Everest:* the fixed rope is 7 cm wide (`SlopeLayer.ROPE_METRES`), so about 1.4 px on a phone held sideways (20 m of slope in 390 px), and its orange (`0xff6f3c`) is 2.5:1 on the snow (`0xeef3f9`); the anchors and the ladders' rails need the same check (#86).
  - *Check:* a Vitest test computes the contrast of each pair in the palette; a story reads the rope's width in pixels on each phone.
- **The player's own climber is found in a second, and by more than colour.** Every climber is drawn, the player's in the brighter suit ([../conventions/rendering.md](../conventions/rendering.md)); it stays at the camera's anchor, and has a shape the others don't: a mark above it, its own headlamp's beam, its name in co-op.
  - *In Everest:* the player's suit (`0xe8412c`) is 3.6:1 on the snow and the others' (`0xf5c518`) 1.5:1, and they differ by colour alone (`ClimberFigure`); the mark and the names come with #87 and #78.
  - *Check:* a crowd on the ridge (#40), in greyscale: the player's climber is found in a second.
- **The night is dark, and what the player needs still shows.** Summit night is an almost black screen with the headlamp's cone ([../../spec.md](../../spec.md) → Graphics): the cone lights the rope and the snow ahead, the lights of other groups show the queue, and a brightness setting before the first night lets the player set the darkest shade they can still see.
  - *In Everest:* #35.
  - *Check:* on the phones of #92 at half brightness, indoors and in daylight.

## Depth in layers

- **Five to seven layers, each farther one paler, hazier and slower** ([../../spec.md](../../spec.md) → Graphics), as the air makes far mountains look, and as [Alto's Adventure](https://en.wikipedia.org/wiki/Alto%27s_Adventure) and Limbo draw them. Only the play plane has full contrast and detail; a far layer has less of both, and costs less to draw.
  - *In Everest:* the depths and colours of `skyline-layer.ts`; Low draws none of the optional layers (`GraphicsQuality`).
- **The foreground never hides the climber or the rope ahead.** It passes low on the screen, or thins where it crosses them; it moves faster than the slope, and motion pulls the eye, so it's sparse.
  - *In Everest:* the foreground is drawn in front of the climber, at depth 1.5 and alpha 0.9 (`skyline-layer.ts`).
  - *Check:* a story walks the section and reads the suit's colour at the climber's place with `window.everest.pixelAt`.

## Colour and light

- **The palette is named, in one place, and a strong colour means one thing.** The world is low in saturation, the snow, the rock and the sky, and strong colour is kept for what matters: the player's suit, the rope, the turnaround mark, danger. Hypoxia mutes the colours ([../../spec.md](../../spec.md) → Graphics), so meaning never rests on saturation alone: shape, and light and dark, carry it. Where colours must tell groups apart for everyone, as the co-op players' suits, they come from Okabe and Ito's palette, made for colour-blind readers: `#E69F00`, `#56B4E9`, `#009E73`, `#F0E442`, `#0072B2`, `#D55E00`, `#CC79A7`, `#000000`.
  - *In Everest:* each layer has its colours as literals (`slope-layer.ts`, `climber-figure.ts`, `skyline-layer.ts`, `sky-layer.ts`): one `Palette` ([../conventions.md](../conventions.md) → Objects: one thing, one class) comes with #86, and the contrast check above with it.
- **Light tells the time and the altitude.** The sky changes with the time of day and darkens with altitude ([../../spec.md](../../spec.md) → Graphics); one sun lights every layer from the same side, and a dawn behind the climber rims them with light (#125).
- **Gradients are dithered, so they don't band** (#125). A dark gradient shows steps on an 8-bit screen; noise of less than one step of colour hides them ([Anisoptera Games, banding and dithering](https://www.anisopteragames.com/how-to-fix-color-banding-with-dithering/)).
  - *In Everest:* the sky's gradient, `#0b1d3a` to `#6f94c6` (`sky-layer.ts`, #86).
  - *Check:* by hand, the night sky on a phone at full brightness.

## Weather and effects

- **An effect tells something, or keeps out of the way.** The plume tells the wind's strength, the snow's slant and speed the wind at the climber, a chain of headlamps the queue ahead ([../../spec.md](../../spec.md) → Graphics); an effect that tells nothing is soft and sparse, and never covers the play plane.
  - *In Everest:* the snow falls in front of everything (`SnowLayer`), so it stays small and thin; the weather comes with #39 and #86.
- **Low quality loses beauty, never information.** What an effect tells stays at every quality level: Low draws it more cheaply, never not at all.
  - *In Everest:* Low draws no flakes (`GraphicsQuality`): once the snow tells the wind (#39, #86), Low keeps a few, or another cue tells it.
  - *Check:* each effect's story runs at Low too, and reads the same information from `#slope`'s data attributes.
- **A whiteout hides the mountain, not the rope in the climber's hand.** Fog and drifting snow can hide the route ahead, as on the mountain, but the rope the climber is clipped to and their own gear always show.

## Motion

- **Motion is drawn between the steps.** The expedition takes 20 steps a second (`SimulationClock.STEPS_PER_SECOND`) and a screen shows 30 to 120 frames: drawn at its last step, a climber at 60 frames a second moves one frame in three. So the scene draws each climber between their last two steps, by how far the next has come (`StepPacer.progress`) ([Fiedler, Fix your timestep](https://gafferongames.com/post/fix_your_timestep/)).
  - *In Everest:* `GameLoop` and the scene draw at the last step, and `StepPacer.progress` is unused (#90).
  - *Check:* a Vitest test of the positions drawn between two steps; by hand, a slow walk at 60 frames a second.
- **The animation shows the body's state, and never hides it.** The rest step, and breathing that speeds up with altitude ([../../spec.md](../../spec.md) → Graphics and Sound): a tired climber moves tired, and a clip is seen to happen (#87).
- **The camera is calm, and shows what's ahead.** It eases after the climber, never shakes unless the player turns shaking on ([XAG 117](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/117)), and looks ahead where the climber is going, so the next anchor and the rope ahead are in view on the way down as on the way up ([Keren, Scroll back, GDC 2015](https://gdcvault.com/play/1022243/Scroll-Back-The-Theory-and)). Almost a third of Everest's deaths come on the descent ([../../spec.md](../../spec.md) → Real accidents as training scenarios).
  - *In Everest:* `Camera` keeps the climber a third across, which leaves two thirds of the screen ahead walking right and one third walking left; the look-ahead comes with #86.
  - *Check:* a Vitest test of `Camera`: walking left, the anchor moves towards the right.
- **The body's effects build slowly, and the screen stays readable.** Hypoxia's narrowing view and muted colours grow over minutes, never in a jump; the HUD and the play plane stay readable at their worst; with motion reduced, nothing pulses ([usability.md](usability.md) → Accessibility, #43, #37).
