import { describe, expect, it } from "vitest";

import { LetGo } from "./game-action";
import type { GameAction } from "./game-action";

// One of each: a new action fails the type check here until it has its line. The spec's
// controls table (Gameplay) is the list.
const EVERY_ACTION: Readonly<Record<GameAction["kind"], GameAction>> = {
  walk: { kind: "walk", climber: "anna", direction: "up" },
  pace: { kind: "pace", climber: "anna", pace: "rest-step" },
  clip: { kind: "clip", climber: "anna", cowstail: "first" },
  unclip: { kind: "unclip", climber: "anna", cowstail: "second" },
  turn: { kind: "turn", climber: "anna", toward: "viewer" },
  jumar: { kind: "jumar", climber: "anna", held: true },
  haul: { kind: "haul", climber: "anna", held: true },
  tool: { kind: "tool", climber: "anna", tool: "ice-axe", x: 12.5, y: 3 },
  pack: { kind: "pack", climber: "anna", item: "ice-tool", change: "take" },
  use: { kind: "use", climber: "anna", item: "water" },
  oxygen: { kind: "oxygen", climber: "anna", change: "up" },
  "check-self": { kind: "check-self", climber: "anna" },
  radio: { kind: "radio", climber: "anna", channel: "base-camp", phrase: "at-camp" },
  tracker: { kind: "tracker", climber: "anna", do: "check-in" },
  "set-up-tent": { kind: "set-up-tent", climber: "anna" },
};

describe("GameAction", () => {
  it.each(Object.entries(EVERY_ACTION))("%s is plain data that JSON keeps whole", (_, action) => {
    expect(JSON.parse(JSON.stringify(action))).toEqual(action);
  });

  it("walks in eight directions, or stops", () => {
    const walk: GameAction = { kind: "walk", climber: "anna", direction: "up-right" };

    expect(JSON.parse(JSON.stringify(walk))).toEqual(walk);
  });
});

describe("LetGo", () => {
  it("leaves a climber holding nothing: stopped, at a steady pace, the jumar and the haul let go", () => {
    expect(new LetGo("anna").actions()).toEqual([
      { kind: "walk", climber: "anna", direction: "stop" },
      { kind: "pace", climber: "anna", pace: "steady" },
      { kind: "jumar", climber: "anna", held: false },
      { kind: "haul", climber: "anna", held: false },
    ]);
  });
});
