import { describe, expect, it } from "vitest";

import { DayWarmth } from "../simulation";
import { WindMeter } from "./wind-meter";

/** The sun warms the ice from 06:00 to 14:00, and none of it comes through falling snow. */
const warmth = new DayWarmth({ from: 6, peak: 14, until: 20 }, { cloud: 0.3, snow: 0 });
const meter = new WindMeter({ still: 4, thermal: 10, snow: 25, strong: 45, gust: 65 }, warmth);
const HOUR = 3600;

describe("the wind meter", () => {
  it("reads the still of the night, and the thermals as the day warms", () => {
    expect(meter.steady(3 * HOUR, "clear")).toBe(4);
    expect(meter.steady(10 * HOUR, "clear")).toBe(9);
    expect(meter.steady(14 * HOUR, "clear")).toBe(14);
    expect(meter.steady(14 * HOUR, "cloud")).toBe(7);
  });

  it("reads a storm's wind and a strong wind, whatever the hour", () => {
    expect(meter.steady(3 * HOUR, "snow")).toBe(25);
    expect(meter.steady(14 * HOUR, "snow")).toBe(25);
    expect(meter.steady(3 * HOUR, "wind")).toBe(45);
    expect(meter.steady(14 * HOUR, "wind")).toBe(55);
  });

  it("reads a gust over whatever blows", () => {
    expect(meter.gust(3 * HOUR, "clear")).toBe(65);
    expect(meter.gust(14 * HOUR, "wind")).toBe(65);
  });

  it("names a wind by the Beaufort scale", () => {
    expect([4, 14, 45, 55, 65].map((speed) => WindMeter.named(speed))).toEqual([
      "calm",
      "breeze",
      "fresh",
      "strong",
      "gale",
    ]);
  });

  it("refuses speeds that don't rise to a gust", () => {
    expect(
      () => new WindMeter({ still: 4, thermal: 10, snow: 25, strong: 20, gust: 65 }, warmth),
    ).toThrow(RangeError);
  });
});
