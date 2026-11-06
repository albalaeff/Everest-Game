import { describe, expect, it } from "vitest";

import { SeededRandom } from "../simulation";
import { type Star, Stars } from "./stars";
import { ThinAir } from "./thin-air";

/** The brightest star there is, to twinkle on its own. */
const BRIGHTEST: Star = { x: 0, y: 0, size: 1.7, phase: 0, faint: 0 };

describe("Stars", () => {
  it("scatters its stars over the open sky, above where the mountains are", () => {
    const { stars } = new Stars(120, SeededRandom.fromSeed(9));

    expect(stars).toHaveLength(120);
    for (const star of stars) {
      expect(star.x).toBeGreaterThanOrEqual(0);
      expect(star.x).toBeLessThan(1);
      expect(star.y).toBeGreaterThanOrEqual(0);
      expect(star.y).toBeLessThan(Stars.SKY_SHARE);
      expect(star.size).toBeGreaterThan(0);
      expect(star.faint).toBeGreaterThanOrEqual(0);
      expect(star.faint).toBeLessThan(1);
    }
  });

  it("draws a faint star smaller than a bright one", () => {
    const { stars } = new Stars(40, SeededRandom.fromSeed(9));
    const sorted = [...stars].sort((one, other) => one.faint - other.faint);

    expect(sorted[0]?.size).toBeGreaterThan(sorted[sorted.length - 1]?.size ?? Infinity);
  });

  it("twinkles each star a little, never out", () => {
    const brightness = Array.from({ length: 50 }, (_, tenth) =>
      Stars.twinkle(BRIGHTEST, tenth / 10, ThinAir.at(0)),
    );

    expect(Math.min(...brightness)).toBeGreaterThan(0.6);
    expect(Math.max(...brightness)).toBeLessThanOrEqual(1);
    expect(Math.max(...brightness) - Math.min(...brightness)).toBeGreaterThan(0.2);
  });

  it("shows more of the faint stars the thinner the air above, and twinkles them less", () => {
    const { stars } = new Stars(200, SeededRandom.fromSeed(9));
    const shown = (altitude: number): number =>
      stars.filter((star) => Stars.twinkle(star, 0, ThinAir.at(altitude)) > 0).length;
    const swing = (altitude: number): number => {
      const brightness = Array.from({ length: 50 }, (_, tenth) =>
        Stars.twinkle(BRIGHTEST, tenth / 10, ThinAir.at(altitude)),
      );
      return Math.max(...brightness) - Math.min(...brightness);
    };

    expect(shown(0)).toBeLessThan(shown(5_364));
    expect(shown(5_364)).toBeGreaterThan(stars.length / 2);
    expect(shown(8_849)).toBeGreaterThan(shown(5_364));
    expect(shown(8_849)).toBeLessThan(stars.length);
    expect(swing(8_849)).toBeLessThan(swing(5_364));
    expect(swing(5_364)).toBeLessThan(swing(0));
  });

  it("is the same sky on the same seed, and another on another", () => {
    expect(new Stars(20, SeededRandom.fromSeed(9)).stars).toEqual(
      new Stars(20, SeededRandom.fromSeed(9)).stars,
    );
    expect(new Stars(20, SeededRandom.fromSeed(10)).stars).not.toEqual(
      new Stars(20, SeededRandom.fromSeed(9)).stars,
    );
  });
});
