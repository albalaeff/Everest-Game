import { describe, expect, it } from "vitest";

import { Terrain } from "../physics";
import { IceSurface } from "./ice-surface";

/** Flat for 10 m, a crevasse from 10 to 14 m across, 9 m deep, with a ledge in its near wall and
 * its far lip a metre higher, a flat, and a wall 3 m up at 20 m. */
const TERRAIN = new Terrain([
  [0, 0],
  [10, 0],
  [10.375, -0.5],
  [10.375, -4],
  [11, -4],
  [11, -9],
  [12, -9],
  [12, -2],
  [14, 1],
  [20, 1],
  [20, 4],
  [30, 4],
]);
const CROSSING = { start: { x: 10, y: 0 }, finish: { x: 14, y: 1 } };
const surface = new IceSurface(TERRAIN, [CROSSING]);

describe("IceSurface", () => {
  it("closes each crevasse a ladder crosses between its lips, and keeps the rest of the ground", () => {
    expect(surface.points).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 14, y: 1 },
      { x: 20, y: 1 },
      { x: 20, y: 4 },
      { x: 30, y: 4 },
    ]);
  });

  it("is as high as the lips over a crevasse, and as the ground elsewhere: a wall's top on the wall", () => {
    expect(surface.height(12)).toBeCloseTo(0.5, 9);
    expect(surface.height(5)).toBe(0);
    expect(surface.height(20)).toBe(4);
    expect(surface.height(25)).toBe(4);
  });

  it("knows where a crevasse is open, between its lips", () => {
    expect(surface.open(10.5)).toBe(true);
    expect(surface.open(13.9)).toBe(true);
    expect(surface.open(9.9)).toBe(false);
    expect(surface.open(16)).toBe(false);
  });

  it("goes as high as the highest ground over a stretch, and as low as the lowest", () => {
    expect(surface.highest(15, 25)).toBe(4);
    expect(surface.lowest(15, 25)).toBe(1);
    expect(surface.lowest(8, 12)).toBe(0);
  });

  it("is the ground itself where no ladder crosses", () => {
    expect(new IceSurface(TERRAIN, []).points.length).toBe(TERRAIN.points.length);
  });
});
