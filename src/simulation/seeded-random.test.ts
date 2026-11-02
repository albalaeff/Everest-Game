import { describe, expect, it } from "vitest";

import { SeededRandom } from "./seeded-random";

const draws = (random: SeededRandom, count: number): number[] =>
  Array.from({ length: count }, () => random.word());

describe("SeededRandom", () => {
  it("draws the published numbers of xoshiro128** from its reference state", () => {
    expect(draws(SeededRandom.restore([1, 2, 3, 4]), 3)).toEqual([11520, 0, 5927040]);
  });

  it("keeps each seed's draws: changing them would break every replay ever saved", () => {
    // Worked out apart from this code.
    expect(draws(SeededRandom.fromSeed(1), 5)).toEqual([
      2442144158, 3238099751, 3819917871, 2104621829, 2021136066,
    ]);
    expect(draws(SeededRandom.fromSeed(2026), 5)).toEqual([
      1436751614, 742089593, 1736781944, 1312845263, 2711517162,
    ]);
    expect(draws(SeededRandom.fromSeed(4294967295), 5)).toEqual([
      835879718, 1921286648, 2356205009, 1885780724, 980451116,
    ]);
  });

  it("gives the same draws for the same seed", () => {
    expect(draws(SeededRandom.fromSeed(42), 100)).toEqual(draws(SeededRandom.fromSeed(42), 100));
  });

  it("gives other draws for another seed", () => {
    expect(draws(SeededRandom.fromSeed(42), 100)).not.toEqual(
      draws(SeededRandom.fromSeed(43), 100),
    );
  });

  it("draws fractions from 0 up to, and not including, 1", () => {
    const random = SeededRandom.fromSeed(5);
    const fractions = Array.from({ length: 10_000 }, () => random.fraction());

    expect(fractions.every((fraction) => fraction >= 0 && fraction < 1)).toBe(true);
    const mean = fractions.reduce((sum, fraction) => sum + fraction, 0) / fractions.length;
    expect(mean).toBeGreaterThan(0.48);
    expect(mean).toBeLessThan(0.52);
  });

  it("takes a chance as often as its probability says", () => {
    const random = SeededRandom.fromSeed(6);
    const tries = Array.from({ length: 100_000 }, () => random.chance(0.25));
    const share = tries.filter(Boolean).length / tries.length;

    expect(share).toBeGreaterThan(0.24);
    expect(share).toBeLessThan(0.26);
  });

  it("never takes a chance of 0, and always one of 1", () => {
    const random = SeededRandom.fromSeed(7);

    for (let draw = 0; draw < 10_000; draw += 1) {
      expect(random.chance(0)).toBe(false);
      expect(random.chance(1)).toBe(true);
    }
  });

  it("rolls whole numbers within both ends, and reaches both", () => {
    const random = SeededRandom.fromSeed(8);
    const rolls = new Set(Array.from({ length: 1_000 }, () => random.between(1, 6)));

    expect([...rolls].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("goes on from a save, through JSON, exactly where it left off", () => {
    const random = SeededRandom.fromSeed(9);
    draws(random, 10);

    const restored = SeededRandom.restore(JSON.parse(JSON.stringify(random.save())));

    expect(draws(restored, 100)).toEqual(draws(random, 100));
  });

  it("keeps a save apart from the generator it came from", () => {
    const random = SeededRandom.fromSeed(10);
    const saved = random.save();
    const before = [...saved];

    draws(random, 10);

    expect(saved).toEqual(before);
  });
});
