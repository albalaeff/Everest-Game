import { describe, expect, it } from "vitest";

import { Terrain } from "./terrain";
import { TestMountain } from "./testing/test-mountain";

const slope = TestMountain.SLOPE.terrain;
const crevasse = TestMountain.CREVASSE.terrain;

describe("Terrain", () => {
  it("measures its ground along its surface", () => {
    expect(slope.length).toBeCloseTo(40 + Math.sqrt(50 * 50 + 42 * 42) + 30, 12);
    expect(crevasse.length).toBe(20 + 30 + 3 + 30 + 27);
  });

  it("finds the point at a distance along its ground", () => {
    expect(slope.point(10)).toEqual({ x: 10, y: 0 });
    expect(crevasse.point(35)).toEqual({ x: 20, y: -15 });
    expect(crevasse.point(51.5)).toEqual({ x: 21.5, y: -30 });
  });

  it("gives the way ahead in the walking direction, the segment behind a corner's own", () => {
    expect(crevasse.ahead(20, 1)).toEqual({ x: 0, y: -1 });
    expect(crevasse.ahead(20, -1)).toEqual({ x: -1, y: 0 });
    expect(crevasse.ahead(10, 1)).toEqual({ x: 1, y: 0 });
    expect(crevasse.ahead(53, -1)).toEqual({ x: -1, y: 0 });
    expect(crevasse.ahead(53, 1)).toEqual({ x: 0, y: 1 });
  });

  it("names the corner ahead, where a step stops", () => {
    expect(crevasse.cornerAhead(10, 1)).toBe(20);
    expect(crevasse.cornerAhead(20, 1)).toBe(50);
    expect(crevasse.cornerAhead(20, -1)).toBe(0);
  });

  it("knows the height of the ground, a wall's top on the wall", () => {
    expect(slope.height(65)).toBeCloseTo(21, 12);
    expect(crevasse.height(21)).toBe(-30);
    expect(crevasse.height(20)).toBe(0);
    expect(crevasse.height(-5)).toBe(0);
    expect(slope.height(500)).toBe(42);
  });

  it("finds the nearest point of its surface, a wall's face beside it", () => {
    const beside = crevasse.nearest({ x: 23.1, y: -12 });

    expect(beside.x).toBe(23);
    expect(beside.y).toBe(-12);
    expect(beside.along).toBeCloseTo(53 + 18, 12);
  });

  it("measures a ground laid on a line along that line, and turns only at the line's corners", () => {
    // A hump on 4 m of flat, measured along the flat under it.
    const laid = new Terrain(
      [
        [0, 0],
        [1, 0.1],
        [2, 0],
        [4, 0],
      ],
      { alongs: [0, 1, 2, 4], corners: [0, 4] },
    );
    const up = laid.ahead(0.5, 1);

    expect(laid.length).toBe(4);
    expect(laid.alongs).toEqual([0, 1, 2, 4]);
    expect(laid.point(0.5)).toEqual({ x: 0.5, y: 0.05 });
    expect(laid.point(3)).toEqual({ x: 3, y: 0 });
    expect(up.x).toBeCloseTo(1 / Math.sqrt(1.01), 12);
    expect(up.y).toBeCloseTo(0.1 / Math.sqrt(1.01), 12);
    expect(laid.height(1.5)).toBeCloseTo(0.05, 12);
    expect(laid.nearest({ x: 1, y: 2 }).along).toBeCloseTo(1, 12);
    expect(laid.cornerAhead(0.5, 1)).toBe(4);
    expect(laid.cornerAhead(1, 1)).toBe(4);
    expect(laid.cornerAhead(3, -1)).toBe(0);
  });

  it("measures a line over its surface, every point a corner", () => {
    expect(crevasse.alongs).toEqual([0, 20, 50, 53, 83, 110]);
    expect(crevasse.corners).toEqual(crevasse.alongs);
  });

  it("refuses a measure that doesn't go on along the ground, or misses a point", () => {
    const points: readonly (readonly [number, number])[] = [
      [0, 0],
      [1, 0],
      [2, 0],
    ];

    expect(() => new Terrain(points, { alongs: [0, 1, 1], corners: [0, 1] })).toThrow(RangeError);
    expect(() => new Terrain(points, { alongs: [0, 2], corners: [0, 2] })).toThrow(RangeError);
  });

  it("refuses ground that goes back on itself or stands still", () => {
    expect(
      () =>
        new Terrain([
          [0, 0],
          [10, 0],
          [5, 3],
        ]),
    ).toThrow(RangeError);
    expect(
      () =>
        new Terrain([
          [0, 0],
          [0, 0],
          [5, 3],
        ]),
    ).toThrow(RangeError);
    expect(() => new Terrain([[0, 0]])).toThrow(RangeError);
  });
});
