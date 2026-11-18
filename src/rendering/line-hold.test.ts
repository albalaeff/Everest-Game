import { describe, expect, it } from "vitest";

import { LineHold } from "./line-hold";

/** A line from a lip 5 m up, down a wall to its foot 3 m below, and 1.5 m out along the floor. */
const SHAPE = [
  { x: 20, y: 5 },
  { x: 20, y: 2 },
  { x: 18.5, y: 2 },
];

describe("LineHold", () => {
  it("ties a climber in a reach up the line from where they are, the rope taut from the anchor to there", () => {
    const hold = new LineHold(SHAPE, { x: 20, y: 3 }, 1);

    expect(hold.down).toBeCloseTo(2, 9);
    expect(hold.fromTop).toBeCloseTo(1.3, 9);
    expect(hold.point).toEqual({ x: 20, y: 3.7 });
    expect(hold.taut).toEqual([
      { x: 20, y: 5 },
      { x: 20, y: 3.7 },
    ]);
  });

  it("ties them in at the anchor where it's nearer than a reach, and further up a figure drawn bigger", () => {
    const near = new LineHold(SHAPE, { x: 20, y: 4.6 }, 1);
    const grown = new LineHold(SHAPE, { x: 20, y: 3 }, 2);

    expect(near.fromTop).toBe(0);
    expect(near.point).toEqual({ x: 20, y: 5 });
    expect(near.taut).toEqual([
      { x: 20, y: 5 },
      { x: 20, y: 5 },
    ]);
    expect(grown.point.y).toBeCloseTo(4.4, 9);
  });

  it("follows the line round a corner: tied in up the wall from out along its foot", () => {
    const hold = new LineHold(SHAPE, { x: 19.6, y: 2 }, 1);

    expect(hold.down).toBeCloseTo(3.4, 9);
    expect(hold.point.x).toBe(20);
    expect(hold.point.y).toBeCloseTo(2.3, 9);
    expect(hold.taut).toHaveLength(2);
  });

  it("takes a climber off the line's own ground as where on it they're nearest, and its foot past its end", () => {
    const off = new LineHold(SHAPE, { x: 19.7, y: 3.5 }, 1);

    expect(off.down).toBeCloseTo(1.5, 9);
    expect(LineHold.along(SHAPE, 100)).toEqual({ x: 18.5, y: 2 });
    expect(LineHold.upTo(SHAPE, 100)).toEqual(SHAPE);
    expect(LineHold.along(SHAPE, 3.5)).toEqual({ x: 19.5, y: 2 });
  });
});
