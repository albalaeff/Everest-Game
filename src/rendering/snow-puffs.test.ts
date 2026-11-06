import { describe, expect, it } from "vitest";

import { SnowPuffs } from "./snow-puffs";

interface Seen {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly alpha: number;
}

const seen = (puffs: SnowPuffs): Seen[] => {
  const all: Seen[] = [];
  puffs.forEach((x, y, radius, alpha) => all.push({ x, y, radius, alpha }));
  return all;
};

describe("SnowPuffs", () => {
  it("kicks up a puff where a boot comes down, which grows, rises and fades, and is gone in its time", () => {
    const puffs = new SnowPuffs();
    puffs.kick(3, 1, 1);
    const [first] = seen(puffs);
    puffs.advance(SnowPuffs.SECONDS / 2, 0);
    const [later] = seen(puffs);

    expect(first).toMatchObject({ x: 3, y: 1 });
    expect(later?.radius).toBeGreaterThan(first?.radius ?? Infinity);
    expect(later?.y).toBeGreaterThan(1);
    expect(later?.alpha).toBeLessThan(first?.alpha ?? 0);
    puffs.advance(SnowPuffs.SECONDS / 2, 0);
    expect(puffs.live).toBe(0);
    expect(seen(puffs)).toEqual([]);
  });

  it("grows with the figure it's kicked up by", () => {
    const puffs = new SnowPuffs();
    puffs.kick(0, 0, 1);
    puffs.kick(5, 0, 3);
    const [small, large] = seen(puffs);

    expect(large?.radius).toBeCloseTo((small?.radius ?? 0) * 3, 9);
  });

  it("drifts on the gust the way the wind blows, and stays put in a calm", () => {
    const puffs = new SnowPuffs();
    puffs.kick(0, 0, 1);
    puffs.kick(10, 0, 1);
    puffs.advance(0.2, 1);
    const [blown] = seen(puffs);

    expect(blown?.x).toBeGreaterThan(0.05);
    const calm = new SnowPuffs();
    calm.kick(0, 0, 1);
    calm.advance(0.2, 0);
    expect(seen(calm)[0]?.x).toBe(0);
  });

  it("takes the oldest puff again once all of them are in the air", () => {
    const puffs = new SnowPuffs();
    for (let kick = 0; kick <= SnowPuffs.COUNT; kick += 1) {
      puffs.kick(kick, 0, 1);
      puffs.advance(0.01, 0);
    }
    const xs = seen(puffs).map(({ x }) => x);

    expect(puffs.live).toBe(SnowPuffs.COUNT);
    expect(xs).toContain(SnowPuffs.COUNT);
    expect(xs).not.toContain(0);
  });
});
