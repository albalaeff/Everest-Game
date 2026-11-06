import { describe, expect, it } from "vitest";

import { ClimberPose } from "./climber-pose";
import { FigureShapes } from "./figure-shapes";
import type { Outline } from "./figure-shapes";

const shapes = new FigureShapes();

/** The area an outline encloses, whichever way round it goes. */
function area(outline: Outline): number {
  let twice = 0;
  for (const [index, point] of outline.entries()) {
    const next = outline[(index + 1) % outline.length] ?? point;
    twice += point.x * next.y - next.x * point.y;
  }
  return Math.abs(twice) / 2;
}

describe("FigureShapes", () => {
  it("rounds each limb at both ends, as thick at each as its down is", () => {
    const { shin } = shapes;
    for (const { x, y } of shin) {
      const root = Math.hypot(x, y);
      const end = Math.hypot(x - ClimberPose.SHIN, y);
      expect(Math.min(Math.abs(root - 0.082), Math.abs(end - 0.068))).toBeLessThan(1e-9);
    }
    // Between the ends, its sides run straight from one round to the other.
    const middle = FigureShapes.band(shin, FigureShapes.AHEAD, 0.2, 0.21);
    expect(Math.max(...middle.map(({ y }) => y))).toBeCloseTo(
      0.082 - (0.014 * 0.2) / ClimberPose.SHIN,
      3,
    );
  });

  it("stands the boot on its sole, from the heel to the toe, with the crampon's points under it", () => {
    const { boot, crampon } = shapes;
    expect(Math.min(...boot.map(({ y }) => y))).toBeCloseTo(0, 9);
    const sole = boot.filter(({ y }) => Math.abs(y) < 1e-9).map(({ x }) => x);
    expect(Math.min(...sole)).toBeCloseTo(-0.105, 9);
    expect(Math.max(...sole)).toBeCloseTo(0.2, 9);
    expect(Math.min(...crampon.flat().map(({ y }) => y))).toBeCloseTo(-0.033, 9);
  });

  it("cuts a band of an outline between two lines, all of it inside the outline", () => {
    const { torso } = shapes;
    const { UP } = FigureShapes;
    const yoke = FigureShapes.band(torso, UP, 0.43, Infinity);
    expect(Math.min(...yoke.map(({ y }) => y))).toBeCloseTo(0.43, 9);
    expect(Math.max(...yoke.map(({ y }) => y))).toBe(Math.max(...torso.map(({ y }) => y)));
    const below = FigureShapes.band(torso, UP, -Infinity, 0.43);
    expect(area(yoke) + area(below)).toBeCloseTo(area(torso), 9);
    // A slanting band, as the harness's belt is.
    const belt = FigureShapes.band(torso, { x: -0.06, y: 1 }, 0.01, 0.06);
    expect(area(belt)).toBeGreaterThan(0);
    expect(area(belt)).toBeLessThan(area(below));
  });

  it("gives a closed outline's first corner once", () => {
    const first = shapes.torso[0];
    const last = shapes.torso.at(-1);
    expect(first).toBeDefined();
    expect(last).not.toEqual(first);
  });
});
