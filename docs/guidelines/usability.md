# Usability

How the game is learnt, and played for two hours by everyone, on every device ([../guidelines.md](../guidelines.md) has the principles): teaching, feedback, mistakes, interruptions, the settings, accessibility and the four input devices. The [Game Accessibility Guidelines](https://gameaccessibilityguidelines.com/)' basic level is the floor, and the [Xbox Accessibility Guidelines](https://learn.microsoft.com/en-us/gaming/accessibility/guidelines) (XAG) give the detail; text and colour are in [interface.md](interface.md).

## Teaching

- **The player plays within the first minute.** Let people play as soon as the game is installed ([Apple, designing for games](https://developer.apple.com/design/human-interface-guidelines/designing-for-games)): they learn more by doing than by reading ([Apple, onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding)).
  - *In Everest:* after the disclaimer, the Controls module is on the slope, and each control is learnt by using it (#63, #64); the theory is in cards beside the mechanic (#70).
  - *Check:* a story from the first load to the first step on the slope counts the screens before it.
- **One thing at a time, where it's needed, then watched:** prime, teach, observe ([Vollmer, Prime, Teach, Observe](https://gdcvault.com/play/1020512/Prime-Teach-Observe-Tutorializing-Innovative)), then a test under stress ([../../spec.md](../../spec.md) → Training). A control is taught where the slope first needs it, the re-clip at the first anchor, and the training sees the player do it before going on.
  - *In Everest:* the coach (`Coach`, `CoachCard`, #192) teaches on the Icefall itself, a tip at a time where the route first needs it: the walk and its paces at the start, the clip at the first rope with what the carabiner and the jumar are, the one to clip now first (#247), a ladder up or down a wall at its foot or top, a crossing at its end, the blue ice ahead and the seracs overhead. Each goes once the player has done it, the clip once both cowstails are on a rope, and the device keeps what's learnt (`everest.coach`). The ropes' tips come back whenever the player is stuck on them (#247): the jumar's Space whenever its grip is what holds them back, and at a rope's end the changeover (`Changeover`), unasked until the first is done and after that wherever the rope holds them there, its four steps listed and ticked off as they're done, the carabiner over to the next rope and then the jumar, so one is always on, or both off where no next rope is in reach; a ring names the anchor on the slope (`CoachMark`). The tip on the card points too (#233): an arrow on the slope at the place it's about (`CoachPointer`, `CoachArrow`), a ring round the exact spot and the control to use there beside the arrow: the place on the rope the carabiner goes, the second cowstail's and then the jumar's; at a changeover the step to do now, the carabiner or the jumar to take off where it is, or its place on the next rope; the way to walk, up or down a ladder, along a crossing; the jumar's slide; the ice the next pick bites well in, and over the lip; the face to step down onto and the rope to lower down; up the rope when hanging; the edge to stand at to pull a partner out or set a ladder back; back from under a cracking serac; the boots to refit a crampon at. It's the card's tip, never a second one, and a tip about no place (a gust, careless steps) has no arrow. Its warnings come whenever they matter, edged in the warning's colour: hanging on the rope (W climbs back), careless steps on blue ice or a ladder (#208), unclipped where a slip is a fall, stopped under the seracs, a crampon come loose (refit it off the ladder) and the headlamp dead in the dark (careful steps till first light), the checks skipped at the gear check catching up (#196), and the training events (#209): a serac cracking ahead (stop, back off), the ladder creaking under them (clip in, hold on), a partner hanging on the rope (stand at the edge and hold F or [Help]), and a broken ladder's wait for the Icefall Doctors. A hard landing's injuries too (#241): a broken leg or arm (lie still, and who comes), a sprain (half the pace until it's wrapped), being hauled up a rescue rope or carried; and beside a partner who's down, the next thing F or [Help] does for them there: first aid, the anchor at the crevasse's edge, the rope down and back up, the haul, the carry to Base Camp, or the kit the player doesn't carry for it. A tip stays up three seconds at least, but a warning takes its place at once. The training framework for the other skills comes with #63.
  - *Check:* `coach.test.ts` plays each tip by the climb alone, `changeover.test.ts` each step of a changeover, and `coach-pointer.test.ts` each arrow's place; `e2e/coach.spec.ts` reads the walk's tip and its arrow on each device, the clip's with the carabiner's and the jumar's lines, going once the player has clipped both cowstails, the clip's arrow on the rope, within a few pixels of it, its key changing from the second cowstail's to the jumar's, the jumar's tip whenever it holds the climber back, and the changeover at the first rope's end, each step ticked off with the arrow on the next and the anchor named. On a phone held sideways the steps fold into a row of numbers with the words of the one to do now, and only the end of the cowstails to clip now is explained, so the card leaves the climber in view: checked by hand at 915 by 412 and 630 by 360 (#247).
- **A hint names the player's own control:** Tab on a PC, [Check yourself] on a phone, the button on a gamepad. It changes when the player picks up another device.
  - *In Everest:* `#hint-click` and `#hint-tap`, by `TouchMode`, and each of the coach's tips in two forms, a keyboard's keys and the thumb's controls (`content/coach.json`, #192); the gamepad's hints come with #64. `TouchMode` turns touch on and never off again, which has no issue yet.
  - *Check:* each project's story reads the hint for its device.
- **Help is one press away:** the controls and the current goal can be looked up at any time, not only in the training ([Pinelle et al.](https://course.ccs.neu.edu/is4300f15/ssl/pinelle-chi08.pdf), heuristic 9: training and help).
  - *In Everest:* #64.

## Feedback

- **Every action answers at once, and every wait says how long.** Within 0.1 s the game shows it heard ([interface.md](interface.md) → Buttons); what takes the climber more than a second shows that it's going, the cowstail moving to the rope, the jumar sliding; a wait over 10 s says how long ([Nielsen](https://www.nngroup.com/articles/response-times-3-important-limits/): 0.1, 1 and 10 s).
  - *In Everest:* the climber's animation (#87); each camp says how long the next section takes ([../../spec.md](../../spec.md) → Phone and PC → Long sessions, #53).
- **What matters can always be found** ([Pinelle et al.](https://course.ccs.neu.edu/is4300f15/ssl/pinelle-chi08.pdf), heuristic 8: status): the readouts on the screen, the body on Tab, the group on the radio.
- **A consequence that comes late is traced back.** Consequences often come hours after the decision ([../../spec.md](../../spec.md) → Gameplay), so the debrief shows the decision, and the point where it could still have been fixed (#46).
  - *In Everest:* at Camp 1 and on a death, the debrief (#194) gives the climb's verdict, a death's cause with what would have prevented it, and the time unclipped, unclipped where a slip was a fall, the falls the rope caught and those it didn't, the time under the seracs and standing still there, what came down nearby, and the hour out of the Icefall against the sun's.

## Mistakes

- **The mountain's mistakes are possible, the fingers' aren't.** A player can unclip on the ridge, as a real climber can, but no fatal mistake is one stray key away, as Ctrl has no action because Ctrl+W would close the game ([../../spec.md](../../spec.md) → Gameplay).
  - *In Everest:* E and R, beside the walking keys, toggle the cowstails (`CONTROLS`): taking the last one off a rope takes a deliberate press. No issue yet.
  - *Check:* a story presses R while walking, on a rope with only the second cowstail on it, and the climber stays clipped.
- **A setting never changes the mountain.** The game has one difficulty ([../../spec.md](../../spec.md) → Concept and requirements). A setting changes how the game is shown or played (the text, the toggles, the motion, the sound), never what the mountain does, so the same seed and actions give the same expedition with any settings, and replays and co-op stay whole ([../conventions.md](../conventions.md) → Time and chance).
  - *Check:* the core is given no setting.

## Interruptions and long sessions

- **A call, a locked screen or another app pauses the single game, and the player comes back to the same place** ([../../spec.md](../../spec.md) → Phone and PC → Interruptions). Everything held lets go (`InputLayer`), the loop stops, and the resume point keeps the place (#60); in co-op, the AI takes the climber to the nearest camp (#45).
  - *Check:* a story hides the page in the middle of a step, shows it again, and reads the same step and nothing held.
- **The phone doesn't lock in the middle of a climb.** The game asks for a [screen wake lock](https://developer.chrome.com/docs/capabilities/web-apis/wake-lock) on the slope and lets it go in camp and in the menus; the browser drops it when the page is hidden, so the game asks again when it's shown.
  - *In Everest:* no issue yet: #61, the PWA, is the nearest.
- **Six hours, in parts.** The camps cut the expedition into sections, the game saves only there (#60), and each camp says how long the next section takes ([../../spec.md](../../spec.md) → Phone and PC → Long sessions).

## Settings

- **The settings a player expects are there before the first climb, and kept:** the text size, each kind of sound's volume and the captions, motion, vibration, the graphics, the controls (remapping and toggles), the language and the units ([Pinelle et al.](https://course.ccs.neu.edu/is4300f15/ssl/pinelle-chi08.pdf), heuristics 2 and 6; the [Game Accessibility Guidelines](https://gameaccessibilityguidelines.com/), basic: separate volumes, settings saved). They're reached from the first screen and from the pause.
  - *In Everest:* the graphics are the first (`QualityChoice`, in `localStorage` until #60 keeps the settings); the others have no issue yet.
  - *Check:* a story changes each setting, reloads the page, and reads it kept.
- **The device's own preference is the default:** `prefers-reduced-motion` turns on reduced motion ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)), `prefers-contrast: more` the backings at full opacity, the browser's language the language, until the player chooses.
  - *Check:* a story with `page.emulateMedia({ reducedMotion: "reduce" })`, and one in a `ru-RU` locale.

## Accessibility

- **Every hold has a toggle.** Holding a button for minutes hurts, and some players can't ([Game Accessibility Guidelines](https://gameaccessibilityguidelines.com/), intermediate: avoid buttons held down, or offer another way; [XAG 107](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/107)).
  - *In Everest:* the jumar (Space, [Jumar]) and the pace (C, Shift) are held (`CONTROLS`); a setting makes each a press on and a press off. No issue yet.
  - *Check:* with the toggle on, a story presses Space once and reads the jumar held until the next press.
- **The controls can be remapped in the game, by action** ([XAG 107](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/107): actions, not just buttons; [Pinelle et al.](https://course.ccs.neu.edu/is4300f15/ssl/pinelle-chi08.pdf), heuristic 6).
  - *In Everest:* `CONTROLS` is the default map, and a remap is the player's own keys and buttons for its rows, kept with the settings (#60). No issue yet.
  - *Check:* a story moves check-self to another key, and reads that the new key opens it and Tab no longer does.
- **No cue comes by sound alone** ([Game Accessibility Guidelines](https://gameaccessibilityguidelines.com/ensure-no-essential-information-is-conveyed-by-sounds-alone/), basic; [XAG 103](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/103)). The wind is heard before it's seen ([../../spec.md](../../spec.md) → Sound), so a caption says it at once; the regulator's hiss falls silent when it fails, so the gear shows it too, and the self-check says it in words. A sound's direction is never the only cue either: some play with one ear, or mono.
  - *In Everest:* the sounds (#88), the regulator's failures (#42), the radio (#79).
  - *Check:* each sound cue's story runs with the sound off, and finds the same information on the screen.
- **Captions carry what matters of the sound:** who speaks on the radio, what was said, and the sounds that warn. They're large, Ian Hamilton suggests at least 46 px at 1080p and adjustable ([80 Level](https://80.lv/articles/10-golden-rules-on-subtitles-for-games)), on a backing, and offered when the game first starts. Each kind of sound has its own volume: the mountain, the body, the gear and the radio.
  - *In Everest:* #88, #79.
- **Motion can be reduced, and nothing flashes.** Avoid shaking, bobbing and blur, or let players turn them off ([XAG 117](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/117)), and never flash more than three times a second ([WCAG 2.2, 2.3.1](https://www.w3.org/TR/WCAG22/#three-flashes-or-below-threshold)). With motion reduced, the camera never shakes or sways, the parallax is shallower, the snow falls slower and thinner, and hypoxia's edges don't pulse; lightning, at any setting, flashes at most three times a second.
  - *In Everest:* the camera, the layers and the snow (`src/rendering/`), hypoxia (#43), the weather (#39, #86); the setting has no issue yet.
  - *Check:* with reduced motion, a story reads the camera's, the layers' and the snow's settings from `#slope`'s data attributes.
- **The body's effects can be turned down, and the words stay.** Hypoxia narrows the view and mutes the colours, and with HACE the controls become imprecise ([../../spec.md](../../spec.md) → Graphics); that's the lesson, so a setting lowers how strong they are, and the self-check says them in words at any strength (#43, #37).
- **Vibration is extra.** It helps where there is any, it's never the only cue (iPhones have none), and a setting turns it off.

## The four devices

The input layer turns them into the same actions ([../conventions/input.md](../conventions/input.md)); these rules are how each feels.

- **The keyboard:** keys by their place (`KeyboardEvent.code`), so WASD stays on a Russian layout, and nothing on Ctrl. A hint names a key as the player's layout prints it, where the browser can say (`navigator.keyboard.getLayoutMap()`, in Chromium), and otherwise by its English letter.
- **The mouse:** pointing needs no precision. A click above the climber is the ice axe, below them the crampons ([../../spec.md](../../spec.md) → Gameplay), anywhere on that side: the slope is the target.
- **Touch:** the joystick appears where the left thumb lands, anywhere on the left half, since its area should be as large as can be ([WWDC24, Design advanced games for Apple platforms](https://developer.apple.com/videos/play/wwdc2024/10085/)). Its dead zone and its eight sectors forgive a thumb that drifts (`Steering`), and both thumbs work at once, by `pointerId`.
- **The gamepad:** the left stick is the joystick, with the same dead zone and sectors, and the triggers use the tools just ahead of the climber, since a gamepad can't point ([../../spec.md](../../spec.md) → Phone and PC). In a panel, A takes a choice.
- **Switching:** a player can change device in the middle of a climb, a gamepad on a phone or a laptop's touch screen. The layout and the hints follow the device used last (#64), and nothing held carries over.

## Before a new screen goes in

Its preview and its PR go through [Pinelle, Wong and Stach's](https://course.ccs.neu.edu/is4300f15/ssl/pinelle-chi08.pdf) ten heuristics for games, in Everest's words:

1. The same action gives the same answer everywhere.
2. The sound, the picture and the controls can be set.
3. The Sherpas, the guides and the other climbers behave as the player expects.
4. Nothing hides the slope.
5. What isn't play, or comes again, can be skipped: a card already read, a scene already seen.
6. The controls can be remapped.
7. The controls are forgiving.
8. What matters can always be found.
9. The training and the help are there when needed.
10. The picture is easy to read, and nothing is busywork.
