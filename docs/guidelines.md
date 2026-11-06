# Everest's design guidelines

How the game looks, sounds and handles: Everest's own guidelines, in the manner of Apple's [Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/designing-for-games), for a 2D climb on a phone and a PC. Every change to what the player sees, hears or touches follows them, as every change to the code follows [conventions.md](conventions.md), whose table names them. Read the principles below, then the page your change touches.

| A change to | Page |
|---|---|
| the layout, the HUD, buttons, text, colour, panels, the words on the screen | [guidelines/interface.md](guidelines/interface.md) |
| teaching, feedback, mistakes, interruptions, settings, accessibility, the four input devices | [guidelines/usability.md](guidelines/usability.md) |
| the picture: readability, the layers, colour and light, weather, motion, the camera | [guidelines/graphics.md](guidelines/graphics.md) |
| the frame rate, PixiJS, the HTML on top, memory, the battery, the download, measuring | [guidelines/performance.md](guidelines/performance.md) |

## Principles

The pages' rules come from these; where no rule fits, they decide.

1. **The mountain is the interface.** What a climber would know, the game shows on the mountain and the gear: the plume says the wind, a chain of headlamps a queue, the gauge the oxygen ([../spec.md](../spec.md) → Graphics, sound and interface). The screen adds only what a climber knows at a glance; the rest is asked for, as the body is on Tab.
2. **Readable before beautiful.** The climber, the rope, the anchors and the ladders read at a glance on a phone at arm's length, at night and in a storm, before any effect is added. #125's scene is the target for beauty, and readability is the floor under it.
3. **Every cue twice.** Nothing the player must know comes by one sense alone: a colour comes with a shape or a word, a sound with a picture, a vibration with a sound or a picture. About one man in twelve sees colours differently, iPhones don't vibrate, and a phone on a train plays with the sound off.
4. **One game on every device.** A phone, a PC and a gamepad get the same information, the same actions and the same chances ([../spec.md](../spec.md) → Phone and PC → Cross-play). A device changes the layout, never what the player can know or do.
5. **Easy hands, hard decisions.** The difficulty is in the decisions: when to turn around, how much oxygen, whom to help. It's never in reflexes, precision or a button held for minutes, and a slip of a finger never makes a fatal mistake.
6. **Kind for two hours.** An expedition lasts about 2 hours, so nothing flashes or shakes, nothing is held for long, the frame rate is steady, the phone stays cool, and a pause keeps the player's place.
7. **Teach by doing.** The player learns a control by using it, where the slope first needs it, one thing at a time ([../spec.md](../spec.md) → Training: explain briefly, show, let them do it, test under stress).

## Using them

- **A rule is the default, not a law.** A change that breaks one says why in its PR; if the rule was wrong, the same PR changes it here.
- **A preview names the rules its screen follows** (CLAUDE.md → Working from GitHub issues, step 1), and the PR's Checked list says how each was checked: by a story in `e2e/` on the three projects, or by hand on the phones of #92.
- **Each rule gives its source, what it means in Everest, and its check.** Where the game doesn't meet a rule yet, the rule names the issue that brings it; a rule with no issue yet says so, and the change that meets it updates the line.
- **These are the screen's numbers, not the mountain's.** A size, a contrast or a frame budget here is a design target, kept in the code or the CSS; the facts the player meets stay in the knowledge base ([conventions.md](conventions.md) → Data, not literals).
- **The sources change**, Apple's every June: they were read on 3 November 2026.
