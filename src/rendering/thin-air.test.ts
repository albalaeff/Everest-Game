import { describe, expect, it } from "vitest";

import { ThinAir } from "./thin-air";

describe("ThinAir", () => {
  it("is none at sea level, and thinner the higher, never all gone", () => {
    const heights = [0, 2_000, 5_364, 6_065, 8_849, 20_000];
    const shares = heights.map((altitude) => ThinAir.at(altitude).share);

    expect(shares[0]).toBe(0);
    expect(shares.every((share, index) => index === 0 || share > (shares[index - 1] ?? 1))).toBe(
      true,
    );
    expect(shares.every((share) => share < 1)).toBe(true);
  });

  it("leaves about half the air below Base Camp and two thirds below the summit", () => {
    expect(ThinAir.at(5_364).share).toBeCloseTo(0.49, 2);
    expect(ThinAir.at(8_849).share).toBeCloseTo(0.67, 2);
  });

  it("is the same air over a few metres, and other air over a ladder's height of a wall", () => {
    expect(ThinAir.at(5_400).same(ThinAir.at(5_420))).toBe(true);
    expect(ThinAir.at(5_400).same(ThinAir.at(5_500))).toBe(false);
  });

  it("is no lower than sea level", () => {
    expect(ThinAir.at(-100).share).toBe(0);
  });
});
