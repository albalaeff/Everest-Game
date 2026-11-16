import { describe, expect, it } from "vitest";

import { Elevation } from "./elevation";
import { MenuSky } from "./menu-sky";

describe("MenuSky", () => {
  const sky = new MenuSky();

  it("scatters its stars over the whole of the picture's width, above the valleys", () => {
    expect(sky.stars).toHaveLength(287);
    expect(sky.bright).toHaveLength(7);
    for (const star of sky.stars) {
      expect(star.at.x).toBeGreaterThanOrEqual(Elevation.LEFT);
      expect(star.at.x).toBeLessThanOrEqual(Elevation.RIGHT);
      expect(star.at.y).toBeLessThan(600);
      expect(star.light).toBeLessThanOrEqual(1);
    }
  });

  it("blows the plume off the summit to the left, on the south-west wind", () => {
    const { banner, core } = sky.plume(Elevation.SUMMIT);

    expect(banner.startsWith("M862 158L")).toBe(true);
    expect(banner).toContain("L510 130");
    expect(core.startsWith("M862 158L")).toBe(true);
    expect(sky.puffs).toHaveLength(9);
  });

  it("draws the same sky every time", () => {
    expect(new MenuSky().stars).toEqual(sky.stars);
    expect(new MenuSky().flakes).toEqual(sky.flakes);
  });
});
