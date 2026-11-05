import { describe, expect, it } from "vitest";

import { WeatherLook } from "./weather-look";

describe("WeatherLook", () => {
  it("has a look for each weather, with the most snow and the thickest veil in snow", () => {
    const { CLEAR, CLOUD, SNOW, WIND } = WeatherLook;

    expect(WeatherLook.of("clear")).toBe(CLEAR);
    expect(WeatherLook.of("snow")).toBe(SNOW);
    expect(CLEAR.snowfall).toBeLessThan(CLOUD.snowfall);
    expect(CLOUD.snowfall).toBeLessThan(SNOW.snowfall);
    expect(SNOW.snowfall).toBe(1);
    expect(WIND.snowfall).toBeGreaterThan(CLEAR.snowfall);
    expect(CLEAR.haze).toBe(0);
    expect(CLOUD.haze).toBeGreaterThan(WIND.haze);
    expect(SNOW.haze).toBeGreaterThan(CLOUD.haze);
    expect(CLEAR.veil).toBe(0);
    expect(SNOW.veil).toBeGreaterThan(CLOUD.veil);
  });

  it("never veils the whole picture", () => {
    for (const weather of ["clear", "cloud", "snow", "wind"] as const) {
      expect(WeatherLook.of(weather).veil).toBeLessThan(0.5);
      expect(WeatherLook.of(weather).haze).toBeLessThanOrEqual(0.7);
    }
  });
});
