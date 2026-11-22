# The glacier's ice under the route

Built on 22 Nov 2026: issue #306. albalaeff asked, with a night screenshot of the Popcorn's blue ice in a headlamp: «сделай вот этот лед тоже не таким примитивным, а красивым и реалистичным (везде)» (make this ice too not so primitive, but beautiful and realistic, everywhere). The ice under the route was seven flat bands of colour under a white cap, and the route's blue ice a blue strip with a sheen line and dashes; beside the walls of #290 they looked primitive, and at night the hour's navy flattened both. Now the cut through the glacier looks like the Icefall's crevasse walls in photos, all along the route, by day, at night and in a headlamp.

## What was tried, and turned down

- **A scalloped relief over the whole face**, as on the walls: a ridged noise read as a maze of worms, not ice. A cut through a glacier isn't a melted face: it swells a little and no more.
- **Each layer picked at a pixel's middle**: layers thinner than a pixel came out as stripes and dashes, a barcode. Each pixel now shows the average of the layers it covers.
- **The bare ice as pale as the ice under the snow**: lit from above the same way, the blue ice came out near white at the top and the player lost where the footing goes. Clear ice up to the surface is blue; what makes the ice under the snow pale is the snow's and the firn's light, and bubbles. The difference fades with depth, or it ran down to the glacier's foot in a stripe.

## What the player sees

- **By day**, under the snow and its crusts, a band of grey-white firn with fine layers, and under it the ice: packets of white bubbly ice and clear blue ice, finer layers in them fading in and out, a line of dust here and there, bubbles; near white under the firn, turquoise, blue, navy deep down. The layers lie along each block of the glacier, tilted with it, so they meet the snow at a slant and break off at a wall's foot or a crevasse's floor, a seam of clear ice between; healed cracks and white fractures cross them.
- **The route's blue ice** is clear ice up to the surface, bluer than the snowy ground around it, glazed, hollowed into sun cups along its top, with hairline cracks down from it; the snow runs out onto it at its ends.
- **At night** the ice is the dark navy of the snow's shade; the blue ice's top shows as a sheen along its cups, from afar; where a headlamp's beam falls on the ground, its light comes down into the ice and the ice there shows its turquoise and its layers, spreading and fading over a metre or so, and the cups' rims glint in the beam.
- **On Low** the ice keeps its flat layers and the blue ice its strip: nothing the player needs is in the ice's look.

## How it works

- `GlacierIce` (pure, on `Noise`, `Wander` and the snow cap of `IceBody`) works the cut out pixel by pixel, in strips that hang from the surface: the top 3 m at 32 pixels a metre, the rest down to 18 m at 10, about 7 MB of pictures for the whole route. Its blocks part at each wall of the surface, in the middle of each crevasse and every 16 to 38 m between; each fits its layers to the line its surface follows, tilted past it a little and folded. `GlacierIce.hang` lays a strip on a mesh along the surface, a wall's two corners at one x.
- `SlopeLayer` works out one strip a frame, the nearest the view first, so the picture opens at once and never stops for it: about 4 ms a strip on a desk, 50 strips for the route.
- `GlacierDrawing` draws each strip with a small program of its own: the picture in the hour's tint, plus the headlamps' light let into the ice under where each beam lights the ground (the beam's cone, at three points of the surface over each pixel, so it spreads as it goes down) and round each lamp.
- `GraphicsQuality.glacierIce`: Medium and High. `Palette.GLACIER`, the flat layers, has the worked-out ice's colours on the whole, so the two run into each other at the ice's foot and past the section's end.

## Open

- The blocks and towers of ice behind the route and in front of it are still flat shapes.
- Nobody has timed a strip on a phone; Medium works it out too.
