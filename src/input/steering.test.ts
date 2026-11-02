import { describe, expect, it } from "vitest";

import { Steering } from "./steering";

const KEY_WAYS = [
  [0, 1, "up"],
  [1, 1, "up-right"],
  [1, 0, "right"],
  [1, -1, "down-right"],
  [0, -1, "down"],
  [-1, -1, "down-left"],
  [-1, 0, "left"],
  [-1, 1, "up-left"],
  [0, 0, "stop"],
] as const;

// A stick's y goes down the screen, as a gamepad's axis and a thumb's drag do.
const STICK_WAYS = [
  [0, -0.7, "up"],
  [0.5, -0.5, "up-right"],
  [0.7, 0, "right"],
  [0.5, 0.5, "down-right"],
  [0, 0.7, "down"],
  [-0.5, 0.5, "down-left"],
  [-0.7, 0, "left"],
  [-0.5, -0.5, "up-left"],
] as const;

const STICK_PACES = [
  [0.3, "rest-step"],
  [0.7, "steady"],
  [0.95, "faster"],
  [1, "faster"],
] as const;

describe("Steering", () => {
  it.each(KEY_WAYS)("from keys %d across and %d up goes %s", (across, up, direction) => {
    expect(Steering.ofKeys(across, up, "steady").direction).toBe(direction);
  });

  it.each(STICK_WAYS)("from a stick at %d, %d goes %s", (x, y, direction) => {
    expect(Steering.ofStick(x, y).direction).toBe(direction);
  });

  it("takes a stick near an axis for that axis, not a diagonal", () => {
    expect(Steering.ofStick(0.7, 0.2).direction).toBe("right");
    expect(Steering.ofStick(0.2, -0.7).direction).toBe("up");
  });

  it.each(STICK_PACES)("from a stick pushed %d of the way sets %s", (push, pace) => {
    expect(Steering.ofStick(push, 0).pace).toBe(pace);
  });

  it("stops in the dead zone, whatever the thumb's shake", () => {
    expect(Steering.ofStick(0.1, -0.1)).toBe(Steering.STOPPED);
  });

  it("knows an equal steering from another", () => {
    expect(Steering.ofStick(0.7, 0).equals(Steering.ofKeys(1, 0, "steady"))).toBe(true);
    expect(Steering.ofStick(1, 0).equals(Steering.ofKeys(1, 0, "steady"))).toBe(false);
  });
});
