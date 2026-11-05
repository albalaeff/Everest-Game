import { describe, expect, it } from "vitest";

import { SeededRandom } from "../simulation";
import { Drift } from "./drift";

const drift = (seed = 5): Drift =>
  new Drift(
    {
      count: 40,
      from: 0,
      to: 100,
      height: { min: 0.05, max: 2 },
      size: { min: 0.03, max: 0.1 },
      speed: { min: 2, max: 6 },
    },
    SeededRandom.fromSeed(seed),
  );

describe("Drift", () => {
  it("scatters its motes along its run, most of them low", () => {
    const { motes } = drift();

    expect(motes).toHaveLength(40);
    for (const mote of motes) {
      expect(mote.x).toBeGreaterThanOrEqual(0);
      expect(mote.x).toBeLessThan(100);
      expect(mote.height).toBeGreaterThanOrEqual(0.05);
      expect(mote.height).toBeLessThanOrEqual(2);
    }
    expect(motes.filter((mote) => mote.height < 1).length).toBeGreaterThan(motes.length / 2);
  });

  it("blows them along with the gust, over the ground, and holds them in still air", () => {
    const blown = drift();
    const still = drift();
    const before = blown.motes.map((mote) => mote.x);

    blown.blow(1, 1, (x) => x / 2, 0);
    still.blow(1, 0, (x) => x / 2, 0);

    for (const [index, mote] of blown.motes.entries()) {
      const moved = (mote.x - (before[index] ?? 0) + 100) % 100;
      expect(moved).toBeGreaterThanOrEqual(2 - 1e-9);
      expect(moved).toBeLessThanOrEqual(6 + 1e-9);
      expect(Math.abs(mote.y - (mote.x / 2 + mote.height))).toBeLessThanOrEqual(0.08);
    }
    for (const [index, mote] of still.motes.entries()) {
      expect(mote.x).toBe(before[index]);
    }
  });

  it("brings a mote past the end back in at the start", () => {
    const blown = drift();

    blown.blow(30, 1, () => 0, 0);

    for (const mote of blown.motes) {
      expect(mote.x).toBeGreaterThanOrEqual(0);
      expect(mote.x).toBeLessThan(100);
    }
  });

  it("is the same snow on the same seed", () => {
    expect(drift(5).motes).toEqual(drift(5).motes);
    expect(drift(6).motes).not.toEqual(drift(5).motes);
  });
});
