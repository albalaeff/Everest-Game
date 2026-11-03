import { describe, expect, it } from "vitest";

import { Skyline } from "./skyline";

const ridge = (seed = 3, base: (x: number) => number = () => 0): Skyline =>
  new Skyline({ from: -40, to: 340, step: 8, low: 4, high: 14, base, seed });

describe("Skyline", () => {
  it("runs from one end to the other, left to right", () => {
    const { points } = ridge();
    const [first] = points;
    const last = points.at(-1);

    expect(first?.x).toBeLessThanOrEqual(-40);
    expect(last?.x).toBeGreaterThanOrEqual(340);
    expect(points.every((point, index) => index === 0 || point.x > (points[index - 1]?.x ?? 0)));
  });

  it("keeps its tops between low and high above its base, which follows the ground", () => {
    const { points } = ridge(3, (x) => x / 10);

    for (const { x, y } of points) {
      expect(y - x / 10).toBeGreaterThan(4 - 1e-9);
      expect(y - x / 10).toBeLessThan(14 + 1e-9);
    }
  });

  it("rises and falls, a step at a time", () => {
    const { points } = ridge();
    const heights = new Set(points.map(({ y }) => y));

    expect(heights.size).toBeGreaterThan(points.length / 2);
    for (const [index, point] of points.entries()) {
      const before = points[index - 1];
      if (before !== undefined) {
        expect(Math.abs(point.y - before.y)).toBeLessThanOrEqual(8);
      }
    }
  });

  it("is the same line on the same seed, and another on another", () => {
    expect(ridge(3).points).toEqual(ridge(3).points);
    expect(ridge(4).points).not.toEqual(ridge(3).points);
  });
});
