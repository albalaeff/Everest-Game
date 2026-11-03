import { describe, expect, it } from "vitest";

import { PlayerInput } from "./player-input";
import { PointerSource } from "./pointer-source";
import { FakeJoystick, FakeSlopeView, FakeSurface, HeardActions } from "./testing/fakes";

const SCREEN = { innerWidth: 640, innerHeight: 360 };

function phone() {
  const heard = new HeardActions();
  const surface = new FakeSurface();
  const joystick = new FakeJoystick();
  const player = new PlayerInput("anna", new FakeSlopeView(SCREEN), heard);
  const source = new PointerSource(surface, player, joystick, SCREEN);
  return { heard, surface, joystick, source };
}

describe("PointerSource", () => {
  it("puts the joystick where the left thumb lands", () => {
    const { surface, joystick } = phone();

    surface.touch(1, 100, 250);

    expect(joystick.shownAt).toEqual([100, 250]);
  });

  it("walks the way the thumb is dragged, measured from where it landed", () => {
    const { heard, surface } = phone();

    surface.touch(1, 200, 100);
    surface.drag(1, 200, 60);

    expect(heard.actions).toEqual([{ kind: "walk", climber: "anna", direction: "up" }]);
  });

  it("moves the knob as a share of the joystick's reach", () => {
    const { surface, joystick } = phone();

    surface.touch(1, 100, 250);
    surface.drag(1, 130, 250);

    expect(joystick.knob).toEqual([0.5, 0]);
  });

  it("takes a small push for the rest step, and the outer ring for faster", () => {
    const { heard, surface } = phone();

    surface.touch(1, 100, 250);
    surface.drag(1, 120, 250);
    surface.drag(1, 158, 250);

    expect(heard.actions).toEqual([
      { kind: "pace", climber: "anna", pace: "rest-step" },
      { kind: "walk", climber: "anna", direction: "right" },
      { kind: "pace", climber: "anna", pace: "faster" },
    ]);
  });

  it("stops the climber and hides the joystick when the thumb lifts", () => {
    const { heard, surface, joystick } = phone();

    surface.touch(1, 100, 250);
    surface.drag(1, 140, 250);
    surface.lift(1, 140, 250);

    expect(heard.actions.at(-1)).toEqual({ kind: "walk", climber: "anna", direction: "stop" });
    expect(joystick.shownAt).toBeUndefined();
  });

  it("takes a tap on the right half for the slope", () => {
    const { heard, surface, joystick } = phone();

    surface.touch(1, 400, 130);
    surface.lift(1, 400, 130);

    expect(heard.actions).toEqual([
      { kind: "tool", climber: "anna", tool: "ice-axe", x: 0.8, y: 0.5 },
    ]);
    expect(joystick.shownAt).toBeUndefined();
  });

  it("takes a quick tap on the left half for the slope too", () => {
    const { heard, surface } = phone();

    surface.touch(1, 200, 230);
    surface.wait(100);
    surface.lift(1, 200, 230);

    expect(heard.actions).toEqual([
      { kind: "tool", climber: "anna", tool: "crampons", x: -1.2, y: -0.5 },
    ]);
  });

  it("uses no tool when a thumb rested on the joystick and lifted", () => {
    const { heard, surface } = phone();

    surface.touch(1, 200, 230);
    surface.wait(1000);
    surface.lift(1, 200, 230);

    expect(heard.actions).toEqual([]);
  });

  it("uses no tool when a thumb pushed the joystick and came back", () => {
    const { heard, surface } = phone();

    surface.touch(1, 200, 230);
    surface.drag(1, 240, 230);
    surface.drag(1, 200, 230);
    surface.lift(1, 200, 230);

    expect(heard.actions.filter((action) => action.kind === "tool")).toEqual([]);
  });

  it("follows each finger by its own id: a tap doesn't disturb the thumb on the joystick", () => {
    const { heard, surface, joystick } = phone();

    surface.touch(1, 100, 250);
    surface.drag(1, 140, 250);
    surface.touch(2, 400, 130);
    surface.drag(2, 410, 140);
    surface.lift(2, 410, 140);

    expect(heard.actions).toEqual([
      { kind: "walk", climber: "anna", direction: "right" },
      { kind: "tool", climber: "anna", tool: "ice-axe", x: 0.8, y: 0.5 },
    ]);
    expect(joystick.shownAt).toEqual([100, 250]);
  });

  it("takes a second finger on the left half for the slope, with the joystick in use", () => {
    const { heard, surface, joystick } = phone();

    surface.touch(1, 100, 250);
    surface.touch(2, 200, 130);

    expect(heard.actions).toEqual([
      { kind: "tool", climber: "anna", tool: "ice-axe", x: -1.2, y: 0.5 },
    ]);
    expect(joystick.shownAt).toEqual([100, 250]);
  });

  it("uses the tool at a mouse click, anywhere on the slope", () => {
    const { heard, surface, joystick } = phone();

    surface.click(200, 130);

    expect(heard.actions).toEqual([
      { kind: "tool", climber: "anna", tool: "ice-axe", x: -1.2, y: 0.5 },
    ]);
    expect(joystick.shownAt).toBeUndefined();
  });

  it("takes only the left mouse button", () => {
    const { heard, surface } = phone();

    surface.click(400, 130, 2);

    expect(heard.actions).toEqual([]);
  });

  it("stops the climber when the phone takes the touch away, and uses no tool", () => {
    const { heard, surface, joystick } = phone();

    surface.touch(1, 100, 250);
    surface.drag(1, 140, 250);
    surface.cancel(1, 140, 250);

    expect(heard.actions).toEqual([
      { kind: "walk", climber: "anna", direction: "right" },
      { kind: "walk", climber: "anna", direction: "stop" },
    ]);
    expect(joystick.shownAt).toBeUndefined();
  });

  it("forgets the thumb on letting go: its release may never come", () => {
    const { surface, joystick, source } = phone();

    surface.touch(1, 100, 250);
    source.letGo();
    surface.touch(2, 120, 260);

    expect(joystick.shownAt).toEqual([120, 260]);
  });
});
