import { describe, expect, it } from "vitest";

import { IceChips } from "./ice-chips";

/** Each chip in the air: where, how big, how strong. */
function chips(ice: IceChips): { x: number; y: number; size: number; alpha: number }[] {
  const seen: { x: number; y: number; size: number; alpha: number }[] = [];
  ice.forEach((x, y, size, _angle, alpha) => seen.push({ x, y, size, alpha }));
  return seen;
}

describe("IceChips", () => {
  it("knocks chips off the ice where a pick strikes, flying out from the face and falling", () => {
    const ice = new IceChips(7);
    // A face to the right: out of it is to the left.
    ice.burst(2, 5, -1, 0, 1, "pick");
    const first = chips(ice);
    expect(first.length).toBeGreaterThan(5);
    ice.advance(0.15);
    const flying = chips(ice);
    expect(flying.every(({ x }) => x < 2)).toBe(true);
    expect(Math.max(...flying.map(({ y }) => y))).toBeGreaterThan(5);
    ice.advance(0.3);
    expect(Math.min(...chips(ice).map(({ y }) => y))).toBeLessThan(5);
  });

  it("shatters brittle ice into more and bigger plates, and a kick of the front points into a few small chips", () => {
    const pick = new IceChips(3);
    pick.burst(0, 0, -1, 0, 1, "pick");
    const poor = new IceChips(3);
    poor.burst(0, 0, -1, 0, 1, "poor");
    const kick = new IceChips(3);
    kick.burst(0, 0, -1, 0, 1, "kick");
    const biggest = (ice: IceChips): number => Math.max(...chips(ice).map(({ size }) => size));
    expect(chips(poor).length).toBeGreaterThan(chips(pick).length);
    expect(biggest(poor)).toBeGreaterThan(biggest(pick));
    expect(chips(kick).length).toBeLessThan(chips(pick).length);
    expect(biggest(kick)).toBeLessThan(biggest(pick));
  });

  it("fades the chips out and has none in the air a second on", () => {
    const ice = new IceChips(11);
    ice.burst(0, 0, -1, 0, 1, "poor");
    expect(ice.live).toBeGreaterThan(0);
    ice.advance(0.5);
    const fading = chips(ice);
    expect(fading.some(({ alpha }) => alpha < 0.9)).toBe(true);
    ice.advance(0.6);
    expect(ice.live).toBe(0);
    expect(chips(ice)).toEqual([]);
  });

  it("draws the same chips from the same seed, and as big again for a figure drawn twice life size", () => {
    const a = new IceChips(5);
    const b = new IceChips(5);
    const big = new IceChips(5);
    for (const ice of [a, b]) {
      ice.burst(1, 1, -1, 0, 1, "pick");
      ice.advance(0.1);
    }
    big.burst(1, 1, -1, 0, 2, "pick");
    big.advance(0.1);
    expect(chips(a)).toEqual(chips(b));
    const [one] = chips(a);
    const [two] = chips(big);
    expect((two?.size ?? 0) / (one?.size ?? 1)).toBeCloseTo(2, 6);
    expect(((two?.x ?? 0) - 1) / ((one?.x ?? 0) - 1)).toBeCloseTo(2, 6);
  });

  it("takes the oldest chips again when all are in the air, so a frame makes none", () => {
    const ice = new IceChips(1);
    for (let burst = 0; burst < 40; burst += 1) {
      ice.burst(0, 0, -1, 0, 1, "poor");
    }
    expect(ice.live).toBe(IceChips.COUNT);
  });
});
