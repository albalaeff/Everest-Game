import { describe, expect, it } from "vitest";

import { Terrain } from "../physics";
import { SnowSurface } from "./snow-surface";

/** A slope of the Icefall's kinds: a flat, a slope up, a wall with a ladder, a crevasse crossed
 * by one, and a long slope to a flat camp. */
const terrain = new Terrain([
  [0, 0],
  [20, 0],
  [44, 7],
  [44, 10],
  [60, 10],
  [60, -20],
  [64, -20],
  [64, 10],
  [80, 10],
  [120, 19],
  [150, 19],
]);
const LADDERS = [
  { from: 44, to: 44 },
  { from: 60, to: 64 },
];
const CAMPS = [{ from: 140, to: 150 }];
const level = [...LADDERS, ...CAMPS];

const surface = (seed = 7): SnowSurface => new SnowSurface(terrain, level, seed);

/** Every `step` metres from `from` to `to`. */
const across = (from: number, to: number, step = 0.1): number[] =>
  Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, index) => from + index * step);

describe("SnowSurface", () => {
  it("lies on the physics' ground by every wall, along every ladder and over every camp", () => {
    const snow = surface();
    const kept = [
      ...across(43.5, 44.5),
      ...across(59, 65),
      ...across(140, 150),
      // The section's walls, a ladder's or not.
      ...across(59.5, 60.5),
    ];

    for (const x of kept) {
      expect(Math.abs(snow.lift(x))).toBeLessThan(1e-9);
      expect(snow.height(x)).toBeCloseTo(terrain.height(x), 9);
    }
  });

  it("rises and falls over the open snow by tens of centimetres, and no more", () => {
    const snow = surface();
    const lifts = [...across(-40, 38), ...across(84, 130)].map((x) => snow.lift(x));

    expect(Math.max(...lifts)).toBeGreaterThan(0.12);
    expect(Math.min(...lifts)).toBeLessThan(-0.12);
    for (const lift of lifts) {
      expect(Math.abs(lift)).toBeLessThan(0.8);
    }
  });

  it("changes smoothly: nowhere steeper than a gentle slope of its own over the ground's", () => {
    const snow = surface();

    for (const x of across(-40, 140, 0.05)) {
      expect(Math.abs(snow.lift(x + 0.05) - snow.lift(x))).toBeLessThan(0.04);
    }
  });

  it("fills a hollow and rounds an edge, as snow lies on a break of slope", () => {
    const smooth = new SnowSurface(terrain, level, 7, []);

    // Flat to a slope up at 20 m: a hollow; the slope to the flat at 120 m: an edge.
    expect(smooth.lift(20)).toBeGreaterThan(0.08);
    expect(smooth.lift(120)).toBeLessThan(-0.04);
    // On a straight stretch, the snow is the ground.
    expect(smooth.lift(32)).toBeCloseTo(0, 9);
    expect(smooth.lift(100)).toBeCloseTo(0, 9);
  });

  it("puts what lies on the ground onto the snow, and a point along it there too", () => {
    const snow = surface();
    const point = terrain.point(30);

    expect(snow.onSnow(point)).toEqual({ x: point.x, y: point.y + snow.lift(point.x) });
    expect(snow.point(30)).toEqual(snow.onSnow(point));
  });

  it("draws the same snow for the same seed, and other snow for another", () => {
    const xs = across(-20, 38, 0.5);

    expect(xs.map((x) => surface(7).lift(x))).toEqual(xs.map((x) => surface(7).lift(x)));
    expect(xs.map((x) => surface(8).lift(x))).not.toEqual(xs.map((x) => surface(7).lift(x)));
  });

  it("outlines its surface left to right, the walls upright, from one end to the other", () => {
    const snow = surface();
    const outline = snow.outline(-50, 200);

    expect(outline[0]?.x).toBe(-50);
    expect(outline.at(-1)?.x).toBe(200);
    for (const [index, point] of outline.entries()) {
      const before = outline[index - 1];
      if (before !== undefined) {
        expect(point.x).toBeGreaterThanOrEqual(before.x);
        expect(point.x - before.x).toBeLessThanOrEqual(SnowSurface.STEP + 1e-9);
      }
      if (![44, 60, 64].includes(point.x)) {
        expect(point.y).toBeCloseTo(snow.height(point.x), 9);
      }
    }
    // The crevasse's walls go down and up again, upright.
    const walls = outline.filter((point) => point.x === 60 || point.x === 64).map(({ y }) => y);
    expect(walls).toEqual([10, -20, -20, 10]);
  });
});
