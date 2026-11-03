import { describe, expect, it } from "vitest";

import { SimulationClock } from "./simulation-clock";

describe("SimulationClock", () => {
  it("starts at nought and counts each step", () => {
    const clock = new SimulationClock();
    expect(clock.step).toBe(0);

    clock.tick();
    clock.tick();

    expect(clock.step).toBe(2);
  });

  it("takes 20 steps to a second, far too short to notice", () => {
    const clock = new SimulationClock();

    for (let step = 0; step < 20; step += 1) {
      clock.tick();
    }

    expect(clock.seconds).toBe(1);
    expect(SimulationClock.STEPS_PER_SECOND * SimulationClock.STEP_SECONDS).toBe(1);
  });

  it("doesn't drift over a whole expedition: it counts steps and doesn't add up fractions", () => {
    const tenHours = 10 * 3600;
    const clock = new SimulationClock(tenHours * SimulationClock.STEPS_PER_SECOND);

    expect(clock.seconds).toBe(tenHours);
  });

  it("goes on from a saved count", () => {
    const clock = new SimulationClock(1234);

    clock.tick();

    expect(clock.step).toBe(1235);
  });
});
