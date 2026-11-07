import { describe, expect, it } from "vitest";

import { Terrain } from "../physics";
import type { Point } from "../physics";
import { IceWall } from "./ice-wall";

/** A flat, a wall 6 m up whose face steps back half a metre at its foot, a flat on its top, and a
 * drop 4 m down to a flat below. */
const TERRAIN = new Terrain([
  [0, 0],
  [10, 0],
  [10.375, 0.5],
  [10.375, 6],
  [20, 6],
  [20, 2.5],
  [20.375, 2],
  [30, 2],
]);
const UP = new IceWall(TERRAIN, { x: 10, y: 0 }, { x: 10.375, y: 6 }, 2);
const DOWN = new IceWall(TERRAIN, { x: 20, y: 6 }, { x: 20.375, y: 2 }, 2);

const xs = (points: readonly Point[]): number[] => points.map(({ x }) => x);

describe("IceWall", () => {
  it("bares the ice of a wall up the route on its right, from its top to its foot", () => {
    expect(UP.into).toBe(1);
    expect(UP.face.slice(0, 3)).toEqual([
      { x: 10.375, y: 6 },
      { x: 10.375, y: 0.5 },
      { x: 10, y: 0 },
    ]);
    expect(Math.min(...xs(UP.face))).toBe(10);
    expect(Math.max(...xs(UP.face))).toBeLessThanOrEqual(10.375 + IceWall.FACE.max + 1e-9);
    expect(Math.max(...xs(UP.face))).toBeGreaterThanOrEqual(10 + IceWall.FACE.min);
  });

  it("bares the ice of a drop on its left", () => {
    expect(DOWN.into).toBe(-1);
    expect(DOWN.face[0]).toEqual({ x: 20, y: 6 });
    expect(Math.max(...xs(DOWN.face))).toBe(20.375);
    expect(Math.min(...xs(DOWN.face))).toBeGreaterThanOrEqual(20 - IceWall.FACE.max - 1e-9);
  });

  it("streaks its face down from the top, inside the bare ice", () => {
    expect(UP.streaks.length).toBeGreaterThan(0);
    for (const streak of UP.streaks) {
      const [top] = streak;
      const end = streak.at(-1);
      expect(top?.y).toBe(6);
      expect(end?.y).toBeLessThan(6 - 6 * IceWall.STREAK_DOWN.min + 1e-9);
      expect(end?.y).toBeGreaterThanOrEqual(6 - 6 * IceWall.STREAK_DOWN.max - 1e-9);
      expect(Math.min(...xs(streak))).toBeGreaterThan(10);
      expect(Math.max(...xs(streak))).toBeLessThan(10.375 + IceWall.FACE.min);
    }
  });

  it("puts a lip of snow on its top, standing out over the drop", () => {
    expect(Math.min(...xs(UP.cornice.outline))).toBeLessThan(10.375);
    expect(Math.max(...xs(DOWN.cornice.outline))).toBeGreaterThan(20);
  });

  it("is the same wall on the same seed", () => {
    expect(new IceWall(TERRAIN, { x: 10, y: 0 }, { x: 10.375, y: 6 }, 2)).toEqual(UP);
  });
});
