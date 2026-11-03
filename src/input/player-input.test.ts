import { describe, expect, it } from "vitest";

import { CONTROLS } from "./controls";
import type { Control, ControlName } from "./controls";
import { PlayerInput } from "./player-input";
import { Steering } from "./steering";
import { FakeSlopeView, HeardActions } from "./testing/fakes";

function control(name: ControlName): Control {
  const found = CONTROLS.find((row) => row.name === name);
  if (found === undefined) {
    throw new RangeError(`No control ${name}`);
  }
  return found;
}

function player() {
  const heard = new HeardActions();
  const slope = new FakeSlopeView({ innerWidth: 640, innerHeight: 360 });
  return { heard, input: new PlayerInput("anna", slope, heard) };
}

describe("PlayerInput", () => {
  it("sends a pace and a direction when they change", () => {
    const { heard, input } = player();

    input.steer(Steering.ofKeys(1, 0, "faster"));

    expect(heard.actions).toEqual([
      { kind: "pace", climber: "anna", pace: "faster" },
      { kind: "walk", climber: "anna", direction: "right" },
    ]);
  });

  it("sends nothing while the steering stays the same: replays keep every action", () => {
    const { heard, input } = player();

    input.steer(Steering.ofKeys(1, 0, "steady"));
    input.steer(Steering.ofKeys(1, 0, "steady"));
    input.steer(Steering.ofStick(0.7, 0));

    expect(heard.actions).toEqual([{ kind: "walk", climber: "anna", direction: "right" }]);
  });

  it("sends only what changed: a new direction at the same pace is one action", () => {
    const { heard, input } = player();

    input.steer(Steering.ofKeys(1, 0, "rest-step"));
    input.steer(Steering.ofKeys(1, 1, "rest-step"));

    expect(heard.actions.at(-1)).toEqual({ kind: "walk", climber: "anna", direction: "up-right" });
    expect(heard.actions).toHaveLength(3);
  });

  it("sends a press once", () => {
    const { heard, input } = player();

    input.press(control("clip-first"));

    expect(heard.actions).toEqual([{ kind: "clip", climber: "anna", cowstail: "first" }]);
  });

  it("takes a cowstail off with its own key once it's on a rope: the key toggles it", () => {
    const heard = new HeardActions();
    const slope = new FakeSlopeView({ innerWidth: 640, innerHeight: 360 });
    const input = new PlayerInput("anna", slope, heard);

    slope.climber = { x: 0, y: 0, first: "fixed", second: null };
    input.press(control("clip-first"));
    input.press(control("clip-second"));

    expect(heard.actions).toEqual([
      { kind: "unclip", climber: "anna", cowstail: "first" },
      { kind: "clip", climber: "anna", cowstail: "second" },
    ]);
  });

  it("gives each tap of a press its own action", () => {
    const { heard, input } = player();

    input.press(control("oxygen-up"));
    input.release(control("oxygen-up"));
    input.press(control("oxygen-up"));

    expect(heard.actions).toHaveLength(2);
  });

  it("holds a held control until it's let go: one action each way", () => {
    const { heard, input } = player();

    input.press(control("jumar"));
    input.press(control("jumar"));
    input.release(control("jumar"));
    input.release(control("jumar"));

    expect(heard.actions).toEqual([
      { kind: "jumar", climber: "anna", held: true },
      { kind: "jumar", climber: "anna", held: false },
    ]);
  });

  it("uses the ice axe above the climber and the crampons below", () => {
    const { heard, input } = player();

    input.useTool(400, 130);
    input.useTool(400, 230);

    expect(heard.actions).toEqual([
      { kind: "tool", climber: "anna", tool: "ice-axe", x: 0.8, y: 0.5 },
      { kind: "tool", climber: "anna", tool: "crampons", x: 0.8, y: -0.5 },
    ]);
  });

  it("opens a panel without telling the simulation", () => {
    const { heard, input } = player();

    input.press(control("inventory"));
    input.press(control("radio"));

    expect(heard.actions).toEqual([
      { kind: "panel", panel: "inventory" },
      { kind: "panel", panel: "radio" },
    ]);
  });

  it("lets go of everything: the climber stops, and the jumar comes off", () => {
    const { heard, input } = player();
    input.steer(Steering.ofKeys(1, 0, "faster"));
    input.press(control("jumar"));

    input.letGo();

    expect(heard.actions.slice(3)).toEqual([
      { kind: "jumar", climber: "anna", held: false },
      { kind: "pace", climber: "anna", pace: "steady" },
      { kind: "walk", climber: "anna", direction: "stop" },
    ]);
  });

  it("has nothing to send when nothing is held", () => {
    const { heard, input } = player();

    input.letGo();

    expect(heard.actions).toEqual([]);
  });
});
