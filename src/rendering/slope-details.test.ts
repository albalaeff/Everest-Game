import { describe, expect, it } from "vitest";

import { Terrain } from "../physics";
import { SlopeDetails } from "./slope-details";

/** Flat for 20 m, then a 45° slope for 20 m, then a wall 6 m up and the flat on. */
const TERRAIN = new Terrain([
  [0, 0],
  [20, 0],
  [40, 20],
  [40, 26],
  [50, 26],
]);

describe("SlopeDetails", () => {
  it("lays sastrugi along the ground, just under its surface, here and there", () => {
    const { sastrugi } = new SlopeDetails(TERRAIN, 3);
    const strokes = TERRAIN.length / SlopeDetails.SASTRUGI_EVERY;

    expect(sastrugi.length).toBeGreaterThan(strokes * 0.4);
    expect(sastrugi.length).toBeLessThan(strokes * 0.8);
    for (const { from, to } of sastrugi) {
      expect(to.x).toBeGreaterThan(from.x);
      expect(TERRAIN.height(from.x) - from.y).toBeGreaterThanOrEqual(
        SlopeDetails.SASTRUGI_UNDER.min,
      );
      expect(TERRAIN.height(from.x) - from.y).toBeLessThanOrEqual(SlopeDetails.SASTRUGI_UNDER.max);
    }
  });

  it("prints a boot track every stride along the ground, the whole way", () => {
    const { track } = new SlopeDetails(TERRAIN, 3);

    expect(track.length).toBe(Math.ceil(TERRAIN.length / SlopeDetails.TRACK_EVERY));
    expect(track[0]).toEqual({ x: 0, y: 0 });
    for (const [index, print] of track.entries()) {
      const before = track[index - 1];
      const surface = TERRAIN.nearest(print);
      expect(Math.hypot(surface.x - print.x, surface.y - print.y)).toBeLessThan(1e-9);
      if (before !== undefined) {
        // A stride along the ground; across a corner, its chord is a little shorter.
        const apart = Math.hypot(print.x - before.x, print.y - before.y);
        expect(apart).toBeLessThanOrEqual(SlopeDetails.TRACK_EVERY + 1e-9);
        expect(apart).toBeGreaterThan(SlopeDetails.TRACK_EVERY * 0.7);
      }
    }
  });

  it("finds the walls, each from its top to its foot", () => {
    const { walls } = new SlopeDetails(TERRAIN, 3);

    expect(walls).toEqual([{ from: { x: 40, y: 26 }, to: { x: 40, y: 20 } }]);
  });

  it("is the same snow on the same seed, and another on another", () => {
    expect(new SlopeDetails(TERRAIN, 3).sastrugi).toEqual(new SlopeDetails(TERRAIN, 3).sastrugi);
    expect(new SlopeDetails(TERRAIN, 4).sastrugi).not.toEqual(
      new SlopeDetails(TERRAIN, 3).sastrugi,
    );
  });
});
