import { describe, expect, it } from "vitest";

import { Expedition } from "./expedition";
import type { ExpeditionSave } from "./expedition";
import { StepPacer } from "./step-pacer";
import { TestSlope } from "./testing/test-slope";

const CATCH_UP = 100;

const stepsOver = (seconds: number, framesPerSecond: number): number => {
  const pacer = new StepPacer(CATCH_UP);
  let steps = 0;
  for (let frame = 0; frame < seconds * framesPerSecond; frame += 1) {
    steps += pacer.due(1 / framesPerSecond);
  }
  return steps;
};

describe("StepPacer", () => {
  it("gives no step before a step's time has gone by", () => {
    expect(new StepPacer(CATCH_UP).due(0.01)).toBe(0);
  });

  it("gives 20 steps a real second, whatever the frame rate", () => {
    for (const framesPerSecond of [15, 30, 60, 144]) {
      const steps = stepsOver(60, framesPerSecond);

      expect(Math.abs(steps - 1200)).toBeLessThanOrEqual(1);
    }
  });

  it("catches up after a slow frame with several steps at once", () => {
    expect(new StepPacer(CATCH_UP).due(0.2)).toBe(4);
  });

  it("drops what it can't catch up, so a phone back from a locked screen doesn't freeze", () => {
    const pacer = new StepPacer(CATCH_UP);

    expect(pacer.due(3600)).toBe(CATCH_UP);
    expect(pacer.due(0)).toBe(0);
  });

  it("says how far the next step has come, for drawing between two steps", () => {
    const pacer = new StepPacer(CATCH_UP);

    pacer.due(0.025);
    expect(pacer.progress).toBeCloseTo(0.5);

    pacer.due(0.0125);
    expect(pacer.progress).toBeCloseTo(0.75);

    pacer.due(0.0125);
    expect(pacer.progress).toBeLessThan(1);
  });

  it("gives a slow phone and a fast PC the same expedition", () => {
    const steps = 400;
    const played = (framesPerSecond: number): ExpeditionSave => {
      const scenario = TestSlope.scenario(3, ["anna", "boris"]);
      const expedition = Expedition.start(scenario, [new TestSlope()]);
      const pacer = new StepPacer(CATCH_UP);
      while (expedition.step < steps) {
        const due = pacer.due(1 / framesPerSecond);
        for (let done = 0; done < due && expedition.step < steps; done += 1) {
          expedition.advance(
            expedition.step === 0
              ? [
                  { kind: "walk", climber: "anna", direction: "up" },
                  { kind: "walk", climber: "boris", direction: "up" },
                ]
              : [],
          );
        }
      }
      return expedition.save();
    };

    expect(played(15)).toEqual(played(60));
  });
});
