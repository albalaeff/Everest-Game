import { describe, expect, it } from "vitest";

import { RopeCurve } from "./rope-curve";
import type { Chain } from "./rope-curve";

/** A chain through these points. */
function chain(...points: readonly (readonly [number, number])[]): Chain {
  return {
    length: points.length,
    x: (index) => points[index]?.[0] ?? Number.NaN,
    y: (index) => points[index]?.[1] ?? Number.NaN,
  };
}

/** A chain a metre a link from `from` to `to` along the level at `y`. */
function level(from: number, to: number, y = 0): Chain {
  return chain(...Array.from({ length: to - from + 1 }, (_, index) => [from + index, y] as const));
}

/** How near the curve comes to a point. */
function nearest(curve: RopeCurve, x: number, y: number): number {
  let near = Infinity;
  for (let index = 0; index < curve.length; index += 1) {
    near = Math.min(near, Math.hypot(curve.x(index) - x, curve.y(index) - y));
  }
  return near;
}

/** How far the curve strays from the level at 0, at most, within `half` of `x`. */
function strays(curve: RopeCurve, x: number, half = 0.3): number {
  let most = 0;
  for (let index = 0; index < curve.length; index += 1) {
    if (Math.abs(curve.x(index) - x) <= half) {
      most = Math.max(most, Math.abs(curve.y(index)));
    }
  }
  return most;
}

const SNOW = (): number => 0;
/** A crevasse 5 m deep between 0.5 and 9.5. */
const CREVASSE = (x: number): number => (x > 0.5 && x < 9.5 ? -5 : 0);

describe("RopeCurve", () => {
  it("draws a curve through every point of the chain, in pieces between them", () => {
    const curve = new RopeCurve();
    const points = [
      [0, 0],
      [1, 0.5],
      [2, 0],
      [3, 1],
    ] as const;
    curve.shape(chain(...points), [], SNOW, 0, 0);

    expect(curve.length).toBeGreaterThan(points.length);
    for (const [x, y] of points) {
      expect(nearest(curve, x, y)).toBeLessThan(1e-9);
    }
  });

  it("rounds a corner of the chain into a curve, and runs straight where it does", () => {
    const curve = new RopeCurve();
    curve.shape(chain([0, 0], [1, 0], [2, 0], [2, 1], [2, 2]), [], SNOW, 0, 0);
    let sharpest = 0;
    for (let index = 1; index < curve.length - 1; index += 1) {
      const before = Math.atan2(
        curve.y(index) - curve.y(index - 1),
        curve.x(index) - curve.x(index - 1),
      );
      const after = Math.atan2(
        curve.y(index + 1) - curve.y(index),
        curve.x(index + 1) - curve.x(index),
      );
      sharpest = Math.max(sharpest, Math.abs(after - before));
    }

    expect(sharpest).toBeLessThan(Math.PI / 9);
    curve.shape(level(0, 10), [], SNOW, 0, 0);
    expect(curve.length).toBe(11);
  });

  it("lies still on the snow in the wind", () => {
    const curve = new RopeCurve();

    expect(curve.shape(level(0, 10), [], SNOW, 1, 3)).toBe(false);
    expect(strays(curve, 5, 5)).toBe(0);
  });

  it("flutters where it hangs free on the gust, less near its anchors, and not in a calm", () => {
    const curve = new RopeCurve();
    let middle = 0;
    let nearAnAnchor = 0;
    for (let elapsed = 0; elapsed < 2; elapsed += 0.05) {
      expect(curve.shape(level(0, 10), [], CREVASSE, 1, elapsed)).toBe(true);
      middle = Math.max(middle, strays(curve, 5));
      nearAnAnchor = Math.max(nearAnAnchor, strays(curve, 1, 0.1));
      expect(curve.x(0)).toBe(0);
      expect(curve.x(curve.length - 1)).toBe(10);
    }

    expect(middle).toBeGreaterThan(0.03);
    expect(nearAnAnchor).toBeGreaterThan(0);
    expect(nearAnAnchor).toBeLessThan(middle * 0.8);
    expect(curve.shape(level(0, 10), [], CREVASSE, 0, 0)).toBe(true);
    expect(strays(curve, 5, 5)).toBe(0);
  });

  it("is blown the way the wind blows where it hangs down free", () => {
    const curve = new RopeCurve();
    const hanging = chain([0, 10], [0, 9], [0, 8], [0, 7], [0, 6]);
    curve.shape(hanging, [], () => 0, 1, 0);

    expect(curve.x(Math.floor(curve.length / 2))).toBeGreaterThan(0.02);
    expect(curve.x(0)).toBe(0);
  });

  it("runs through a jumar held off it, lifted with it less and less, to nothing at 2.5 m", () => {
    const curve = new RopeCurve();
    const held = [{ on: { x: 5.5, y: 0 }, drawn: { x: 5.7, y: 0.4 } }];
    curve.shape(level(0, 10), held, SNOW, 0, 0);
    const lifted = (away: number): number => (1 + Math.cos((Math.PI * away) / 2.5)) / 2;

    expect(nearest(curve, 5.7, 0.4)).toBeLessThan(1e-9);
    expect(nearest(curve, 5 + 0.2 * lifted(0.5), 0.4 * lifted(0.5))).toBeLessThan(1e-9);
    expect(nearest(curve, 7 + 0.2 * lifted(1.5), 0.4 * lifted(1.5))).toBeLessThan(1e-9);
    expect(nearest(curve, 3, 0)).toBeLessThan(1e-9);
    expect(nearest(curve, 8, 0)).toBeLessThan(1e-9);
    expect(strays(curve, 1, 1)).toBe(0);
  });

  it("keeps an anchor where it is, with a jumar right by it", () => {
    const curve = new RopeCurve();
    curve.shape(level(0, 4), [{ on: { x: 0.1, y: 0 }, drawn: { x: 0.3, y: 0.5 } }], SNOW, 0, 0);

    expect([curve.x(0), curve.y(0)]).toEqual([0, 0]);
    expect(nearest(curve, 0.3, 0.5)).toBeLessThan(1e-9);
  });

  it("goes from one jumar's lift to the other's between two, each where it's drawn", () => {
    const curve = new RopeCurve();
    const held = [
      { on: { x: 5.5, y: 0 }, drawn: { x: 5.5, y: 0.2 } },
      { on: { x: 4.5, y: 0 }, drawn: { x: 4.5, y: 0.4 } },
    ];
    curve.shape(level(0, 10), held, SNOW, 0, 0);

    expect(nearest(curve, 4.5, 0.4)).toBeLessThan(1e-9);
    expect(nearest(curve, 5, 0.3)).toBeLessThan(1e-9);
    expect(nearest(curve, 5.5, 0.2)).toBeLessThan(1e-9);
  });

  it("doesn't sway where a jumar holds it", () => {
    const curve = new RopeCurve();
    const held = [{ on: { x: 5.5, y: 0 }, drawn: { x: 5.5, y: 0.3 } }];
    curve.shape(level(0, 10), held, CREVASSE, 1, 0);

    expect(nearest(curve, 5.5, 0.3)).toBeLessThan(1e-9);
  });

  it("draws the same rope the same way every time, a longer or a shorter one after it", () => {
    const curve = new RopeCurve();
    const xs = (): number[] => Array.from({ length: curve.length }, (_, index) => curve.x(index));
    curve.shape(chain([0, 0], [1, 1], [2, 0], [3, 1]), [], SNOW, 0, 0);
    const first = xs();
    curve.shape(level(0, 20), [{ on: { x: 7.5, y: 0 }, drawn: { x: 7.5, y: 1 } }], SNOW, 0, 0);
    curve.shape(chain([0, 0], [1, 1], [2, 0], [3, 1]), [], SNOW, 0, 0);

    expect(xs()).toEqual(first);
  });
});
