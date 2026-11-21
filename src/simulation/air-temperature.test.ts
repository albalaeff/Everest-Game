import { describe, expect, it } from "vitest";

import { AirTemperature } from "./air-temperature";

/** A clear day from −10 °C at 06:00 to 2 °C at 13:00 at a station at 5,000 m, 6 °C colder for
 * every kilometre higher. */
const air = new AirTemperature({
  days: {
    clear: { min: -10, max: 2 },
    cloud: { min: -7, max: -2 },
    snow: { min: -6, max: -3 },
    wind: { min: -13, max: -6 },
    storm: { min: -15, max: -9 },
  },
  coldest: 6,
  warmest: 13,
  lapse: 6,
  station: 5000,
});
const HOUR = 3600;
const STATION = 5000;
const at = (hour: number, weather: "clear" | "cloud" | "snow" | "wind" = "clear") =>
  air.at(hour * HOUR, weather, STATION);

describe("the air's temperature", () => {
  it("is coldest at sunrise and warmest at midday, and the next day's the same", () => {
    expect(at(6)).toBe(-10);
    expect(at(13)).toBe(2);
    expect(at(0)).toBeCloseTo(at(24), 9);
    expect(air.station(13 * HOUR, "clear")).toBe(2);
  });

  it("warms fast in the morning's sun and cools fast through the late afternoon, then slowly through the night", () => {
    // Halfway from sunrise to midday it's three quarters of the way up; halfway through the
    // night it has lost three quarters of the day's warmth.
    expect(at(9.5)).toBeCloseTo(-1, 9);
    expect(at(21.5)).toBeCloseTo(-7, 9);
    expect(at(8) - at(6)).toBeGreaterThan(at(13) - at(11));
    expect(at(13) - at(17)).toBeGreaterThan(at(2) - at(6));
    expect(at(3)).toBeGreaterThan(-10);
    expect(at(3)).toBeLessThan(-9.5);
  });

  it("has each weather's day: cloud and snow keep it near freezing, a strong wind brings colder air", () => {
    expect([at(6, "cloud"), at(13, "cloud")]).toEqual([-7, -2]);
    expect([at(6, "snow"), at(13, "snow")]).toEqual([-6, -3]);
    expect([at(6, "wind"), at(13, "wind")]).toEqual([-13, -6]);
  });

  it("is colder the higher it is, by the lapse rate", () => {
    expect(air.at(13 * HOUR, "clear", 6000)).toBeCloseTo(-4, 9);
    expect(air.at(6 * HOUR, "clear", 5500)).toBeCloseTo(-13, 9);
  });

  it("refuses a day that's warmest before it's coldest, or colder at its warmest", () => {
    const days = { clear: { min: -10, max: 2 }, cloud: { min: -7, max: -2 } };
    const snowAndWind = {
      snow: { min: -6, max: -3 },
      wind: { min: -13, max: -6 },
      storm: { min: -15, max: -9 },
    };
    expect(
      () =>
        new AirTemperature({
          days: { ...days, ...snowAndWind },
          coldest: 13,
          warmest: 6,
          lapse: 6,
          station: 5000,
        }),
    ).toThrow(RangeError);
    expect(
      () =>
        new AirTemperature({
          days: { ...days, ...snowAndWind, wind: { min: -6, max: -13 } },
          coldest: 6,
          warmest: 13,
          lapse: 6,
          station: 5000,
        }),
    ).toThrow(RangeError);
  });
});
