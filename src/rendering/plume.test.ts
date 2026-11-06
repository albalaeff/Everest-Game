import { describe, expect, it } from "vitest";

import { Plume } from "./plume";
import type { Puff } from "./plume";

const SUMMIT = { x: 40, y: 10 };
const LENGTH = 16;

/** The plume after `seconds` of wind at `gust`, a frame at a time. */
const blown = (gust: number, seconds = 20, seed = 5): Plume => {
  const plume = new Plume(SUMMIT, LENGTH, seed);
  for (let frame = 0; frame < seconds * 60; frame += 1) {
    plume.blow(1 / 60, gust, frame / 60);
  }
  return plume;
};

/** The puffs that show. */
const shown = (plume: Plume): readonly Puff[] => plume.puffs.filter(({ alpha }) => alpha > 0);

describe("Plume", () => {
  it("shows nothing in still air, nor in a breath of wind", () => {
    expect(shown(blown(0))).toEqual([]);
    expect(shown(blown(0.08))).toEqual([]);
  });

  it("streams from the summit downwind, to the right, and no farther than its length", () => {
    const puffs = shown(blown(0.9));

    expect(puffs.length).toBeGreaterThan(10);
    for (const { x, alpha, radius } of puffs) {
      expect(x).toBeGreaterThanOrEqual(SUMMIT.x);
      expect(x).toBeLessThanOrEqual(SUMMIT.x + LENGTH);
      expect(alpha).toBeLessThanOrEqual(1);
      expect(radius).toBeGreaterThan(0);
    }
  });

  it("reaches farther and shows denser the stronger the wind", () => {
    const reach = (plume: Plume): number => Math.max(...shown(plume).map(({ x }) => x - SUMMIT.x));
    const density = (plume: Plume): number =>
      plume.puffs.reduce((sum, { alpha }) => sum + alpha, 0);
    const gusty = blown(0.25);
    const gale = blown(0.9);

    expect(reach(gale)).toBeGreaterThan(reach(gusty) * 1.5);
    expect(density(gale)).toBeGreaterThan(density(gusty) * 2);
  });

  it("spreads as it streams away from the summit, and thins out towards its end", () => {
    const puffs = shown(blown(0.9));
    const near = puffs.filter(({ x }) => x - SUMMIT.x < LENGTH * 0.25);
    const far = puffs.filter(({ x }) => x - SUMMIT.x > LENGTH * 0.6);
    const spread = (some: readonly Puff[]): number =>
      Math.max(...some.map(({ y }) => Math.abs(y - SUMMIT.y)));
    const mean = (some: readonly Puff[]): number =>
      some.reduce((sum, { alpha }) => sum + alpha, 0) / some.length;

    expect(near.length).toBeGreaterThan(0);
    expect(far.length).toBeGreaterThan(0);
    expect(spread(far)).toBeGreaterThan(spread(near));
    expect(mean(far)).toBeLessThan(mean(near));
  });

  it("comes in softly at the summit, torn off it, rather than popping out whole", () => {
    const plume = new Plume(SUMMIT, LENGTH, 5);
    for (let frame = 0; frame < 30 * 60; frame += 1) {
      plume.blow(1 / 60, 0.9, frame / 60);
      for (const { x, alpha } of plume.puffs) {
        if (x - SUMMIT.x < LENGTH * 0.01) {
          expect(alpha).toBeLessThan(0.2);
        }
      }
    }
  });

  it("moves the same puffs each frame, so a frame makes no new ones", () => {
    const plume = blown(0.6, 2);
    const { puffs } = plume;
    plume.blow(1 / 60, 0.6, 2);

    expect(plume.puffs).toBe(puffs);
    expect(blown(0.6, 2).puffs).toHaveLength(blown(0, 2).puffs.length);
  });

  it("is the same plume on the same seed", () => {
    expect(blown(0.6, 5).puffs).toEqual(blown(0.6, 5).puffs);
    expect(blown(0.6, 5, 6).puffs).not.toEqual(blown(0.6, 5).puffs);
  });
});
