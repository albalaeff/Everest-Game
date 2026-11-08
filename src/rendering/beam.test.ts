import { describe, expect, it } from "vitest";

import { Beam } from "./beam";

/** A lamp 1.6 m up at the origin's foot, shining level to the right, 6 m. */
const level = new Beam({ x: 0, y: 1.6 }, 0, 6, 0.25, 1);

describe("Beam", () => {
  it("lights what's ahead in its cone, brightest near the lamp and on its axis", () => {
    const near = level.lights({ x: 1, y: 1.6 });
    const far = level.lights({ x: 5, y: 1.6 });
    const offAxis = level.lights({ x: 1, y: 1.75 });

    expect(near).toBeGreaterThan(0.6);
    expect(far).toBeGreaterThan(0);
    expect(far).toBeLessThan(near);
    expect(offAxis).toBeGreaterThan(0);
    expect(offAxis).toBeLessThan(near);
  });

  it("lights nothing behind the lamp, beside its cone or past its reach", () => {
    expect(level.lights({ x: -1, y: 1.6 })).toBe(0);
    expect(level.lights({ x: 1, y: 2.6 })).toBe(0);
    expect(level.lights({ x: 6.5, y: 1.6 })).toBe(0);
  });

  it("is as bright as the hour asks, and dark by day", () => {
    const dim = new Beam({ x: 0, y: 1.6 }, 0, 6, 0.25, 0.5);
    const off = new Beam({ x: 0, y: 1.6 }, 0, 6, 0.25, 0);

    expect(dim.lights({ x: 1, y: 1.6 })).toBeCloseTo(level.lights({ x: 1, y: 1.6 }) / 2, 9);
    expect(off.lights({ x: 1, y: 1.6 })).toBe(0);
  });

  it("turns with its direction: tipped down a slope, it lights the snow below", () => {
    const down = new Beam({ x: 0, y: 1.6 }, -Math.PI / 4, 6, 0.25, 1);

    expect(down.lights({ x: 1, y: 0.6 })).toBeGreaterThan(0.5);
    expect(down.lights({ x: 1, y: 1.6 })).toBe(0);
  });

  it("meets the ground where its axis comes down to it, or nowhere within its reach", () => {
    const tipped = new Beam({ x: 0, y: 1.6 }, -0.3, 8, 0.25, 1);
    const flat = (x: number): number => x * 0;
    const steep = (x: number): number => x * 0.6;

    const onFlat = tipped.meets(flat);
    expect(onFlat?.x).toBeCloseTo(1.6 / Math.tan(0.3), 1);
    expect(onFlat?.y).toBeCloseTo(0, 6);
    expect(tipped.meets(steep)?.x).toBeLessThan(onFlat?.x ?? 0);
    expect(level.meets(flat)).toBeNull();
  });

  it("lights a fan that stops at the ground: a wall ahead cuts it, open snow doesn't (#202)", () => {
    const flat = (x: number): number => x * 0;
    // A wall of ice 2 m ahead, 10 m high.
    const wall = (x: number): number => (x >= 2 ? 10 : 0);

    const open = level.fan(flat, 8);
    const cut = level.fan(wall, 8);

    expect(open).toHaveLength(10);
    expect(open[0]).toEqual({ x: 0, y: 1.6 });
    // The rays that don't meet the snow reach the cone's far end.
    expect(Math.max(...open.map(({ x }) => x))).toBeCloseTo(6, 6);
    for (const { x } of cut.slice(1)) {
      expect(x).toBeCloseTo(2, 2);
    }
  });

  it("lights no fan from a lamp under the ground", () => {
    const over = (x: number): number => 2 + x * 0;

    expect(level.fan(over, 8)).toEqual([]);
  });
});
