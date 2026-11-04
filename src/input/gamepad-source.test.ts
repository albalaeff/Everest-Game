import { describe, expect, it } from "vitest";

import { GamepadSource } from "./gamepad-source";
import type { Pad } from "./gamepad-source";
import { PlayerInput } from "./player-input";
import { FakePad, FakeSlopeView, HeardActions } from "./testing/fakes";

// The Gamepad API's standard mapping.
const A = 0;
const B = 1;
const X = 2;
const Y = 3;
const RIGHT_BUMPER = 5;
const LEFT_TRIGGER = 6;
const RIGHT_TRIGGER = 7;
const VIEW = 8;
const MENU = 9;
const DPAD_UP = 12;
const DPAD_DOWN = 13;
const DPAD_LEFT = 14;
const DPAD_RIGHT = 15;

function setUp() {
  const heard = new HeardActions();
  const pad = new FakePad();
  const pads = { connected: [null, pad] as (Pad | null)[] };
  const slope = new FakeSlopeView({ innerWidth: 640, innerHeight: 360 });
  const player = new PlayerInput("anna", slope, heard);
  const source = new GamepadSource({ getGamepads: () => pads.connected }, player);
  return { heard, pad, pads, source };
}

const ONE_PRESS_BUTTONS = [
  ["X", X, { kind: "clip", climber: "anna", cowstail: "first" }],
  ["Y", Y, { kind: "clip", climber: "anna", cowstail: "second" }],
  ["B", B, { kind: "panel", panel: "radio" }],
  ["the D-pad's up", DPAD_UP, { kind: "oxygen", climber: "anna", change: "up" }],
  ["the D-pad's down", DPAD_DOWN, { kind: "oxygen", climber: "anna", change: "down" }],
  ["the D-pad's left", DPAD_LEFT, { kind: "view", change: "farther" }],
  ["the D-pad's right", DPAD_RIGHT, { kind: "view", change: "closer" }],
  ["View", VIEW, { kind: "check-self", climber: "anna" }],
  ["Menu", MENU, { kind: "panel", panel: "inventory" }],
  ["the right bumper", RIGHT_BUMPER, { kind: "set-up-tent", climber: "anna" }],
  ["RT", RIGHT_TRIGGER, { kind: "tool", climber: "anna", tool: "ice-axe", x: 1, y: 1 }],
  ["LT", LEFT_TRIGGER, { kind: "tool", climber: "anna", tool: "crampons", x: 1, y: -1 }],
] as const;

describe("GamepadSource", () => {
  it("sends nothing while nothing changes", () => {
    const { heard, source } = setUp();

    source.poll();
    source.poll();

    expect(heard.actions).toEqual([]);
  });

  it("walks with the left stick, in the joystick's zones", () => {
    const { heard, pad, source } = setUp();

    pad.push(1, 0);
    source.poll();

    expect(heard.actions).toEqual([
      { kind: "pace", climber: "anna", pace: "faster" },
      { kind: "walk", climber: "anna", direction: "right" },
    ]);
  });

  it("sends once for a stick held still", () => {
    const { heard, pad, source } = setUp();

    pad.push(0.7, 0);
    source.poll();
    source.poll();

    expect(heard.actions).toHaveLength(1);
  });

  it("doesn't fight the keys: a resting stick says nothing", () => {
    const { heard, source } = setUp();

    source.poll();

    expect(heard.actions).toEqual([]);
  });

  it("stops when the stick comes back", () => {
    const { heard, pad, source } = setUp();

    pad.push(0.7, 0);
    source.poll();
    pad.push(0.05, 0);
    source.poll();

    expect(heard.actions.at(-1)).toEqual({ kind: "walk", climber: "anna", direction: "stop" });
  });

  it.each(ONE_PRESS_BUTTONS)("sends %s's action once", (_, button, action) => {
    const { heard, pad, source } = setUp();

    pad.press(button);
    source.poll();
    source.poll();
    pad.press();
    source.poll();

    expect(heard.actions).toEqual([action]);
  });

  it("holds the jumar while A is down", () => {
    const { heard, pad, source } = setUp();

    pad.press(A);
    source.poll();
    source.poll();
    pad.press();
    source.poll();

    expect(heard.actions).toEqual([
      { kind: "jumar", climber: "anna", held: true },
      { kind: "jumar", climber: "anna", held: false },
    ]);
  });

  it("reads no pad without the standard mapping: its buttons could be anything", () => {
    const { heard, pad, source } = setUp();
    pad.mapping = "";

    pad.press(A);
    pad.push(1, 0);
    source.poll();

    expect(heard.actions).toEqual([]);
  });

  it("lets go when the pad is unplugged", () => {
    const { heard, pad, pads, source } = setUp();
    pad.press(A);
    pad.push(0.7, 0);
    source.poll();

    pads.connected = [];
    source.poll();

    expect(heard.actions.slice(-2)).toEqual([
      { kind: "walk", climber: "anna", direction: "stop" },
      { kind: "jumar", climber: "anna", held: false },
    ]);
  });
});
