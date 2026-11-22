# Design notes

What Alex (albalaeff) decided in chats with Claude on claude.ai, and the notes those chats wrote on four parts of the game as they were built, here so that Claude Code sessions and agents know them too. [spec.md](../spec.md) is the plan, [guidelines.md](guidelines.md) the rules for what the player sees and [conventions.md](conventions.md) those for the code; this page holds what they don't say. Moved here from the claude.ai project "Everest Game" on 21 Nov 2026.

## Decided in chat

These hold for every change:

- **Realistic and beautiful.** Everything in the game is as true to the real mountain and as beautiful as it can be, and every change is judged by both (Nov 2026). Readability stays the floor under the beauty ([guidelines.md](guidelines.md) → Principles, 2). Realism is the main requirement: every motion and number is checked against sources, and where they show life slower or harder than the game, the game goes as life does (21 Nov 2026, #256).
- **Drawn in code.** No image generator and no painted images: every picture, the people included, is drawn in code ([design/tents.md](design/tents.md) → The person).
- **Pemba talks like a Sherpa.** The Sherpa, alone and in a room, knows everything about Everest and thinks and talks like a Sherpa, not like an AI. Written lines for now; a live voice through the Claude API later.

Planned, not built yet:

- **Alpine style.** An option to climb without the fixed ropes, so a player can take the risk and fall as a real climber would, where a rope would have held them. The game makes it tempting, as the real mountain does.
- **Your own climber.** Players will build and customise their character, face parts included: the tent's `Features` and `Appearance` (`src/page/tent/`) are made for that editor.

The rest of what was decided in chat (one hard difficulty, a tutorial for everyone, Russian and English, free online, every real accident plus made-up scenarios, open sources until experts review the game, co-op for 2–4 players with a room code) is in [spec.md](../spec.md) → Concept and requirements and → Co-op.

## Parts as built

Each page was written in chat as its part was built (16–19 Nov 2026). The merges were checked on 21 Nov; the open questions at the pages' ends weren't. The code's own rules stay in [conventions/](conventions/), and the pages link there.

| Part                                                                                 | Issues and PRs   | Page                                       |
| ------------------------------------------------------------------------------------ | ---------------- | ------------------------------------------ |
| The main menu: Everest before dawn, with the route to the summit                     | #248, #249       | [design/main-menu.md](design/main-menu.md) |
| The climber's devices: a radio, a GPS watch, a weather meter and a satellite tracker | #260, #261, #275 | [design/devices.md](design/devices.md)     |
| The camps' tents: the way in, the inside and the person in it                        | #258 to #282     | [design/tents.md](design/tents.md)         |
| Injury and rescue                                                                    | #241 to #305     | [design/rescue.md](design/rescue.md)       |
| Weather that changes, the forecast and the cold                                      | #272             | [design/weather.md](design/weather.md)     |
| The Icefall's walls of ice: their look by day and night, and the taller steps        | #290             | [design/ice-walls.md](design/ice-walls.md) |

A change that alters what a page says updates the page in the same PR.
