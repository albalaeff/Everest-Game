import { describe, expect, it } from "vitest";

import { SeededRandom } from "../simulation";
import { Stars } from "./stars";

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
    }
  });

  it("twinkles each star a little, never out", () => {
    const [star] = new Stars(1, SeededRandom.fromSeed(9)).stars;
    const brightness = Array.from({ length: 50 }, (_, tenth) =>
      Stars.twinkle(star ?? { x: 0, y: 0, size: 1, phase: 0 }, tenth / 10),
    );

    expect(Math.min(...brightness)).toBeGreaterThan(0.6);
    expect(Math.max(...brightness)).toBeLessThanOrEqual(1);
    expect(Math.max(...brightness) - Math.min(...brightness)).toBeGreaterThan(0.2);
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
