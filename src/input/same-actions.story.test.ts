import { describe, expect, it } from "vitest";

import { CONTROLS } from "./controls";
import type { ControlName } from "./controls";
import { GamepadSource } from "./gamepad-source";
import { KeyboardSource } from "./keyboard-source";
import { PlayerInput } from "./player-input";
import { PointerSource } from "./pointer-source";
import { PlainSlopeView } from "./slope-view";
import { FakeJoystick, FakeKeyboard, FakePad, FakeSurface, HeardActions } from "./testing/fakes";

const SCREEN = { innerWidth: 640, innerHeight: 360 };

/** One climb on the test page: what the simulation can't tell apart, whatever played it. */
const THE_CLIMB = [
  { kind: "tool", climber: "anna", tool: "ice-axe", x: 0.8, y: 0.5 },
  { kind: "tool", climber: "anna", tool: "crampons", x: 0.8, y: -0.5 },
  { kind: "pace", climber: "anna", pace: "faster" },
  { kind: "walk", climber: "anna", direction: "right" },
  { kind: "pace", climber: "anna", pace: "steady" },
  { kind: "walk", climber: "anna", direction: "stop" },
  { kind: "pace", climber: "anna", pace: "rest-step" },
  { kind: "walk", climber: "anna", direction: "up" },
  { kind: "pace", climber: "anna", pace: "steady" },
  { kind: "walk", climber: "anna", direction: "stop" },
  { kind: "clip", climber: "anna", cowstail: "first" },
  { kind: "clip", climber: "anna", cowstail: "second" },
  { kind: "jumar", climber: "anna", held: true },
  { kind: "jumar", climber: "anna", held: false },
  { kind: "oxygen", climber: "anna", change: "up" },
  { kind: "oxygen", climber: "anna", change: "down" },
  { kind: "check-self", climber: "anna" },
  { kind: "panel", panel: "radio" },
  { kind: "panel", panel: "inventory" },
  { kind: "set-up-tent", climber: "anna" },
];

function playedOnAPc(): HeardActions {
  const heard = new HeardActions();
  const keyboard = new FakeKeyboard();
  const surface = new FakeSurface();
  const player = new PlayerInput("anna", new PlainSlopeView(SCREEN), heard);
  new KeyboardSource(keyboard, player);
  new PointerSource(surface, player, new FakeJoystick(), SCREEN);

  surface.click(400, 130);
  surface.click(400, 230);
  keyboard.down("ShiftLeft");
  keyboard.down("KeyD");
  keyboard.up("ShiftLeft");
  keyboard.up("KeyD");
  keyboard.down("KeyC");
  keyboard.down("KeyW");
  keyboard.up("KeyC");
  keyboard.up("KeyW");
  keyboard.tap("KeyE");
  keyboard.tap("KeyR");
  keyboard.tap("Space");
  keyboard.tap("Equal");
  keyboard.tap("Minus");
  keyboard.tap("Tab");
  keyboard.tap("KeyQ");
  keyboard.tap("KeyI");
  keyboard.tap("KeyT");
  return heard;
}

function playedOnAPhone(): HeardActions {
  const heard = new HeardActions();
  const surface = new FakeSurface();
  const player = new PlayerInput("anna", new PlainSlopeView(SCREEN), heard);
  new PointerSource(surface, player, new FakeJoystick(), SCREEN);
  const tapTheButton = (name: ControlName): void => {
    const control = CONTROLS.find((row) => row.name === name);
    if (control === undefined) {
      throw new RangeError(`No button ${name}`);
    }
    player.press(control);
    player.release(control);
  };

  surface.touch(1, 400, 130);
  surface.lift(1, 400, 130);
  surface.touch(1, 400, 230);
  surface.lift(1, 400, 230);
  surface.touch(1, 100, 250);
  surface.drag(1, 160, 250);
  surface.lift(1, 160, 250);
  surface.touch(1, 100, 250);
  surface.drag(1, 100, 230);
  surface.lift(1, 100, 230);
  tapTheButton("clip-first");
  tapTheButton("clip-second");
  tapTheButton("jumar");
  tapTheButton("oxygen-up");
  tapTheButton("oxygen-down");
  tapTheButton("check-self");
  tapTheButton("radio");
  tapTheButton("inventory");
  tapTheButton("set-up-tent");
  return heard;
}

function playedOnAGamepad(): HeardActions {
  const heard = new HeardActions();
  const pad = new FakePad();
  const player = new PlayerInput("anna", new PlainSlopeView(SCREEN), heard);
  const source = new GamepadSource({ getGamepads: () => [pad] }, player);
  const push = (x: number, y: number): void => {
    pad.push(x, y);
    source.poll();
  };
  const tap = (button: number): void => {
    pad.press(button);
    source.poll();
    pad.press();
    source.poll();
  };

  push(1, 0);
  push(0, 0);
  push(0, -0.3);
  push(0, 0);
  tap(2);
  tap(3);
  tap(0);
  tap(12);
  tap(13);
  tap(8);
  tap(1);
  tap(9);
  tap(5);
  return heard;
}

describe("Every device", () => {
  it("plays the whole climb by keys and the mouse", () => {
    expect(playedOnAPc().actions).toEqual(THE_CLIMB);
  });

  it("plays the same climb by touch: the simulation can't tell them apart", () => {
    expect(playedOnAPhone().actions).toEqual(playedOnAPc().actions);
  });

  it("plays the same climb on a gamepad, which can only place tools just ahead", () => {
    const withoutTools = THE_CLIMB.filter((action) => action.kind !== "tool");

    expect(playedOnAGamepad().actions).toEqual(withoutTools);
  });
});
