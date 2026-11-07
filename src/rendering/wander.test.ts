import { describe, expect, it } from "vitest";

import { SeededRandom } from "../simulation";
import { Wander } from "./wander";

describe("Wander", () => {
  it("wanders between -1 and 1, smoothly: a metre's step moves it little", () => {
    const wander = new Wander(SeededRandom.fromSeed(5), 4);
    const values = Array.from({ length: 400 }, (_, index) => wander.at(index * 0.25));

    expect(Math.min(...values)).toBeGreaterThanOrEqual(-1);
    expect(Math.max(...values)).toBeLessThanOrEqual(1);
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.8);
    for (const [index, value] of values.entries()) {
      const next = values[index + 1] ?? value;
      expect(Math.abs(next - value)).toBeLessThan(0.25);
    }
  });

  it("is the same line on the same seed, and goes on past its knots and behind its start", () => {
    const one = new Wander(SeededRandom.fromSeed(5), 4);
    const two = new Wander(SeededRandom.fromSeed(5), 4);

    expect(one.at(17.3)).toBe(two.at(17.3));
    expect(one.at(-300)).toBe(one.at(-300));
    expect(Number.isFinite(one.at(1e6))).toBe(true);
    expect(new Wander(SeededRandom.fromSeed(6), 4).at(17.3)).not.toBe(one.at(17.3));
  });
});
