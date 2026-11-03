import { describe, expect, it } from "vitest";

import { SeededRandom } from "../simulation";
import { Snowfall } from "./snowfall";

const snowing = (count = 120, width = 640, height = 360): Snowfall =>
  new Snowfall(count, width, height, SeededRandom.fromSeed(7));

function allOnTheScreen(snow: Snowfall, width: number, height: number): boolean {
  return snow.flakes.every(
    (flake) => flake.x >= 0 && flake.x < width && flake.y >= 0 && flake.y < height,
  );
}

describe("Snowfall", () => {
  it("fills the screen with the flakes asked for, of a few sizes", () => {
    const snow = snowing(300);

    expect(snow.flakes).toHaveLength(300);
    expect(allOnTheScreen(snow, 640, 360)).toBe(true);
    expect(new Set(snow.flakes.map((flake) => flake.size)).size).toBeGreaterThan(10);
  });

  it("falls: a moment later every flake is lower, or back in at the top", () => {
    const snow = snowing();
    const before = snow.flakes.map((flake) => flake.y);

    snow.fall(0.1);

    for (const [index, flake] of snow.flakes.entries()) {
      const was = before[index] ?? 0;
      expect(flake.y > was || flake.y < was - 300).toBe(true);
    }
  });

  it("keeps every flake on the screen however long it snows", () => {
    const snow = snowing();

    for (let second = 0; second < 100; second += 1) {
      snow.fall(0.5);
    }

    expect(allOnTheScreen(snow, 640, 360)).toBe(true);
  });

  it("drifts with the wind, and comes back in at the other side", () => {
    const snow = snowing();
    const before = snow.flakes.map((flake) => flake.x);

    snow.fall(1, 200);

    expect(allOnTheScreen(snow, 640, 360)).toBe(true);
    expect(snow.flakes.some((flake, index) => flake.x !== before[index])).toBe(true);
  });

  it("fits a turned screen", () => {
    const snow = snowing();

    snow.resize(360, 640);
    snow.fall(0.01);

    expect(allOnTheScreen(snow, 360, 640)).toBe(true);
  });

  it("snows the same on the same seed", () => {
    const first = snowing();
    const second = snowing();

    first.fall(2);
    second.fall(2);

    expect(first.flakes).toEqual(second.flakes);
  });
});
