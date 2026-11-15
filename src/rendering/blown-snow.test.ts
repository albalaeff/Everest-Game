import { describe, expect, it } from "vitest";

import type { Point } from "../physics";
import { SeededRandom } from "../simulation";
import { BlownSnow } from "./blown-snow";
import type { Puff, SnowView, SnowWind } from "./blown-snow";

const VIEW: SnowView = { from: 0, to: 40 };
/** A ground's height at each x. */
type Ground = (x: number) => number;

const flat: Ground = () => 0;

/** The snow over `ground` for `seconds` in frames of a sixtieth, each frame's wind from `wind`
 * at its seconds. */
const blowing = (
  wind: (seconds: number) => SnowWind,
  seconds: number,
  {
    ground = flat,
    edges = [] as readonly Point[],
    snow = null as BlownSnow | null,
  }: { ground?: Ground; edges?: readonly Point[]; snow?: BlownSnow | null } = {},
): BlownSnow => {
  const blown = snow ?? new BlownSnow(150, edges, SeededRandom.fromSeed(3));
  for (let frame = 0; frame < Math.round(seconds * 60); frame += 1) {
    blown.blow(1 / 60, wind(frame / 60), ground, VIEW);
  }
  return blown;
};

const steady = (wind: number) => (): SnowWind => ({ wind, blowing: 0 });
/** The puffs that show, as they are now. */
const shown = (snow: BlownSnow): readonly Puff[] =>
  snow.puffs.filter(({ shows }) => shows > 0.02).map((puff) => ({ ...puff }));
const mean = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);

describe("BlownSnow (#223)", () => {
  it("lifts no snow in a calm", () => {
    expect(shown(blowing(steady(0.1), 3))).toEqual([]);
  });

  it("skims the surface ankle-high in a breeze, along its rises and dips, and never under it", () => {
    const ground = (x: number): number => 0.5 * Math.sin(x / 3);

    const snow = blowing(steady(0.32), 4, { ground });
    const veils = shown(snow);

    expect(veils.length).toBeGreaterThan(30);
    for (const { x, y } of veils) {
      expect(y - ground(x)).toBeGreaterThanOrEqual(0);
      expect(y - ground(x)).toBeLessThan(0.25);
    }
  });

  it("rides higher and streams longer in a strong wind: knee-high", () => {
    const breeze = shown(blowing(steady(0.32), 4));
    const strong = shown(blowing(steady(0.9), 4));

    expect(mean(strong.map(({ y }) => y))).toBeGreaterThan(2 * mean(breeze.map(({ y }) => y)));
    expect(Math.max(...strong.map(({ y }) => y))).toBeLessThan(0.6);
    expect(mean(strong.map(({ length }) => length))).toBeGreaterThan(
      1.5 * mean(breeze.map(({ length }) => length)),
    );
  });

  it("pours off a lip: past a drop the snow goes on over it, sinking, and a wall it can't climb stops it", () => {
    const lip = (x: number): number => (x < 20 ? 0 : -6);
    const wall = (x: number): number => (x < 20 ? 0 : 5);

    const off = shown(blowing(steady(0.9), 4, { ground: lip }));
    const against = blowing(steady(0.9), 4, { ground: wall }).puffs;
    // Well over the ground below the drop, and no higher than they rode over the edge.
    const pouring = off.filter(({ x, y }) => x > 20.5 && x < 24 && y > -4);

    expect(pouring.length).toBeGreaterThan(3);
    for (const { y } of pouring) {
      expect(y).toBeLessThan(0.6);
    }
    for (const { x, y } of [...off, ...against]) {
      expect(y).toBeGreaterThanOrEqual(Math.min(lip(x), wall(x)));
    }
    for (const { x, y } of against) {
      expect(y).toBeGreaterThanOrEqual(wall(x));
    }
  });

  it("streams a wisp off each edge in the view, downwind of it, a longer plume in a strong wind", () => {
    // The ground far below, so the wisps off the edge are all that's up there.
    const ground: Ground = () => -50;
    const edges = [
      { x: 10, y: 2 },
      { x: 25, y: 4 },
      { x: 60, y: 3 },
    ];
    const wisps = (wind: number): readonly Puff[] =>
      shown(blowing(steady(wind), 4, { ground, edges })).filter(({ y }) => y > -10);

    const breeze = wisps(0.32);
    const strong = wisps(0.9);
    const off = (puffs: readonly Puff[], edge: Point): readonly number[] =>
      puffs
        .filter(({ x }) => x >= edge.x && x < edge.x + 12 && (edge.x > 20 || x < 25))
        .map(({ x }) => x - edge.x);

    for (const edge of edges.slice(0, 2)) {
      expect(off(breeze, edge).length).toBeGreaterThan(0);
      expect(mean(off(strong, edge))).toBeGreaterThan(1.5 * mean(off(breeze, edge)));
      expect(Math.max(...off(strong, edge))).toBeLessThan(8);
    }
    // None off an edge out of the view, and none upwind of an edge.
    expect(strong.filter(({ x }) => x > 40 || x < 10)).toEqual([]);
  });

  it("sends a gust's wave across the view from upwind, waist-high, and lets it settle after", () => {
    const gust = (until: number) => (seconds: number) => ({
      wind: 0.2,
      blowing: seconds < until ? Math.min(seconds / 1.5, 1) : 0,
    });
    const heights = (puffs: readonly Puff[], from: number, to: number): number =>
      mean(puffs.filter(({ x }) => x >= from && x < to).map(({ y }) => y));

    const coming = shown(blowing(gust(Infinity), 0.6));
    const come = blowing(gust(Infinity), 2.5);
    const atItsHeight = shown(come);
    const settled = shown(blowing(gust(0), 5, { snow: come }));

    // Over half a second, the wave has come a few metres: lifted behind its front, not ahead.
    expect(heights(coming, 0, 6)).toBeGreaterThan(3 * heights(coming, 25, 40));
    expect(heights(atItsHeight, 0, 40)).toBeGreaterThan(0.45);
    expect(Math.max(...atItsHeight.map(({ y, thickness }) => y + thickness / 2))).toBeLessThan(2);
    expect(heights(settled, 0, 40)).toBeLessThan(0.15);
  });

  it("lies along the wind's line, tilted a little where the snow goes up or down, never steeply", () => {
    const stairs: Ground = (x) => Math.floor(x / 5) * 1.5;

    const puffs = shown(blowing(steady(0.9), 3, { ground: stairs, edges: [{ x: 10, y: 3 }] }));

    expect(puffs.length).toBeGreaterThan(30);
    for (const { heading } of puffs) {
      expect(Math.abs(heading)).toBeLessThanOrEqual(0.45 + 1e-9);
    }
  });

  it("keeps the snow where the layer shows the slope, as the view moves", () => {
    const snow = blowing(steady(0.6), 2);
    const moved = { from: 30, to: 70 };

    for (let frame = 0; frame < 60; frame += 1) {
      snow.blow(1 / 60, { wind: 0.6, blowing: 0 }, flat, moved);
    }

    for (const { x } of shown(snow)) {
      expect(x).toBeGreaterThanOrEqual(30);
      expect(x).toBeLessThanOrEqual(70 + 0.5);
    }
  });

  it("finds the edges the wind streams off: a lip and a wall's top, the highest of a stepped one, and not a ledge down a crevasse nor a hummock", () => {
    const line: Point[] = [
      { x: 0, y: 0 },
      { x: 5, y: 0.1 },
      { x: 10, y: 0 },
      { x: 10, y: -4 },
      { x: 11, y: -4 },
      { x: 11, y: -8 },
      { x: 14, y: -8 },
      { x: 14, y: 1 },
      { x: 20, y: 1 },
      { x: 20, y: 2 },
      { x: 20.5, y: 2 },
      { x: 20.5, y: 3 },
      { x: 26, y: 3 },
    ];

    expect(BlownSnow.edgesOf(line)).toEqual([
      { x: 10, y: 0 },
      { x: 14, y: 1 },
      { x: 20.5, y: 3 },
    ]);
  });
});
