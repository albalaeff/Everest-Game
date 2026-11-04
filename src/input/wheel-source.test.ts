import { describe, expect, it } from "vitest";

import { PlayerInput } from "./player-input";
import { FakeSlopeView, FakeWheel, HeardActions } from "./testing/fakes";
import { WheelSource } from "./wheel-source";

function setUp() {
  const heard = new HeardActions();
  const wheel = new FakeWheel();
  const slope = new FakeSlopeView({ innerWidth: 640, innerHeight: 360 });
  new WheelSource(wheel, new PlayerInput("anna", slope, heard));
  return { heard, wheel };
}

const FARTHER = { kind: "view", change: "farther" };
const CLOSER = { kind: "view", change: "closer" };

describe("WheelSource", () => {
  it("shows the slope closer for a notch away from you, and farther for one towards you", () => {
    const { heard, wheel } = setUp();

    wheel.away();
    wheel.wait(500);
    wheel.towards();

    expect(heard.actions).toEqual([CLOSER, FARTHER]);
  });

  it("moves a level a notch", () => {
    const { heard, wheel } = setUp();

    wheel.towards();
    wheel.wait(300);
    wheel.towards();

    expect(heard.actions).toEqual([FARTHER, FARTHER]);
  });

  it("moves a trackpad's stream of small turns one level a quarter of a second", () => {
    const { heard, wheel } = setUp();

    for (let turn = 0; turn < 20; turn += 1) {
      wheel.towards({ deltaY: 4 });
      wheel.wait(16);
    }

    expect(heard.actions).toEqual([FARTHER, FARTHER]);
  });

  it("leaves Ctrl and the wheel to the browser's own zoom", () => {
    const { heard, wheel } = setUp();

    wheel.away({ ctrlKey: true });

    expect(heard.actions).toEqual([]);
  });

  it("ignores a turn sideways", () => {
    const { heard, wheel } = setUp();

    wheel.away({ deltaY: 0 });

    expect(heard.actions).toEqual([]);
  });
});
