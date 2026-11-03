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
