import { describe, expect, it } from "vitest";

import { LeastSize } from "./least-size";

// A phone held sideways, 412 px high: 20.6 px a metre at 20 m, 4.12 at 100 m.
const PHONE_AT_20_M = 412 / 20;
const PHONE_AT_100_M = 412 / 100;
// A PC, 720 px high: 72 px a metre at 10 m.
const PC_AT_10_M = 720 / 10;

describe("LeastSize", () => {
  it("draws a line true to scale while it's 1.5 px wide or more", () => {
    expect(new LeastSize(PC_AT_10_M).line(0.07)).toBe(0.07);
  });

  it("draws a thinner line 1.5 px wide: a rope seen from far out", () => {
    const far = new LeastSize(PHONE_AT_100_M);

    expect(far.line(0.07) * PHONE_AT_100_M).toBeCloseTo(1.5, 9);
    expect(far.line(0.15) * PHONE_AT_100_M).toBeCloseTo(1.5, 9);
  });

  it("draws a climber true to scale while they're 24 px tall or more", () => {
    expect(new LeastSize(PHONE_AT_20_M).climber(1.77)).toBe(1);
    expect(new LeastSize(PC_AT_10_M).climber(1.77)).toBe(1);
  });

  it("draws a smaller climber 24 px tall: 7 px true to scale on a phone at 100 m", () => {
    const grown = new LeastSize(PHONE_AT_100_M).climber(1.77);

    expect(1.77 * PHONE_AT_100_M).toBeLessThan(8);
    expect(1.77 * PHONE_AT_100_M * grown).toBeCloseTo(24, 9);
  });

  it("knows the scale it was made for", () => {
    expect(new LeastSize(PHONE_AT_20_M).pixelsPerMetre).toBe(PHONE_AT_20_M);
  });
});
