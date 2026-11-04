import { describe, expect, it } from "vitest";

import { Terrain } from "../physics";
import type { Point } from "../physics";
import type { HazardZone } from "../simulation";
import { HazardSigns } from "./hazard-signs";

/** Flat for 20 m, then a 45° slope for 20 m. */
const TERRAIN = new Terrain([
  [0, 0],
  [20, 0],
  [40, 20],
]);
const SERAC: HazardZone = { id: "serac", kind: "serac", from: 5, to: 15 };
const SLOPE: HazardZone = { id: "slope", kind: "avalanche", from: 22, to: 46 };
const BRIDGE: HazardZone = { id: "bridge", kind: "crevasse", from: 5, to: 15 };
const signs = new HazardSigns(TERRAIN);

const within = (points: readonly Point[], from: number, to: number): boolean =>
  points.every((point) => point.x >= from && point.x <= to);

describe("HazardSigns", () => {
  it("stands ice towers over a serac's stretch, rising well above the ground", () => {
    const towers = signs.zone(SERAC);

    expect(towers.length).toBeGreaterThan(1);
    for (const tower of towers) {
      const reach = HazardSigns.TOWER_HALF_WIDTH;
      expect(within(tower, 5 - reach, 15 + reach)).toBe(true);
      expect(Math.max(...tower.map((point) => point.y))).toBeGreaterThan(5);
    }
  });

  it("lays loaded snow along an avalanche slope, just above its ground", () => {
    const [band] = signs.zone(SLOPE);
    const top = TERRAIN.point(SLOPE.to);

    expect(band).toBeDefined();
    expect(band?.some((point) => point.x === top.x && point.y > top.y)).toBe(true);
    expect(Math.min(...(band ?? []).map((point) => point.y))).toBeGreaterThanOrEqual(0);
  });

  it("shows nothing of a hidden crevasse", () => {
    expect(signs.zone(BRIDGE)).toEqual([]);
  });

  it("brings what comes down from high above the stretch to its ground as the warning runs", () => {
    const start = signs.debris(SERAC, 0);
    const half = signs.debris(SERAC, 0.5);
    const end = signs.debris(SERAC, 1);

    expect(start.length).toBe(HazardSigns.PIECES);
    expect(within(start, 5, 15)).toBe(true);
    expect(Math.min(...start.map((piece) => piece.y))).toBeGreaterThanOrEqual(
      HazardSigns.FALL_METRES,
    );
    expect(half.every((piece, index) => piece.y < (start[index]?.y ?? 0))).toBe(true);
    expect(end.every((piece) => Math.abs(piece.y) < 1e-9)).toBe(true);
  });

  it("makes snow bigger than ice, and holds what's past the warning's end on the ground", () => {
    const snow = signs.debris(SLOPE, 2);
    const ice = signs.debris(SERAC, 1);

    expect(snow[0]?.size).toBeGreaterThan(ice[0]?.size ?? Infinity);
    expect(snow.every((piece) => Math.abs(piece.y - TERRAIN.nearest(piece).y) < 1e-9)).toBe(true);
  });
});
