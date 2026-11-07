import { describe, expect, it } from "vitest";

import { Terrain } from "../physics";
import type { Point } from "../physics";
import { Crevasse } from "./crevasse";

/** A flat, then a crevasse from 20 to 24 m across that narrows to half a metre at its foot, 12 m
 * down, with a gentle step in its near wall and its far lip half a metre higher, then a flat. */
const TERRAIN = new Terrain([
  [0, 5],
  [20, 5],
  [20.375, 4.5],
  [20.375, 1],
  [21.875, 0.375],
  [21.875, -7],
  [22.375, -7],
  [22.375, -2],
  [23.25, 1],
  [23.25, 4],
  [24, 5.5],
  [40, 5.5],
]);
const START = { x: 20, y: 5 };
const FINISH = { x: 24, y: 5.5 };
const crevasse = new Crevasse(TERRAIN, START, FINISH, 4);

const xs = (points: readonly Point[]): number[] => points.map(({ x }) => x);
const ys = (points: readonly Point[]): number[] => points.map(({ y }) => y);

describe("Crevasse", () => {
  it("finds its inside: down a wall from the ladder's end, along its foot and up the other", () => {
    expect(crevasse.outline).toEqual([
      { x: 20, y: 5 },
      { x: 20.375, y: 4.5 },
      { x: 20.375, y: 1 },
      { x: 21.875, y: 0.375 },
      { x: 21.875, y: -7 },
      { x: 22.375, y: -7 },
      { x: 22.375, y: -2 },
      { x: 23.25, y: 1 },
      { x: 23.25, y: 4 },
      { x: 24, y: 5.5 },
    ]);
    expect(crevasse.depth).toBe(12.5);
    expect(new Crevasse(TERRAIN, FINISH, START, 4).outline).toEqual(crevasse.outline);
  });

  it("lights a band of ice along each wall, inside the ice, from the lip down to the foot", () => {
    const [left, right] = crevasse.rims;

    expect(Math.max(...xs(left ?? []))).toBeLessThanOrEqual(21.875 + Crevasse.ROUGH);
    expect(Math.min(...xs(left ?? []))).toBeGreaterThanOrEqual(20 - Crevasse.RIM.max - 1e-9);
    expect(Math.max(...ys(left ?? []))).toBe(5);
    expect(Math.min(...ys(left ?? []))).toBe(-7);
    expect(Math.min(...xs(right ?? []))).toBeGreaterThanOrEqual(22.375 - Crevasse.ROUGH);
    expect(Math.max(...xs(right ?? []))).toBeLessThanOrEqual(24 + Crevasse.RIM.max + 1e-9);
    expect(Math.max(...ys(right ?? []))).toBe(5.5);
    // Each band is as deep into the ice as the rim allows, all the way down.
    for (const rim of [left, right]) {
      const half = (rim?.length ?? 0) / 2;
      for (let index = 0; index < half; index += 1) {
        const wall = rim?.[index];
        const inside = rim?.[rim.length - 1 - index];
        const deep = Math.abs((inside?.x ?? 0) - (wall?.x ?? 0));
        expect(inside?.y).toBe(wall?.y);
        expect(deep).toBeGreaterThanOrEqual(Crevasse.RIM.min - 1e-9);
        expect(deep).toBeLessThanOrEqual(Crevasse.RIM.max + 1e-9);
      }
    }
  });

  it("stands a lip of snow out over the void on each side", () => {
    const [left, right] = crevasse.cornices;

    expect(Math.max(...xs(left?.outline ?? []))).toBeGreaterThan(20);
    expect(Math.min(...xs(right?.outline ?? []))).toBeLessThan(24);
    for (const cornice of [left, right]) {
      expect(cornice?.icicles.length).toBeGreaterThan(0);
    }
  });

  it("plugs its foot with snow, and lays a crust on its gentler steps but not on its steep ones", () => {
    const [plug, ...crusts] = crevasse.snow;

    expect(Math.min(...ys(plug ?? []))).toBe(-7);
    expect(Math.max(...ys(plug ?? []))).toBeGreaterThanOrEqual(-7 + Crevasse.PLUG.min);
    expect(Math.max(...ys(plug ?? []))).toBeLessThanOrEqual(-7 + Crevasse.PLUG.max);
    expect(Math.min(...xs(plug ?? []))).toBeGreaterThanOrEqual(21.875 - Crevasse.ROUGH);
    expect(Math.max(...xs(plug ?? []))).toBeLessThanOrEqual(22.375 + Crevasse.ROUGH);
    expect(crusts.map((crust) => crust[0])).toEqual([
      { x: 20, y: 5 },
      { x: 20.375, y: 1 },
    ]);
  });

  it("draws its walls rough, near the ground's line and through its corners", () => {
    const { inside, outline } = crevasse;

    expect(inside.length).toBeGreaterThan(outline.length * 2);
    for (const corner of outline) {
      expect(inside).toContainEqual(corner);
    }
    for (const { x, y } of inside) {
      const nearest = TERRAIN.nearest({ x, y });
      expect(Math.hypot(nearest.x - x, nearest.y - y)).toBeLessThanOrEqual(Crevasse.ROUGH + 1e-9);
    }
  });

  it("is the same crevasse on the same seed", () => {
    expect(new Crevasse(TERRAIN, START, FINISH, 4)).toEqual(crevasse);
    expect(new Crevasse(TERRAIN, START, FINISH, 5).rims).not.toEqual(crevasse.rims);
  });
});
