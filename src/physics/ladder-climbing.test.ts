import { describe, expect, it } from "vitest";

import { LadderClimbing } from "./ladder-climbing";
import { Steepness } from "./steepness";

/** Up a wall at 0.3 m/s, across at 0.6 and down a wall at 0.27, its footing's; a metre down a
 * wall costs 0.64 of a metre up it. */
const ladders = new LadderClimbing(
  [
    [-90, 0.27],
    [0, 0.6],
    [90, 0.3],
  ],
  0.64,
);
const up = Steepness.ofDegrees(90);
const across = Steepness.ofDegrees(0);
const down = Steepness.ofDegrees(-90);

describe("Along a ladder: the power up it and across, the footing down it", () => {
  it("climbs a wall and crosses a crevasse at the speed by steepness times the stride, on all its power", () => {
    expect(ladders.step(up, 1)).toEqual({ speed: 0.3, exertion: 1 });
    expect(ladders.step(up, 0.5)).toEqual({ speed: 0.15, exertion: 1 });
    expect(ladders.step(across, 0.5)).toEqual({ speed: 0.3, exertion: 1 });
  });

  it("comes down a wall fresh no faster than the footing goes, on a share of the power", () => {
    const step = ladders.step(down, 1);

    // The stride buys 0.3 / 0.64 down, more than the footing lets them go.
    expect(step.speed).toBe(0.27);
    expect(step.exertion).toBeCloseTo((0.27 * 0.64) / 0.3, 10);
    expect(step.speed).toBeLessThan(ladders.step(up, 1).speed);
  });

  it("comes down a wall high up as fast as the stride's power pays for, once it runs short", () => {
    const step = ladders.step(down, 0.4);

    expect(step.speed).toBeCloseTo((0.4 * 0.3) / 0.64, 10);
    expect(step.exertion).toBe(1);
    // Still faster than up the same ladder on the same stride: a metre down costs less.
    expect(step.speed).toBeGreaterThan(ladders.step(up, 0.4).speed);
  });

  it("comes down a gentler ladder at the speed between, on a cost between a crossing's and a wall's", () => {
    const gentle = Steepness.ofDegrees(-30);
    const step = ladders.step(gentle, 1);

    expect(step.speed).toBeCloseTo(0.6 + (0.27 - 0.6) * gentle.sine * -1, 10);
    expect(step.exertion).toBeLessThan(1);
    expect(step.exertion).toBeGreaterThan(ladders.step(down, 1).exertion);
  });

  it("stands still on no stride", () => {
    expect(ladders.step(down, 0)).toEqual({ speed: 0, exertion: 1 });
  });

  it("needs a metre down to cost something, and no more than a metre up", () => {
    expect(() => new LadderClimbing([[0, 0.5]], 0)).toThrow(RangeError);
    expect(() => new LadderClimbing([[0, 0.5]], 1.2)).toThrow(RangeError);
  });
});
