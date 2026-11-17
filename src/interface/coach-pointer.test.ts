import { describe, expect, it } from "vitest";

import type { ClimberView, Point } from "../physics";
import { Changeover } from "./changeover";
import { CoachPointer } from "./coach-pointer";
import type { PointerWorld } from "./coach-pointer";

/** A climber standing at `x` on flat ground, clipped to nothing. */
const standing = (x: number, over: Partial<ClimberView> = {}): ClimberView => ({
  x,
  y: 0,
  altitude: 5400,
  falling: false,
  dead: false,
  walking: "stop",
  moving: false,
  exertion: 0,
  first: null,
  second: null,
  firstAt: null,
  secondAt: null,
  jumarHeld: false,
  ladder: null,
  falls: [],
  slipChance: 0,
  hanging: false,
  kit: { crampons: true, lamp: true, water: true },
  cramponLoose: false,
  refitting: false,
  hauling: false,
  haulHeld: false,
  onIce: false,
  picks: [],
  pickPoor: false,
  lowering: false,
  gear: { jumar: true, tools: 1 },
  clipping: null,
  stillChance: 0,
  heldBack: null,
  facing: 1,
  towardViewer: false,
  ...over,
});

/** A route along a flat: a rope lying from 10 to 20 m and the next from 20 to 30, a ladder up a
 * wall at 40 m, 5 m high, one across a crevasse from 50 to 56, and a wall of ice at 60 m, 3 m
 * high. A clip takes the rope whose line is within 0.8 m of the player, the nearer one. */
class World implements PointerWorld {
  view: ClimberView = standing(0);
  ropes = ["one", "two"];
  ladders = ["wall", "crevasse"];
  face: { foot: Point; top: Point } | null = null;
  pickAt: Point | null = null;
  lift: Point | null = null;
  private readonly shapes: Readonly<Record<string, readonly Point[]>> = {
    one: [
      { x: 10, y: 0 },
      { x: 15, y: 0 },
      { x: 20, y: 0 },
    ],
    two: [
      { x: 20, y: 0 },
      { x: 30, y: 0 },
    ],
    wall: [
      { x: 40, y: 0 },
      { x: 40, y: 5 },
    ],
    crevasse: [
      { x: 50, y: 0 },
      { x: 56, y: 0 },
    ],
  };

  player(): ClimberView {
    return this.view;
  }

  ropeWithin(): string | null {
    const { x } = this.view;
    const reach = 0.8;
    const away = (id: string): number => {
      const [from, to] = [this.shapes[id]?.[0]?.x ?? 0, this.shapes[id]?.at(-1)?.x ?? 0];
      return x < from ? from - x : x > to ? x - to : 0;
    };
    const within = this.ropes.filter((id) => away(id) <= reach);
    // Past an anchor, the next rope is the nearest.
    return (
      within.sort((a, b) => away(a) - away(b) || (x > 20 ? -1 : 1) * a.localeCompare(b))[0] ?? null
    );
  }

  rope(id: string): readonly Point[] {
    return this.shapes[id] ?? [];
  }

  ladder(id: string): readonly Point[] {
    return this.shapes[id] ?? [];
  }

  iceFace(): { foot: Point; top: Point } | null {
    return this.face;
  }

  pickSpot(): Point | null {
    return this.pickAt;
  }

  liftPoint(): Point | null {
    return this.lift;
  }
}

const pointer = new CoachPointer();

describe("CoachPointer", () => {
  it("points nowhere with no tip on the card, or for a tip about no place", () => {
    const world = new World();

    expect(pointer.point(null, world)).toBeNull();
    expect(pointer.point("gust", world)).toBeNull();
    expect(pointer.point("seracs", world)).toBeNull();
    expect(pointer.point("careless", world)).toBeNull();
  });

  it("points ahead of the climber for the walk, clear of them", () => {
    const world = new World();
    world.view = standing(3);
    const walk = pointer.point("walk", world);

    expect(walk).toMatchObject({ way: "right", anchor: "tail", says: "walk" });
    expect(walk?.at.x).toBeGreaterThan(3 + 1);
    expect(walk?.at.y).toBeGreaterThan(0.8);
  });

  it("points up from under the rope onto the exact place on it a carabiner goes: the rope's point nearest the climber", () => {
    const world = new World();
    world.view = standing(12.4);

    expect(pointer.point("clip", world)).toEqual({
      at: { x: 12.4, y: 0 },
      way: "up",
      anchor: "tip",
      says: "clip-second",
    });
    // A step short of the rope's end, the place is its end: the anchor.
    world.view = standing(9.5);
    expect(pointer.point("clip", world)?.at).toEqual({ x: 10, y: 0 });
  });

  it("names the second cowstail first, then the jumar's, and points nowhere once both are on", () => {
    const world = new World();
    world.view = standing(12, { second: "one" });
    expect(pointer.point("clip", world)).toMatchObject({ says: "clip-first", at: { x: 12, y: 0 } });

    world.view = standing(12, { first: "one", second: "one" });
    expect(pointer.point("clip", world)).toBeNull();
  });

  it("points at no rope out of a cowstail's reach, nor for a climber falling past one", () => {
    const world = new World();
    world.view = standing(5);
    expect(pointer.point("clip", world)).toBeNull();

    world.view = standing(12, { falling: true });
    expect(pointer.point("unclipped", world)).toBeNull();
  });

  it("points at the rope for an unclipped climber by a crevasse, and on a creaking ladder", () => {
    const world = new World();
    world.view = standing(18);

    expect(pointer.point("unclipped", world)).toMatchObject({ says: "clip-second", way: "up" });
    expect(pointer.point("ladder-creak", world)).toMatchObject({ says: "clip-second" });
    world.view = standing(18, { first: "one", second: "one" });
    expect(pointer.point("ladder-creak", world)).toBeNull();
  });

  it("at a changeover takes it a step at a time: the carabiner off where it is, onto the next rope, then the jumar (#247)", () => {
    const world = new World();
    const change = new Changeover({ x: 20, y: 0 }, "one", "two");
    // Past the anchor, where the next rope is the nearest: the carabiner, still on the old rope.
    const onTheOld = { firstAt: { x: 20, y: 0 }, secondAt: { x: 20, y: 0 } };
    world.view = standing(20.5, { first: "one", second: "one", ...onTheOld });
    expect(pointer.point("anchor", world, change)).toEqual({
      at: { x: 20, y: 0 },
      way: "up",
      anchor: "tip",
      says: "off-second",
    });

    world.view = standing(20.5, { first: "one", second: null, ...onTheOld });
    expect(pointer.point("anchor", world, change)).toMatchObject({
      says: "clip-second",
      at: { x: 20.5, y: 0 },
    });

    world.view = standing(20.5, { first: "one", second: "two", ...onTheOld });
    expect(pointer.point("anchor", world, change)).toMatchObject({
      says: "off-first",
      at: { x: 20, y: 0 },
    });

    world.view = standing(20.5, { first: null, second: "two" });
    expect(pointer.point("anchor", world, change)).toMatchObject({ says: "clip-first" });

    world.view = standing(20.5, { first: "two", second: "two" });
    expect(pointer.point("anchor", world, change)).toBeNull();
    // No changeover on the card: no arrow for it.
    expect(pointer.point("anchor", world)).toBeNull();
  });

  it("points a little along the next rope from the anchor while a clip still takes the old one (#247)", () => {
    const world = new World();
    world.view = standing(19.6, { first: "one", second: null });
    const next = pointer.point("anchor", world, new Changeover({ x: 20, y: 0 }, "one", "two"));

    expect(next).toMatchObject({ way: "up", anchor: "tip", says: "clip-second" });
    expect(next?.at.x).toBeCloseTo(20.6, 6);
    expect(next?.at.y).toBe(0);
  });

  it("at a rope's end with no next one points at the carabiner, then the jumar, to take off (#247)", () => {
    const world = new World();
    const change = new Changeover({ x: 30, y: 0 }, "two", null);
    world.view = standing(30.7, { first: "two", second: "two", secondAt: { x: 30, y: 0 } });
    const carabiner = pointer.point("rope-end", world, change);
    world.view = standing(30.7, { first: "two", firstAt: { x: 30, y: 0 } });

    expect(carabiner).toMatchObject({ says: "off-second", at: { x: 30, y: 0 } });
    expect(pointer.point("rope-end", world, change)).toMatchObject({ says: "off-first" });
  });

  it("points along the rope from the jumar in the hand, the way the climber faces, for its slide", () => {
    const world = new World();
    world.view = standing(12, { first: "one", second: "one", firstAt: { x: 12.3, y: 0 } });
    const slide = pointer.point("jumar", world);
    world.view = standing(12, { first: "one", firstAt: { x: 11.7, y: 0 }, facing: -1 });
    const back = pointer.point("jumar", world);

    expect(slide).toMatchObject({ way: "right", anchor: "tail", says: "jumar" });
    expect(slide?.at.x).toBeGreaterThan(12.3);
    expect(back).toMatchObject({ way: "left", anchor: "tail", says: "jumar" });
    expect(back?.at.x).toBeLessThan(11.7);
  });

  it("points up a wall's ladder from its foot, down it from its top, and along a crossing", () => {
    const world = new World();
    world.view = standing(39.5);
    const up = pointer.point("ladder-up", world);
    // From over the head of a climber at its foot.
    expect(up).toMatchObject({ way: "up", anchor: "tail", says: "up" });
    expect(up?.at.x).toBe(40);
    expect(up?.at.y).toBeGreaterThan(1.9);

    world.view = standing(40.3, { y: 5 });
    const down = pointer.point("ladder-down", world);
    expect(down).toMatchObject({ way: "down", anchor: "tail", says: "down" });
    expect(down?.at.y).toBeLessThan(5);
    expect(down?.at.y).toBeGreaterThan(4);

    world.view = standing(49.5);
    const across = pointer.point("crossing", world);
    expect(across).toMatchObject({ way: "right", anchor: "tail", says: "cross" });
    expect(across?.at.x).toBeGreaterThan(50);
    // And back across it from its far end.
    world.view = standing(56.4);
    expect(pointer.point("crossing", world)).toMatchObject({ way: "left" });
  });

  it("points at no ladder far from the climber", () => {
    const world = new World();
    world.view = standing(33);

    expect(pointer.point("ladder-up", world)).toBeNull();
  });

  it("points at the ice where the next pick bites well, out of the wall so the climber stays in view, and down over the lip", () => {
    const world = new World();
    world.face = { foot: { x: 60, y: 0 }, top: { x: 60, y: 3 } };
    world.view = standing(59.6);
    world.pickAt = { x: 60, y: 1.7 };
    expect(pointer.point("ice-wall", world)).toEqual({
      at: { x: 60, y: 1.7 },
      way: "left",
      anchor: "tip",
      says: "pick",
    });

    world.view = standing(60, { y: 1.5, onIce: true });
    world.pickAt = { x: 60.3, y: 3 };
    expect(pointer.point("on-ice", world)).toEqual({
      at: { x: 60.3, y: 3 },
      way: "down",
      anchor: "tip",
      says: "pick-over",
    });
    world.pickAt = null;
    expect(pointer.point("on-ice", world)).toBeNull();
  });

  it("points down a face from its lip: at the ice to step down onto, and down its rope to lower", () => {
    const world = new World();
    world.face = { foot: { x: 60, y: 0 }, top: { x: 60, y: 3 } };
    world.view = standing(60.4, { y: 3 });
    const step = pointer.point("ice-down", world);
    const lower = pointer.point("rappel", world);

    expect(step).toMatchObject({ way: "right", anchor: "tip", says: "step-down" });
    expect(step?.at.x).toBe(60);
    expect(step?.at.y).toBeLessThan(3);
    expect(lower).toMatchObject({ way: "down", anchor: "tail", says: "lower" });
  });

  it("points up the rope over a hanging climber, and at the carabiner the jumar goes beside", () => {
    const world = new World();
    world.view = standing(53, { y: -4, falling: true, hanging: true, first: "one", second: "one" });
    const up = pointer.point("hanging", world);
    expect(up).toMatchObject({ way: "up", anchor: "tail", says: "climb-rope" });
    expect(up?.at.y).toBeGreaterThan(-4 + 2);

    world.view = standing(53, { y: -4, hanging: true, second: "one", secondAt: { x: 53, y: -3 } });
    expect(pointer.point("hanging-carabiner", world)).toEqual({
      at: { x: 53, y: -3 },
      way: "down",
      anchor: "tip",
      says: "jumar-on",
    });
  });

  it("points at the edge to stand at to pull a partner out, and at a fallen ladder's end to set it back", () => {
    const world = new World();
    world.view = standing(47);
    world.lift = { x: 50, y: 0 };
    expect(pointer.point("haul", world)).toEqual({
      at: { x: 50, y: 0 },
      way: "down",
      anchor: "tip",
      says: "haul",
    });
    world.lift = null;
    expect(pointer.point("haul", world)).toBeNull();

    world.view = standing(49);
    expect(pointer.point("ladder-broken", world)).toEqual({
      at: { x: 50, y: 0 },
      way: "down",
      anchor: "tip",
      says: "raise",
    });
  });

  it("points back from under a cracking serac, on from under a standing one, and at the boots of a loose crampon off a ladder", () => {
    const world = new World();
    world.view = standing(70);

    expect(pointer.point("serac-crack", world)).toMatchObject({ way: "left", says: "back-off" });
    expect(pointer.point("serac-crack", world)?.at.x).toBeLessThan(70 - 1);
    expect(pointer.point("stopped-under-seracs", world)).toMatchObject({
      way: "right",
      says: "move-on",
    });
    expect(pointer.point("crampon-loose", world)).toMatchObject({ way: "up", says: "refit" });
    world.view = standing(52, { ladder: "crevasse" });
    expect(pointer.point("crampon-loose", world)).toBeNull();
  });
});
