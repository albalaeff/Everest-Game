import { describe, expect, it } from "vitest";

import { Atmosphere } from "./atmosphere";
import { Gust } from "./gust";
import { Palette } from "./palette";
import { ThinAir } from "./thin-air";
import { WeatherLook } from "./weather-look";

const seconds = (hours: number, minutes = 0): number => hours * 3600 + minutes * 60;
/** Base Camp's altitude, where the Icefall begins, and Camp 1's, where it ends. */
const BASE_CAMP = 5_364;
const CAMP_ONE = 6_065;

describe("Atmosphere", () => {
  it("opens at the hour's light, the altitude's air and the weather's look, with no seconds gone", () => {
    const night = Atmosphere.at(seconds(3), "clear", BASE_CAMP);
    const noon = Atmosphere.at(seconds(12), "snow", BASE_CAMP);

    expect(night.light.phase).toBe("night");
    expect(night.air.share).toBeCloseTo(ThinAir.at(BASE_CAMP).share, 9);
    expect(night.look).toBe(WeatherLook.CLEAR);
    expect(night.elapsed).toBe(0);
    expect(night.gust).toBeCloseTo(new Gust("clear").at(0), 9);
    expect(noon.light.phase).toBe("day");
    expect(noon.look).toBe(WeatherLook.SNOW);
    expect(noon.palette.snowTint).toBe(0xffffff);
  });

  it("keeps the palette while the light, the air and the weather look the same, and mixes a new one as one changes", () => {
    const opened = Atmosphere.at(seconds(3), "clear", BASE_CAMP);
    const later = opened.after(1, seconds(3, 1), "clear", BASE_CAMP + 5);
    const dawn = later.after(1, seconds(5, 45), "clear", BASE_CAMP + 5);
    const higher = dawn.after(1, seconds(5, 45), "clear", CAMP_ONE);
    const clouded = higher.after(1, seconds(5, 45), "cloud", CAMP_ONE);

    expect(later.palette).toBe(opened.palette);
    expect(later.recoloured(opened)).toBe(false);
    expect(dawn.palette).not.toBe(opened.palette);
    expect(dawn.recoloured(later)).toBe(true);
    expect(dawn.light.glow).toBeGreaterThan(0.9);
    expect(higher.recoloured(dawn)).toBe(true);
    expect(clouded.recoloured(higher)).toBe(true);
  });

  it("recolours a slow dawn and a slow climb once they show, though no frame's step shows", () => {
    // At 60 frames a second a frame is 0.6 s of the mountain's time (time.compression): too
    // little light or air between two frames to show, a lot over a minute of them.
    const start = seconds(5, 20);
    let atmosphere = Atmosphere.at(start, "clear", BASE_CAMP);
    const opened = atmosphere.palette;
    for (let frame = 1; frame <= 3_600; frame += 1) {
      atmosphere = atmosphere.after(1 / 60, start + frame * 0.6, "clear", BASE_CAMP + frame * 0.2);
    }
    const mixedNow = new Palette(atmosphere.light, atmosphere.air, atmosphere.look);
    const apart = (one: number, other: number): number =>
      Math.abs(Palette.brightness(one) - Palette.brightness(other));

    expect(atmosphere.palette).not.toBe(opened);
    expect(apart(atmosphere.palette.snowTint, mixedNow.snowTint)).toBeLessThan(4);
    expect(apart(atmosphere.palette.skyTop, mixedNow.skyTop)).toBeLessThan(4);
    expect(apart(atmosphere.palette.skyTop, opened.skyTop)).toBeGreaterThan(20);
  });

  it("dims the glow and the stars under cloud, and all but hides them in snow", () => {
    const sunrise = (weather: "clear" | "cloud" | "snow"): Atmosphere =>
      Atmosphere.at(seconds(5, 45), weather, BASE_CAMP);
    const night = (weather: "clear" | "cloud" | "snow"): Atmosphere =>
      Atmosphere.at(seconds(2), weather, BASE_CAMP);

    expect(sunrise("clear").glow).toBe(sunrise("clear").light.glow);
    expect(sunrise("cloud").glow).toBeLessThan(sunrise("clear").glow / 2);
    expect(sunrise("snow").glow).toBeLessThan(sunrise("cloud").glow);
    expect(night("clear").stars).toBe(1);
    expect(night("cloud").stars).toBeLessThan(0.5);
    expect(night("snow").stars).toBeLessThan(0.1);
  });

  it("counts the picture's seconds, and gusts by them in the weather now", () => {
    let atmosphere = Atmosphere.at(seconds(10), "clear", BASE_CAMP);
    for (let frame = 0; frame < 120; frame += 1) {
      atmosphere = atmosphere.after(0.5, seconds(10), "wind", BASE_CAMP);
    }

    expect(atmosphere.elapsed).toBeCloseTo(60, 9);
    expect(atmosphere.look).toBe(WeatherLook.WIND);
    expect(atmosphere.gust).toBeCloseTo(new Gust("wind").at(60), 9);
    expect(atmosphere.after(-1, seconds(10), "wind", BASE_CAMP).elapsed).toBeCloseTo(60, 9);
  });
});
