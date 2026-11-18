import { describe, expect, it } from "vitest";

import { Terrain } from "../physics";
import type { RescueLineView } from "../physics";
import { LineAnchor } from "./line-anchor";

/** Level to a crevasse 4 m deep and 2 m wide at 10 m, and level on from 12. */
const terrain = new Terrain([
  [0, 0],
  [10, 0],
  [10, -4],
  [12, -4],
  [12, 0],
  [20, 0],
]);
/** A line from the crevasse's near lip, or its far one, down to the middle of its floor. */
const line = (built: number, far = false): RescueLineView => ({
  id: "line",
  top: far ? 20 : 10,
  foot: 15,
  shape: [],
  built,
});

describe("LineAnchor", () => {
  it("sets two screws back from the lip, on the ground the rescuer stands on, and the sling's point by the lip", () => {
    const near = new LineAnchor(terrain, line(1));
    const far = new LineAnchor(terrain, line(1, true));

    expect(near.screws[0].x).toBeCloseTo(9.84, 9);
    expect(near.screws[1].x).toBeCloseTo(9.62, 9);
    expect(near.screws.every(({ y }) => y === 0)).toBe(true);
    expect(near.master.x).toBeCloseTo(9.96, 9);
    expect(near.master.y).toBeGreaterThan(0);
    // From the far lip, back is the other way.
    expect(far.screws[0].x).toBeCloseTo(12.16, 9);
    expect(far.screws[1].x).toBeCloseTo(12.38, 9);
    expect(far.master.x).toBeCloseTo(12.04, 9);
  });

  it("turns the first screw in, then the second, then runs the sling, as the anchor is built", () => {
    const head = (built: number, screw: 0 | 1): number | null =>
      new LineAnchor(terrain, line(built)).head(screw)?.y ?? null;

    expect(head(0, 0)).toBeNull();
    expect(head(0.05, 0)).toBeCloseTo(0.2, 9);
    expect(head(0.2, 0)).toBeGreaterThan(head(0.35, 0) ?? Infinity);
    expect(head(0.4, 0)).toBeCloseTo(0.035, 9);
    expect(head(0.39, 1)).toBeNull();
    expect(head(0.75, 1)).toBeCloseTo(0.035, 9);
    expect(new LineAnchor(terrain, line(0.74)).slung).toBe(0);
    expect(new LineAnchor(terrain, line(0.875)).slung).toBeCloseTo(0.5, 9);
    expect(new LineAnchor(terrain, line(1)).slung).toBe(1);
  });

  it("has the hands at the head of the screw going in, then at the sling's point", () => {
    const working = (built: number) => new LineAnchor(terrain, line(built)).working;
    const done = new LineAnchor(terrain, line(1));

    expect(working(0).x).toBeCloseTo(9.84, 9);
    expect(working(0).y).toBeCloseTo(0.2, 9);
    expect(working(0.2).x).toBeCloseTo(9.84, 9);
    expect(working(0.2).y).toBeLessThan(0.2);
    expect(working(0.5).x).toBeCloseTo(9.62, 9);
    expect(working(0.9)).toEqual(done.master);
  });

  it("kneels whoever builds it back from the screws, facing the lip, the whole anchor within their reach", () => {
    const near = new LineAnchor(terrain, line(0.2));
    const far = new LineAnchor(terrain, line(0.2, true));

    expect(near.kneels).toBeCloseTo(9.34, 9);
    expect(far.kneels).toBeCloseTo(12.66, 9);
    expect(near.master.x - near.kneels).toBeLessThan(0.7);
  });

  it("grows with the figures where they're drawn bigger than life", () => {
    const grown = new LineAnchor(terrain, line(0.05), 2);

    expect(grown.screws[0].x).toBeCloseTo(9.68, 9);
    expect(grown.screws[1].x).toBeCloseTo(9.24, 9);
    expect(grown.head(0)?.y).toBeCloseTo(0.4, 9);
    expect(grown.kneels).toBeCloseTo(8.68, 9);
  });
});
