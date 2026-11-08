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

  it("opens a staged collapse's crack down the serac over its stretch, longer as it goes, chips falling off it (#209)", () => {
    const early = signs.crack(SERAC, 0.1);
    const late = signs.crack(SERAC, 0.9);
    const length = (line: readonly Point[]): number => (line[0]?.y ?? 0) - (line.at(-1)?.y ?? 0);

    expect(within(late.line, 9, 11)).toBe(true);
    // On the serac's face over the route, above the climbers' heads, where the view shows it.
    expect(Math.min(...late.line.map(({ y }) => y))).toBeGreaterThan(2.5);
    expect(Math.max(...late.line.map(({ y }) => y))).toBeLessThan(9);
    expect(length(late.line)).toBeGreaterThan(length(early.line) * 4);
    expect(late.chips.length).toBeGreaterThan(0);
    for (const chip of late.chips) {
      expect(chip.y).toBeGreaterThanOrEqual(0);
    }
  });

  it("leaves blocks of ice lying on the ground over a staged collapse's stretch (#209)", () => {
    const blocks = signs.rubble(SERAC);

    expect(blocks.length).toBeGreaterThan(5);
    for (const block of blocks) {
      expect(within(block, 4, 16)).toBe(true);
      expect(Math.min(...block.map(({ y }) => y))).toBeLessThan(0.2);
      expect(Math.max(...block.map(({ y }) => y))).toBeLessThan(2);
    }
  });
});
