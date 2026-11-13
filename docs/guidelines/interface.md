# The interface

The screen around the slope: where things go, the HUD, the buttons, the text, colour, panels and the words ([../guidelines.md](../guidelines.md) has the principles). It's the HTML and CSS over the canvas: `index.html`, `src/style.css`, `src/interface/`, the buttons of `src/input/`, and their texts in `content/`.

## Layout

- **The slope gets the screen.** During the climb, no control, readout or panel covers the climber, the rope ahead or the ground under the next steps. An unobstructed view is one of [Pinelle, Wong and Stach's](https://course.ccs.neu.edu/is4300f15/ssl/pinelle-chi08.pdf) ten usability heuristics for games, and virtual controls cover what's under them ([Apple, game controls](https://developer.apple.com/design/human-interface-guidelines/game-controls)).
  - *In Everest:* the camera keeps the climber a third across and a little below the middle (`Camera.ANCHOR_X`, `ANCHOR_Y`), clear of the right thumb's buttons in the lower right and of the menu along the top. A new control goes to an edge or a corner, never across the middle.
  - *Check:* a story on each phone reads the climber's place from `#slope`'s data attributes and every control's box, and finds no overlap.
- **What's used often sits under the thumbs, what's used rarely at the top,** and controls used one after the other sit together ([Apple, game controls](https://developer.apple.com/design/human-interface-guidelines/game-controls)).
  - *In Everest:* the right thumb's corner holds the cowstails, the jumar and the oxygen flow, with the jumar between the two cowstails, since a re-clip and a slide come one after the other; the menu (Check yourself, Radio, Inventory, Set up tent) runs along the top (`.touch` in `style.css`).
  - *Check:* on the phones of #92, every control of the climb is reached without changing grip.
- **The controls stay in the safe area and clear of the system's gestures; the picture runs to the edges.** Safe areas say where the interface goes, not where the game's art stops ([WWDC24, Design advanced games for Apple platforms](https://developer.apple.com/videos/play/wwdc2024/10085/)). Android's back gesture takes a strip of about 20 dp along each side, and a web page can't take it back ([Android Developers](https://medium.com/androiddevelopers/gesture-navigation-handling-gesture-conflicts-8ee9c2665c69)).
  - *In Everest:* `--edge-*` in `style.css` keeps the controls in the safe area, at least 0.5 rem in. On touch, no control sits within 24 px of a side, and the floating joystick's ring is drawn at least that far in. No issue yet.
  - *Check:* the `android` story reads every control's box at least 24 px from the sides.
- **The climb is in landscape, and reading works upright too** ([../../spec.md](../../spec.md) → Phone and PC). Held upright, the climb asks to be turned (`#turn-phone`); the camp, the menus, the training cards and the debrief lay out both ways.
  - *Check:* each of those screens' stories runs on the phones both ways up.

## The HUD

- **Only what a climber knows at a glance stays on the screen:** the clock, the altimeter and the bottle's pressure gauge ([../../spec.md](../../spec.md) → Graphics, sound and interface). The body is on Tab, in words, with no health bars. A display in the world or on the gear comes first, one at the screen's edges (as hypoxia's narrowing view) next, and a plain overlay last ([Fagerholt and Lorentzon, Beyond the HUD](https://www2.slideshare.net/DICEStudio/beyond-the-hud-user-interfaces-for-increased-player-immersion-in-fps-games)).
  - *In Everest:* `#readouts` (#25), the turnaround mark on the clock (#36), hypoxia's edges (#43). A new readout first asks whether a climber would know it: the forecast comes by radio and in camp (#39, #79), not in a corner of the screen.
  - *Check:* a screen's preview lists what stays on it during the climb, and how a climber would know each.
- **A readout is read in one glance.** It's always in the same place and order, with its unit, in figures that don't shift as they change (`font-variant-numeric: tabular-nums`). A change that matters shows twice: the turnaround time is a red mark on the clock and a shape, and passing it is said in words.
  - *In Everest:* `#readouts`; the turnaround mark (#36).
  - *Check:* a story reads the readouts' boxes before and after their values change, and finds they haven't moved.
- **What's shown is as sure as what's known.** A forecast is a range, a fact no expert has checked says so, and a gauge reads as a real one would ([../../spec.md](../../spec.md) → Realism and accuracy principles). The model's hidden numbers never show: the climber sees symptoms, the pulse oximeter and the fingers' colour, not the body model's state.
  - *In Everest:* the self-check (#25), the forecast (#39), a tour's hidden quality (#59).
  - *Check:* a preview shows each reading as the climber would see it on the mountain.

## Buttons

- **A touch target is at least 48 CSS px square, the right thumb's 64, with 8 px between targets** ([../../spec.md](../../spec.md) → Phone and PC). In a phone's browser a CSS pixel is Android's dp and Apple's pt, so this is Android's own 48 dp, 8 dp apart ([Android accessibility help](https://support.google.com/accessibility/android/answer/7101858)), above Apple's 44 pt for frequent controls and 28 pt for menus ([Apple, game controls](https://developer.apple.com/design/human-interface-guidelines/game-controls)). With a mouse, no target is under WCAG's 24 px ([WCAG 2.2, 2.5.8](https://www.w3.org/TR/WCAG22/#target-size-minimum)). A target can be larger than what's drawn.
  - *In Everest:* `.action-button` and the disclaimer's button are at least 48, the thumb's (`.touch .oxygen`, `.touch .thumb`) 64. The `[Graphics]` button (`.setting-button`) is a target too, with no size of its own yet: 48 on touch, at least 24 with a mouse. No issue yet.
  - *Check:* a story on each project measures every `button`'s box and the gaps between them.
- **A press answers within a tenth of a second,** the limit for feeling that the game reacted at once ([Nielsen](https://www.nngroup.com/articles/response-times-3-important-limits/)): the button looks pressed, and clicks once there's sound. A vibration is never the only answer: Safari has none ([the Vibration API's implementations](https://w3c.github.io/vibration/reports/implementation.html)).
  - *In Everest:* `ActionButton` marks the press (`action-button--pressed`): the button takes the rope's orange and sinks a pixel. It vibrates 10 ms where it can; the click comes with #88.
  - *Check:* `e2e/controls.spec.ts` reads the pressed mark on the press.
- **A touch belongs to what it started on.** A finger that lands on a button stays that button's until it lifts, even when it slides off, and the joystick's finger presses nothing on its way. A held button lets go only when its finger lifts or the page loses it ([../conventions/input.md](../conventions/input.md) → Everything held can be let go).
  - *In Everest:* `PointerSource` and `ActionButton`, by `pointerId`.
  - *Check:* a story slides a finger holding [Jumar] off the button, and reads the jumar held until the finger lifts.
- **A button looks like a climber's hardware, and the way on stands out.** Every button has the same shape and the same metal, so the eye knows what can be pressed. The one button that goes on stands out on each screen.
  - *In Everest:* `.action-button` and the screens' buttons are anodized metal with a lit top edge (`--metal`, `--metal-shadow`). The one that goes on, on each screen before the climb and at a camp, is the rope's orange (`--rope`), and so is a button held, or a panel's button while its panel is open (`aria-expanded`). The focus is the ice's blue (`--ice`), so it's never taken for either. The menu's buttons have a mark before their word (`--icon-…`); on the narrowest phones, 700 px wide and under, they keep the mark alone, and their word for a screen reader.
- **One control, one place, one meaning.** A control is where it was last time, does the same on every screen of the climb, and has the same name everywhere ([Pinelle et al.](https://course.ccs.neu.edu/is4300f15/ssl/pinelle-chi08.pdf), heuristic 1: consistent responses).
  - *In Everest:* a control's row in `CONTROLS` gives its place and its name ([../conventions/input.md](../conventions/input.md) → An action more is a row more).

## Text

- **What the player reads while playing is big enough at arm's length.** On a PC at 1080p, the letters are at least 18 px from the lowest descender to the highest ascender, about a 19 px font ([XAG 101](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/101)); on a phone, the font is at least 17 px, Apple's default for iPhone text, and nothing the player needs is under its least, 11 ([Apple, typography](https://developer.apple.com/design/human-interface-guidelines/typography)).
  - *In Everest:* the readouts are a 16 px font and `main`'s text 14; they grow with #25. `#fps` and `#received`, at 12, are for checks by hand, not for the player.
  - *Check:* a story reads the computed `font-size` of every text the player needs, on each project.
- **The player can make the text larger, to twice its size** ([XAG 101](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/101)), and the layout grows with it: nothing is cut off or overlaps.
  - *In Everest:* no issue brings the setting yet; #60 keeps it with the saves.
  - *Check:* each screen's story runs again at twice the size.
- **Text stands out from whatever passes behind it:** 4.5:1, or 3:1 for large text (24 px, or 19 px bold) ([WCAG 2.2, 1.4.3](https://www.w3.org/TR/WCAG22/#contrast-minimum)), against the worst part of the picture that can be behind it ([XAG 102](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/102)). Text over the slope gets a backing whose opacity the player can raise, or a dark outline (XAG 102).
  - *In Everest:* the readouts and the hints sit over the sky, but a ridge, the snow or a whiteout can come behind them; they get a backing with #25.
  - *Check:* on a section that puts the slope behind the HUD, a story reads the picture behind each text with `window.everest.pixelAt` and computes the contrast.
- **A tip names what to press, and the eye finds it.** The coach's card draws each key (D, Shift) and each button ([Clip 1]) its words name as a key cap. A tip of the tutorial is edged in the rope's orange with a peak, and a warning in red with a triangle.
  - *In Everest:* `CoachCard` writes the keys and the bracketed buttons as `kbd`, a button's without its brackets, and marks the card `data-kind="tip"` or `"warning"` (`Coach.isWarning`).
  - *Check:* `e2e/coach.spec.ts` reads the walk's keys as key caps, and `e2e/training.spec.ts` a warning's mark.
- **The font is the system's** (`system-ui`): it downloads nothing, has every Cyrillic letter, and reads as the device's own. Figures that change are tabular.

## Colour

- **Colour is never the only cue** ([WCAG 2.2, 1.4.1](https://www.w3.org/TR/WCAG22/#use-of-color); the [Game Accessibility Guidelines](https://gameaccessibilityguidelines.com/), basic). About one man in 12 and one woman in 200 see colours differently ([Colour Blind Awareness](https://www.colourblindawareness.org/colour-blindness/)), so a colour that means something comes with a shape, a place or a word.
  - *In Everest:* the turnaround mark is red and a notch (#36); the fingers' colour on the self-check comes with its words (#25, #38); a coach's warning has a triangle and a tip a peak; the player's climber stands out by more than the suit ([graphics.md](graphics.md) → Readable first).
  - *Check:* Chrome DevTools → Rendering → Emulate vision deficiencies, each of protanopia, deuteranopia, tritanopia and achromatopsia: every cue still reads.
- **The interface's own colours stay quiet, but for the rope's.** Its blues (`#16335c`, `#9db4d0`) and its dark metal frame and recede. The rope's orange (`--rope`) marks the way on and what's in hand: the one button that goes on, a button held or a panel open, what's packed, the coach's tip. In the HTML, red means danger and the turnaround, and nothing else ([graphics.md](graphics.md) → Colour and light).

## Panels and dialogs

- **A panel opens and closes with the same control,** and Esc closes it too: the self-check on Tab, the radio on Q, the inventory on I, each also on its button and its gamepad button ([../../spec.md](../../spec.md) → Gameplay).
  - *In Everest:* the `menu` rows of `CONTROLS`; the panels themselves come with #25 and #79.
  - *Check:* a story opens and closes each panel by key, by button and by gamepad.
- **A panel works with the keys alone, and with a gamepad alone** ([WCAG 2.2, 2.1.1](https://www.w3.org/TR/WCAG22/#keyboard)), and the focus shows ([2.4.7](https://www.w3.org/TR/WCAG22/#focus-visible)). While it's open, the keys it needs to move between its choices are its own, and the climb's keys it doesn't need still work. Tab is the self-check's key during the climb (`KeyboardSource` takes it from the browser), so a panel moves between its choices with the arrows, or the gamepad's d-pad.
  - *In Everest:* #25 decides the panels' keys, and the d-pad's oxygen buttons while one is open; the disclaimer puts the focus on its button (`disclaimer.ts`).
  - *Check:* a story goes through each panel with the keys alone, and with a gamepad alone.

## Words

- **Plain words a climber would use, kept short.** Symptoms are what the climber feels ("Your head aches and you feel sick"), not the model's terms ([../../spec.md](../../spec.md) → Interface: symptoms in words); a button says what it does, a verb first ("Set up tent"); a thing has one name everywhere. The texts are in `content/`, written by people ([../conventions.md](../conventions.md) → Modules).
- **Russian and English are equals, and the layout takes the longer.** Russian runs longer, short labels most: "Set up tent" has 11 characters, "Поставить палатку" 17. No label has a fixed width: a button grows or its row wraps, and nothing is cut off.
  - *In Everest:* `content/controls.json`; the language switch comes with #89.
  - *Check:* each screen's story runs in both languages on the narrowest phone (`iphone`), and once with every English text half as long again, and finds no text overflowing its box (`scrollWidth` within `clientWidth`).
- **Numbers, units and times follow the language.** `Intl.NumberFormat` writes 8,412 m in English and 8 412 м in Russian; metres and °C, or feet and °F in the settings ([../../spec.md](../../spec.md) → Interface, #89). The clock is 24-hour in both languages, as the turnaround time is written (14:00), so a.m. and p.m. can't be mixed up.
