import { describe, expect, it } from "vitest";

import { Steepness, SteepnessCurve } from "./steepness";

describe("Steepness", () => {
  it("works out the sine of an angle in degrees with the core's own maths", () => {
    expect(Steepness.ofDegrees(0).sine).toBe(0);
    expect(Steepness.ofDegrees(30).sine).toBeCloseTo(0.5, 12);
    expect(Steepness.ofDegrees(45).sine).toBeCloseTo(Math.SQRT1_2, 12);
    expect(Steepness.ofDegrees(60).sine).toBeCloseTo(Math.sqrt(3) / 2, 12);
    expect(Steepness.ofDegrees(90).sine).toBeCloseTo(1, 12);
    expect(Steepness.ofDegrees(-30).sine).toBeCloseTo(-0.5, 12);
  });

  it("refuses an angle past the vertical", () => {
    expect(() => Steepness.ofDegrees(91)).toThrow(RangeError);
    expect(() => Steepness.ofDegrees(-91)).toThrow(RangeError);
  });

  it("measures a way over the ground: up is positive, down negative", () => {
    expect(Steepness.ofWay(3, 4).sine).toBeCloseTo(0.8, 12);
    expect(Steepness.ofWay(-3, -4).sine).toBeCloseTo(-0.8, 12);
    expect(Steepness.ofWay(5, 0).sine).toBe(0);
    expect(Steepness.ofWay(0, -2).sine).toBe(-1);
  });

  it("reads a gradient, the rise over the run, as the sources give it: 1 is 45°", () => {
    expect(Steepness.ofGradient(1).sine).toBeCloseTo(Math.SQRT1_2, 12);
    expect(Steepness.ofGradient(0.75).sine).toBeCloseTo(0.6, 12);
    expect(Steepness.ofGradient(-0.75).sine).toBeCloseTo(-0.6, 12);
    expect(Steepness.ofGradient(0).sine).toBe(0);
  });
});

describe("SteepnessCurve", () => {
  const curve = new SteepnessCurve([
    [-30, 2],
    [0, 1],
    [30, 0],
  ]);

  it("gives the value at each of its points", () => {
    expect(curve.at(Steepness.ofDegrees(-30))).toBeCloseTo(2, 12);
    expect(curve.at(Steepness.ofDegrees(0))).toBe(1);
    expect(curve.at(Steepness.ofDegrees(30))).toBeCloseTo(0, 12);
  });

  it("goes straight between its points, by the sine", () => {
    expect(curve.at(Steepness.ofWay(4, 1))).toBeCloseTo(1 - 1 / Math.sqrt(17) / 0.5, 12);
  });

  it("holds its end values past its ends, and says where they are", () => {
    expect(curve.at(Steepness.ofDegrees(80))).toBeCloseTo(0, 12);
    expect(curve.at(Steepness.ofDegrees(-80))).toBeCloseTo(2, 12);
    expect(curve.steeperUp(Steepness.ofDegrees(31))).toBe(true);
    expect(curve.steeperUp(Steepness.ofDegrees(29))).toBe(false);
    expect(curve.steeperDown(Steepness.ofDegrees(-31))).toBe(true);
    expect(curve.steeperDown(Steepness.ofDegrees(-29))).toBe(false);
  });

  it("refuses points out of order, and no points at all", () => {
    expect(
      () =>
        new SteepnessCurve([
          [10, 1],
          [0, 1],
        ]),
    ).toThrow(RangeError);
    expect(() => new SteepnessCurve([])).toThrow(RangeError);
  });
});
