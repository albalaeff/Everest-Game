import { describe, expect, it } from "vitest";

import type { HazardWeather } from "../simulation";
import { Gust } from "./gust";

const mean = (weather: HazardWeather): number => {
  const gust = new Gust(weather);
  let sum = 0;
  for (let second = 0; second < 600; second += 0.5) {
    sum += gust.at(second);
  }
  return sum / 1200;
};

describe("Gust", () => {
  it("stays between still and full, whatever the weather", () => {
    for (const weather of ["clear", "cloud", "snow", "wind"] as const) {
      const gust = new Gust(weather);
      for (let second = 0; second < 120; second += 0.1) {
        expect(gust.at(second)).toBeGreaterThanOrEqual(0);
        expect(gust.at(second)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("blows hardest in wind, and barely in clear air", () => {
    expect(mean("wind")).toBeGreaterThan(mean("snow"));
    expect(mean("snow")).toBeGreaterThan(mean("clear"));
    expect(mean("clear")).toBeCloseTo(Gust.MEAN.clear, 1);
  });

  it("comes in gusts: it rises and falls over the seconds", () => {
    const wind = new Gust("wind");
    const gusts = Array.from({ length: 60 }, (_, second) => wind.at(second));

    expect(Math.max(...gusts) - Math.min(...gusts)).toBeGreaterThan(0.3);
    expect(wind.at(10)).toBe(wind.at(10));
  });
});
