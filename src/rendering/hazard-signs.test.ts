import { describe, expect, it } from "vitest";

import { Terrain } from "../physics";
import type { Point } from "../physics";
import type { HazardZone } from "../simulation";
import { HazardSigns } from "./hazard-signs";
import { IceSurface } from "./ice-surface";

/** Flat for 20 m, then a 45° slope for 20 m. */
const TERRAIN = new Terrain([
  [0, 0],
  [20, 0],
  [40, 20],
]);
const SERAC: HazardZone = { id: "serac", kind: "serac", from: 5, to: 15 };
const SLOPE: HazardZone = { id: "slope", kind: "avalanche", from: 22, to: 46 };
const BRIDGE: HazardZone = { id: "bridge", kind: "crevasse", from: 5, to: 15 };
const CORNICE: HazardZone = { id: "cornice", kind: "cornice", from: 5, to: 15 };
const signs = new HazardSigns(TERRAIN, new IceSurface(TERRAIN, []));

const within = (points: readonly Point[], from: number, to: number): boolean =>
  points.every((point) => point.x >= from && point.x <= to);

describe("HazardSigns", () => {
  it("towers seracs over a serac's stretch, behind it: tall, leaning out past their feet, cracked and capped with snow", () => {
    const seracs = signs.seracs(SERAC);
    const reach = HazardSigns.TOWER_HALF_WIDTH * 1.2;

    expect(seracs.length).toBeGreaterThan(1);
    expect(signs.zone(SERAC)).toEqual([]);
    for (const { outline, shade, cap, cracks } of seracs) {
      const ys = outline.map((point) => point.y);
      const [foot, other] = outline;
      const xs = outline.map((point) => point.x);
      const widest = Math.max(...xs) - Math.min(...xs);
      expect(within(outline, 5 - reach, 15 + reach)).toBe(true);
      expect(Math.max(...ys)).toBeGreaterThan(Math.min(...HazardSigns.TOWER_METRES) - 1e-9);
      // Its foot sinks behind the ice in front of it.
      expect(Math.min(...ys)).toBeLessThan(0);
      // It leans out wider than its foot.
      expect(widest).toBeGreaterThan(Math.abs((other?.x ?? 0) - (foot?.x ?? 0)));
      expect(shade.length).toBe(outline.length);
      expect(Math.min(...cap.map((point) => point.y))).toBeGreaterThan(Math.max(...ys) * 0.6);
      expect(cracks.length).toBeGreaterThan(0);
    }
  });

  it("stands the seracs on the lips of a crevasse in their stretch, never down in it", () => {
    const crevassed = new Terrain([
      [0, 0],
      [8, 0],
      [8, -20],
      [12, -20],
      [12, 0],
      [30, 0],
    ]);
    const bridged = new IceSurface(crevassed, [{ start: { x: 8, y: 0 }, finish: { x: 12, y: 0 } }]);
    const zone: HazardZone = { id: "serac", kind: "serac", from: 2, to: 70 };

    for (const { outline } of new HazardSigns(crevassed, bridged).seracs(zone)) {
      expect(Math.max(...outline.map((point) => point.y))).toBeGreaterThan(14);
    }
  });

  it("stands a serac every 10 m or so along a long stretch, so one is over wherever a climber is (#229)", () => {
    const flat = new Terrain([
      [0, 0],
      [200, 0],
    ]);
    const long: HazardZone = { id: "glacier", kind: "serac", from: 20, to: 120 };
    const middles = new HazardSigns(flat, new IceSurface(flat, []))
      .seracs(long)
      .map(({ middle }) => middle);

    expect(middles.length).toBe(10);
    expect(Math.min(...middles) - 20).toBeLessThanOrEqual(HazardSigns.TOWER_SPACING / 2 + 1e-9);
    expect(120 - Math.max(...middles)).toBeLessThanOrEqual(HazardSigns.TOWER_SPACING / 2 + 1e-9);
    for (const [index, middle] of middles.slice(1).entries()) {
      expect(middle - (middles[index] ?? 0)).toBeLessThanOrEqual(HazardSigns.TOWER_SPACING + 1e-9);
    }
  });

  it("stands a training collapse's serac right over its stretch, on the zone or off it (#229)", () => {
    const staged: HazardZone = { id: "serac-collapse", kind: "serac", from: 8, to: 12 };
    const off: HazardZone = { id: "serac-collapse", kind: "serac", from: 30, to: 38 };
    const moved = signs.seracs(SERAC, [staged]);

    expect(moved.map(({ middle }) => middle)).toContain(10);
    expect(moved.length).toBe(signs.seracs(SERAC).length);
    expect(signs.seracs(SERAC, [off])).toEqual(signs.seracs(SERAC));
    expect(signs.seracOver(off).middle).toBe(TERRAIN.point(34).x);
  });

  it("shades a serac's side away from the light, whatever's drawn of it", () => {
    const [serac] = signs.seracs(SERAC);
    const outline = serac?.outline ?? [];
    const shaded = serac === undefined ? [] : HazardSigns.shaded(serac, outline);

    expect(shaded).toEqual(serac?.shade);
    expect(Math.max(...shaded.map(({ x }) => x))).toBeLessThan(
      Math.max(...outline.map(({ x }) => x)),
    );
  });

  it("lays loaded snow along an avalanche slope as a drift: deepest along its middle, thinning to nothing at its ends (#243)", () => {
    const [band = []] = signs.zone(SLOPE);
    const from = TERRAIN.point(SLOPE.from);
    const to = TERRAIN.point(SLOPE.to);
    const depthAt = (point: { readonly x: number; readonly y: number }): number =>
      point.y - TERRAIN.height(point.x);
    const depths = band.map(depthAt);

    // On the ground or above it, never under it, and as deep as loaded snow lies in its middle.
    expect(Math.min(...depths)).toBeGreaterThanOrEqual(-1e-9);
    expect(Math.max(...depths)).toBeCloseTo(HazardSigns.LOADED_METRES, 6);
    // No step at either end: its top comes down to the ground there, so it has no square edge.
    for (const end of [from, to]) {
      const there = band.filter((point) => Math.abs(point.x - end.x) < 1e-9);
      expect(there.length).toBeGreaterThan(0);
      expect(Math.max(...there.map(depthAt))).toBeLessThan(0.01);
    }
    // And its top rises and falls gently: no point of it more than a boot above its neighbour.
    const top = band.slice(band.length / 2);
    for (let index = 1; index < top.length; index += 1) {
      const rise = depthAt(top[index] ?? to) - depthAt(top[index - 1] ?? to);
      expect(Math.abs(rise)).toBeLessThan(0.25);
    }
  });

  it("shows nothing of a hidden crevasse", () => {
    expect(signs.zone(BRIDGE)).toEqual([]);
  });

  it("brings what comes down from high above the stretch to its ground as the warning runs", () => {
    const start = signs.debris(CORNICE, 0);
    const half = signs.debris(CORNICE, 0.5);
    const end = signs.debris(CORNICE, 1);

    expect(start.length).toBe(HazardSigns.PIECES);
    expect(within(start, 5, 15)).toBe(true);
    expect(Math.min(...start.map((piece) => piece.y))).toBeGreaterThanOrEqual(
      HazardSigns.FALL_METRES,
    );
    expect(half.every((piece, index) => piece.y < (start[index]?.y ?? 0))).toBe(true);
    expect(end.every((piece) => Math.abs(piece.y) < 1e-9)).toBe(true);
  });

  it("makes an avalanche's snow bigger than a cornice's, and holds what's past the warning's end on the ground", () => {
    const snow = signs.debris(SLOPE, 2);
    const cornice = signs.debris(CORNICE, 1);

    expect(snow[0]?.size).toBeGreaterThan(cornice[0]?.size ?? Infinity);
    expect(snow.every((piece) => Math.abs(piece.y - TERRAIN.nearest(piece).y) < 1e-9)).toBe(true);
  });
});
