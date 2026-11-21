import { describe, expect, it } from "vitest";

import { Terrain } from "../physics";
import type { Point } from "../physics";
import { Beam } from "./beam";
import { IceRelief } from "./ice-relief";
import { IceWall } from "./ice-wall";

/** A flat, a wall 6 m up whose face steps back half a metre at its foot, a flat on its top, and a
 * drop 4 m down to a flat below. */
const TERRAIN = new Terrain([
  [0, 0],
  [10, 0],
  [10.375, 0.5],
  [10.375, 6],
  [20, 6],
  [20, 2.5],
  [20.375, 2],
  [30, 2],
]);
const UP = new IceWall(TERRAIN, { x: 10, y: 0 }, { x: 10.375, y: 6 }, 2);
const DOWN = new IceWall(TERRAIN, { x: 20, y: 6 }, { x: 20.375, y: 2 }, 2);
/** The same wall, as a step of ice the route climbs on the tools, with no ladder (#290). */
const STEP = new IceWall(TERRAIN, { x: 10, y: 0 }, { x: 10.375, y: 6 }, 2, true);

const xs = (points: readonly Point[]): number[] => points.map(({ x }) => x);
const ys = (points: readonly Point[]): number[] => points.map(({ y }) => y);

/** How far a point is from a segment. */
const toSegment = (point: Point, a: Point, b: Point): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const share =
    length === 0
      ? 0
      : Math.min(1, Math.max(0, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length));
  return Math.hypot(point.x - (a.x + share * dx), point.y - (a.y + share * dy));
};

/** Whether a point is inside a closed outline, or on its edge to a millimetre. */
const inside = (point: Point, outline: readonly Point[]): boolean => {
  let crossings = 0;
  for (const [index, a] of outline.entries()) {
    const b = outline[(index + 1) % outline.length] ?? a;
    if (toSegment(point, a, b) < 1e-3) {
      return true;
    }
    if (a.y > point.y !== b.y > point.y) {
      const x = a.x + ((point.y - a.y) * (b.x - a.x)) / (b.y - a.y);
      if (x > point.x) {
        crossings += 1;
      }
    }
  }
  return crossings % 2 === 1;
};

/** Whether a point is on a wall's ice: on its face, in its bulge, or on a lump standing proud of
 * either, a pixel's width allowed. */
const onTheIce = (point: Point, wall: IceWall): boolean => {
  const reach = IceRelief.PROUD + 2 / IceRelief.PIXELS_A_METRE;
  const nearer = { x: point.x + wall.into * reach, y: point.y };
  return [wall.face, wall.bulge].some(
    (outline) => outline.length > 0 && (inside(point, outline) || inside(nearer, outline)),
  );
};

/** How solid a wall's relief is at a point of the picture, 0 to 1. */
const solidAt = ({ relief }: IceWall, { x, y }: Point): number => {
  const column = Math.floor((x - relief.box.left) * IceRelief.PIXELS_A_METRE);
  const row = Math.floor((relief.box.top - y) * IceRelief.PIXELS_A_METRE);
  return (relief.ice[(row * relief.columns + column) * 4 + 3] ?? 0) / 255;
};

/** The lowest the lip of snow on a wall's top comes down. */
const underTheLip = (wall: IceWall): number => Math.min(...ys(wall.cornice.outline));

describe("IceWall", () => {
  it("bares the ice of a wall up the route on its right, from its top to its foot, back to a ragged line in the glacier", () => {
    expect(UP.into).toBe(1);
    expect(UP.face.slice(0, 3)).toEqual([
      { x: 10.375, y: 6 },
      { x: 10.375, y: 0.5 },
      { x: 10, y: 0 },
    ]);
    expect(Math.min(...xs(UP.face))).toBe(10);
    const back = UP.face.slice(3);
    for (const { x, y } of back) {
      const edge = y >= 0.5 ? 10.375 : 10 + 0.75 * y;
      expect(x - edge).toBeGreaterThanOrEqual(IceWall.FACE.min - IceWall.RAGGED.most - 1e-9);
      expect(x - edge).toBeLessThanOrEqual(IceWall.FACE.max + IceWall.RAGGED.most + 1e-9);
    }
    // Ragged, not a straight line: it turns back and forth many times down the face.
    const turns = back.filter((point, index) => {
      const [before, after] = [back[index - 1], back[index + 1]];
      return (
        before !== undefined &&
        after !== undefined &&
        (point.x - before.x) * (after.x - point.x) < 0
      );
    });
    expect(turns.length).toBeGreaterThan(6);
  });

  it("bares the ice of a drop on its left", () => {
    expect(DOWN.into).toBe(-1);
    expect(DOWN.face[0]).toEqual({ x: 20, y: 6 });
    expect(Math.max(...xs(DOWN.face))).toBe(20.375);
    expect(Math.min(...xs(DOWN.face))).toBeGreaterThanOrEqual(
      20 - IceWall.FACE.max - IceWall.RAGGED.most - 1e-9,
    );
  });

  it("shows its bare ice a metre and more back into the glacier, so the face reads as a wall of ice (#290)", () => {
    expect(IceWall.FACE.min).toBeGreaterThanOrEqual(1);
  });

  it("puts a lip of snow on its top, standing out over the drop", () => {
    expect(Math.min(...xs(UP.cornice.outline))).toBeLessThan(10.375);
    expect(Math.max(...xs(DOWN.cornice.outline))).toBeGreaterThan(20);
  });

  it("is the same wall on the same seed", () => {
    expect(new IceWall(TERRAIN, { x: 10, y: 0 }, { x: 10.375, y: 6 }, 2)).toEqual(UP);
  });

  it("marks a band of brittle ice across the face between two heights, within its ice, its edges ragged and cracked", () => {
    const band = UP.brittle(3, 3.5);
    const outline = band?.outline ?? [];
    const heights = ys(outline);
    const faceRight = Math.max(...xs(UP.face));

    expect(outline.length).toBeGreaterThan(6);
    // From the face's bare ice, at 10.375, into the ice to its right, no further than the face.
    expect(Math.min(...xs(outline))).toBe(10.375);
    expect(Math.max(...xs(outline))).toBeLessThanOrEqual(faceRight);
    // Its edges across wander a few centimetres off the heights it's laid between.
    expect(Math.min(...heights)).toBeGreaterThan(2.9);
    expect(Math.max(...heights)).toBeLessThan(3.6);
    expect(new Set(heights).size).toBeGreaterThan(2);
    // Its cracks run out of it into the sound ice above and below.
    expect(band?.cracks).toHaveLength(2);
    for (const crack of band?.cracks ?? []) {
      const end = crack.at(-1)?.y ?? 3.25;
      expect(end > 3.5 || end < 3).toBe(true);
    }
  });

  it("marks only what of the band the face reaches, and none off it", () => {
    expect(UP.brittle(5.5, 7)?.outline.every(({ y }) => y <= 6.05)).toBe(true);
    expect(UP.brittle(7, 8)).toBeNull();
    expect(DOWN.brittle(-3, 1)).toBeNull();
  });

  it("works its ice out as a relief over its whole face, from its top to its foot and out past its edge for its lumps, its own on each wall (#290)", () => {
    const { box } = UP.relief;
    expect(box.top).toBe(6);
    expect(box.height).toBe(6);
    expect(box.left).toBeLessThanOrEqual(10 - IceRelief.PROUD);
    expect(box.left + box.width).toBeGreaterThanOrEqual(Math.max(...xs(UP.face)) - 1e-9);
    // Solid ice along the face's edge, none out over the drop, fading out towards its ragged
    // line in the glacier.
    for (let y = 0.75; y < 5.5; y += 0.5) {
      expect(solidAt(UP, { x: 10.6, y })).toBeGreaterThan(0.95);
      expect(solidAt(UP, { x: 10.375 - IceRelief.PROUD - 0.05, y })).toBe(0);
      expect(solidAt(UP, { x: Math.max(...xs(UP.face)) + 0.02, y })).toBe(0);
    }
    // A drop's ice is on its left, its own.
    expect(solidAt(DOWN, { x: 19.8, y: 4 })).toBeGreaterThan(0.95);
    expect(solidAt(DOWN, { x: 20.375 + IceRelief.PROUD + 0.05, y: 4 })).toBe(0);
    const other = new IceWall(TERRAIN, { x: 10, y: 0 }, { x: 10.375, y: 6 }, 3);
    expect(other.relief.character).not.toEqual(UP.relief.character);
    expect(UP.lip).toBeCloseTo(underTheLip(UP), 9);
  });

  it("shines in a lamp's light at its ice's highlights, and at the scars up a step climbed on the tools (#290)", () => {
    expect(UP.shines.length).toBeGreaterThan(10);
    for (const point of UP.shines) {
      expect(onTheIce(point, UP)).toBe(true);
    }
    for (const point of STEP.shines) {
      expect(onTheIce(point, STEP)).toBe(true);
    }
    expect(STEP.shines.length).toBeGreaterThan(STEP.relief.shines.length);
    // Spread down the face, not bunched at one height.
    expect(Math.max(...ys(UP.shines)) - Math.min(...ys(UP.shines))).toBeGreaterThan(3);
  });

  it("leans out at its top where the route climbs it on the tools: a bulge of ice under the lip of snow, which stands out past it (#290)", () => {
    expect(UP.bulge).toEqual([]);
    expect(DOWN.bulge).toEqual([]);
    const { bulge } = STEP;
    const out = 10.375 - Math.min(...xs(bulge));
    expect(out).toBeGreaterThanOrEqual(IceWall.BULGE.lean.min - 1e-9);
    expect(out).toBeLessThanOrEqual(IceWall.BULGE.lean.max + 1e-9);
    // From the lip down a metre or less, and back into the face at its foot.
    expect(Math.max(...ys(bulge))).toBeCloseTo(6, 9);
    expect(6 - Math.min(...ys(bulge))).toBeLessThanOrEqual(IceWall.BULGE.height.max + 1e-9);
    expect(Math.max(...xs(bulge))).toBeCloseTo(10.375, 9);
    // The lip of snow stands out further than the ice under it.
    expect(Math.min(...xs(STEP.cornice.outline))).toBeLessThan(Math.min(...xs(bulge)) - 0.05);
    // Its ice is there, out over the drop where the same wall with a ladder has none, and its
    // bare ice shows from under it.
    const nose = { x: 10.375 - out * 0.6, y: 6 - (6 - Math.min(...ys(bulge))) * 0.42 };
    expect(solidAt(STEP, nose)).toBeGreaterThan(0.9);
    expect(solidAt(UP, nose)).toBe(0);
    expect(STEP.lip).toBeCloseTo(Math.min(...ys(bulge)), 9);
  });

  it("scars a step climbed on the tools up its face, its picks' holes and front points' marks from the foot to under the lip, beside the face's edge (#290)", () => {
    expect(UP.scars).toEqual([]);
    const { scars } = STEP;
    expect(scars.length).toBeGreaterThan(8);
    const heights = scars.flatMap((scar) => ys(scar));
    expect(Math.min(...heights)).toBeLessThan(1);
    expect(Math.max(...heights)).toBeGreaterThan(4);
    expect(Math.max(...heights)).toBeLessThan(underTheLip(STEP));
    for (const scar of scars) {
      for (const point of scar) {
        expect(inside(point, STEP.face)).toBe(true);
        // Where the climbers swing: near the face's edge, not deep in the ice.
        expect(point.x - 10.375).toBeLessThan(0.75);
      }
    }
  });

  it("flashes in a headlamp's beam that falls on its face from the open side, brighter nearer the lamp, and not in one from inside the ice or turned away (#290)", () => {
    // A climber at the foot, their lamp at 1.7 m, looking up the face; one on its top; one
    // facing back down the route.
    const atTheFoot = new Beam({ x: 9.4, y: 1.7 }, 0.6, 6, 0.45, 1);
    const onTop = new Beam({ x: 11.5, y: 7.7 }, -2.4, 6, 0.45, 1);
    const turnedAway = new Beam({ x: 9.4, y: 1.7 }, Math.PI, 6, 0.45, 1);
    const lit = UP.lit([atTheFoot], 0.05);

    expect(lit.length).toBeGreaterThan(5);
    for (const { point, light } of lit) {
      expect(onTheIce(point, UP)).toBe(true);
      expect(light).toBeGreaterThan(0.05);
      expect(light).toBeLessThanOrEqual(1);
    }
    const nearest = [...lit].sort((one, other) => one.point.y - other.point.y)[0];
    const farthest = [...lit].sort((one, other) => other.point.y - one.point.y)[0];
    expect(nearest?.light ?? 0).toBeGreaterThan(farthest?.light ?? 1);
    expect(UP.lit([onTop], 0.05)).toEqual([]);
    expect(UP.lit([turnedAway], 0.05)).toEqual([]);
    expect(UP.lit([], 0.05)).toEqual([]);
  });

  it("drifts snow against its foot: up from the snow in front of it to the face, where its ice's bank of snow goes on (#290)", () => {
    const { apron } = UP;
    const { APRON } = IceWall;
    expect(apron.length).toBeGreaterThan(6);
    expect(Math.max(...ys(apron))).toBeGreaterThanOrEqual(APRON.high.min - 1e-9);
    expect(Math.max(...ys(apron))).toBeLessThanOrEqual(APRON.high.max + 1e-9);
    expect(Math.min(...xs(apron))).toBeLessThanOrEqual(10 - APRON.out.min + 1e-9);
    expect(Math.min(...xs(apron))).toBeGreaterThanOrEqual(10 - APRON.out.max - 1e-9);
    // It ends at the face, on the slant of its foot.
    expect(Math.max(...xs(apron))).toBeGreaterThanOrEqual(10);
    expect(Math.max(...xs(apron))).toBeLessThanOrEqual(10.375 + 1e-9);
    expect(Math.min(...ys(apron))).toBeGreaterThan(-0.2);
    // A drop's drift lies at its foot, on its right.
    expect(Math.max(...xs(DOWN.apron))).toBeGreaterThan(20.375 + APRON.out.min - 1e-9);
    expect(Math.min(...ys(DOWN.apron))).toBeGreaterThan(1.8);
  });

  it("is the same step on the same seed, its ice, bulge and scars too", () => {
    expect(new IceWall(TERRAIN, { x: 10, y: 0 }, { x: 10.375, y: 6 }, 2, true)).toEqual(STEP);
  });
});
