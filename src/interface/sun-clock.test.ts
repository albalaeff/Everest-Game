import { describe, expect, it } from "vitest";

import { SunClock } from "./sun-clock";

const HOUR = 3600;
/** The ice warms from 06:00, warmest at 14:00, cold again from 20:00. */
const sun = new SunClock({ from: 6, peak: 14, until: 20 });

describe("SunClock: when the sun is on the ice (#194)", () => {
  it("counts down to the sun in the cold before it, to the minute", () => {
    expect(sun.at(3 * HOUR)).toEqual({ state: "cold", hours: 3, minutes: 0, warmth: 0 });
    expect(sun.at(4 * HOUR + 55 * 60 + 30)).toEqual({
      state: "cold",
      hours: 1,
      minutes: 4,
      warmth: 0,
    });
  });

  it("says the sun is on the ice from its hour, warming to the peak and cooling after", () => {
    expect(sun.at(6 * HOUR)).toMatchObject({ state: "warming", warmth: 0 });
    expect(sun.at(10 * HOUR)).toMatchObject({ state: "warming", warmth: 0.5 });
    expect(sun.at(14 * HOUR)).toMatchObject({ state: "cooling", warmth: 1 });
    expect(sun.at(17 * HOUR)).toMatchObject({ state: "cooling", warmth: 0.5 });
  });

  it("says the ice is cold again once the day's warmth is over, and counts to the next day's sun", () => {
    expect(sun.at(21 * HOUR)).toEqual({ state: "cold", hours: 9, minutes: 0, warmth: 0 });
  });

  it("refuses a day whose warmth doesn't rise to its peak and end after it", () => {
    expect(() => new SunClock({ from: 14, peak: 6, until: 20 })).toThrow(RangeError);
  });
});
