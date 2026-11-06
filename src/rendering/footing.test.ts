import { describe, expect, it } from "vitest";

import { Terrain } from "../physics";
import { Footing } from "./footing";

// A slope up to a wall, a step up it, then a crevasse, with a ladder's walls each side.
const terrain = new Terrain([
  [0, 0],
  [10, 1],
  [10, 4],
  [20, 4],
  [20, -2],
  [23, -2],
  [23, 4],
  [30, 4],
]);
const footing = new Footing(terrain);
const corner = (index: number): number => terrain.alongs[index] ?? Number.NaN;

describe("Footing", () => {
  it("gives the snow round a climber's feet from under them, either side", () => {
    const under = footing.under(5 * Math.hypot(1, 0.1));

    expect(under(0)).toBeCloseTo(0, 9);
    expect(under(2)).toBeCloseTo(0.2, 9);
    expect(under(-2)).toBeCloseTo(-0.2, 9);
  });

  it("never reaches up a wall's face: past it, the snow goes on level from its edge", () => {
    const under = footing.under(9 * Math.hypot(1, 0.1));

    expect(under(0.5)).toBeCloseTo(0.05, 6);
    expect(under(3)).toBeCloseTo(0.1, 6);
  });

  it("stands a climber at a wall's foot or on its top on their own side of it", () => {
    const foot = footing.under(corner(1));
    const top = footing.under(corner(2));

    expect(foot(1)).toBeCloseTo(0, 6);
    expect(foot(-1)).toBeCloseTo(-0.1, 6);
    expect(top(-1)).toBeCloseTo(0, 6);
    expect(top(1)).toBeCloseTo(0, 6);
  });

  it("never reaches down into a crevasse, from either side of it", () => {
    const before = footing.under(corner(3) - 1);
    const after = footing.under(corner(6) + 1);

    expect(before(3)).toBeCloseTo(0, 6);
    expect(after(-3)).toBeCloseTo(0, 6);
  });

  it("gives a climber on a wall level snow, a ladder's rungs", () => {
    const under = footing.under((corner(3) + corner(4)) / 2);

    for (const x of [-2, 0, 2]) {
      expect(under(x)).toBe(0);
    }
  });
});
