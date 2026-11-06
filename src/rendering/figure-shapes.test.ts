import { describe, expect, it } from "vitest";

import { ClimberPose } from "./climber-pose";
import type { Joint } from "./climber-pose";
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

/** Whether a point is inside an outline: a line from it crosses the outline an odd number of
 * times. */
function inside(point: Joint, outline: Outline): boolean {
  let crossings = 0;
  for (const [index, from] of outline.entries()) {
    const to = outline[(index + 1) % outline.length] ?? from;
    if (from.y > point.y !== to.y > point.y) {
      const x = from.x + ((point.y - from.y) * (to.x - from.x)) / (to.y - from.y);
      crossings += x > point.x ? 1 : 0;
    }
  }
  return crossings % 2 === 1;
}

/** A point of the shin's frame in the boot's, its ankle bent `flex` radians: the shin leaning
 * that far forward of the boot's upright. */
function inTheBoot(point: Joint, flex: number): Joint {
  const up = ClimberPose.SHIN - point.x;
  return {
    x: up * Math.sin(flex) + point.y * Math.cos(flex),
    y: ClimberPose.ANKLE + up * Math.cos(flex) - point.y * Math.sin(flex),
  };
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

  it("keeps the leg inside its boot, however far the boot lets the ankle bend", () => {
    const { shin, gaiter, boot } = shapes;
    const collar = Math.min(...gaiter.map(({ x }) => x));
    // Below its collar the gaiter is round the shin, and turns with it.
    for (const point of FigureShapes.band(shin, FigureShapes.AHEAD, collar + 0.001, Infinity)) {
      expect(inside(point, gaiter)).toBe(true);
    }
    // Its end, round the ankle, stays inside the shell however far the ankle bends.
    const { forward, back } = ClimberPose.BOOT_FLEX;
    for (let flex = -back; flex <= forward + 1e-9; flex += 0.02) {
      for (const point of gaiter) {
        const there = inTheBoot(point, flex);
        if (Math.hypot(there.x, there.y - ClimberPose.ANKLE) < 0.09) {
          expect(inside(there, boot)).toBe(true);
        }
      }
    }
    // Above it, the shell is round the ankle: the gaiter turns in it.
    const top = boot.filter(({ y }) => y > 0.12);
    for (const { x, y } of top) {
      expect(Math.hypot(x, y - ClimberPose.ANKLE)).toBeCloseTo(0.1, 2);
    }
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
