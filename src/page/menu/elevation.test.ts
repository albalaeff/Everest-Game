import { describe, expect, it } from "vitest";

import { Elevation } from "./elevation";

describe("Elevation", () => {
  const elevation = new Elevation(8849);

  it("puts the summit at its place on the picture", () => {
    expect(elevation.place(0, 8849)).toEqual(Elevation.SUMMIT);
  });

  it("draws a metre up the same as a metre across: the mountain keeps its proportions", () => {
    const camp = elevation.place(1000, 7849);

    expect(camp.x - Elevation.SUMMIT.x).toBeCloseTo(1000 * Elevation.PIXELS_A_METRE);
    expect(camp.y - Elevation.SUMMIT.y).toBeCloseTo(1000 * Elevation.PIXELS_A_METRE);
  });

  it("reads an altitude back off the picture", () => {
    expect(elevation.altitude(elevation.height(5340))).toBeCloseTo(5340);
  });

  it("keeps Base Camp on the picture, above its lower edge", () => {
    expect(elevation.height(5340)).toBeLessThan(Elevation.HEIGHT);
    expect(elevation.height(5340)).toBeGreaterThan(Elevation.HEIGHT * 0.75);
  });
});
