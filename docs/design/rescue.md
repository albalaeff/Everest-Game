# Injury and rescue (issue #241, merged in PR #263 on 2026-11-18)

How a hard fall injures a climber and how they're rescued, as built. The code's own rules are in the repo: `docs/conventions/slope-physics.md` → Injuries and rescue, `agents.md`, `rendering.md`. On 19 Nov the haul out of a crevasse was redrawn (issue #279, PR #281) and the whole game, the rescue with it, made twice as fast (issue #278, PR #282), both merged into `develop` the same day.

## What the player sees

- **A hard landing can injure, by how they came down.** Only an unroped fall counts: a rope that holds the fall hurts nobody. By the speed they hit the ground: from 5 m/s a sprain, from 7.7 a broken bone, from 9.9 a bone broken through the skin, which bleeds; 12 m/s kills, as before. One draw of chance decides how they landed: now and then unhurt (6 in 10 at the slowest hard landing, 1 in 20 just short of a lethal one), mostly a leg when they land feet first, mostly an arm when thrown against a face. It can happen anywhere: off a step, a ladder, a slide over a lip, into a crevasse.
- **A sprain slows, a fracture ends the climb.** A sprained leg walks at half the pace, three quarters once wrapped. With a broken bone the climber sits where they came to rest and can't walk; a broken arm holds no rope.
- **Two kits in the pack.** A first-aid kit (0.4 kg: tourniquet, mouldable splint, wrap) is in every pack. A rescue kit (1.17 kg: thin rope with pulley and ascender, two ice screws) is in Base Camp's store. Pemba carries both. A first-aid kit treats one casualty; a rescue kit builds one rope.
- **One control rescues: F on a PC, `[Help]` on a phone**, held. It does the next thing a rescuer would do where they stand:
  1. beside a casualty: the tourniquet where it bleeds, then the splint (or a sprain's wrap);
  2. beside a treated casualty who can't walk: takes them on the back; standing still, a new hold sets them down;
  3. at a crevasse's edge over a casualty on its floor: two ice screws and the rope down;
  4. on that rope S goes down and W back up;
  5. at the rope's anchor: hauls the casualty out, 3 m of rope for each metre.
  One long hold never undoes itself: let go between lifting and setting down.
- **Pemba does the whole rescue alone** and carries the player to Base Camp, saying what his hands do. The climb then ends with "Evacuated to Base Camp", and the debrief names the injuries and the hour.
- **Hauled out of a crevasse (#279):** the casualty hangs in the harness beside the wall, drawn where the taut rope brings them, straight up over the wall's steps and clear of the ice. At the lip the hands reach onto the snow, the chest is pulled over the edge with the legs still down the face, then they're dragged flat onto the snow and lie there till they're lifted. Before, they lay flat in the air, went through the wall and stood upright in the air at the lip on a broken leg.
- **A solo climb runs faster while the player waits to be rescued:** three times as fast while they lie hurt with help coming (#278) and while they're hauled, six times while they're carried (`CarriedPace`). Not in the god mode, which runs at its panel's speed (×1 unless set), nor in a room.
- **The coach** says each step, and to clip in to the fixed rope before hauling at the edge: a gust can put an unclipped rescuer in the crevasse.

## Numbers

Out of the first crevasse (12 m deep), by the mountain's clock: 90 minutes until the haul starts (Pemba comes, anchors, goes down, splints), 101 minutes of haul, 6 to lift the casualty, 32 to carry them to Base Camp (measured 19 Nov). In play, at the pace of #278:

- A normal solo climb: about a minute in all (25 s waiting, 28 s of haul, 4 s of carry). It took nearly four minutes before #278.
- The god mode at ×1: about 3 minutes (it was 6.5 before #278, the haul 2.8 of them).
- Over the haul's time at the edge, a gust puts the hauling rescuer on their own rope about one time in seven (2 of 14 seeds tried, before #278; the mountain's time is the same).

## How to try it

- `?god` in the address, then **Break a leg** in the god panel: Pemba splints the leg and carries you to Base Camp. Set the panel's speed to ×5 to see it at about a normal climb's pace.
- Out of a crevasse: in the console `window.everest.god.calm(); window.everest.god.injure(undefined, undefined, 52)`, and watch Pemba haul you out of the first crevasse.
- You as the rescuer: take the rescue kit on the pack screen, then in the console `god.injure(undefined, "pemba", 52)` and `god.teleport(39.3)`; hold F at the edge, S down the rope, F by him, W back up, R to clip in, F to haul him out and onto your back.
- `god.calm()` stops the gusts for a long scenario. From a deep crevasse's floor the rescuer at the edge is off the screen at the 20 m view; the 50 m view shows both.

## Open

- **A broken ladder between the casualty and Base Camp** (issue #262, waiting for Alex's choice): today Pemba treats them, hauls them out on his side and waits. Options: a helicopter long line (needs a source for the Icefall), the Icefall Doctors coming sooner, or a carry across once the ladder is back.
- Offered, not asked for: the god mode running a rescue at a climb's pace by itself (its ×1 is real time today).
- Not checked by hand: two players rescuing each other in a room, the phone's `[Help]` button during a rescue, high graphics beyond the first crevasse.
- A save from before this change has no kits in its packs, so Pemba can't rescue on it.
