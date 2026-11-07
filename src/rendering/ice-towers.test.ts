import { describe, expect, it } from "vitest";

import type { Point } from "../physics";
import { IceTowers } from "./ice-towers";
import type { TowerSizes } from "./ice-towers";

const SIZES: TowerSizes = {
  width: { min: 2, max: 5 },
  height: { min: 4, max: 9 },
  apart: { min: 0.5, max: 2 },
  saddle: { min: -1, max: 0.5 },
};
/** Ice over a base rising 1 m in 10, the towers full size from 0 to 60 m, none from 60 to 80, and
 * half size past 80. */
const options = {
  from: 0,
  to: 120,
  sizes: SIZES,
  base: (x: number): number => x / 10,
  scale: (x: number): number => (x < 60 ? 1 : x < 80 ? 0 : 0.5),
  seed: 7,
};
const towers = new IceTowers(options);

const over = (point: Point): number => point.y - options.base(point.x);

describe("IceTowers", () => {
  it("runs a line of towers from end to end, left to right", () => {
    const { outline } = towers;

    expect(outline[0]?.x).toBe(0);
    expect(outline.at(-1)?.x).toBeGreaterThanOrEqual(120);
    for (const [index, point] of outline.entries()) {
      expect(point.x).toBeGreaterThanOrEqual(outline[index - 1]?.x ?? -Infinity);
    }
  });

  it("stands each tower within its sizes over the base, and none where the scale is nought", () => {
    const tops = towers.towers;

    expect(tops.length).toBeGreaterThan(8);
    for (const { left, right, height } of tops) {
      const scale = options.scale(left);
      expect(scale).toBeGreaterThan(0);
      expect(right - left).toBeLessThanOrEqual(SIZES.width.max + 1e-9);
      expect(height).toBeLessThanOrEqual(SIZES.height.max * scale + 1e-9);
      expect(height).toBeGreaterThanOrEqual(SIZES.height.min * scale - 1e-9);
      expect(left >= 60 && left < 80).toBe(false);
    }
    // Past the reach of a tower that stood up just before 60 m, only the ice between.
    const between = towers.outline.filter(({ x }) => x > 60 + SIZES.width.max && x < 79);
    expect(between.length).toBeGreaterThan(5);
    expect(between.every((point) => over(point) <= SIZES.saddle.max + 1e-9)).toBe(true);
  });

  it("is as high as its line at any x, between its corners", () => {
    const index = towers.outline.findIndex(
      (point, at) => (towers.outline[at + 1]?.x ?? point.x) > point.x,
    );
    const [a, b] = [towers.outline[index], towers.outline[index + 1]];
    if (a === undefined || b === undefined) {
      throw new RangeError("The line has two corners apart at least");
    }
    expect(towers.top((a.x + b.x) / 2)).toBeCloseTo((a.y + b.y) / 2, 9);
    expect(towers.top(-5)).toBe(towers.outline[0]?.y);
  });

  it("caps each tower's top with snow, and streaks its face down from the top", () => {
    expect(towers.caps.length).toBe(towers.towers.length);
    for (const cap of towers.caps) {
      const ys = cap.map(({ y }) => y);
      expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0);
    }
    expect(towers.flutings.length).toBeGreaterThan(towers.towers.length);
    for (const { top, foot } of towers.flutings) {
      expect(foot.y).toBeLessThan(top.y);
    }
  });

  it("shades each tower's left face, and its right, down past the base", () => {
    for (const side of [-1, 1] as const) {
      const faces = towers.shades(side, 10);
      expect(faces.length).toBe(towers.towers.length);
      for (const [index, face] of faces.entries()) {
        const tower = towers.towers[index];
        const xs = face.map(({ x }) => x);
        const middle = ((tower?.left ?? 0) + (tower?.right ?? 0)) / 2;
        expect(side === -1 ? Math.max(...xs) <= middle : Math.min(...xs) >= middle).toBe(true);
        expect(Math.min(...face.map(({ y }) => y))).toBeLessThan(options.base(middle) - 5);
      }
    }
  });

  it("lights the tallest towers' tops at dawn and dusk", () => {
    const crests = towers.crests(0.5, 0.5);

    expect(crests.length).toBeGreaterThan(0);
    expect(crests.length).toBeLessThanOrEqual(towers.towers.length);
  });

  it("has no flutings' bands of rock, and is the same ice on the same seed", () => {
    expect(towers.bands).toEqual([]);
    expect(new IceTowers(options).outline).toEqual(towers.outline);
    expect(new IceTowers({ ...options, seed: 8 }).outline).not.toEqual(towers.outline);
  });
});
