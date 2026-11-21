import { describe, expect, it } from "vitest";

import { Power } from "./power";

describe("a power from roots", () => {
  it("raises to the wind chill's 0.16 within a few parts in a hundred thousand", () => {
    const power = new Power(0.16);
    for (const wind of [1, 4.8, 10, 30, 60, 100, 150]) {
      // The reference only checks the roots: the core never uses `**` itself.
      const exact = wind ** 0.16;
      expect(Math.abs(power.of(wind) - exact) / exact).toBeLessThan(1e-4);
    }
  });

  it("raises to a half as a square root, to nought as one, and to one as the number", () => {
    expect(new Power(0.5).of(81)).toBeCloseTo(9, 3);
    expect(new Power(0).of(42)).toBe(1);
    expect(new Power(1).of(42)).toBe(42);
    expect(new Power(0.16).of(0)).toBe(0);
  });

  it("gives the same digits however often it's asked", () => {
    const power = new Power(0.16);
    expect(power.of(37.5)).toBe(new Power(0.16).of(37.5));
  });

  it("refuses a power past one, and a number under nought", () => {
    expect(() => new Power(1.5)).toThrow(RangeError);
    expect(() => new Power(-0.1)).toThrow(RangeError);
    expect(() => new Power(0.16).of(-1)).toThrow(RangeError);
  });
});
