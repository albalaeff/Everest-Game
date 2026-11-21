import { describe, expect, it } from "vitest";

import { AirTemperature } from "./air-temperature";
import { DayWarmth } from "./day-warmth";
import { Expedition } from "./expedition";
import { MountainClock } from "./mountain-clock";
import type { HazardWeather } from "./objective-hazards";
import { Weather } from "./weather";
import type { DrawnDay, WeatherNumbers } from "./weather";
import { Wind } from "./wind";

const HOUR = 60 * 60;
const DAY = 24 * HOUR;
/** Bad days four in ten, in spells; a clear spring morning, snow from the afternoon on a bad day;
 * the sky turning over 40 minutes. Made up, to show the rule. */
const NUMBERS: WeatherNumbers = {
  bad: { afterGood: 0.3, afterBad: 0.6 },
  windy: 0.25,
  stormy: 0.3,
  hours: {
    cloud: { min: 9, max: 12 },
    snow: { min: 12, max: 15 },
    clearing: { min: 19, max: 22 },
    wind: { min: 7, max: 10 },
    calm: { min: 17, max: 20 },
    storm: { min: 2, max: 6 },
    easing: { min: 18, max: 22 },
  },
  turn: 40 * 60,
};
const AIR = new AirTemperature({
  days: {
    clear: { min: -10, max: 2 },
    cloud: { min: -7, max: -2 },
    snow: { min: -6, max: -3 },
    wind: { min: -13, max: -6 },
    storm: { min: -13, max: -8 },
  },
  coldest: 6,
  warmest: 13,
  lapse: 6,
  station: 5000,
});
const WIND = new Wind(
  {
    still: 4,
    thermal: 10,
    snow: 20,
    strong: 45,
    storm: 60,
    gust: 70,
    scale: { breeze: 6, fresh: 29, strong: 50, gale: 62 },
  },
  new DayWarmth({ from: 6, peak: 14, until: 20 }, { cloud: 0.3, snow: 0 }),
);

/** The weather of a climb from `seed`, its clock at midnight on 20 April, holding `held` if
 * given. */
function weatherOf(
  seed: number,
  held?: HazardWeather,
): { readonly weather: Weather; readonly clock: MountainClock; readonly climb: Expedition } {
  const clock = new MountainClock(60);
  const weather = new Weather(NUMBERS, clock, AIR, WIND);
  const climb = Expedition.start(
    {
      seed,
      climbers: [],
      start: {
        [MountainClock.NAME]: MountainClock.start({ date: "2026-04-20", time: "00:00" }),
        [Weather.NAME]: Weather.start(held === undefined ? { seed } : { seed, held }),
      },
    },
    [clock, weather],
  );
  return { weather, clock, climb };
}

const bad = ({ kind }: DrawnDay): boolean => kind === "unsettled" || kind === "stormy";

/** The first day of `kind` some seed draws, and the weather that drew it. */
function firstDay(kind: DrawnDay["kind"]): { readonly weather: Weather; readonly day: number } {
  for (let seed = 1; seed < 200; seed += 1) {
    const { weather } = weatherOf(seed);
    for (let day = 0; day < 20; day += 1) {
      if (weather.dayOf(day).kind === kind) {
        return { weather, day };
      }
    }
  }
  throw new Error(`No seed draws a ${kind} day`);
}

describe("the weather (#272)", () => {
  it("draws the same days from the same seed, and other days from another", () => {
    const kinds = (seed: number) =>
      Array.from({ length: 40 }, (_, day) => weatherOf(seed).weather.dayOf(day).kind);
    expect(kinds(7)).toEqual(kinds(7));
    expect(kinds(7)).not.toEqual(kinds(8));
  });

  it("brings bad days about four in ten, in spells that last", () => {
    const { weather } = weatherOf(11);
    const days = Array.from({ length: 4000 }, (_, day) => weather.dayOf(day));
    const bads = days.filter(bad).length;
    const pairs = days.slice(1).filter((day, index) => bad(day) && bad(days[index] as DrawnDay));
    // 0.3 / (1 − 0.6 + 0.3) of the days are bad, and a bad day follows a bad one six times in ten.
    expect(bads / days.length).toBeCloseTo(0.3 / 0.7, 1);
    expect(pairs.length / days.slice(0, -1).filter(bad).length).toBeCloseTo(0.6, 1);
  });

  it("goes as a spring day in the Khumbu: clear mornings, snow from the afternoon", () => {
    const { weather, day } = firstDay("unsettled");
    const [clear, cloud, snow, clearing] = weather.dayOf(day).spells;
    const hour = (seconds: number | undefined) => ((seconds ?? -1) - day * DAY) / HOUR;
    expect([clear?.weather, cloud?.weather, snow?.weather, clearing?.weather]).toEqual([
      "clear",
      "cloud",
      "snow",
      "cloud",
    ]);
    expect(hour(clear?.from)).toBe(0);
    expect(hour(cloud?.from)).toBeGreaterThanOrEqual(9);
    expect(hour(cloud?.from)).toBeLessThan(12);
    expect(hour(snow?.from)).toBeGreaterThanOrEqual(12);
    expect(hour(snow?.from)).toBeLessThan(15);
    expect(hour(clearing?.from)).toBeGreaterThanOrEqual(19);
    expect(hour(clearing?.from)).toBeLessThan(22);
    expect(weather.at(day * DAY + 6 * HOUR)).toBe("clear");
    expect(weather.at(day * DAY + 16 * HOUR)).toBe("snow");
  });

  it("has windy days, and stormy days of snow in a gale", () => {
    const windy = firstDay("windy");
    expect(windy.weather.dayOf(windy.day).spells.map(({ weather }) => weather)).toEqual([
      "clear",
      "wind",
      "clear",
    ]);
    const stormy = firstDay("stormy");
    expect(stormy.weather.dayOf(stormy.day).spells.map(({ weather }) => weather)).toEqual([
      "cloud",
      "storm",
      "snow",
    ]);
    expect(stormy.weather.at(stormy.day * DAY + 12 * HOUR)).toBe("storm");
  });

  it("turns the sky over its turn, the weather of the hour changing halfway", () => {
    const { weather, day } = firstDay("unsettled");
    const snow = weather.dayOf(day).spells[2]?.from ?? 0;
    const half = NUMBERS.turn / 2;
    expect(weather.turnAt(snow - half - 60)).toEqual({ from: "cloud", to: "cloud", share: 1 });
    expect(weather.turnAt(snow - half / 2)).toEqual({ from: "cloud", to: "snow", share: 0.25 });
    expect(weather.at(snow - 1)).toBe("cloud");
    expect(weather.at(snow)).toBe("snow");
    expect(weather.turnAt(snow + half / 2).share).toBeCloseTo(0.75, 9);
    expect(weather.turnAt(snow + half + 60)).toEqual({ from: "snow", to: "snow", share: 1 });
  });

  it("turns the air and the wind with the sky, between the two weathers'", () => {
    const { weather, day } = firstDay("unsettled");
    const snow = weather.dayOf(day).spells[2]?.from ?? 0;
    const timeOfDay = snow - day * DAY;
    const halfway = [AIR.at(timeOfDay, "cloud", 5500), AIR.at(timeOfDay, "snow", 5500)];
    expect(weather.air(snow, 5500)).toBeCloseTo(((halfway[0] ?? 0) + (halfway[1] ?? 0)) / 2, 9);
    const winds = [WIND.steady(timeOfDay, "cloud"), WIND.steady(timeOfDay, "snow")];
    expect(weather.wind(snow)).toBeCloseTo(((winds[0] ?? 0) + (winds[1] ?? 0)) / 2, 9);
  });

  it("reads the weather of the hour off the mountain's clock, and the kind of day it is", () => {
    const { weather, clock, climb } = weatherOf(21);
    clock.skip(2 * DAY + 16 * HOUR);
    climb.advance([]);
    expect(weather.seconds).toBeCloseTo(2 * DAY + 16 * HOUR + clock.secondsAStep, 6);
    expect(weather.now).toBe(weather.at(weather.seconds));
    expect(weather.turn).toEqual(weather.turnAt(weather.seconds));
    expect(weather.today).toBe(weather.dayOf(2).kind);
    expect(weather.airNow(5500)).toBe(weather.air(weather.seconds, 5500));
    expect(weather.windNow()).toBe(weather.wind(weather.seconds));
  });

  it("holds a weather all climb long when a scenario or the god mode says so, and lets it go", () => {
    const { weather, clock, climb } = weatherOf(3, "storm");
    clock.skip(5 * DAY + 3 * HOUR);
    climb.advance([]);
    expect(weather.now).toBe("storm");
    expect(weather.turn).toEqual({ from: "storm", to: "storm", share: 1 });
    expect(weather.held).toBe("storm");
    expect(weather.today).toBeNull();
    weather.hold(null);
    expect(weather.held).toBeNull();
    expect(weather.now).toBe(weather.at(weather.seconds));
    expect(weather.today).toBe(weather.dayOf(5).kind);
  });

  it("keeps its seed and what it holds in a save, and a save from before it holds clear", () => {
    const { weather } = weatherOf(5);
    expect(weather.save()).toEqual({ seed: 5, held: null });
    weather.hold("snow");
    expect(weather.save()).toEqual({ seed: 5, held: "snow" });
    expect(weather.missing()).toEqual({ seed: 0, held: "clear" });
  });

  it("refuses chances that aren't shares, hours past a day, and a weather it doesn't know", () => {
    const clock = new MountainClock(60);
    const wrong = { ...NUMBERS, bad: { afterGood: 1.2, afterBad: 0.6 } };
    expect(() => new Weather(wrong, clock, AIR, WIND)).toThrow(RangeError);
    const late = { ...NUMBERS, hours: { ...NUMBERS.hours, snow: { min: 12, max: 25 } } };
    expect(() => new Weather(late, clock, AIR, WIND)).toThrow(RangeError);
    expect(() => Weather.start({ seed: 1, held: "fog" as HazardWeather })).toThrow(RangeError);
  });
});
