import { describe, expect, it } from "vitest";

import { Terrain } from "../physics";
import type { Point } from "../physics";
import type { HazardZone } from "../simulation";
import { HazardSigns } from "./hazard-signs";
import { IceSurface } from "./ice-surface";
import { SeracFall } from "./serac-fall";
import type { SeracFallFrame } from "./serac-fall";

/** Flat ground, and seracs over a stretch of it: the first stands 15 m tall and leans out to x's
 * way, the second the other way. */
const TERRAIN = new Terrain([
  [0, 0],
  [100, 0],
]);
const ZONE: HazardZone = { id: "towers", kind: "serac", from: 10, to: 40 };
const [FIRST, SECOND] = new HazardSigns(TERRAIN, new IceSurface(TERRAIN, [])).seracs(ZONE);
const GROUND = (): number => 0;
const LANDING = { from: 10, to: 40 };
const TIMING = { crack: 3, fall: 1.9 };

const fallOf = (
  serac = FIRST,
  timing = TIMING,
  seed = 7,
  outline: readonly Point[] = serac?.outline ?? [],
): SeracFall =>
  new SeracFall(
    { outline, snow: serac?.cap ?? null, turned: serac?.turned ?? 1, base: serac?.base ?? 0 },
    GROUND,
    timing,
    LANDING,
    seed,
  );

/** A polygon's area, by the shoelace. */
const area = (polygon: readonly Point[]): number =>
  Math.abs(
    polygon.reduce((sum, { x, y }, index) => {
      const next = polygon[(index + 1) % polygon.length] ?? { x, y };
      return sum + x * next.y - next.x * y;
    }, 0) / 2,
  );
const ys = (points: readonly Point[]): number[] => points.map(({ y }) => y);
const xs = (points: readonly Point[]): number[] => points.map(({ x }) => x);
const middle = (points: readonly Point[]): Point => ({
  x: xs(points).reduce((sum, x) => sum + x, 0) / Math.max(points.length, 1),
  y: ys(points).reduce((sum, y) => sum + y, 0) / Math.max(points.length, 1),
});
const kinds = (frame: SeracFallFrame): Set<string> => new Set(frame.pieces.map(({ kind }) => kind));
const mean = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);

describe("SeracFall", () => {
  it("cracks across a serac a quarter of the way up it to a little under half, over the climbers' heads: its stump below, its top above, nothing lost", () => {
    const fall = fallOf();
    const outline = FIRST?.outline ?? [];

    expect(fall.cut).toBeGreaterThan(0.25 * 15 - 1e-9);
    expect(fall.cut).toBeLessThan(0.45 * 15 + 1e-9);
    expect(Math.max(...ys(fall.stump))).toBeLessThan(fall.cut + 0.5);
    expect(Math.min(...ys(fall.top))).toBeGreaterThan(fall.cut - 0.5);
    expect(area(fall.stump) + area(fall.top)).toBeCloseTo(area(outline), 6);
    // It turns on the crack's front end, out where it leans.
    expect(fall.pivot.x).toBeGreaterThan(mean(xs(fall.top)));
  });

  it("runs its crack from the back to the front as it cracks, opening it, and leans its top out further and further", () => {
    const fall = fallOf();
    const early = fall.at(0.5, 0);
    const late = fall.at(2.8, 0);

    expect(late.crack.length).toBeGreaterThan(early.crack.length);
    expect(late.open).toBeGreaterThan(early.open);
    expect(Math.abs(late.lean ?? 0)).toBeGreaterThan(Math.abs(early.lean ?? 0));
    const leaned = fall.leaned(fall.top, late.lean ?? 0);
    // Out over its front: the way it leans.
    expect(Math.max(...xs(leaned))).toBeGreaterThan(Math.max(...xs(fall.top)));
    for (const { corners } of late.pieces) {
      expect(Math.min(...ys(corners))).toBeGreaterThan(-0.5);
    }
    expect(late.pieces.every(({ kind }) => kind === "chip")).toBe(true);
  });

  it("leans the other way for a serac that leans out the other way", () => {
    const fall = fallOf(SECOND);
    const lean = fall.at(2.8, 0).lean ?? 0;

    expect(fall.pivot.x).toBeLessThan(mean(xs(fall.top)));
    expect(Math.min(...xs(fall.leaned(fall.top, lean)))).toBeLessThan(Math.min(...xs(fall.top)));
  });

  it("breaks off as its crack runs out, and its first block lands as the hazard comes down, life size", () => {
    const fall = fallOf();
    const { crack, fall: falls } = TIMING;
    const broken = fall.at(crack + 0.01, 0);
    const before = fall.at(crack + falls - 0.02, 0);
    const after = fall.at(crack + falls + 0.02, 0);

    expect(broken.lean).toBeNull();
    expect(broken.crack).toEqual([]);
    expect(kinds(broken).has("block")).toBe(true);
    // The snow on its top goes down with the blocks it lay on.
    expect(broken.pieces.some(({ snow }) => (snow?.length ?? 0) >= 3)).toBe(true);
    expect(kinds(before).has("shard")).toBe(false);
    expect(kinds(after).has("shard")).toBe(true);
    // Each block comes down onto the route, none through it.
    for (let seconds = crack; seconds < fall.rests; seconds += 0.02) {
      for (const { corners } of fall.at(seconds, 0).pieces.filter(({ kind }) => kind === "block")) {
        expect(Math.min(...ys(corners))).toBeGreaterThan(-0.3);
      }
    }
  });

  it("shatters its blocks on the route across where its ice may land, and leaves them there as rubble", () => {
    const fall = fallOf();
    const still = fall.at(fall.rests + 0.1, 0);

    expect(fall.rubble.length).toBeGreaterThan(8);
    for (const piece of fall.rubble) {
      expect(Math.min(...xs(piece))).toBeGreaterThan(LANDING.from - 5);
      expect(Math.max(...xs(piece))).toBeLessThan(LANDING.to + 5);
      // Lying on the snow, sunk into it a little.
      expect(middle(piece).y).toBeGreaterThan(0);
      expect(middle(piece).y).toBeLessThan(0.8);
    }
    expect(still.pieces).toEqual([]);
    expect(fall.rests).toBeLessThan(fall.ends);
  });

  it("raises a cloud of ice dust as its ice lands, which rises and grows, rolls away on the wind, and settles", () => {
    const fall = fallOf();
    const lands = TIMING.crack + TIMING.fall;
    const soon = fall.at(lands + 0.5, 0).dust;
    const later = fall.at(lands + 4, 0).dust;
    const blown = fall.at(lands + 4, 1).dust;

    expect(soon.length).toBeGreaterThan(10);
    expect(Math.min(...later.map(({ y }) => y))).toBeGreaterThan(
      Math.min(...soon.map(({ y }) => y)) + 1,
    );
    expect(Math.max(...later.map(({ radius }) => radius))).toBeGreaterThan(
      Math.max(...soon.map(({ radius }) => radius)),
    );
    expect(mean(blown.map(({ x }) => x))).toBeGreaterThan(mean(later.map(({ x }) => x)) + 8);
    expect(fall.at(fall.ends + 0.1, 0).dust).toEqual([]);
    for (const { shows } of soon) {
      expect(shows).toBeGreaterThan(0);
      expect(shows).toBeLessThanOrEqual(1);
    }
  });

  it("shakes the picture a little as it cracks, more as its ice falls, hardest as it lands, then less and less", () => {
    const fall = fallOf();
    const lands = TIMING.crack + TIMING.fall;
    const cracking = fall.at(1, 0).shake;
    const falling = fall.at(TIMING.crack + 0.5, 0).shake;
    const landing = fall.at(lands + 0.02, 0).shake;
    const after = fall.at(lands + 3, 0).shake;

    expect(cracking).toBeGreaterThan(0);
    expect(falling).toBeGreaterThan(cracking);
    expect(landing).toBeGreaterThan(falling);
    expect(after).toBeLessThan(cracking);
  });

  it("falls the same from the same seed, and otherwise from another: its stump and its rubble whatever its seconds, so a reload lays them again", () => {
    const fall = fallOf();
    const quicker = fallOf(FIRST, { crack: 0.4, fall: 1.9 });
    const other = fallOf(FIRST, TIMING, 8);

    expect(quicker.stump).toEqual(fall.stump);
    expect(quicker.rubble).toEqual(fall.rubble);
    expect(fallOf().at(4, 0.3)).toEqual(fall.at(4, 0.3));
    expect(other.rubble).not.toEqual(fall.rubble);
  });

  it("breaks again from its stump, lower down", () => {
    const first = fallOf();
    const again = fallOf(FIRST, TIMING, 9, first.stump);

    expect(again.cut).toBeLessThan(first.cut);
    expect(again.cut).toBeGreaterThan(0);
    expect(again.top.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...ys(again.stump))).toBeLessThan(Math.max(...ys(first.stump)));
    expect(again.rubble.length).toBeGreaterThan(0);
  });

  it("breaks off at once with no crack, its ice still landing as the hazard comes down", () => {
    const sudden = fallOf(FIRST, { crack: 0, fall: 1.9 });

    expect(sudden.at(0, 0).lean).toBeNull();
    expect(sudden.at(0, 0).crack).toEqual([]);
    expect(kinds(sudden.at(1.88, 0)).has("shard")).toBe(false);
    expect(kinds(sudden.at(1.92, 0)).has("shard")).toBe(true);
  });
});
