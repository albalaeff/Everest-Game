import { describe, expect, it } from "vitest";

import { Terrain } from "../physics";
import { IceBody } from "./ice-body";
import { IceSurface } from "./ice-surface";

/** A long snowy ground, every quarter metre across: flat, a wall 4 m up, gentle waves, a crevasse
 * from 60 to 63 m across that a ladder crosses, and a long flat. */
function ground(): Terrain {
  const points: [number, number][] = [];
  for (let x = 0; x < 40; x += 0.25) {
    points.push([x, 0.2 * Math.sin(x / 3)]);
  }
  points.push([40, 0], [40, 4]);
  for (let x = 40.25; x < 60; x += 0.25) {
    points.push([x, 4 + 0.15 * Math.sin(x)]);
  }
  points.push([60, 4], [60.5, 2], [61, -6], [62, -6], [63, 4]);
  for (let x = 63.25; x <= 100; x += 0.25) {
    points.push([x, 4]);
  }
  return new Terrain(points);
}

const TERRAIN = ground();
const SURFACE = new IceSurface(TERRAIN, [{ start: { x: 60, y: 4 }, finish: { x: 63, y: 4 } }]);
const body = new IceBody(SURFACE, 9);

describe("IceBody", () => {
  it("lays a snow cap under the whole surface, from its top down to a foot that wanders within the cap's depths", () => {
    const top = body.cap.slice(0, SURFACE.points.length);
    const foot = body.cap.slice(SURFACE.points.length).reverse();
    const under = foot.map(({ x, y }, index) => {
      const above = top[index];
      expect(above?.x).toBe(x);
      return (above?.y ?? 0) - y;
    });

    expect(top).toEqual(SURFACE.points);
    for (const depth of under) {
      expect(depth).toBeGreaterThanOrEqual(IceBody.CAP.min - 1e-9);
      expect(depth).toBeLessThanOrEqual(IceBody.CAP.max + 1e-9);
    }
    expect(new Set(under.map((depth) => depth.toFixed(2))).size).toBeGreaterThan(10);
  });

  it("lays the ice under it in layers that go deeper one after another, never crossing", () => {
    expect(body.bands.length).toBe(IceBody.LAYERS.length);
    let above = IceBody.CAP.max;
    for (const [index, band] of body.bands.entries()) {
      const layer = IceBody.LAYERS[index] ?? 0;
      expect(band.depth).toBeGreaterThan(above / 2);
      expect(band.depth).toBeLessThan(layer);
      above = layer;
    }
    // Under the long flat, every edge lies deeper than the one above it.
    const at = (x: number): number[] =>
      body.edges.map((edge) => {
        const point = edge.find((corner) => Math.abs(corner.x - x) < 0.6);
        return point === undefined ? Number.NaN : 4 - point.y;
      });
    for (const x of [70, 80, 90]) {
      const under = at(x);
      expect(under.every((depth) => Number.isFinite(depth))).toBe(true);
      for (const [index, depth] of under.entries()) {
        expect(depth).toBeGreaterThan(under[index - 1] ?? 0);
      }
    }
  });

  it("draws the layers' edges every metre or so, and keeps a wall upright in each", () => {
    const [deepest] = body.edges.slice(-1);
    const wall = (deepest ?? []).filter(({ x }) => x === 40);

    expect(deepest?.length).toBeLessThan(SURFACE.points.length / 2);
    expect(wall.length).toBe(2);
    expect(Math.abs((wall[0]?.y ?? 0) - (wall[1]?.y ?? 0))).toBeCloseTo(4, 9);
  });

  it("runs the layers on under a crevasse, closed between its lips", () => {
    for (const edge of body.edges) {
      expect(edge.every(({ x, y }) => x < 60.5 || x > 62.5 || y < 4)).toBe(true);
      expect(edge.some(({ x }) => x > 63)).toBe(true);
    }
  });

  it("says how deep its snow lies at any x across, as its cap's foot has it", () => {
    const top = SURFACE.points.length;
    const feet = body.cap.slice(top).reverse();

    for (const [index, { x, y }] of SURFACE.points.entries()) {
      expect(y - (feet[index]?.y ?? 0)).toBeCloseTo(body.capAt(x), 9);
    }
    expect(body.capAt(12.34)).toBeGreaterThanOrEqual(IceBody.CAP.min);
    expect(body.capAt(12.34)).toBeLessThanOrEqual(IceBody.CAP.max);
  });

  it("is the same ice on the same seed, and another on another", () => {
    expect(new IceBody(SURFACE, 9).bands).toEqual(body.bands);
    expect(new IceBody(SURFACE, 10).cap).not.toEqual(body.cap);
  });
});
