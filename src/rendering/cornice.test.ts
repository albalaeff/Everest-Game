import { describe, expect, it } from "vitest";

import { SeededRandom } from "../simulation";
import { Cornice } from "./cornice";

const LIP = { x: 10, y: 5 };
/** An upright wall under the lip, and one leaning in under it, 0.8 m across for each metre down. */
const UPRIGHT = (): number => 10;
const LEANING = (y: number): number => 10 + (5 - y) * 0.8;

const cornices = (way: 1 | -1, wall: (y: number) => number): Cornice[] =>
  Array.from({ length: 40 }, (_, seed) => new Cornice(LIP, way, wall, SeededRandom.fromSeed(seed)));

describe("Cornice", () => {
  it("stands out over the drop the way it's laid, as far as its reach, and lies back on the snow", () => {
    for (const way of [1, -1] as const) {
      for (const { outline } of cornices(way, UPRIGHT)) {
        const out = outline.map(({ x }) => way * (x - LIP.x));
        expect(Math.max(...out)).toBeGreaterThanOrEqual(Cornice.REACH.min);
        expect(Math.max(...out)).toBeLessThanOrEqual(Cornice.REACH.max + 1e-9);
        expect(Math.min(...out)).toBeCloseTo(-Cornice.BACK, 9);
        expect(Math.max(...outline.map(({ y }) => y))).toBeGreaterThan(LIP.y);
        expect(Math.min(...outline.map(({ y }) => y))).toBeGreaterThanOrEqual(
          LIP.y - Cornice.THICK.max,
        );
      }
    }
  });

  it("hangs its icicles in the air past the wall, down from its underside, a few of them long", () => {
    const lengths: number[] = [];
    for (const wall of [UPRIGHT, LEANING]) {
      for (const way of [1, -1] as const) {
        for (const { icicles } of cornices(way, wall)) {
          expect(icicles.length).toBeGreaterThanOrEqual(Cornice.ICICLES.min);
          expect(icicles.length).toBeLessThanOrEqual(Cornice.ICICLES.max);
          for (const [left, right, tip] of icicles) {
            if (left === undefined || right === undefined || tip === undefined) {
              throw new RangeError("An icicle has three corners");
            }
            const length = left.y - tip.y;
            lengths.push(length);
            expect(left.y).toBe(right.y);
            expect(left.y).toBeLessThan(LIP.y);
            expect(length).toBeGreaterThanOrEqual(Cornice.ICICLE_LENGTH.min - 1e-9);
            expect(length).toBeLessThanOrEqual(Cornice.ICICLE_LENGTH.max + 1e-9);
            // Past the wall at its top, on the drop's side.
            expect(way * ((left.x + right.x) / 2 - wall(left.y))).toBeGreaterThan(0);
          }
        }
      }
    }
    expect(lengths.filter((length) => length > 0.7).length).toBeGreaterThan(0);
    expect(lengths.filter((length) => length < 0.4).length).toBeGreaterThan(lengths.length / 2);
  });

  it("reaches past a wall that leans in under it", () => {
    for (const { outline } of cornices(1, LEANING)) {
      const nose = Math.max(...outline.map(({ x }) => x));
      const underside = Math.min(...outline.map(({ y }) => y));
      expect(nose).toBeGreaterThan(LEANING(underside));
    }
  });

  it("is the same cornice on the same draw", () => {
    const one = new Cornice(LIP, 1, UPRIGHT, SeededRandom.fromSeed(3));
    const two = new Cornice(LIP, 1, UPRIGHT, SeededRandom.fromSeed(3));
    expect(one).toEqual(two);
  });
});
