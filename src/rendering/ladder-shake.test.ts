import { describe, expect, it } from "vitest";

import { LadderShake } from "./ladder-shake";
import type { Shake } from "./ladder-shake";

/** An 8 m ladder's shake. */
const shake = new LadderShake(8, 5);

/** A shake's drop at its start, middle and finish. */
const drops = (frame: Shake): readonly number[] => [0, 4, 8].map((along) => frame.drop(along));

/** The creak's drop at the free start, `seconds` in, every 10 ms over `span` seconds. */
const startOver = (span: number): readonly number[] =>
  Array.from({ length: Math.round(span * 100) }, (_, index) =>
    shake.creaking(index / 100, "start").drop(0),
  );

describe("LadderShake (#228)", () => {
  it("lies still at rest", () => {
    expect(drops(LadderShake.STILL)).toEqual([0, 0, 0]);
    expect(LadderShake.STILL.roll(4)).toBe(0);
  });

  it("creaking, drops its failing end in a few sharp jerks, holding between them, while the other end holds", () => {
    const path = startOver(3);
    const steps = path.slice(1).map((drop, index) => drop - (path[index] ?? 0));
    // A jerk is a drop of a centimetre or more within a few hundredths of a second.
    const jerks = steps
      .map((step, index) => ({ step, index }))
      .filter(({ step }, index) => step > 0.004 && (steps[index - 1] ?? 0) <= 0.004);

    expect(jerks.length).toBeGreaterThanOrEqual(4);
    expect(jerks.length).toBeLessThanOrEqual(6);
    // Unevenly apart, not a buzz.
    const gaps = jerks.slice(1).map(({ index }, at) => index - (jerks[at]?.index ?? 0));
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeGreaterThan(5);
    // Each further down than the last, by 10 to 25 cm in all.
    expect(path.at(-1)).toBeGreaterThan(0.1);
    expect(path.at(-1)).toBeLessThan(0.25);
    // The end that holds stays where it is.
    for (const seconds of [0.2, 0.9, 2.5]) {
      expect(Math.abs(shake.creaking(seconds, "start").drop(8))).toBeLessThan(1e-9);
    }
  });

  it("creaking, rings after each jerk: its middle swings up and down, and dies away", () => {
    // The first jerk comes 0.15 s in; the middle, with no end slipping, rings.
    const ring = (from: number): readonly number[] =>
      Array.from({ length: 15 }, (_, index) => shake.creaking(from + index / 100, null).drop(4));
    const after = ring(0.155);
    const crossings = after.slice(1).filter((drop, index) => drop * (after[index] ?? 0) < 0);

    expect(crossings.length).toBeGreaterThanOrEqual(2);
    expect(Math.max(...after.map(Math.abs))).toBeGreaterThan(0.005);
    expect(Math.max(...ring(0.155).map(Math.abs))).toBeGreaterThan(
      Math.max(...ring(0.155 + 0.25).map(Math.abs)),
    );
  });

  it("twisting, rocks over its long axis one way and the other, most at its middle and none at its ends", () => {
    const rolls = Array.from({ length: 300 }, (_, index) => shake.twisting(index / 100, 0).roll(4));

    expect(Math.max(...rolls)).toBeGreaterThan(0.25);
    expect(Math.min(...rolls)).toBeLessThan(-0.25);
    expect(Math.max(...rolls.map(Math.abs))).toBeLessThanOrEqual(0.4);
    for (const seconds of [0.5, 1.5, 2.5]) {
      expect(Math.abs(shake.twisting(seconds, 0).roll(0))).toBeLessThan(1e-9);
      expect(Math.abs(shake.twisting(seconds, 0).roll(8))).toBeLessThan(1e-9);
    }
  });

  it("twisting, grows as its twist comes, and settles once it's over", () => {
    const peak = (seconds: number, over: number): number =>
      Math.max(
        ...Array.from({ length: 80 }, (_, index) =>
          Math.abs(
            shake.twisting(seconds + index / 100, over + (over > 0 ? index / 100 : 0)).roll(4),
          ),
        ),
      );

    expect(peak(0, 0)).toBeLessThan(peak(1.5, 0));
    expect(peak(3, 2)).toBeLessThan(0.05 * peak(1.5, 0));
  });

  it("laid back across, bounces on the lip and settles", () => {
    expect(Math.abs(shake.landing(0.07).drop(4))).toBeGreaterThan(0.02);
    expect(Math.abs(shake.landing(1.5).drop(4))).toBeLessThan(0.001);
    expect(shake.landing(0.07).drop(0)).toBeCloseTo(0, 9);
  });
});
