import { describe, expect, it } from "vitest";

import { SeededRandom } from "../simulation";
import { Noise } from "./noise";

const NOISE = new Noise(SeededRandom.fromSeed(5));

describe("Noise", () => {
  it("stays between 0 and 1, and is the same at the same point on the same seed", () => {
    const again = new Noise(SeededRandom.fromSeed(5));
    for (let step = 0; step < 200; step += 1) {
      const [x, y] = [step * 0.37 - 20, step * 0.61 - 31];
      const value = NOISE.at(x, y);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      expect(again.at(x, y)).toBe(value);
    }
    expect(new Noise(SeededRandom.fromSeed(6)).at(3.3, 4.4)).not.toBe(NOISE.at(3.3, 4.4));
  });

  it("is smooth: near points are near in value, far ones aren't all alike", () => {
    for (let step = 0; step < 100; step += 1) {
      const [x, y] = [step * 0.83, step * 0.29];
      expect(Math.abs(NOISE.at(x + 0.01, y) - NOISE.at(x, y))).toBeLessThan(0.03);
      expect(Math.abs(NOISE.at(x, y + 0.01) - NOISE.at(x, y))).toBeLessThan(0.03);
    }
    const values = Array.from({ length: 50 }, (_, step) => NOISE.at(step * 1.7, step * 2.3));
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.5);
  });

  it("repeats after its size each way, with no seam", () => {
    expect(NOISE.at(1.25 + Noise.SIZE, 7.5)).toBeCloseTo(NOISE.at(1.25, 7.5), 12);
    expect(NOISE.at(1.25, 7.5 - Noise.SIZE)).toBeCloseTo(NOISE.at(1.25, 7.5), 12);
  });

  it("layers finer lumps on big ones, and folds into ridges", () => {
    for (let step = 0; step < 100; step += 1) {
      const [x, y] = [step * 0.41, step * 0.77];
      const fractal = NOISE.fractal(x, y, 3);
      expect(fractal).toBeGreaterThanOrEqual(0);
      expect(fractal).toBeLessThanOrEqual(1);
      const ridged = NOISE.ridged(x, y);
      expect(ridged).toBeGreaterThanOrEqual(0);
      expect(ridged).toBeLessThanOrEqual(1);
      expect(ridged).toBeCloseTo(1 - Math.abs(2 * NOISE.at(x, y) - 1), 12);
    }
    expect(NOISE.fractal(2.2, 3.3, 1)).toBeCloseTo(NOISE.at(2.2, 3.3), 12);
  });
});
