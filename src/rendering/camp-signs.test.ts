import { describe, expect, it } from "vitest";

import { Terrain } from "../physics";
import { CampSigns } from "./camp-signs";
import type { CampStretch, TentSizes } from "./camp-signs";

/** Flat for 20 m, then a 45° slope for 20 m, and a ledge 30 m long. */
const TERRAIN = new Terrain([
  [0, 0],
  [20, 0],
  [40, 20],
  [70, 20],
]);
/** A dome 2.6 m long and 1.2 m high, its vestibule 0.9 m and its tail 0.45; the big dome 4 m
 * across and 2.1 m high. */
const SIZES: TentSizes = {
  length: 2.6,
  height: 1.2,
  vestibule: 0.9,
  tail: 0.45,
  dome: { width: 4, height: 2.1 },
};
const CLIMBER = 1.77;
/** Rubble for the first 20 m, snow above. */
const signs = new CampSigns(TERRAIN, SIZES, 20, 7);
const BASE: CampStretch = {
  id: "base-camp",
  from: 0,
  to: 8,
  tents: [
    { door: 4, lies: -1 },
    { door: 8.5, lies: -1 },
  ],
};
const HIGH: CampStretch = { id: "camp-1", from: 50, to: 60, tents: [{ door: 51, lies: 1 }] };

const xs = (points: readonly { x: number }[]): number[] => points.map(({ x }) => x);
const ys = (points: readonly { y: number }[]): number[] => points.map(({ y }) => y);

describe("CampSigns: a camp's tents (#258)", () => {
  it("stands each tent where the route pitches it, its door's end on the ground at its door, its body the way it lies", () => {
    const [first, second] = signs.tents(BASE);

    expect(signs.tents(BASE)).toHaveLength(2);
    expect(first).toMatchObject({ camp: "base-camp", index: 0, door: { x: 4, y: 0 }, lies: -1 });
    expect(first?.outline[0]).toEqual({ x: 4, y: 0 });
    expect(Math.min(...xs(first?.outline ?? []))).toBeCloseTo(4 - signs.span, 9);
    expect(second?.door.x).toBe(8.5);
    expect(Math.max(...xs(second?.outline ?? []))).toBe(8.5);
  });

  it("draws an expedition dome: as long as its room, vestibule and tail, a little higher than the room inside, and lower than a climber", () => {
    const [tent] = signs.tents(HIGH);
    const outline = tent?.outline ?? [];

    expect(signs.span).toBeCloseTo(2.6 + 0.9 + 0.45, 9);
    expect(Math.max(...xs(outline)) - Math.min(...xs(outline))).toBeCloseTo(signs.span, 9);
    const height = Math.max(...ys(outline)) - 20;
    expect(height).toBeGreaterThan(SIZES.height);
    expect(height).toBeLessThan(SIZES.height + 0.1);
    expect(height).toBeLessThan(CLIMBER);
    expect(outline.at(-1)?.y).toBe(20);
    expect(Math.min(...ys(outline))).toBe(20);
  });

  it("gives it a door in its vestibule that a climber on hands and knees gets through", () => {
    const [tent] = signs.tents(HIGH);
    const opening = tent?.opening ?? [];

    const door = tent?.door.x ?? NaN;

    expect(Math.min(...xs(opening))).toBeGreaterThanOrEqual(door);
    expect(Math.max(...xs(opening))).toBeLessThanOrEqual(door + SIZES.vestibule);
    expect(Math.max(...ys(opening)) - 20).toBeGreaterThan(0.6);
    expect(Math.max(...xs(opening)) - Math.min(...xs(opening))).toBeGreaterThan(0.6);
  });

  it("sways in the wind most at its top and not at all on the ground, and pegs every guy line to the ground", () => {
    const [tent] = signs.tents(HIGH);
    const shape = tent ?? { base: 0, tall: 1 };

    expect(tent).toMatchObject({ base: 20 });
    expect(CampSigns.swayed({ x: 45, y: 20 }, shape, 0.1).x).toBe(45);
    expect(CampSigns.swayed({ x: 45, y: 20 + shape.tall }, shape, 0.1).x).toBeCloseTo(45.1, 9);
    expect(tent?.guys.length).toBeGreaterThanOrEqual(3);
    for (const { from, peg } of tent?.guys ?? []) {
      expect(peg.y).toBe(20);
      expect(from.y).toBeGreaterThan(20.3);
    }
  });

  it("leaves the door's opening out of the vestibule round it, for whoever goes in to show in", () => {
    const [tent] = signs.tents(HIGH);
    type Spot = { readonly x: number; readonly y: number };
    const inside = (point: Spot, shape: readonly Spot[]): boolean =>
      shape.reduce((crossed, from, index) => {
        const to = shape[(index + 1) % shape.length] ?? from;
        const spans = from.y > point.y !== to.y > point.y;
        const at = from.x + ((point.y - from.y) / (to.y - from.y)) * (to.x - from.x);
        return spans && point.x < at ? !crossed : crossed;
      }, false);
    const door = tent?.door.x ?? NaN;
    const inTheDoor = { x: door + 0.5, y: 20.3 };

    expect(inside(inTheDoor, tent?.vestibule ?? [])).toBe(true);
    expect(inside(inTheDoor, tent?.around ?? [])).toBe(false);
    expect(inside({ x: door + 0.6, y: 20.95 }, tent?.around ?? [])).toBe(true);
    expect(inside({ x: door + 2.2, y: 20.5 }, tent?.room ?? [])).toBe(true);
  });

  it("ties a tent on the rubble to rocks, with a barrel beside it, and stakes one on the snow, with what was carried up", () => {
    const [low] = signs.tents(BASE);
    const [high] = signs.tents(HIGH);

    const [, second] = signs.tents(BASE);

    expect(low?.rubble).toBe(true);
    expect(low?.props.map(({ kind }) => kind)).toEqual(expect.arrayContaining(["axe", "barrel"]));
    // Behind the second tent's tail is the first one's door: nothing lies in a doorway.
    expect(second?.props.map(({ kind }) => kind)).toEqual(["axe"]);
    expect(high?.rubble).toBe(false);
    expect(high?.props.map(({ kind }) => kind)).toEqual(["axe", "bottles"]);
  });

  it("finds the tent whose door is nearest a climber", () => {
    const tents = signs.tents(BASE);

    expect(CampSigns.nearest(tents, 3.2)?.index).toBe(0);
    expect(CampSigns.nearest(tents, 9)?.index).toBe(1);
    expect(CampSigns.nearest([], 9)).toBeNull();
  });

  it("stands none at a camp the route pitches none at", () => {
    expect(signs.tents({ id: "ledge", from: 50, to: 51 })).toEqual([]);
  });
});

describe("CampSigns: Base Camp's big dome and the tents behind (#258)", () => {
  it("stands the big dome before Base Camp's tents, clear of them, as wide and as high as it is: a climber stands up in it", () => {
    const dome = signs.dome(BASE);
    const [first] = signs.tents(BASE);
    const outline = dome?.outline ?? [];

    expect(Math.max(...xs(outline)) - Math.min(...xs(outline))).toBeCloseTo(4, 9);
    expect(Math.max(...ys(outline))).toBeGreaterThan(CLIMBER);
    expect(Math.max(...ys(outline))).toBeLessThan(2.1 + 0.1);
    expect(Math.max(...xs(outline))).toBeLessThan(Math.min(...xs(first?.outline ?? [])));
    expect(Math.max(...ys(dome?.door ?? []))).toBeGreaterThan(1.4);
  });

  it("stands no big dome at a higher camp", () => {
    expect(signs.dome(HIGH)).toBeNull();
  });

  it("stands rows of other expeditions' tents behind a camp, smaller than its own, on level ground, the same every time", () => {
    const far = signs.far(BASE);
    const again = new CampSigns(TERRAIN, SIZES, 20, 7).far(BASE);
    const other = new CampSigns(TERRAIN, SIZES, 20, 8).far(BASE);

    expect(far.length).toBeGreaterThan(5);
    expect(far).toEqual(again);
    expect(far).not.toEqual(other);
    for (const { outline } of far) {
      const wide = Math.max(...xs(outline)) - Math.min(...xs(outline));
      expect(wide).toBeLessThan(signs.span * 0.7);
      expect(wide).toBeGreaterThan(signs.span * 0.4);
      expect(Math.min(...ys(outline))).toBeCloseTo(outline[0]?.y ?? NaN, 9);
    }
    expect(far.some(({ lit }) => lit)).toBe(true);
    expect(far.some(({ lit }) => !lit)).toBe(true);
  });

  it("stands fewer behind a higher camp, none hanging over the edge of its flat", () => {
    const far = signs.far(HIGH);

    expect(far.length).toBeGreaterThan(0);
    expect(far.length).toBeLessThan(signs.far(BASE).length);
    for (const { outline } of far) {
      expect(Math.min(...xs(outline))).toBeGreaterThanOrEqual(40);
      expect(Math.min(...ys(outline))).toBe(20);
    }
  });
  it("cuts a tent through from end to end: from the ground at its door's end over its peak to the ground behind", () => {
    const profile = CampSigns.profile(SIZES);
    const [first] = profile;
    const last = profile.at(-1);
    const top = Math.max(...profile.map(([, up]) => up));
    const peak = profile.find(([, up]) => up === top);

    expect(first).toEqual([0, 0]);
    expect(last?.[0]).toBeCloseTo(SIZES.vestibule + SIZES.length + SIZES.tail, 9);
    expect(last?.[1]).toBeCloseTo(0, 9);
    // The fly stands a hand's width over the tent's own peak, over the middle of the room.
    expect(top).toBeGreaterThanOrEqual(SIZES.height);
    expect(top).toBeLessThan(SIZES.height + 0.1);
    expect(peak?.[0]).toBeGreaterThan(SIZES.vestibule + 0.3 * SIZES.length);
    expect(peak?.[0]).toBeLessThan(SIZES.vestibule + 0.7 * SIZES.length);
    // Along it goes on from the door to the tail, never back.
    expect(
      profile.every(([along], index) => index === 0 || along >= (profile[index - 1]?.[0] ?? 0)),
    ).toBe(true);
  });
});
