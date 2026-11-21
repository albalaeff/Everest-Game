import { describe, expect, it } from "vitest";

import { WindChill } from "./wind-chill";
import type { WindChillNumbers } from "./wind-chill";

/** Canada's and the United States' index, a meter that takes the wind in its hand for two thirds
 * of the wind 10 m up, and Canada's bands of the risk of frostbite. */
const NUMBERS: WindChillNumbers = {
  constant: 13.12,
  air: 0.6215,
  wind: 11.37,
  airInWind: 0.3965,
  power: 0.16,
  warmest: 10,
  calmest: 4.8,
  factor: 1.5,
  risks: {
    moderate: { from: -10, freezes: null },
    high: { from: -28, freezes: { min: 10, max: 30 } },
    "very-high": { from: -40, freezes: { min: 5, max: 10 } },
    severe: { from: -48, freezes: { min: 2, max: 5 } },
    extreme: { from: -55, freezes: { min: 2, max: 2 } },
  },
};
const index = new WindChill(NUMBERS);

describe("the wind chill a weather meter works out", () => {
  it("is Canada's index for the wind 10 m up: the wind in the meter's hand, by its factor", () => {
    // Canada's table: −10 °C in a 20 km/h wind feels like −18, and −20 °C in 30 km/h like −33.
    expect(index.of(-10, 20 / 1.5).chill).toBeCloseTo(-17.86, 2);
    expect(index.of(-20, 20).chill).toBeCloseTo(-32.57, 2);
    expect(index.of(-10, 4).chill).toBeCloseTo(-13.52, 2);
  });

  it("is the air itself where the index doesn't hold: in a calm, or in air over 10 °C", () => {
    expect(index.of(-10, 3).chill).toBe(-10);
    expect(index.of(12, 40).chill).toBe(12);
    expect(index.of(-10, 0)).toEqual({ chill: -10, risk: "moderate", freezes: null });
  });

  it("names the risk of frostbite by Canada's bands, of its whole degrees", () => {
    const risk = (air: number) => index.of(air, 0).risk;
    expect([5, -9.4, -9.6, -27.4, -27.6, -39, -40, -47, -48, -54, -55, -70].map(risk)).toEqual([
      "low",
      "low",
      "moderate",
      "moderate",
      "high",
      "high",
      "very-high",
      "very-high",
      "severe",
      "severe",
      "extreme",
      "extreme",
    ]);
  });

  it("says how soon bare skin can freeze, where Canada gives a time", () => {
    expect(index.of(-30, 0).freezes).toEqual({ min: 10, max: 30 });
    expect(index.of(-60, 0).freezes).toEqual({ min: 2, max: 2 });
    expect(index.of(-20, 0).freezes).toBeNull();
    expect(index.of(0, 0).freezes).toBeNull();
  });

  it("refuses bands that don't get colder as the risk rises", () => {
    const risks = { ...NUMBERS.risks, high: { from: -8, freezes: { min: 10, max: 30 } } };
    expect(() => new WindChill({ ...NUMBERS, risks })).toThrow(RangeError);
  });
});
