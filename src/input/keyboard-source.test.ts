import { describe, expect, it } from "vitest";

import { KeyboardSource } from "./keyboard-source";
import { PlayerInput } from "./player-input";
import { FakeKeyboard, FakeSlopeView, HeardActions } from "./testing/fakes";

function pc() {
  const heard = new HeardActions();
  const keyboard = new FakeKeyboard();
  const slope = new FakeSlopeView({ innerWidth: 640, innerHeight: 360 });
  const source = new KeyboardSource(keyboard, new PlayerInput("anna", slope, heard));
  return { heard, keyboard, source };
}

const ONE_PRESS_KEYS = [
  ["KeyE", { kind: "clip", climber: "anna", cowstail: "first" }],
  ["KeyR", { kind: "clip", climber: "anna", cowstail: "second" }],
  ["Equal", { kind: "oxygen", climber: "anna", change: "up" }],
  ["NumpadAdd", { kind: "oxygen", climber: "anna", change: "up" }],
  ["Minus", { kind: "oxygen", climber: "anna", change: "down" }],
  ["NumpadSubtract", { kind: "oxygen", climber: "anna", change: "down" }],
  ["Tab", { kind: "check-self", climber: "anna" }],
  ["KeyT", { kind: "set-up-tent", climber: "anna" }],
  ["KeyQ", { kind: "panel", panel: "radio" }],
  ["KeyI", { kind: "panel", panel: "inventory" }],
] as const;

describe("KeyboardSource", () => {
  it("walks with A and D along the slope", () => {
    const { heard, keyboard } = pc();

    keyboard.down("KeyD");
    keyboard.up("KeyD");
    keyboard.down("KeyA");

    expect(heard.actions).toEqual([
      { kind: "walk", climber: "anna", direction: "right" },
      { kind: "walk", climber: "anna", direction: "stop" },
      { kind: "walk", climber: "anna", direction: "left" },
    ]);
  });

  it("climbs ladders and ropes with W and S, and combines them with A and D", () => {
    const { heard, keyboard } = pc();

    keyboard.down("KeyW");
    keyboard.down("KeyD");
    keyboard.up("KeyW");
    keyboard.down("KeyS");

    expect(heard.actions).toEqual([
      { kind: "walk", climber: "anna", direction: "up" },
      { kind: "walk", climber: "anna", direction: "up-right" },
      { kind: "walk", climber: "anna", direction: "right" },
      { kind: "walk", climber: "anna", direction: "down-right" },
    ]);
  });

  it("stands still with A and D both down", () => {
    const { heard, keyboard } = pc();

    keyboard.down("KeyA");
    keyboard.down("KeyD");

    expect(heard.actions.at(-1)).toEqual({ kind: "walk", climber: "anna", direction: "stop" });
  });

  it("goes faster while either Shift is held", () => {
    const { heard, keyboard } = pc();

    keyboard.down("ShiftRight");
    keyboard.up("ShiftRight");
    keyboard.down("ShiftLeft");

    expect(heard.actions).toEqual([
      { kind: "pace", climber: "anna", pace: "faster" },
      { kind: "pace", climber: "anna", pace: "steady" },
      { kind: "pace", climber: "anna", pace: "faster" },
    ]);
  });

  it("takes the rest step while C is held", () => {
    const { heard, keyboard } = pc();

    keyboard.down("KeyC");
    keyboard.up("KeyC");

    expect(heard.actions).toEqual([
      { kind: "pace", climber: "anna", pace: "rest-step" },
      { kind: "pace", climber: "anna", pace: "steady" },
    ]);
  });

  it("keeps a steady pace with Shift and C both held", () => {
    const { heard, keyboard } = pc();

    keyboard.down("KeyC");
    keyboard.down("ShiftLeft");

    expect(heard.actions.at(-1)).toEqual({ kind: "pace", climber: "anna", pace: "steady" });
  });

  it.each(ONE_PRESS_KEYS)("sends %s's action once", (code, action) => {
    const { heard, keyboard } = pc();

    keyboard.tap(code);

    expect(heard.actions).toEqual([action]);
  });

  it("holds the jumar while Space is down", () => {
    const { heard, keyboard } = pc();

    keyboard.down("Space");
    keyboard.up("Space");

    expect(heard.actions).toEqual([
      { kind: "jumar", climber: "anna", held: true },
      { kind: "jumar", climber: "anna", held: false },
    ]);
  });

  it("ignores the repeats of a held key", () => {
    const { heard, keyboard } = pc();

    keyboard.down("KeyE");
    keyboard.down("KeyE", { repeat: true });
    keyboard.down("KeyW");
    keyboard.down("KeyW", { repeat: true });

    expect(heard.actions).toHaveLength(2);
  });

  it("clips with Shift held: walking fast and clipping go together", () => {
    const { heard, keyboard } = pc();

    keyboard.down("ShiftLeft");
    keyboard.down("KeyE", { repeat: false });

    expect(heard.actions.at(-1)).toEqual({ kind: "clip", climber: "anna", cowstail: "first" });
  });

  it("keeps Tab and Space from the browser, so they don't move the focus or scroll", () => {
    const { keyboard } = pc();

    expect(keyboard.down("Tab")).toBe(true);
    expect(keyboard.down("Space")).toBe(true);
    expect(keyboard.down("Space", { repeat: true })).toBe(true);
  });

  it("leaves keys it doesn't use to the browser", () => {
    const { heard, keyboard } = pc();

    expect(keyboard.down("F5")).toBe(false);
    expect(heard.actions).toEqual([]);
  });

  it("leaves the browser's own shortcuts alone: Ctrl+R reloads, and clips nothing", () => {
    const { heard, keyboard } = pc();

    expect(keyboard.down("KeyR", { ctrlKey: true })).toBe(false);
    expect(keyboard.down("KeyD", { metaKey: true })).toBe(false);
    expect(keyboard.down("Tab", { altKey: true })).toBe(false);
    expect(heard.actions).toEqual([]);
  });

  it("ignores game keys while the player types in a text field", () => {
    const { heard, keyboard } = pc();
    const chat = { tagName: "INPUT" } as unknown as EventTarget;
    const note = { tagName: "DIV", isContentEditable: true } as unknown as EventTarget;

    expect(keyboard.down("KeyE", { target: chat })).toBe(false);
    expect(keyboard.down("KeyW", { target: note })).toBe(false);
    expect(heard.actions).toEqual([]);
  });

  it("forgets held keys on letting go: their release never comes", () => {
    const { heard, keyboard, source } = pc();

    keyboard.down("KeyW");
    source.letGo();
    keyboard.down("KeyD");

    expect(heard.actions.at(-1)).toEqual({ kind: "walk", climber: "anna", direction: "right" });
  });
});
