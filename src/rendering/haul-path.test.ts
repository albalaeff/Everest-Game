import { describe, expect, it } from "vitest";

import { Terrain } from "../physics";
import type { Point } from "../physics";
import { HaulPath } from "./haul-path";
import { LineHold } from "./line-hold";

/** The top of a crevasse's wall at 8 m, its lip at 35.4 m; the wall down to its floor in even
 * steps, each 1.6 m down and 0.4 m out, as the slope draws its walls; the floor at 0, and its far
 * wall at 40 m. */
const STEPS: readonly (readonly [number, number])[] = [
  [30, 8],
  [35.4, 8],
  [35.4, 6.4],
  [35.8, 6.4],
  [35.8, 4.8],
  [36.2, 4.8],
  [36.2, 3.2],
  [36.6, 3.2],
  [36.6, 1.6],
  [37, 1.6],
  [37, 0],
  [40, 0],
  [40, 8],
  [45, 8],
];
const terrain = new Terrain(STEPS.map(([x, y]) => [x, y]));
const point = ([x, y]: readonly [number, number]): Point => ({ x, y });
/** A rescue line down that wall, anchored 0.4 m back from the lip, its foot `out` metres out on
 * the floor from the wall's foot: the ground's own corners, its anchor first. */
const line = (out: number): readonly Point[] => [
  { x: 35, y: 8 },
  ...STEPS.slice(1, 11).map(point),
  { x: 37 + out, y: 0 },
];
/** How far down a line's ground it is from its anchor to its foot. */
const lengthOf = (shape: readonly Point[]): number =>
  shape.slice(1).reduce((sum, at, index) => {
    const before = shape[index] ?? at;
    return sum + Math.hypot(at.x - before.x, at.y - before.y);
  }, 0);

describe("HaulPath: how a casualty comes up a rescue line as the rope brings them (#279)", () => {
  it("runs the taut rope straight over even steps, from the lip to the casualty, never round a corner cut back into the ice", () => {
    const path = new HaulPath(line(1.5), terrain);

    expect(path.corners).toEqual([
      { x: 35, y: 8 },
      { x: 35.4, y: 8 },
      { x: 38.5, y: 0 },
    ]);
    expect(path.lip).toEqual({ x: 35.4, y: 8 });
  });

  it("bears on a corner that stands out of the line of the others, and on the lip below an anchor at the edge", () => {
    // The third step juts out 0.3 m further than the rest.
    const jutting: readonly (readonly [number, number])[] = [
      ...STEPS.slice(0, 7),
      [36.9, 3.2],
      [36.9, 1.6],
      ...STEPS.slice(9),
    ];
    const ground = new Terrain(jutting.map(([x, y]) => [x, y]));
    const shape = [{ x: 35, y: 8 }, ...jutting.slice(1, 10).map(point), { x: 37.5, y: 0 }];
    const path = new HaulPath(shape, ground);
    const atTheEdge = new HaulPath(line(0).slice(1), terrain);

    expect(path.corners).toContainEqual({ x: 36.9, y: 3.2 });
    expect(path.corners).not.toContainEqual({ x: 36.2, y: 3.2 });
    expect(atTheEdge.lip).toEqual({ x: 35.4, y: 8 });
  });

  it("brings them up the steep run steadily, as each metre of rope comes in, with no step aside and nothing in the ice", () => {
    const shape = line(0.5);
    const path = new HaulPath(shape, terrain);
    const total = lengthOf(shape);
    const drawn: Point[] = [];
    for (let down = total; down >= 0; down -= 0.02) {
      drawn.push(path.at(down));
    }
    const moves = drawn.slice(1).map((at, index) => {
      const before = drawn[index] ?? at;
      return { across: at.x - before.x, up: at.y - before.y };
    });
    const lip = path.lip;
    const climbing = moves.filter((_, index) => (drawn[index]?.y ?? 0) < lip.y - 1e-9);

    // Up all the way to the lip, never down nor back out, and as far up each time: no pause on a
    // ledge, no jump onto the next step.
    expect(climbing.every(({ up }) => up > 0)).toBe(true);
    expect(climbing.every(({ across }) => across <= 1e-9)).toBe(true);
    const ups = climbing.map(({ up }) => up);
    expect(Math.max(...ups) - Math.min(...ups)).toBeLessThan(1e-6);
    // Never into the ice, the step's corners only met.
    expect(drawn.filter((at) => terrain.holds({ x: at.x, y: at.y + 0.02 }))).toEqual([]);
  });

  it("drags them along the ground where the rope runs low: over the top to the anchor, and along a wide floor to the wall", () => {
    const wide = line(8);
    const path = new HaulPath(wide, terrain);
    const total = lengthOf(wide);

    // Over the top, from the lip to the anchor, on the snow.
    expect(path.at(0.2)).toEqual({ x: 35.2, y: 8 });
    // Out along a floor 8 m wide the rope runs low from the lip: they're on the floor, dragged.
    expect(path.at(total - 2)).toEqual(LineHold.along(wide, total - 2));
    expect(path.at(total - 2).y).toBe(0);
    // The rope to them runs from the anchor over the corners it bears on, to where they are.
    expect(path.rope(total - 2)).toEqual([...path.corners.slice(0, -1), path.at(total - 2)]);
  });
});
