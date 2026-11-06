import { describe, expect, it } from "vitest";

import { CloudSea } from "./cloud-sea";
import type { CloudSeaOptions } from "./cloud-sea";

const options = (over: Partial<CloudSeaOptions> = {}): CloudSeaOptions => ({
  from: -50,
  to: 150,
  step: 1,
  height: 3,
  puff: { min: 4, max: 9 },
  seed: 11,
  ...over,
});

describe("CloudSea", () => {
  it("runs from one end to the other, its top never below the sea's and never over a puff's", () => {
    const { outline } = new CloudSea(options());

    expect(outline[0]?.x).toBe(-50);
    expect(outline.at(-1)?.x).toBeGreaterThanOrEqual(150);
    for (const { y } of outline) {
      expect(y).toBeGreaterThanOrEqual(3);
      expect(y).toBeLessThanOrEqual(3 + 9 * 0.55 + 1e-9);
    }
    expect(Math.max(...outline.map(({ y }) => y))).toBeGreaterThan(3 + 4 * 0.55);
  });

  it("rises and falls in rounded puffs, with no cliff between two points", () => {
    const { outline } = new CloudSea(options());
    let rises = 0;
    for (let index = 1; index < outline.length; index += 1) {
      const before = outline[index - 1];
      const after = outline[index];
      if (before === undefined || after === undefined) {
        continue;
      }
      expect(Math.abs(after.y - before.y)).toBeLessThan(3);
      if (after.y > before.y + 1e-9) {
        rises += 1;
      }
    }
    expect(rises).toBeGreaterThan(20);
  });

  it("lays rows, the farthest first, each nearer one lower and its puffs bigger", () => {
    const rows = CloudSea.rows(options(), 3, 1.5);
    const highest = (sea: CloudSea | undefined): number =>
      Math.max(...(sea?.outline ?? []).map(({ y }) => y));
    const lowest = (sea: CloudSea | undefined): number =>
      Math.min(...(sea?.outline ?? []).map(({ y }) => y));

    expect(rows).toHaveLength(3);
    expect(lowest(rows[0])).toBeGreaterThanOrEqual(6);
    expect(lowest(rows[1])).toBeGreaterThanOrEqual(4.5);
    expect(lowest(rows[2])).toBeGreaterThanOrEqual(3);
    expect(lowest(rows[2])).toBeLessThan(lowest(rows[1]));
    expect(lowest(rows[1])).toBeLessThan(lowest(rows[0]));
    expect(highest(rows[0]) - 6).toBeLessThan(highest(rows[2]) - 3);
    expect(rows[0]?.outline).not.toEqual(rows[1]?.outline);
  });

  it("is the same sea on the same seed, and another on another", () => {
    expect(new CloudSea(options()).outline).toEqual(new CloudSea(options()).outline);
    expect(new CloudSea(options({ seed: 12 })).outline).not.toEqual(
      new CloudSea(options()).outline,
    );
  });
});
