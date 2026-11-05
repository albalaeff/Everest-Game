import { describe, expect, it } from "vitest";

import { Atmosphere } from "./atmosphere";
import { Gust } from "./gust";
import { WeatherLook } from "./weather-look";

const seconds = (hours: number, minutes = 0): number => hours * 3600 + minutes * 60;

describe("Atmosphere", () => {
  it("opens at the hour's light and the weather's look, with no seconds gone", () => {
    const night = Atmosphere.at(seconds(3), "clear");
    const noon = Atmosphere.at(seconds(12), "snow");

    expect(night.light.phase).toBe("night");
    expect(night.look).toBe(WeatherLook.CLEAR);
    expect(night.elapsed).toBe(0);
    expect(night.gust).toBeCloseTo(new Gust("clear").at(0), 9);
    expect(noon.light.phase).toBe("day");
    expect(noon.look).toBe(WeatherLook.SNOW);
    expect(noon.palette.snowTint).toBe(0xffffff);
  });

  it("keeps the palette while the light looks the same, and mixes a new one as it changes", () => {
    const opened = Atmosphere.at(seconds(3), "clear");
    const later = opened.after(1, seconds(3, 1), "clear");
    const dawn = later.after(1, seconds(5, 45), "clear");

    expect(later.palette).toBe(opened.palette);
    expect(later.recoloured(opened)).toBe(false);
    expect(dawn.palette).not.toBe(opened.palette);
    expect(dawn.recoloured(later)).toBe(true);
    expect(dawn.light.glow).toBeGreaterThan(0.9);
  });

  it("counts the picture's seconds, and gusts by them in the weather now", () => {
    let atmosphere = Atmosphere.at(seconds(10), "clear");
    for (let frame = 0; frame < 120; frame += 1) {
      atmosphere = atmosphere.after(0.5, seconds(10), "wind");
    }

    expect(atmosphere.elapsed).toBeCloseTo(60, 9);
    expect(atmosphere.look).toBe(WeatherLook.WIND);
    expect(atmosphere.gust).toBeCloseTo(new Gust("wind").at(60), 9);
    expect(atmosphere.after(-1, seconds(10), "wind").elapsed).toBeCloseTo(60, 9);
  });
});
