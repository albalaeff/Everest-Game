import { describe, expect, it } from "vitest";

import { GlacierGround } from "./glacier-ground";
import { GlacierShape } from "./glacier-shape";
import { SeracField } from "./serac-field";
import { IcefallForTests } from "./testing/icefall";

const icefall = new IcefallForTests();
const { shape, trail, physics } = icefall;

describe("the glacier's shape round the Icefall's line", () => {
  it("is the physics' own ground on the trail, to the millimetre", () => {
    const onRoute = shape.rows.filter(({ along }) => along >= 0 && along <= physics.terrain.length);
    expect(onRoute.length).toBeGreaterThan(1000);
    for (const row of onRoute) {
      const line = physics.terrain.point(row.along);
      for (const side of [0, 0.6, -0.9]) {
        const ground = shape.across(row, side);
        expect(ground.y).toBeCloseTo(line.y, 3);
        expect(ground.z).toBeCloseTo(-line.x, 3);
        expect(ground.x).toBeCloseTo(trail.aside(line.x) + side, 9);
      }
    }
  });

  it("has a row at every corner of the line, and none further apart than its step", () => {
    const alongs = new Set(shape.rows.map(({ along }) => along));
    for (const corner of physics.terrain.alongs) {
      expect(alongs.has(corner)).toBe(true);
    }
    const onRoute = shape.rows.filter(({ along }) => along >= 0 && along <= physics.terrain.length);
    for (const [index, row] of onRoute.entries()) {
      const before = onRoute[index - 1];
      if (before !== undefined) {
        expect(row.along - before.along).toBeLessThanOrEqual(GlacierShape.STEP + 1e-9);
      }
    }
  });

  it("lets go of the line by its reach: there the ground is the glacier's own", () => {
    for (const row of shape.rows) {
      for (const side of [-GlacierShape.REACH, GlacierShape.REACH]) {
        const ground = shape.across(row, side);
        expect(ground.y).toBeCloseTo(shape.floor(ground.x, ground.z).y, 6);
      }
    }
  });

  it("is deep in the crevasses the trail crosses, and level with the glacier at the camp", () => {
    const deepest = Math.max(...shape.rows.map((row) => shape.across(row, 0).depth));
    expect(deepest).toBeGreaterThan(8);
    const camp = shape.rows.find(({ along }) => along === 0);
    expect(camp === undefined ? Number.NaN : shape.across(camp, 0).depth).toBeLessThan(0.05);
  });

  it("carries a crevasse on to each side of the trail, shallower as it closes", () => {
    const row = shape.rows.reduce((deep, each) => (each.relief < deep.relief ? each : deep));
    const at = (side: number): number => shape.across(row, side).depth;
    expect(at(8)).toBeGreaterThan(4);
    expect(at(-8)).toBeGreaterThan(4);
    expect(at(GlacierShape.REACH)).toBeLessThan(1);
  });

  it("is rubble below Crampon Point and the glacier above it", () => {
    expect(shape.rubble(5, 0)).toBeGreaterThan(1.9);
    expect(shape.rubble(60, 0)).toBe(0);
  });

  it("is the same glacier each time it's built", () => {
    const again = new IcefallForTests().shape;
    for (const [index, row] of shape.rows.entries()) {
      if (index % 97 === 0) {
        const other = again.rows[index];
        expect(other === undefined ? null : again.across(other, 13.5)).toEqual(
          shape.across(row, 13.5),
        );
      }
    }
  });
});

describe("the towers of ice on the glacier", () => {
  const seracs = SeracField.stand(shape, IcefallForTests.SEED);

  it("stand in their hundreds, none on the moraine", () => {
    expect(seracs.length).toBeGreaterThan(300);
    const moraine = physics.terrain.point(20).x;
    for (const { z } of seracs) {
      expect(-z).toBeGreaterThan(moraine - 10);
    }
  });

  it("leave the trail clear, and the crevasses it crosses open", () => {
    for (const serac of seracs) {
      const reach = Math.abs(serac.x - trail.aside(-serac.z));
      expect(reach).toBeGreaterThan(Math.max(serac.width, serac.depth) * 0.6 + 2);
      expect(shape.crevassed(serac.x, serac.z, 0)).toBe(false);
    }
  });

  it("are small in the Popcorn and as tall as a house in the maze and above it", () => {
    const tallestIn = (part: string): number => {
      const stretch = icefall.parts.find(({ id }) => id === part);
      const from = physics.terrain.point(stretch?.from ?? 0).x + 10;
      const to = physics.terrain.point(stretch?.to ?? 0).x - 10;
      return Math.max(
        ...seracs.filter(({ z }) => -z > from && -z < to).map(({ height }) => height),
      );
    };
    expect(tallestIn("popcorn")).toBeLessThan(6);
    expect(tallestIn("maze")).toBeGreaterThan(10);
    expect(tallestIn("upper-icefall")).toBeGreaterThan(12);
  });
});

describe("the ground's columns", () => {
  it("are the same to the left as to the right, the trail's middle among them", () => {
    const sides = GlacierGround.sides();
    expect(sides).toContain(0);
    expect(sides.at(-1)).toBe(GlacierShape.REACH);
    for (const [index, side] of sides.entries()) {
      expect(sides[sides.length - 1 - index]).toBeCloseTo(-side, 12);
    }
  });

  it("are closest together at the trail, where the climber looks at the ground", () => {
    const sides = GlacierGround.sides();
    const middle = sides.indexOf(0);
    expect(sides[middle + 1] ?? 0).toBeLessThan(0.4);
    expect((sides.at(-1) ?? 0) - (sides.at(-2) ?? 0)).toBeGreaterThan(1);
  });
});
