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

  it("covers the sky in cloud and snow, little in a wind, and not at all when it's clear", () => {
    const { CLEAR, CLOUD, SNOW, WIND } = WeatherLook;

    expect(CLEAR.overcast).toBe(0);
    expect(WIND.overcast).toBeLessThan(0.3);
    expect(CLOUD.overcast).toBeGreaterThan(0.6);
    expect(SNOW.overcast).toBeGreaterThan(CLOUD.overcast);
    expect(SNOW.overcast).toBeLessThanOrEqual(1);
  });

  it("drifts fog across in cloud and thicker in snow, and a thin mist in front in snow alone", () => {
    const { CLEAR, CLOUD, SNOW, WIND } = WeatherLook;

    expect(CLEAR.fog).toBe(0);
    expect(WIND.fog).toBeLessThan(CLOUD.fog);
    expect(SNOW.fog).toBeGreaterThan(CLOUD.fog);
    expect(SNOW.mist).toBeGreaterThan(0);
    expect([CLEAR.mist, CLOUD.mist, WIND.mist]).toEqual([0, 0, 0]);
  });

  it("never veils the whole picture", () => {
    for (const weather of ["clear", "cloud", "snow", "wind"] as const) {
      expect(WeatherLook.of(weather).veil).toBeLessThan(0.5);
      expect(WeatherLook.of(weather).haze).toBeLessThanOrEqual(0.7);
      // The rope ahead still shows through the mist in front (docs/guidelines/graphics.md).
      expect(WeatherLook.of(weather).mist).toBeLessThanOrEqual(0.3);
    }
  });
});
