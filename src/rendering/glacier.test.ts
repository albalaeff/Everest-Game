import { describe, expect, it } from "vitest";

import { Terrain } from "../physics";
import { Glacier } from "./glacier";

/** Flat for 20 m, then up 5 m over 10, a crevasse 10 m deep and 3 m across, and a flat 23 m. */
const TERRAIN = new Terrain([
  [0, 0],
  [20, 0],
  [30, 5],
  [34, 5],
  [34, -5],
  [37, -5],
  [37, 5],
  [60, 5],
]);
const glacier = new Glacier(TERRAIN, 3);

describe("Glacier", () => {
  it("lays the moraine over the ground to its end and back past its start, its edge with the ice slanting under it", () => {
    const outline = glacier.moraine(20, 50, -40);
    const end = outline.findIndex(({ x, y }) => x === 20 && y === 0);
    const edge = outline.slice(end + 1, -2);

    expect(outline.slice(0, end + 1)).toEqual([
      { x: -50, y: 0 },
      { x: 0, y: 0 },
      { x: 20, y: 0 },
    ]);
    expect(outline.slice(-2)).toEqual([
      { x: 20 - 40 * Glacier.EDGE_SLANT, y: -40 },
      { x: -50, y: -40 },
    ]);
    expect(edge.length).toBeGreaterThan(20);
    for (const [index, { x, y }] of edge.entries()) {
      expect(y).toBeCloseTo(-(index + 1) * Glacier.EDGE_EVERY, 9);
      expect(Math.abs(x - (20 + y * Glacier.EDGE_SLANT))).toBeLessThanOrEqual(Glacier.EDGE_WANDER);
    }
  });

  it("sits stones along the moraine, on its surface, none past the edge of the ice", () => {
    const stones = glacier.stones(20, 50);

    expect(stones.length).toBeGreaterThan((70 / Glacier.STONE_EVERY) * 0.9);
    for (const { outline, dark } of stones) {
      const xs = outline.map(({ x }) => x);
      const ys = outline.map(({ y }) => y);
      const ground = TERRAIN.height((Math.min(...xs) + Math.max(...xs)) / 2);
      expect(Math.max(...xs)).toBeLessThanOrEqual(20);
      expect(Math.min(...ys)).toBeCloseTo(ground - Glacier.STONE_SUNK, 9);
      expect(Math.max(...ys)).toBeLessThanOrEqual(
        ground + Glacier.STONE_RADIUS.max * Glacier.STONE_HEIGHT,
      );
      expect(dark).toBeGreaterThanOrEqual(Glacier.STONE_DARK.min);
      expect(dark).toBeLessThanOrEqual(Glacier.STONE_DARK.max);
    }
  });

  it("cracks the snow along a stretch: thin wedges down from its surface, none past its ends", () => {
    const cracks = glacier.cracks(60, 78);
    const steps = 18 / Glacier.CRACK_EVERY;

    expect(cracks.length).toBeGreaterThan(steps * 0.2);
    expect(cracks.length).toBeLessThan(steps * 0.8);
    for (const [left, right, foot] of cracks) {
      if (left === undefined || right === undefined || foot === undefined) {
        throw new RangeError("A crack has three corners");
      }
      expect([left.y, right.y]).toEqual([5, 5]);
      expect(right.x - left.x).toBeGreaterThanOrEqual(Glacier.CRACK_WIDTH.min - 1e-9);
      expect(right.x - left.x).toBeLessThanOrEqual(Glacier.CRACK_WIDTH.max + 1e-9);
      expect(5 - foot.y).toBeGreaterThanOrEqual(Glacier.CRACK_DEPTH.min);
      expect(5 - foot.y).toBeLessThanOrEqual(Glacier.CRACK_DEPTH.max);
      expect(left.x).toBeGreaterThanOrEqual(TERRAIN.point(60).x - Glacier.CRACK_WIDTH.max);
      expect(right.x).toBeLessThanOrEqual(TERRAIN.point(78).x + Glacier.CRACK_WIDTH.max);
    }
  });

  it("is the same glacier on the same seed, and another on another", () => {
    expect(new Glacier(TERRAIN, 3).stones(20, 50)).toEqual(glacier.stones(20, 50));
    expect(new Glacier(TERRAIN, 3).cracks(60, 78)).toEqual(glacier.cracks(60, 78));
    expect(new Glacier(TERRAIN, 4).stones(20, 50)).not.toEqual(glacier.stones(20, 50));
  });
});
