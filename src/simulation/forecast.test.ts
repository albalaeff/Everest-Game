import { describe, expect, it } from "vitest";

import { Forecast } from "./forecast";
import type { ForecastNumbers } from "./forecast";
import type { HazardWeather } from "./objective-hazards";
import type { WeatherTruth } from "./weather";

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

/** A made-up truth: snow every afternoon, a storm all of the day after tomorrow, the air colder
 * by night, the wind stronger in the snow. */
const TRUTH: WeatherTruth = {
  at(seconds: number): HazardWeather {
    const day = Math.floor(seconds / DAY);
    const hour = (seconds - day * DAY) / HOUR;
    return day % 3 === 2 ? "storm" : hour >= 12 && hour < 20 ? "snow" : "clear";
  },
  air(seconds: number, altitude: number): number {
    const hour = (seconds % DAY) / HOUR;
    return -10 + hour / 3 - (altitude - 5000) / 160;
  },
  wind(seconds: number): number {
    const weather = TRUTH.at(seconds);
    return weather === "storm" ? 60 : weather === "snow" ? 20 : 5;
  },
};
const BASE_CAMP: ForecastNumbers = {
  right: [0.95, 0.9, 0.85],
  storms: 0.9,
  air: 1,
  wind: 0.15,
};
const GENERAL: ForecastNumbers = {
  right: [0.85, 0.75, 0.65],
  storms: 0.5,
  air: 1.5,
  wind: 0.225,
};

/** The worst weather truly in the six hours from `from`, hour by hour, as a forecast says it. */
function worstOf(from: number): HazardWeather {
  const worse: readonly HazardWeather[] = ["clear", "cloud", "wind", "snow", "storm"];
  let worst = 0;
  for (let hour = 0; hour < 6; hour += 1) {
    worst = Math.max(worst, worse.indexOf(TRUTH.at(from + hour * HOUR + HOUR / 2)));
  }
  return worse[worst] ?? "clear";
}

/** The share of `seeds` climbs' forecasts issued at 06:00 on day 0 whose six hours `day` days
 * ahead call the sky right, and of the storms they call storms. */
function rightShares(
  numbers: ForecastNumbers,
  day: number,
  seeds = 600,
): { readonly right: number; readonly storms: number } {
  let right = 0;
  let periods = 0;
  let storms = 0;
  let stormy = 0;
  for (let seed = 1; seed <= seeds; seed += 1) {
    const forecast = new Forecast("base-camp", numbers, TRUTH, seed).issued(6 * HOUR, 5500);
    for (const period of forecast[day]?.periods ?? []) {
      const truly = worstOf(period.from);
      periods += 1;
      right += period.sky === truly ? 1 : 0;
      if (truly === "storm") {
        stormy += 1;
        storms += period.sky === "storm" ? 1 : 0;
      }
    }
  }
  return { right: right / periods, storms: stormy === 0 ? 1 : storms / stormy };
}

describe("a forecast (#272)", () => {
  it("covers the rest of today in six hours, then the two days after", () => {
    const days = new Forecast("base-camp", BASE_CAMP, TRUTH, 1).issued(DAY + 7 * HOUR, 5500);
    expect(days.map(({ day }) => day)).toEqual([0, 1, 2]);
    expect(days[0]?.periods.map(({ from }) => (from - DAY) / HOUR)).toEqual([6, 12, 18]);
    expect(days[1]?.periods.map(({ from }) => (from - 2 * DAY) / HOUR)).toEqual([0, 6, 12, 18]);
    expect(days[2]?.periods).toHaveLength(4);
  });

  it("says the same however often it's asked within six hours, and is issued afresh after", () => {
    const forecast = new Forecast("general", GENERAL, TRUTH, 42);
    expect(forecast.issued(6 * HOUR + 60, 5500)).toEqual(forecast.issued(11 * HOUR, 5500));
    const another = (seed: number) => new Forecast("general", GENERAL, TRUTH, seed);
    const differ = [...Array(40).keys()].some(
      (seed) =>
        JSON.stringify(another(seed).issued(6 * HOUR, 5500)[2]) !==
        JSON.stringify(another(seed).issued(12 * HOUR, 5500)[2]),
    );
    expect(differ).toBe(true);
  });

  it("is right more often today than tomorrow, and tomorrow than the day after", () => {
    const shares = [0, 1, 2].map((day) => rightShares(BASE_CAMP, day).right);
    expect(shares[0]).toBeGreaterThan(shares[1] ?? 1);
    expect(shares[1]).toBeGreaterThan(shares[2] ?? 1);
    expect(shares[0]).toBeCloseTo(0.95, 1);
  });

  it("from the general model, misses more, a storm most of all", () => {
    const baseCamp = rightShares(BASE_CAMP, 2);
    const general = rightShares(GENERAL, 2);
    expect(general.right).toBeLessThan(baseCamp.right);
    expect(general.storms).toBeLessThan(baseCamp.storms - 0.25);
  });

  it("puts the air and the wind near the truth, further off further ahead", () => {
    const spread = (day: number) => {
      let air = 0;
      let count = 0;
      for (let seed = 1; seed <= 300; seed += 1) {
        for (const period of new Forecast("general", GENERAL, TRUTH, seed).issued(0, 5500)[day]
          ?.periods ?? []) {
          air = Math.max(air, Math.abs(period.air - TRUTH.air(period.from + 3 * HOUR, 5500)));
          count += 1;
        }
      }
      return { air, count };
    };
    expect(spread(0).air).toBeLessThanOrEqual(1.5);
    expect(spread(2).air).toBeGreaterThan(1.5);
    expect(spread(2).air).toBeLessThanOrEqual(4.5);
  });

  it("from Base Camp's forecaster, says how sure: less the further ahead, and less of snow", () => {
    const days = new Forecast("base-camp", BASE_CAMP, TRUTH, 3).issued(0, 5500);
    const general = new Forecast("general", GENERAL, TRUTH, 3).issued(0, 5500);
    expect(days.map(({ confidence }) => confidence)).toEqual(
      days.map(({ day, periods }) => {
        const falling = periods.some(({ sky }) => sky === "snow" || sky === "storm") ? 1 : 0;
        return (["high", "medium", "low"] as const)[Math.min(2, day + falling)];
      }),
    );
    expect(general.every(({ confidence }) => confidence === null)).toBe(true);
  });

  it("refuses chances that aren't shares and errors under nought", () => {
    expect(() => new Forecast("general", { ...GENERAL, storms: 1.2 }, TRUTH, 1)).toThrow(
      RangeError,
    );
    expect(() => new Forecast("general", { ...GENERAL, air: -1 }, TRUTH, 1)).toThrow(RangeError);
  });
});
