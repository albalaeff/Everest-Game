import { describe, expect, it } from "vitest";

import { DayLight } from "./day-light";

const at = (hours: number, minutes = 0): DayLight => DayLight.at(hours * 3600 + minutes * 60);

describe("DayLight", () => {
  it("is night at four in the morning: no daylight, stars out, headlamps on", () => {
    const light = at(4);

    expect(light.phase).toBe("night");
    expect(light.daylight).toBe(0);
    expect(light.stars).toBe(1);
    expect(light.lamps).toBe(1);
    expect(light.glow).toBeLessThan(0.01);
  });

  it("is full day at noon: the sun at its highest, the stars gone, the lamps off", () => {
    const light = at(12);

    expect(light.phase).toBe("day");
    expect(light.sun).toBeCloseTo(1, 2);
    expect(light.daylight).toBe(1);
    expect(light.stars).toBe(0);
    expect(light.lamps).toBe(0);
  });

  it("glows at sunrise on the right, and at sunset on the left", () => {
    const dawn = at(5, 45);
    const dusk = at(18, 18);

    expect(dawn.phase).toBe("dawn");
    expect(dawn.glow).toBeGreaterThan(0.9);
    expect(dawn.glowSide).toBe(1);
    expect(dusk.phase).toBe("dusk");
    expect(dusk.glow).toBeGreaterThan(0.9);
    expect(dusk.glowSide).toBe(-1);
  });

  it("brightens through the morning without a step back, the lamps going out after the stars", () => {
    let last = at(4).daylight;
    for (let minutes = 0; minutes <= 180; minutes += 5) {
      const { daylight } = at(4, minutes);
      expect(daylight).toBeGreaterThanOrEqual(last);
      last = daylight;
    }
    expect(last).toBe(1);
    expect(at(5, 30).stars).toBeLessThan(at(5, 30).lamps);
  });

  it("wraps at midnight, and takes any day's seconds", () => {
    expect(DayLight.at(0).sun).toBeCloseTo(DayLight.at(DayLight.SECONDS_A_DAY).sun, 9);
    expect(DayLight.at(-3600).sun).toBeCloseTo(at(23).sun, 9);
    expect(at(2 * 24 + 12).phase).toBe("day");
  });

  it("knows when two lights draw the same picture", () => {
    expect(at(4).same(at(4, 20))).toBe(true);
    expect(at(5, 30).same(at(5, 45))).toBe(false);
    expect(at(5, 45).same(at(18, 18))).toBe(false);
  });
});
