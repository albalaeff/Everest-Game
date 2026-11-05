import { describe, expect, it } from "vitest";

import { Terrain } from "../physics";
import { CampSigns } from "./camp-signs";

/** Flat for 20 m, then a 45° slope for 20 m, and a ledge. */
const TERRAIN = new Terrain([
  [0, 0],
  [20, 0],
  [40, 20],
  [60, 20],
]);
const signs = new CampSigns(TERRAIN);

describe("CampSigns", () => {
  it("stands a tent every few metres along a camp's stretch, each on the ground, none over its ends", () => {
    const tents = signs.tents({ id: "base-camp", from: 0, to: 8 });

    expect(tents).toHaveLength(3);
    for (const tent of tents) {
      const feet = tent.filter((point) => point.y === 0);
      const top = tent.find((point) => point.y > 0);
      expect(feet).toHaveLength(2);
      expect(top).toBeDefined();
      expect(Math.min(...tent.map((point) => point.x))).toBeGreaterThanOrEqual(0);
      expect(Math.max(...tent.map((point) => point.x))).toBeLessThanOrEqual(8);
    }
  });

  it("stands them on the ground wherever the camp is, up the ledge too", () => {
    const [tent] = signs.tents({ id: "camp-1", from: 50, to: 56 });

    expect(tent).toBeDefined();
    expect(tent?.every((point) => point.y >= 20)).toBe(true);
    expect(tent?.some((point) => point.y === 20)).toBe(true);
  });

  it("stands none on a stretch too short for one", () => {
    expect(signs.tents({ id: "ledge", from: 50, to: 51 })).toEqual([]);
  });
});
