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

  /** A rope lying on a slope that rises half a metre a metre, from its foot to an anchor at its
   * top, and the slope's snow. */
  const SLOPE = (x: number): number => x / 2;
  const up = (from: number, to: number): Chain =>
    chain(
      ...Array.from(
        { length: to - from + 1 },
        (_, index) => [from + index, (from + index) / 2] as const,
      ),
    );
  /** How far the curve strays from the straight line between two points, at most, between them
   * across. */
  const offLine = (
    curve: RopeCurve,
    from: readonly [number, number],
    to: readonly [number, number],
  ): number => {
    let most = 0;
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    for (let index = 0; index < curve.length; index += 1) {
      const x = curve.x(index);
      if (x > Math.min(from[0], to[0]) + 1e-6 && x < Math.max(from[0], to[0]) - 1e-6) {
        const across =
          ((to[0] - from[0]) * (curve.y(index) - from[1]) - (to[1] - from[1]) * (x - from[0])) /
          length;
        most = Math.max(most, Math.abs(across));
      }
    }
    return most;
  };

  it("runs straight from a jumar that bears a climber's weight to the anchor above it (#232)", () => {
    const curve = new RopeCurve();
    const held = [{ on: { x: 4, y: 2 }, drawn: { x: 4, y: 2.9 }, load: 1 }];
    curve.shape(up(0, 10), held, SLOPE, 0, 0);

    expect(nearest(curve, 4, 2.9)).toBeLessThan(1e-9);
    expect(offLine(curve, [4, 2.9], [10, 5])).toBeLessThan(1e-6);
    // Half way up it, the rope is well off the snow it lay on.
    expect(nearest(curve, 7, 3.95)).toBeLessThan(0.02);
  });

  it("leaves the rope below a loaded jumar as slack as it was, from a link below it", () => {
    const loaded = new RopeCurve();
    const slack = new RopeCurve();
    const at = { on: { x: 4, y: 2 }, drawn: { x: 4, y: 2.9 } };
    loaded.shape(up(0, 10), [{ ...at, load: 1 }], SLOPE, 0, 0);
    slack.shape(up(0, 10), [at], SLOPE, 0, 0);
    const below = (curve: RopeCurve): number[] =>
      Array.from({ length: curve.length }, (_, index) => index)
        .filter((index) => curve.x(index) < 3 - 1e-6)
        .flatMap((index) => [curve.x(index), curve.y(index)]);

    expect(below(loaded)).toEqual(below(slack));
    expect(nearest(loaded, 1, 0.5)).toBeLessThan(1e-9);
  });

  it("comes half way to the straight line under half the weight, and lies as it did under none", () => {
    const curve = new RopeCurve();
    const at = { on: { x: 4, y: 2 }, drawn: { x: 4, y: 2.9 } };
    curve.shape(up(0, 10), [{ ...at, load: 0 }], SLOPE, 0, 0);
    const slack = nearest(curve, 8, 4);
    curve.shape(up(0, 10), [{ ...at, load: 0.5 }], SLOPE, 0, 0);

    expect(slack).toBeLessThan(1e-9);
    // The rope's point at 8 m lay on the snow at 4 m up; taut, it's 0.3 m over it.
    expect(nearest(curve, 8, 4.15)).toBeLessThan(0.02);
  });

  it("bears no weight on an anchor below the climber: only the rope above them comes taut", () => {
    const curve = new RopeCurve();
    const held = [{ on: { x: 6, y: 3 }, drawn: { x: 6, y: 3.9 }, load: 1 }];
    curve.shape(up(0, 10), held, SLOPE, 0, 0);

    expect(offLine(curve, [6, 3.9], [10, 5])).toBeLessThan(1e-6);
    expect(nearest(curve, 2, 1)).toBeLessThan(1e-9);
  });

  /** A crevasse 6 m deep from 1 m to 5 m across, a rope hanging into it from an anchor a metre
   * back from one lip to one two metres back from the other. */
  const DEEP = (x: number): number => (x > 1 && x < 5 ? -6 : 0);
  const hung = chain(
    [0, 0],
    [1, 0],
    [1.3, -0.9],
    [1.8, -1.8],
    [2.4, -2.6],
    [3, -3],
    [3.6, -2.6],
    [4.2, -1.8],
    [4.7, -0.9],
    [5, 0],
    [6, 0],
    [7, 0],
  );

  it("bends over a lip between a climber hanging in a crevasse and each anchor, straight between", () => {
    const curve = new RopeCurve();
    const held = [{ on: { x: 3, y: -3 }, drawn: { x: 3, y: -3.4 }, load: 1 }];
    curve.shape(hung, held, DEEP, 0, 0);

    // Straight from the carabiner to each lip, and along the snow from there to the anchor.
    expect(offLine(curve, [3, -3.4], [4.4, -1])).toBeLessThan(0.03);
    expect(offLine(curve, [1.6, -1], [3, -3.4])).toBeLessThan(0.03);
    for (let index = 0; index < curve.length; index += 1) {
      const [x, y] = [curve.x(index), curve.y(index)];
      expect(y).toBeGreaterThan(DEEP(x) - 0.12);
      if (x > 5.5 || x < 0.5) {
        expect(Math.abs(y)).toBeLessThan(0.06);
      }
    }
  });

  it("runs taut both ways from hands that pull it tight, to an anchor no higher than they are", () => {
    const curve = new RopeCurve();
    const held = [{ on: { x: 6, y: 0 }, drawn: { x: 6.2, y: 1 }, load: 1, pulled: true }];
    curve.shape(hung, held, DEEP, 0, 0);

    // Across the crevasse it's a rail from his hands to the far lip, not a loop hanging into it.
    expect(nearest(curve, 3, -3)).toBeGreaterThan(2.5);
    expect(offLine(curve, [6.2, 1], [0, 0])).toBeLessThan(0.02);
  });

  it("runs taut from a hauler's hands to the climber hanging below them, not on across the crevasse to the far anchor (#239)", () => {
    const curve = new RopeCurve();
    const held = [
      { on: { x: 3.6, y: -2.6 }, drawn: { x: 3.6, y: -3 }, load: 1 },
      { on: { x: 6, y: 0 }, drawn: { x: 6.2, y: 1 }, load: 1, pulled: true },
    ];
    curve.shape(hung, held, DEEP, 0, 0);

    // From his hands over the lip, down to the carabiner: no rail across the crevasse.
    expect(offLine(curve, [3.6, -3], [5, 0])).toBeLessThan(0.05);
    expect(nearest(curve, 3, 0.5)).toBeGreaterThan(1.5);
    expect(nearest(curve, 6.2, 1)).toBeLessThan(1e-9);
    expect(nearest(curve, 3.6, -3)).toBeLessThan(1e-9);
    // And on from the climber up to the lip on the other side, as when nobody hauls.
    expect(offLine(curve, [1.3, -0.35], [3.6, -3])).toBeLessThan(0.05);
    // Behind him it's tight to its anchor.
    expect(offLine(curve, [6.2, 1], [7, 0])).toBeLessThan(0.02);
  });

  /** A rope up a wall 5 m high, a metre a link from its foot to its anchor at the top; and a
   * climber on it 1.5 m up, their jumar in their hand and their second carabiner on its sling at
   * their harness, both on the one spot of the rope, as the physics has them on a ladder. */
  const WALL = chain([0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5]);
  const IN_HAND = { on: { x: 0, y: 1.5 }, drawn: { x: 0.15, y: 2.3 } };
  const AT_THE_HARNESS = { on: { x: 0, y: 1.5 }, drawn: { x: -0.05, y: 1.7 } };
  const ys = (curve: RopeCurve): number[] =>
    Array.from({ length: curve.length }, (_, index) => curve.y(index));
  /** How far the curve strays from the straight line between two points, at most, where it's
   * between their heights. */
  const offTheWay = (
    curve: RopeCurve,
    from: readonly [number, number],
    to: readonly [number, number],
  ): number => {
    let most = 0;
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    for (let index = 0; index < curve.length; index += 1) {
      const y = curve.y(index);
      if (y > Math.min(from[1], to[1]) + 1e-6 && y < Math.max(from[1], to[1]) - 1e-6) {
        const across =
          ((to[0] - from[0]) * (y - from[1]) - (to[1] - from[1]) * (curve.x(index) - from[0])) /
          length;
        most = Math.max(most, Math.abs(across));
      }
    }
    return most;
  };

  it("runs through two holds on one spot of the rope in the order they're drawn along it, up from the harness to the hand, never doubling back between them", () => {
    const curve = new RopeCurve();
    curve.shape(WALL, [IN_HAND, AT_THE_HARNESS], SNOW, 0, 0);
    const heights = ys(curve);
    const xs = Array.from({ length: curve.length }, (_, index) => curve.x(index));

    expect(nearest(curve, 0.15, 2.3)).toBeLessThan(1e-9);
    expect(nearest(curve, -0.05, 1.7)).toBeLessThan(1e-9);
    // Up the wall all the way: never down from the hand to the harness and up again.
    heights.slice(1).forEach((y, index) => {
      expect(y).toBeGreaterThanOrEqual(heights[index] ?? Infinity);
    });
    // Whichever of them the figure hands the rope first.
    curve.shape(WALL, [AT_THE_HARNESS, IN_HAND], SNOW, 0, 0);
    expect(ys(curve)).toEqual(heights);
    expect(Array.from({ length: curve.length }, (_, index) => curve.x(index))).toEqual(xs);
  });

  it("pulled tight from above, runs straight to the hand and the harness of a climber on it below and on from them, not past them", () => {
    const curve = new RopeCurve();
    const above = { on: { x: 0, y: 4.2 }, drawn: { x: 0.4, y: 4.9 }, load: 1, pulled: true };
    curve.shape(WALL, [IN_HAND, AT_THE_HARNESS, above], SNOW, 0, 0);

    expect(offTheWay(curve, [0.4, 4.9], [0.15, 2.3])).toBeLessThan(1e-3);
    expect(offTheWay(curve, [0.15, 2.3], [-0.05, 1.7])).toBeLessThan(1e-3);
    expect(offTheWay(curve, [-0.05, 1.7], [0, 0])).toBeLessThan(1e-3);
    expect(nearest(curve, 0.4, 4.9)).toBeLessThan(1e-9);
    expect(nearest(curve, 0.15, 2.3)).toBeLessThan(1e-9);
    expect(nearest(curve, -0.05, 1.7)).toBeLessThan(1e-9);
  });

  /** Whether any two pieces of the curve that don't meet end to end cross. */
  const crossesItself = (curve: RopeCurve): boolean => {
    const at = (index: number): readonly [number, number] => [curve.x(index), curve.y(index)];
    const side = (
      [ax, ay]: readonly [number, number],
      [bx, by]: readonly [number, number],
      [cx, cy]: readonly [number, number],
    ): number => Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
    for (let one = 0; one + 1 < curve.length; one += 1) {
      for (let other = one + 2; other + 1 < curve.length; other += 1) {
        const [a, b, c, d] = [at(one), at(one + 1), at(other), at(other + 1)];
        if (side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0) {
          return true;
        }
      }
    }
    return false;
  };

  it("goes up to the hands of whoever holds it tight past its anchor and back down by their harness to it, not across itself, with a climber just below", () => {
    const curve = new RopeCurve();
    // He stands over the anchor, both his cowstails on it: the rope in his hands, pulled tight.
    const hands = { on: { x: 0, y: 5 }, drawn: { x: 0.39, y: 5.95 }, load: 1, pulled: true };
    const harness = { on: { x: 0, y: 5 }, drawn: { x: 0.08, y: 5.39 } };
    // Below him, near the top of the wall, a climber's hand and harness.
    const hand = { on: { x: 0, y: 4.2 }, drawn: { x: 0.23, y: 4.9 } };
    const theirs = { on: { x: 0, y: 4.2 }, drawn: { x: -0.02, y: 4.22 } };
    curve.shape(WALL, [hand, theirs, hands, harness], SNOW, 0, 0);

    expect(crossesItself(curve)).toBe(false);
    for (const { drawn } of [hands, harness, hand, theirs]) {
      expect(nearest(curve, drawn.x, drawn.y)).toBeLessThan(1e-9);
    }
  });

  it("quivers across itself in the middle of its loaded length, and not at its ends", () => {
    const curve = new RopeCurve();
    const at = { on: { x: 4, y: 2 }, drawn: { x: 4, y: 2.9 }, load: 1 };
    curve.shape(up(0, 10), [{ ...at, quiver: 0.04 }], SLOPE, 0, 0);

    expect(offLine(curve, [4, 2.9], [10, 5])).toBeCloseTo(0.04, 2);
    expect(nearest(curve, 4, 2.9)).toBeLessThan(1e-9);
    expect([curve.x(curve.length - 1), curve.y(curve.length - 1)]).toEqual([10, 5]);
  });

  it("doesn't flutter on the gust where it's taut", () => {
    const curve = new RopeCurve();
    const held = [{ on: { x: 4, y: 2 }, drawn: { x: 4, y: 2.9 }, load: 1 }];
    curve.shape(up(0, 10), held, SLOPE, 1, 0.4);

    expect(offLine(curve, [4, 2.9], [10, 5])).toBeLessThan(1e-6);
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
