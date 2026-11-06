import { describe, expect, it } from "vitest";

import { Snow } from "./snow";
import type { SnowLayout } from "./snow";
import { Terrain } from "./terrain";

/** A line of the Icefall's kinds: a flat, a slope up, a wall with a ladder, a crevasse crossed by
 * one, and a long slope to a flat camp. Its corners are at 0, 20, 45, 48, 64, 94, 98, 128, 144,
 * 185 and 215 m along it. */
const line = new Terrain([
  [0, 0],
  [20, 0],
  [44, 7],
  [44, 10],
  [60, 10],
  [60, -20],
  [64, -20],
  [64, 10],
  [80, 10],
  [120, 19],
  [150, 19],
]);
const LADDERS = [
  { from: 45, to: 48 },
  { from: 64, to: 128 },
];
const LAYOUT: SnowLayout = {
  waves: [
    { length: 12, height: 0.3 },
    { length: 5, height: 0.14 },
    { length: 2.2, height: 0.06 },
    { length: 0.9, height: 0.025 },
  ],
  rounding: 1.5,
  margin: 1,
  blend: 2.5,
  seed: 7,
  // The camp, from 140 m across to the end.
  level: [{ from: 205, to: 215 }],
};

const snow = (layout: Partial<SnowLayout> = {}): Snow =>
  new Snow(line, { ...LAYOUT, ...layout }, LADDERS);

/** How far the snow lies above the line at `x`. */
const lift = (on: Snow, x: number): number => on.height(x) - line.height(x);

/** Every `step` metres from `from` to `to`. */
const across = (from: number, to: number, step = 0.1): number[] =>
  Array.from(
    { length: Math.floor((to - from) / step + 1e-9) + 1 },
    (_, index) => from + index * step,
  );

describe("Snow", () => {
  it("lies on the line by every wall, along every ladder and over every camp", () => {
    const lying = snow();
    const kept = [...across(43.5, 44.5), ...across(59.25, 64.75), ...across(140, 150)];

    for (const x of kept) {
      expect(Math.abs(lift(lying, x))).toBeLessThan(1e-9);
    }
  });

  it("rises and falls over the open snow by tens of centimetres, and no more", () => {
    const lying = snow();
    const lifts = [...across(0, 38), ...across(84, 130)].map((x) => lift(lying, x));

    expect(Math.max(...lifts)).toBeGreaterThan(0.12);
    expect(Math.min(...lifts)).toBeLessThan(-0.12);
    for (const height of lifts) {
      expect(Math.abs(height)).toBeLessThan(0.8);
    }
  });

  it("changes smoothly: nowhere steeper than a gentle slope of its own over the line's", () => {
    const lying = snow();

    for (const x of across(0, 140, 0.05)) {
      expect(Math.abs(lift(lying, x + 0.05) - lift(lying, x))).toBeLessThan(0.04);
    }
  });

  it("fills a hollow and rounds an edge, as snow lies on a break of slope", () => {
    const smooth = snow({ waves: [] });

    // Flat to a slope up at 20 m across: a hollow; the slope to the flat at 120 m: an edge.
    expect(lift(smooth, 20)).toBeGreaterThan(0.08);
    expect(lift(smooth, 120)).toBeLessThan(-0.04);
    // On a straight stretch, the snow is the line.
    expect(lift(smooth, 32)).toBeCloseTo(0, 9);
    expect(lift(smooth, 100)).toBeCloseTo(0, 9);
  });

  it("draws the same snow for the same seed, and other snow for another", () => {
    const xs = across(0, 38, 0.5);

    expect(xs.map((x) => snow().height(x))).toEqual(xs.map((x) => snow().height(x)));
    expect(xs.map((x) => snow({ seed: 8 }).height(x))).not.toEqual(xs.map((x) => snow().height(x)));
  });

  it("is measured along the line under it, so what's laid by how far along the ground stays put", () => {
    const lying = snow();

    expect(lying.length).toBe(line.length);
    // The ladders' ends, where the snow lies on the line.
    for (const along of [45, 48, 64, 128]) {
      expect(lying.point(along)).toEqual(line.point(along));
    }
    for (const along of [5, 12.3, 30, 150.5, 170]) {
      const point = lying.point(along);

      expect(point.x).toBeCloseTo(line.point(along).x, 9);
      expect(point.y).toBeCloseTo(lying.height(point.x), 9);
      expect(lying.nearest({ x: point.x, y: point.y + 0.01 }).along).toBeCloseTo(along, 2);
    }
  });

  it("turns only at the line's corners, so a step stops there and not at each of its points", () => {
    const lying = snow();

    expect(lying.corners).toEqual(line.corners);
    expect(lying.cornerAhead(21, 1)).toBe(45);
    expect(lying.cornerAhead(30, -1)).toBe(20);
  });

  it("slopes as the snow does: steeper than the line up a hump's face, gentler past its crest", () => {
    const lying = snow();
    const gradients = across(1, 19, 0.25).map((along) => {
      const { x, y } = lying.ahead(along, 1);
      return y / x;
    });

    expect(Math.max(...gradients)).toBeGreaterThan(0.03);
    expect(Math.min(...gradients)).toBeLessThan(-0.03);
  });

  it("keeps its points no further apart than a step across, its walls upright", () => {
    const { points } = snow();

    for (const [index, [x]] of points.entries()) {
      const before = points[index - 1];
      if (before !== undefined) {
        expect(x).toBeGreaterThanOrEqual(before[0]);
        expect(x - before[0]).toBeLessThanOrEqual(Snow.STEP + 1e-9);
      }
    }
    // The crevasse's walls go down and up again, upright.
    const walls = points.filter(([x]) => x === 60 || x === 64).map(([, y]) => y);
    expect(walls).toEqual([10, -20, -20, 10]);
  });

  it("refuses a level stretch off the ground", () => {
    expect(() => snow({ level: [{ from: 205, to: 230 }] })).toThrow(RangeError);
  });
});
