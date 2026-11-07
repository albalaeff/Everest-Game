import { describe, expect, it } from "vitest";

import { Steepness } from "./steepness";
import type { GradientPoint } from "./steepness";
import { Walking } from "./walking";

describe("Walking", () => {
  /** Costs 1 on the level, 4 up a gradient of 1 (45°) and 2 down it, walked up to 60°, on a
   * power of 2 and no faster than 1 m/s. */
  const walking = new Walking(
    [
      [-1, 2],
      [0, 1],
      [1, 4],
    ],
    60,
    2,
    1,
  );
  const up45 = Steepness.ofGradient(1);
  const level = Steepness.ofGradient(0);
  /** Metres of height a second. */
  const climbing = (steepness: Steepness) =>
    Math.abs(walking.step(steepness, 1).speed * steepness.sine);

  it("goes as fast as the power pays for where the cost is high, on all of it", () => {
    expect(walking.step(up45, 1)).toEqual({ speed: 0.5, exertion: 1 });
    expect(walking.step(up45, 0.5)).toEqual({ speed: 0.25, exertion: 1 });
  });

  it("goes no faster than the fastest walk where the power would pay for more, on a share of it", () => {
    expect(walking.step(level, 1)).toEqual({ speed: 1, exertion: 0.5 });
    expect(walking.step(level, 0.5)).toEqual({ speed: 1, exertion: 1 });
    expect(walking.step(level, 0.25)).toEqual({ speed: 0.5, exertion: 1 });
  });

  it("costs each metre of height what it does on the steepest gradient measured, past it", () => {
    const degrees = (angle: number) => Steepness.ofDegrees(angle);

    expect(climbing(degrees(60))).toBeCloseTo(climbing(up45), 12);
    expect(climbing(degrees(52))).toBeCloseTo(climbing(up45), 12);
    expect(climbing(degrees(-60))).toBeCloseTo(climbing(Steepness.ofGradient(-1)), 12);
    expect(walking.step(degrees(60), 1).exertion).toBe(1);
  });

  it("stops at the steepest ground walked, up and down", () => {
    expect(walking.steeperUp(Steepness.ofDegrees(60))).toBe(false);
    expect(walking.steeperUp(Steepness.ofDegrees(61))).toBe(true);
    expect(walking.steeperDown(Steepness.ofDegrees(-60))).toBe(false);
    expect(walking.steeperDown(Steepness.ofDegrees(-61))).toBe(true);
    expect(walking.steeperDown(Steepness.ofDegrees(61))).toBe(false);
  });

  it("refuses a cost not measured both ways, measured past the steepest walked, and no power", () => {
    const both: readonly GradientPoint[] = [
      [-1, 2],
      [1, 4],
    ];
    const upOnly: readonly GradientPoint[] = [
      [0, 1],
      [1, 4],
    ];
    const pastSteepest: readonly GradientPoint[] = [
      [-1, 2],
      [2, 5],
    ];
    const made =
      (points: readonly GradientPoint[], power = 2, fastest = 1) =>
      () =>
        new Walking(points, 60, power, fastest);

    expect(made(both)).not.toThrow();
    expect(made(upOnly)).toThrow(RangeError);
    expect(made(pastSteepest)).toThrow(RangeError);
    expect(made(both, 0)).toThrow(RangeError);
    expect(made(both, 2, 0)).toThrow(RangeError);
  });

  it("walks uphill on the boosted power, no faster than the fastest walk, and leaves flat and downhill alone", () => {
    const boosted = new Walking(
      [
        [-1, 2],
        [0, 1],
        [1, 4],
      ],
      60,
      2,
      1,
      3,
    );

    expect(boosted.step(up45, 1)).toEqual({ speed: 1.5, exertion: 1 });
    expect(boosted.step(level, 1)).toEqual({ speed: 1, exertion: 0.5 });
    expect(boosted.step(Steepness.ofGradient(-1), 1)).toEqual({ speed: 1, exertion: 1 });
  });

  it("refuses an uphill power boost below one", () => {
    expect(
      () =>
        new Walking(
          [
            [-1, 2],
            [0, 1],
            [1, 4],
          ],
          60,
          2,
          1,
          0.5,
        ),
    ).toThrow(RangeError);
  });
});
