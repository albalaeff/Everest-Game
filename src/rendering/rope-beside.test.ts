import { describe, expect, it } from "vitest";

import type { Joint } from "./climber-pose";
import { RopeBeside } from "./rope-beside";

/** A rope's points a metre apart, or near it, from `from` to `to`. */
function points(from: Joint, to: Joint): Joint[] {
  const metres = Math.round(Math.hypot(to.x - from.x, to.y - from.y));
  return Array.from({ length: metres + 1 }, (_, index) => ({
    x: from.x + ((to.x - from.x) * index) / metres,
    y: from.y + ((to.y - from.y) * index) / metres,
  }));
}

function expectAt(joint: Joint, x: number, y: number): void {
  expect(joint.x).toBeCloseTo(x, 9);
  expect(joint.y).toBeCloseTo(y, 9);
}

/** A rope on level snow from 3 m behind the feet to 8 m ahead. */
const level = points({ x: -3, y: 0 }, { x: 8, y: 0 });
const feet: Joint = { x: 0, y: 0 };

describe("RopeBeside", () => {
  it("finds the rope's point nearest a hand above it, and an anchor past its end", () => {
    const rope = new RopeBeside(level);

    expectAt(rope.nearest({ x: 0.42, y: 0.85 }), 0.42, 0);
    expectAt(rope.nearest({ x: 12, y: 1 }), 8, 0);
  });

  it("leads along the snow the way the climber faces, whichever end it was fixed from", () => {
    for (const rope of [new RopeBeside(level), new RopeBeside([...level].reverse())]) {
      expectAt(rope.ahead(feet, 1.3), 1.3, 0);
      expectAt(rope.ahead(feet, -0.5), -0.5, 0);
      expectAt(rope.ahead({ x: 0.4, y: 0.8 }, 1), 1.4, 0);
    }
  });

  it("leads down the slope ahead as the climber goes down it, the way they face", () => {
    const ahead = new RopeBeside(points({ x: 5, y: -4 }, { x: -5, y: 4 })).ahead(feet, 1);

    expect(ahead.x).toBeGreaterThan(0.7);
    expect(ahead.y).toBeLessThan(-0.5);
  });

  it("leads up a rope that runs up a wall ahead, and up it on the ladder", () => {
    // From the snow behind to the foot of a wall 0.4 m ahead, up it 3 m, and on along its top.
    const wall = new RopeBeside([
      ...points({ x: -2.6, y: 0 }, { x: 0.4, y: 0 }),
      ...points({ x: 0.4, y: 1 }, { x: 0.4, y: 3 }),
      { x: 1.4, y: 3 },
    ]);
    const ladder = points({ x: 0.4, y: -1 }, { x: 0.4, y: 2 });

    expectAt(wall.ahead(feet, 1.3), 0.4, 0.9);
    expectAt(wall.ahead({ x: 0.38, y: 1.08 }, 1), 0.4, 2.08);
    expectAt(new RopeBeside(ladder).ahead(feet, 1), 0.4, 1);
    expectAt(new RopeBeside([...ladder].reverse()).ahead(feet, 1), 0.4, 1);
  });

  it("holds the gear at the anchors at the rope's ends", () => {
    const rope = new RopeBeside(points({ x: -6, y: 0 }, { x: 0.5, y: 0 }));

    expectAt(rope.ahead(feet, 1.3), 0.5, 0);
    expectAt(rope.ahead(feet, -10), -6, 0);
  });

  it("lies along the snow for a hand to lift, but not up a wall from the feet, nor ended at them", () => {
    const steep = points({ x: -3, y: -3 }, { x: 3, y: 3 });
    // The snow to the foot of a wall 0.4 m ahead, and up it.
    const nearAWall = [...points({ x: -2.6, y: 0 }, { x: 0.4, y: 0 }), { x: 0.4, y: 3 }];
    const upAWall = points({ x: 0, y: 0 }, { x: 0, y: 3 });
    const ended = points({ x: -6, y: 0 }, { x: 0.1, y: 0 });

    for (const lying of [level, [...level].reverse(), steep, nearAWall]) {
      expect(new RopeBeside(lying).lies()).toBe(true);
    }
    for (const standing of [upAWall, [...upAWall].reverse(), ended, [...ended].reverse()]) {
      expect(new RopeBeside(standing).lies()).toBe(false);
    }
  });
});
