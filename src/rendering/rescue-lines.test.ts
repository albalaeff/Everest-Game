import { describe, expect, it } from "vitest";

import { Terrain } from "../physics";
import type { RescueLineView } from "../physics";
import { LeastSize } from "./least-size";
import { RescueLines } from "./rescue-lines";

/** Level to a crevasse 4 m deep and 2 m wide at 10 m, and level on from 12. */
const terrain = new Terrain([
  [0, 0],
  [10, 0],
  [10, -4],
  [12, -4],
  [12, 0],
  [20, 0],
]);
const line = (built: number): RescueLineView => ({
  id: "line",
  top: 10,
  foot: 15,
  shape: [
    { x: 10, y: 0 },
    { x: 10, y: -4 },
    { x: 11, y: -4 },
  ],
  built,
});
const SIZE = new LeastSize(60);
const NOBODY = new Map<string, never>();

/** What the lines' picture spans once `lines` are drawn with these loads. */
const drawn = (
  lines: readonly RescueLineView[],
  loads: Parameters<RescueLines["show"]>[2] = NOBODY,
) => {
  const picture = new RescueLines();
  picture.show(lines, terrain, loads, SIZE, 1);
  return picture.getLocalBounds();
};

describe("RescueLines", () => {
  it("draws nothing with no line on the slope", () => {
    expect(drawn([]).width).toBe(0);
  });

  it("draws the first screw alone as the anchor is begun: no cord before it's done", () => {
    const begun = drawn([line(0.2)]);
    const built = drawn([line(0.9)]);

    expect(begun.width).toBeLessThan(0.15);
    expect(begun.minY).toBeGreaterThan(-0.1);
    expect(begun.maxX).toBeLessThan(9.95);
    // Both screws and the sling to its point by the lip, still on top of the ice.
    expect(built.minX).toBeLessThan(9.62);
    expect(built.maxX).toBeGreaterThan(9.9);
    expect(built.minY).toBeGreaterThan(-0.1);
  });

  it("hangs the cord from the anchor over the lip and down the ice to its foot", () => {
    const whole = drawn([line(1)]);

    expect(whole.minY).toBeLessThan(-3.9);
    expect(whole.maxX).toBeGreaterThan(10.9);
    expect(whole.minX).toBeLessThan(9.62);
  });

  it("runs the cord taut to a casualty hauled up it and no further, and back to the hands that haul", () => {
    const taut = [
      { x: 10, y: 0 },
      { x: 10, y: -1.5 },
    ];
    const hauled = drawn([line(1)], new Map([["line", { taut, hands: { x: 9.2, y: 0.9 } }]]));
    const held = drawn([line(1)], new Map([["line", { taut, hands: null }]]));

    expect(hauled.minY).toBeGreaterThan(-1.7);
    expect(hauled.maxX).toBeLessThan(10.2);
    expect(hauled.maxY).toBeGreaterThan(0.85);
    expect(hauled.minX).toBeLessThan(9.25);
    expect(held.maxY).toBeLessThan(0.3);
    expect(held.minY).toBeGreaterThan(-1.7);
  });

  it("clears the picture once the lines are gone", () => {
    const picture = new RescueLines();
    picture.show([line(1)], terrain, NOBODY, SIZE, 1);
    picture.show([], terrain, NOBODY, SIZE, 1);

    expect(picture.getLocalBounds().width).toBe(0);
  });
});
