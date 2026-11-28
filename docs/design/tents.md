# Tent design

The camps' tents were rebuilt on 17–18 Nov 2026: true to size and detailed outside, with a button to go in, an entering animation, a detailed inside where every act is animated, and resource management. Issue #258, pull request #259 (https://github.com/albalaeff/Everest-Game/pull/259), merged into `develop` with CI green. On 18 Nov the person was redrawn to look real and the panel turned into pictures and few words: issue #264, pull requests #265 (https://github.com/albalaeff/Everest-Game/pull/265) and #266 (https://github.com/albalaeff/Everest-Game/pull/266). The arms coming away from the body were fixed the same day: issue #267, pull request #268 (https://github.com/albalaeff/Everest-Game/pull/268). The hands' grips and the movements of melting snow, cooking, a drink and a bar were reworked the same day too: issue #269, pull request #270 (https://github.com/albalaeff/Everest-Game/pull/270), merged into `develop` with CI green. That evening the hands became real hands in three dimensions and every movement was checked frame by frame: issue #274, pull request #276 (https://github.com/albalaeff/Everest-Game/pull/276). On 19 Nov the neck was redrawn to join the head in every pose (issue #277, pull request #280, https://github.com/albalaeff/Everest-Game/pull/280), and the whole game went twice as fast, the tent's chores with it (issue #278, pull request #282, https://github.com/albalaeff/Everest-Game/pull/282). All of these are merged into `develop` (checked 21 Nov).

## Outside

- An expedition dome for three: floor 2.64 m × 2.16 m, peak 1.23 m (The North Face VE 25), with a vestibule in front (about 0.93 m) and a smaller one behind. Before, a tent was a 2 m × 1.5 m orange triangle.
- Gold fly over crossed poles, grey vestibules, a zipped door, a vent, a valance, guy lines tied to rocks on the rubble and staked in the snow; a barrel, a duffel, oxygen bottles, a wand or an axe beside it.
- Base Camp also has its big dome (3.94 m wide, 2.11 m high) and rows of other expeditions' tents, smaller and hazier, on the side away from the route.
- Tents sway on the gust; at night their rooms glow, and an occupied one shows its dweller's shadow.
- Two tents are pitched at Base Camp (doors 3.625 m and 8.25 m along the ground) and two at Camp 1 (660.375 m and 665 m).

## The way in

- [Enter the tent] is pinned over the tent whose door the climber stands at (within 1.25 m), with the key T on it where there's a keyboard. The menu's [Tent] and T do the same.
- On the slope: a step to the door, the flap opens, down on hands and knees, in, the flap falls (2.6 s); out the same way back (2.4 s). The Sherpa waits outside.

## Inside

- The tent cut open from end to end, drawn as SVG at 300 px a metre (view 1400 × 800, floor at y = 640), from the same profile as the slope's tent.
- Outside the cut: the sky, peaks, neighbours' tents and the ground (rubble at Base Camp, snow above), coloured by the hour and the weather; falling snow when it snows.
- Vestibule: crampons, boots, the stove on its board with a pot and a mug. The stove burns there with the door open.
- Room: foam mat and pad, sleeping bag and pillow, the pack with its axe, second tool and jumar, mesh pockets, a gear loft, socks on a line, a lamp, a radio, bottles, meal pouches, a snow sack; the guitar leans on the wall at Base Camp.
- Night: the tent is dark and lit by its lamp; the lamp is out while they sleep.
- Layout: on a PC the picture is above and the panel along the bottom; on a phone on its side the panel is down the right; upright the picture is on top. Where the whole tent doesn't fit, the picture follows what the person does.

## The person (#264, #267, #269, #274, #277, #285)

- The slope's climber, sitting: the bones of `ClimberPose` at 300 px a metre, and the quilted down suit of the slope's front view, each part shaded toward the lamp and each baffle puffed. The hood is down and the collar open on the base layer; down booties.
- The head is three-dimensional, at a real head's size and proportions, turned a little toward the stove. The face is drawn front on from its measurements and wrapped round the head: no outlines, but soft light and shade, a few days' stubble, sunburn, the goggles' paler band and a ribbed beanie.
- The neck (#277): drawn each frame from the base layer's collar up into the head, under the jaw and the ear (`DwellerNeck`), so it bends as the head turns, tilts and sways, and never shows beside the jaw. albalaeff found the old one "awful": a pale wedge beside the jaw whenever the body leaned. Lit on its near side, in the jaw's shadow, the stubble a little way down it, the muscle from behind the ear. The base layer's collar is a man's neck wide, round at its ends, its back drawn behind the neck.
- The measurements are `Features` in `src/page/tent/dweller-head.ts`: cheeks, jaw, chin, eyes, brows, nose, lips, ears, stubble. albalaeff's plan: players will build and customise their own character in the game later, face parts included, so a character editor sets these. Colours are a set of their own (`Appearance`): suit, yoke, skin, hair, eyes, hat, booties, base layer.
- The upper arms are drawn behind the body with their whole round tops (#267). The shoulder always covers the joint, so an arm never comes away from the body, whichever way it turns. The forearms and hands are in front. Clipping the sleeves' tops at the shoulders instead (in #266) left a flat cut and a gap whenever an arm left the side.
- Drawn in code, by the rule of the time; albalaeff lifted it on 28 Nov 2026 ([../design.md](../design.md) → Decided in chat).

### Hands (#274)

- After #269, albalaeff found the hands "completely awful" in the drink (the hand a flat band across the bottle, the forearm a stub) and asked for every animation to be better still. So each hand is now a real hand in three dimensions (`HandBones`, `src/page/tent/hand-bones.ts`).
- A median man's right hand from ANSUR II (2012): 193 mm from the wrist's crease to the middle fingertip, 88 mm across; the fingers' bones from NIOSH's hand survey. A palm, four fingers of three bones each, a thumb of three. The left hand is its mirror image.
- Each grip closes every finger's joints until the finger touches what it holds, and the thumb round it the other way (or over the fingers round a thin handle): round a bottle or a lump of snow; tight on the stirring spoon, the pot's handle, a lighter; round the guitar's neck; a pen's pinch for the eating spoon, a bar, the pick, the pouch's seal; a flat pouch by its side (fingers over its face, thumb behind) or by its top, hanging under the fingers; open, relaxed or spread flat.
- Drawn as it's seen (`DwellerHands.drawn`): each bone a rounded, tapered shape, shorter as it points at the viewer; nails where a fingertip's back faces the viewer; the palm round its rim; each part in front of or behind the sleeve's cuff and the held thing by its depth. So the back, the palm and the side show as the hand turns, and a bottle is in the fingers.
- What's held is drawn in its own frame, upright or tipped as the pose has it; the pot, carried by its near handle, is behind the arm. The bottle, the pouch, the pot and the spoon are the tent's own drawings: what a hand takes is hidden where it stood. A pouch set down on the lap stands there.

### Legs (#285)

- albalaeff found the legs "cringe": three flat parts slid between two hand-placed drawings, the knees folded flat on the mat. Each leg is now a real leg in three dimensions (`LegBones`, `src/page/tent/leg-bones.ts`): the hip, the knee, the ankle, the heel, the ball of the foot and the toes, at a median man's lengths from ANSUR II (2012): thigh 409 mm, shin 419 mm, ankle 73 mm off the floor, foot 271 mm, its ball 201 mm from the heel.
- It's set by its joints' angles, in the order clinicians measure the hip (Grood and Suntay): bent forward, swung out, turned out; the knee bent; the ankle pointed or flexed. Each stays within a healthy man's range (the CDC's study, men aged 20 to 44): the hip bends 130° forward and 17° back, the knee 138°, the ankle 13° up and 55° down.
- Sitting cross-legged within those ranges, a man in a down suit has his knees well up, about 16 cm above his hips, with the pelvis rolled back 30°. The thighs rise out to the knees, and the shins cross with the right one in front by about 13 cm (`DwellerLegs`). The hands rest on the raised knees.
- Kneeling to crawl in and out, the hips rise to a kneel's height (100 px, about 33 cm above the seat), with the thighs upright under them, the knees on the mat, the shins back along it and the toes pointed. The way between the two eases every joint's angle and the hips' turn, so no leg jumps or bends past its range.
- Drawn as seen: each part as long as its bone, shorter as it points at the viewer, the far leg whole before the near one.
- The tests hold the legs to their ranges and to a smooth move frame by frame, with no foot through the mat and the shins crossing apart.

### Arms (#269, #274)

- An arm is the upper arm, the forearm and the hand, in three dimensions and drawn flat, so an arm that reaches toward the viewer is shorter.
- The hand turns to what it holds (a held thing points exactly the way the pose aims it); the arm bends to the wrist that puts there. The elbow is drawn toward where it leaves the wrist straight, less the higher that is (never up as a wing) and less near the arm's own line; otherwise it hangs the way the pose says.
- An empty hand is put by its palm as it rests, so what it's ready to take changes nothing until it reaches for it.
- A pose's elbow way stays well off the arm's line, where it's clear which side of the arm the elbow is on; from one side to the other it turns round behind the arm. Elbow ways and a hand's back are turned round from one key to the next, never mixed, so they never shrink to nothing and flip.

### Movements (#269, #274, #278)

- Each movement is its key poses in time, eased from one to the next along curves, the body leaning in and the head and the eyes following the hands. Checked frame by frame at 60 a second with probes that report each act's worst hand turn, wrist bend, end-on forearm and elbow jump.
- A chore is seen in its parts, each begun as the chore gets so far and each ending where the next begins. Since #278 a chore takes half as long on screen as before (melting snow 10 s of play, cooking 12.5 s), and its parts play briskly to fit (`DwellerActs.briskness`), never more than twice as quick as drawn. The parts' times below are as drawn.
  - Melting snow: the stove lit with a lighter (2.2 s); then, round and round, the pot stirred with the spoon in the fist, the elbow under the arm; the spoon left standing in it, the fingers down into the sack, a lump carried palm up to the pot and dropped palm down (7.2 s a round).
  - Cooking: the stove lit; the bottle taken from the floor, its water poured into the pot, and stood back (4.8 s); the hands held to the flame (3.2 s); a pouch lifted by its top from the pile (the wrist was bent back 127° grabbing it by its side), set down on the lap and held there while the other hand lifts the pot off the stove, then taken again by its side, leant to the pot and filled, the pot put back and the stove out (5.3 s); the pouch sealed, finger and thumb along its top (2.2 s); eaten from on the lap, the spoon down into it and level up to the mouth, chewing between (2.4 s a spoonful).
- A drink (3.5 s): the bottle from the floor to the lips, tipped with the head back, the elbow out, and stood back. A bar (3.6 s): out of the chest pocket, two bites, and back. A hand in the pack reaches round the shoulder, not past it.
- When the act changes otherwise, a chore begun or cut short by a drink, the pose turns into the new one's over a third of a second; a hand going from one grip to another goes slack in between, so it doesn't spin (it turned up to 164° in a frame before). A drink, a bar or a hand in the pack over a chore leaves the stove burning.
- The tests hold every movement to: a held thing within 1° of its aim; a wrist bent no more than 125° (the fretting hand), and past an easy 75° in under a tenth of the frames where the hands reach out in front; a forearm seen end on for 4 frames at most; no elbow over the shoulder but reaching out over the stove and stretching; no hand turning more than 26° a frame, nor 35° between acts.
- Left as it is (#274): getting up off the hands and knees, and turning to the pack, an elbow still swings round behind its arm fast (up to 80 px in a frame).

## The panel (#264)

- Pictures and few words. Where and when, and how the climber feels: a mark and a word each (Fresh, Thirsty, ...).
- The stores are drawn as the pack draws them, plus a gas canister and a meal pouch of their own, each with its number. Water and gas also have a gauge.
- Each chore is a button with its mark in a ring and a word: [Melt], [Cook], [Nap], [Sleep], [Play].
  - What it takes and gives shows as marks with numbers.
  - The mark of what it lacks is crossed out, not red: red is kept for danger.
  - In hand, the ring fills with its progress, with the time left and a stop.
- Each button and row says the whole in a sentence, as its tooltip and to a screen reader, in English and Russian.
- The stove's warning ("Door open for the fumes", red triangle) shows only while it burns. "Slept 22 h 4 min" stands by the clock until the next chore.
- [Drink], [Eat], [Pack] and [Leave] each keep a word beside their mark.
- On a phone the chores are in two columns on its side and three upright.

## Resources

- Melt snow: 12 min of the mountain's time and 38 g of gas for 1 L. Cook a meal: 15 min, 10 g of gas and 0.4 L of water for 600 kcal. A canister holds 227 g.
- Camp 1 has 454 g of gas and six meals; Base Camp's kitchen never runs out. Camp 1's water is no longer free: it's melted.
- Nap: 1 h. Sleep: until the alarm at 02:00 (an hour's breakfast before the 03:00 start). Alone the clock skips at once; in a room, once every player sleeps. An hour's sleep takes back 3 hours awake.
- [Drink] and [Eat] use the pack; [Pack] opens the pack's card over the tent, to take from the camp's store or leave things in it.
- The guitar is at Base Camp only and only passes the time.

## Not in

- Cold in the tent, the stove's fumes as a danger (a warning only), tent-mates and Pemba inside, sound.
- The pack's card, the self-check and the HUD in the same pictures-and-symbols style: offered in chat, not asked for yet.
- Opening the pouch (it opens as it's set on the lap) and tearing it: not modelled.

## In the game

- Core: `src/simulation/tents.ts` (rule `Tents`; `TentView.whole`, a chore's whole length in the mountain's seconds, since #278), `sheltered` in the slope physics, `Rule.missing` so a save from before the tents goes on. Numbers: `content/facts/gear.json`, `time.json`, `body.json`, read by `src/content/tent-facts.ts`. Tents and stores per camp: `content/route/icefall.json`.
- Slope: `src/rendering/camp-signs.ts`, `tent-drawing.ts`, `tent-entry.ts`.
- Inside: `src/page/tent/` (`TentArt`, `TentPicture`, `DwellerPose`, `DwellerActs`, `DwellerBlend`, `DwellerShapes`, `DwellerDrawing`, `DwellerHead`, `DwellerNeck`, `DwellerHands`, `HandBones`, `Appearance`, `TentReadout`, `TentScreen`, `TentDoorPin`). Words: `content/tent.json`, EN and RU. Marks: `--icon-*` in `src/style.css`; drawings: `#art-*` in `index.html`.
- The arm is `DwellerPose.reach()`: the hand's turn from a straight-arm estimate, the elbow pulled toward a straight wrist (`STRAIGHT`, `UP`, `OFF_LINE`, `FOLDED`), then `bent3()`; elbow ways between keys are `swing()`/`turning()`. The blend's let-go is `DwellerBlend.mix()`. The neck is `DwellerNeck.frame()`, set each frame by `TentPicture.pose()` (the parts `neck*`). The picture's attribute for the chore in hand is `data-doing`; `data-chore` is the panel's buttons'; `data-set="pouch"` while a pouch stands on the lap.
- Stories: `e2e/tent.spec.ts`. They report a page's errors in CI's log and wait as long as walking for what a press shows. WebKit draws slowly on CI: 7.6 s after a press on 18 Nov. Docs: `docs/conventions/simulation-core.md` → Tents, `rendering.md`, `body.md`.
- Speed: blurs and masks redrawn each frame cost a lot. So the stubble is gradient spots, and the upper arms are drawn behind the body rather than clipped. The 3D hands write 16 parts per place each frame into fixed SVG paths.
- CI's `checks` job has had 30 minutes since #259 (it had 20, and the page's stories alone took 14).
