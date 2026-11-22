import { describe, expect, it } from "vitest";

import { Terrain } from "../physics";
import type { ClimberView, Point } from "../physics";
import type { BodyView } from "../simulation";
import { ClimberReading } from "./climber-reading";
import type { DrawnAt, ReadSlope } from "./climber-reading";

/** Level to 10 m, up half a metre a metre to 14, level, a wall 3 m high at 20, and level on. */
const terrain = new Terrain([
  [0, 0],
  [10, 0],
  [14, 2],
  [20, 2],
  [20, 5],
  [30, 5],
]);
const LADDERS: Readonly<Record<string, readonly Point[]>> = {
  wall: [
    { x: 20, y: 2 },
    { x: 20, y: 5 },
  ],
  across: [
    { x: 24, y: 5 },
    { x: 28, y: 5 },
  ],
};
/** A rope up the rise, its anchors at 10 and 14 m. */
const ROPES: Readonly<Record<string, readonly Point[]>> = {
  rise: [
    { x: 10, y: 0 },
    { x: 12, y: 1 },
    { x: 14, y: 2 },
  ],
};
const slope: ReadSlope = {
  terrain,
  ladder: (id) => LADDERS[id] ?? [],
  rope: (id) => ROPES[id] ?? [],
  // The rope up the rise is 5 m long, half a metre of it slack (#256).
  ropeLength: (id) => (ROPES[id] === undefined ? 0 : 5),
  lines: [],
};
const BODY: BodyView = { tiredness: "fresh", symptoms: [], oximeter: 90, pace: "steady" };

const view = (over: Partial<ClimberView> = {}): ClimberView => ({
  x: 0,
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
  injuries: [],
  down: false,
  carriedBy: null,
  carrying: null,
  onLine: null,
  hauled: false,
  helping: null,
  sheltered: false,
  ...over,
});

const drawn = (x: number, y: number, grown = 1, jumar: Point | null = null): DrawnAt => ({
  at: { x, y },
  jumar,
  carabiner: null,
  grown,
});

describe("ClimberReading", () => {
  it("faces the way they last walked, and keeps it at a halt", () => {
    const reading = new ClimberReading(slope);

    reading.read(view({ walking: "left" }), BODY, drawn(5, 0));
    expect(reading.facing).toBe(-1);
    reading.read(view({ walking: "stop" }), BODY, drawn(5, 0));
    expect(reading.facing).toBe(-1);
    reading.read(view({ walking: "down-right" }), BODY, drawn(5, 0));
    expect(reading.facing).toBe(1);
  });

  it("faces along the rope they hold tight or haul on, toward its far end, whichever way they last walked", () => {
    const reading = new ClimberReading(slope);
    // At the rope's upper anchor after walking up to it: the rope runs back down behind them.
    const there = drawn(14, 2);
    reading.read(view({ x: 14, y: 2, walking: "right", first: "rise" }), BODY, there);
    reading.read(view({ x: 14, y: 2, first: "rise" }), BODY, there);
    expect(reading.facing).toBe(1);

    reading.read(view({ x: 14, y: 2, first: "rise", haulHeld: true }), BODY, there);
    expect(reading.facing).toBe(-1);
    const hauling = view({ x: 14, y: 2, first: "rise", haulHeld: true, hauling: true });
    reading.read(hauling, BODY, there);
    expect(reading.facing).toBe(-1);
    // The haul let go, they face as they did holding it, until they walk.
    reading.read(view({ x: 14, y: 2, first: "rise" }), BODY, there);
    expect(reading.facing).toBe(-1);
  });

  it("counts the way covered across the ground in the figure's metres, and none in a fall", () => {
    const reading = new ClimberReading(slope);
    reading.read(view(), BODY, drawn(10, 0, 2));

    expect(reading.read(view({ moving: true }), BODY, drawn(12, 1, 2)).travelled).toBeCloseTo(1);
    expect(reading.read(view({ falling: true }), BODY, drawn(13, 0, 2)).travelled).toBeCloseTo(1);
  });

  it("reads the ground ahead the way they face, in the figure's metres", () => {
    const reading = new ClimberReading(slope);
    const right = reading.read(view({ walking: "right" }), BODY, drawn(12, 1, 2));

    expect(right.ground(0)).toBeCloseTo(0, 9);
    expect(right.ground(0.5)).toBeCloseTo(0.25, 9);
    const left = reading.read(view({ walking: "left" }), BODY, drawn(12, 1, 2));
    expect(left.ground(0.5)).toBeCloseTo(-0.25, 9);
  });

  it("reads steps likelier to slip as less steady: a careful one steady, a hurried one on blue ice not at all (#208)", () => {
    const reading = new ClimberReading(slope);
    const footing = (slipChance: number): number =>
      reading.read(view({ moving: true, slipChance }), BODY, drawn(5, 0)).footing;

    expect(footing(0)).toBe(1);
    expect(footing(0.005)).toBeGreaterThan(0.9);
    expect(footing(0.03)).toBeCloseTo(0.5, 9);
    expect(footing(0.06)).toBe(0);
    expect(footing(0.5)).toBe(0);
  });

  it("stands a boot level beside a wall's face, at its foot too", () => {
    const reading = new ClimberReading(slope);
    const below = reading.read(view({ walking: "right" }), BODY, drawn(19.9, 2));

    expect(below.ground(0.2)).toBeCloseTo(0, 9);
    const atTheFoot = reading.read(view(), BODY, drawn(20, 2));
    expect(atTheFoot.ground(0)).toBeCloseTo(0, 9);
    expect(atTheFoot.ground(-0.3)).toBeCloseTo(0, 9);
  });

  it("reads how high a falling climber is off the ground", () => {
    const state = new ClimberReading(slope).read(view({ falling: true }), BODY, drawn(5, 3, 1.5));

    expect(state.ground(0)).toBeCloseTo(-2, 9);
    expect(state.ladder).toBeNull();
  });

  it("reads a climber off their feet against a wall's face as over its foot, not on its top above them", () => {
    const reading = new ClimberReading(slope);
    // Hanging on their rope against the wall, a metre under its lip: 2 m of air under them.
    const hanging = reading.read(view({ falling: true, hanging: true }), BODY, drawn(20, 4));
    expect(hanging.ground(0)).toBeCloseTo(-2, 9);

    // Lying on the wall's top at its edge, and at its foot: on the ground, each.
    const onTop = reading.read(view({ falling: true }), BODY, drawn(20.02, 5));
    expect(onTop.ground(0)).toBeCloseTo(0, 9);
    const atTheFoot = reading.read(view({ falling: true }), BODY, drawn(19.98, 2));
    expect(atTheFoot.ground(0)).toBeCloseTo(0, 9);
  });

  it("turns a climber who hangs on their rope beside a wall's face to face it, and leaves one in the open air as they were", () => {
    const reading = new ClimberReading(slope);
    reading.read(view({ walking: "left" }), BODY, drawn(19, 2));
    expect(reading.facing).toBe(-1);

    // Half a metre out from the wall, hauled up toward its lip: it's within a leg's reach.
    reading.read(view({ falling: true, hanging: true }), BODY, drawn(19.5, 3.5));
    expect(reading.facing).toBe(1);

    // Three metres out from it, in the open air: no wall to face.
    const free = new ClimberReading(slope);
    free.read(view({ walking: "left" }), BODY, drawn(17, 2));
    free.read(view({ falling: true, hanging: true }), BODY, drawn(17, 4));
    expect(free.facing).toBe(-1);
  });

  it("faces the wall on a ladder up it, going up or down by the key", () => {
    const reading = new ClimberReading(slope);
    const up = reading.read(view({ ladder: "wall", walking: "up" }), BODY, drawn(20, 3));

    expect(reading.facing).toBe(1);
    expect(up.ladder).toEqual({ way: { x: 0, y: 1 }, rung: -0.85, spacing: 0.3, ends: [-1, 2] });
    const down = reading.read(view({ ladder: "wall", walking: "down" }), BODY, drawn(20, 3));
    expect(down.ladder?.way.y).toBe(-1);
    expect(down.ladder?.rung).toBeCloseTo(0.85, 9);
    expect(down.ladder?.ends).toEqual([1, -2]);
  });

  it("goes down a wall's ladder stepped onto at its top, and counts the way along it", () => {
    const reading = new ClimberReading(slope);
    const onTop = reading.read(view({ ladder: "wall" }), BODY, drawn(20, 4.9, 2));
    const lower = reading.read(view({ ladder: "wall", moving: true }), BODY, drawn(20, 4.5, 2));

    expect(onTop.ladder?.way.y).toBe(-1);
    expect(lower.travelled - onTop.travelled).toBeCloseTo(0.2, 9);
    expect(lower.ladder?.spacing).toBeCloseTo(0.15, 9);
  });

  it("finds the rungs and the ends the way they go across a ladder, facing either way", () => {
    const reading = new ClimberReading(slope);
    const right = reading.read(view({ ladder: "across", walking: "right" }), BODY, drawn(25, 5));

    expect(right.ladder?.way).toEqual({ x: 1, y: 0 });
    expect(right.ladder?.rung).toBeCloseTo(-0.85, 9);
    expect(right.ladder?.ends).toEqual([-1, 3]);
    const left = reading.read(view({ ladder: "across", walking: "left" }), BODY, drawn(25, 5));
    expect(left.ladder?.way.x).toBe(1);
    expect(left.ladder?.way.y).toBeCloseTo(0, 9);
    expect(left.ladder?.rung).toBeCloseTo(0.85, 9);
    expect(left.ladder?.ends).toEqual([1, -3]);
  });

  it("reads a climber on their tools at a wall's foot against its face, not the ground before it, in short steps", () => {
    const reading = new ClimberReading(slope);
    reading.read(view({ walking: "right" }), BODY, drawn(19, 2));
    const state = reading.read(
      view({ onIce: true, picks: [{ x: 20, y: 3.9 }] }),
      BODY,
      drawn(20, 2),
    );

    expect(reading.facing).toBe(1);
    expect(state.ladder?.way.x).toBeCloseTo(0, 9);
    expect(state.ladder?.way.y).toBeCloseTo(1, 9);
    expect(state.ladder?.spacing).toBeCloseTo(ClimberReading.ICE_STEP_METRES, 9);
    expect(state.onIce).toBe(true);
    const [pick] = state.picks ?? [];
    expect(pick).toMatchObject({ swing: 1, at: { x: 0, y: 1.9 } });
    expect(pick?.into.x).toBeCloseTo(1, 9);
    expect(pick?.into.y).toBeCloseTo(0, 9);
  });

  it("reads a face of ice as a ladder from its foot to its lip, so the pose knows where it ends (#222)", () => {
    const reading = new ClimberReading(slope);
    reading.read(view({ walking: "right" }), BODY, drawn(19, 2));
    const top = (y: number): readonly number[] =>
      reading.read(view({ onIce: true }), BODY, drawn(20, y)).ladder?.ends ?? [];

    // The wall goes up from 2 m to 5 m: low on it, its lip is 2.5 m over the climber's point; near
    // the lip, 0.4 m, and its foot 2.6 m under it; at the lip, none.
    expect(Math.max(...top(2.5))).toBeCloseTo(2.5, 6);
    expect(Math.min(...top(2.5))).toBeCloseTo(-0.5, 6);
    expect(Math.max(...top(4.6))).toBeCloseTo(0.4, 6);
    expect(Math.min(...top(4.6))).toBeCloseTo(-2.6, 6);
    expect(Math.max(...top(5))).toBeCloseTo(0, 6);
  });

  it("tells each pick in the ice by the swing that put it there, and the way into the ice where it is", () => {
    const reading = new ClimberReading(slope);
    const on = (picks: readonly Point[], tools = 2) =>
      reading.read(view({ onIce: true, picks, gear: { jumar: true, tools } }), BODY, drawn(20, 3));
    const first = { x: 20, y: 4.4 };
    const second = { x: 20, y: 4.7 };
    const overTheLip = { x: 20.5, y: 5 };

    expect(on([first]).picks?.map(({ swing }) => swing)).toEqual([1]);
    expect(on([second, first]).picks?.map(({ swing }) => swing)).toEqual([2, 1]);
    const topping = on([overTheLip, second]);
    expect(topping.picks?.map(({ swing }) => swing)).toEqual([3, 2]);
    expect(topping.picks?.[0]?.into.x).toBeCloseTo(0, 9);
    expect(topping.picks?.[0]?.into.y).toBeCloseTo(-1, 9);
    expect(topping.tools).toBe(2);
    expect(reading.read(view(), BODY, drawn(20, 5)).picks).toEqual([]);
  });

  it("puts the carabiners in the figure's metres, from where the climber is drawn", () => {
    const reading = new ClimberReading(slope);
    const jumar = { x: 12, y: 1 };
    const state = reading.read(view({ walking: "left" }), BODY, drawn(11, 0, 2, jumar));

    expect(state.jumar).toEqual({ x: -0.5, y: 0.5 });
    expect(state.carabiner).toBeNull();
  });

  it("hands the pose the rope the jumar is on, its anchors and its length, in the figure's metres (#256)", () => {
    const reading = new ClimberReading(slope);
    const low = reading.read(view({ first: "rise" }), BODY, drawn(11, 0.5, 2, { x: 11, y: 0.5 }));
    const high = reading.read(
      view({ first: "rise", walking: "left" }),
      BODY,
      drawn(13, 1.5, 1, { x: 13.6, y: 1.8 }),
    );

    expect(low.rope).toEqual({
      anchors: [
        { x: -0.5, y: -0.25 },
        { x: 1.5, y: 0.75 },
      ],
      length: 2.5,
    });
    // Facing left, x the way they face.
    expect(high.rope).toEqual({
      anchors: [
        { x: 3, y: -1.5 },
        { x: -1, y: 0.5 },
      ],
      length: 5,
    });
    expect(reading.read(view(), BODY, drawn(11, 0.5)).rope).toBeNull();
  });
});

/** A rescue line from the wall's lip, down its face and a metre and a half out along its foot. */
const LIP = terrain.nearest({ x: 20, y: 5 }).along;
const line = (built = 1): ReadSlope["lines"][number] => ({
  id: "line",
  top: LIP,
  foot: LIP - 4.5,
  shape: [
    { x: 20, y: 5 },
    { x: 20, y: 2 },
    { x: 18.5, y: 2 },
  ],
  built,
});
const withLine = (built = 1): ReadSlope => ({ ...slope, lines: [line(built)] });
const BROKEN_LEG = {
  part: "leg",
  kind: "fracture",
  step: 0,
  tourniquet: false,
  splinted: false,
  aid: 0,
} as const;
const BROKEN_ARM = { ...BROKEN_LEG, part: "arm" } as const;
const SPRAIN = { ...BROKEN_LEG, kind: "sprain" } as const;

describe("ClimberReading: a casualty and their rescuer (#241)", () => {
  it("tells a climber down with a bone broken by the limb, the leg before the arm, and has them take no stride", () => {
    const reading = new ClimberReading(slope);
    const leg = reading.read(view({ down: true, injuries: [BROKEN_LEG] }), BODY, drawn(5, 0));
    const arm = reading.read(view({ down: true, injuries: [BROKEN_ARM] }), BODY, drawn(5, 0));
    const both = view({ down: true, injuries: [BROKEN_ARM, BROKEN_LEG], walking: "left" });
    const sound = reading.read(view(), BODY, drawn(5, 0));

    expect(leg).toMatchObject({ hurt: "leg", falling: false, limp: 0 });
    expect(arm.hurt).toBe("arm");
    expect(reading.read(both, BODY, drawn(5, 0)).hurt).toBe("leg");
    // Down, they turn nowhere, whatever key is held.
    expect(reading.facing).toBe(1);
    expect(sound.hurt).toBeNull();
  });

  it("has a sprained leg limp until it's wrapped, less once it is, and an arm's not at all", () => {
    const reading = new ClimberReading(slope);
    const limp = (injury: ClimberView["injuries"][number]): number | undefined =>
      reading.read(view({ injuries: [injury] }), BODY, drawn(5, 0)).limp;

    expect(limp(SPRAIN)).toBe(1);
    expect(limp({ ...SPRAIN, splinted: true })).toBeCloseTo(0.45, 9);
    expect(limp({ ...SPRAIN, part: "arm" })).toBe(0);
    expect(reading.read(view({ injuries: [SPRAIN] }), BODY, drawn(5, 0)).hurt).toBeNull();
  });

  it("holds a climber on a rescue line to it a reach above them, the rope running on up to its anchor", () => {
    const reading = new ClimberReading(withLine());
    const going = view({ onLine: "line", lowering: true, moving: true });
    const low = reading.read(going, BODY, drawn(20, 3));
    const tied = reading.onLine;
    const still = reading.read({ ...going, moving: false }, BODY, drawn(20, 3));
    // Drawn twice life size, the reach is longer than the rope above them: at its anchor.
    const high = reading.read(going, BODY, drawn(20, 4, 2));

    expect(low.jumar?.x).toBeCloseTo(0, 9);
    expect(low.jumar?.y).toBeCloseTo(0.7, 9);
    // The rope above them, from its anchor 2 m up, as far as their hold on it.
    expect(low.rope?.anchors).toEqual([{ x: 0, y: 2 }]);
    expect(low.rope?.length).toBeCloseTo(1.3, 9);
    expect(low).toMatchObject({ sliding: true, onIce: true, falling: false });
    expect(still.sliding).toBe(false);
    expect(tied).toEqual({
      line: "line",
      taut: [
        { x: 20, y: 5 },
        { x: 20, y: 3.7 },
      ],
    });
    expect(high.jumar?.y).toBeCloseTo(0.5, 9);
    expect(high.rope?.length).toBe(0);
    // Off the line, nothing holds them.
    reading.read(view(), BODY, drawn(21, 5));
    expect(reading.onLine).toBeNull();
  });

  it("holds one round the foot of a line's wall to the rope where it lies, corner and all", () => {
    const reading = new ClimberReading(withLine());
    reading.read(view({ onLine: "line", lowering: true }), BODY, drawn(19.5, 2));

    expect(reading.onLine?.taut).toEqual([
      { x: 20, y: 5 },
      { x: 20, y: 2.2 },
    ]);
  });

  it("hangs a casualty hauled up a rescue line on it: off their feet over the wall's foot, facing the ice", () => {
    const reading = new ClimberReading(withLine());
    reading.read(view({ walking: "left" }), BODY, drawn(19, 2));
    const hauled = view({ down: true, hauled: true, onLine: "line", injuries: [BROKEN_LEG] });
    // The physics has them 1.5 m down the wall, a third of the line's 4.5 m from its anchor; the
    // rope runs taut from the lip to its foot on the floor, and brings them up along it (#279).
    const state = reading.read(hauled, BODY, drawn(20, 3.5));

    expect(reading.drawnAt.x).toBeCloseTo(19.5, 9);
    expect(reading.drawnAt.y).toBeCloseTo(4, 9);
    expect(state).toMatchObject({ falling: true, hanging: true, hurt: "leg" });
    expect(state.face).toBeCloseTo(0.45, 9);
    expect(state.ground(0)).toBeCloseTo(-2, 9);
    // Tied in a reach up the rope, toward the lip: where the lip is from their harness.
    expect(Math.hypot(state.jumar?.x ?? 0, state.jumar?.y ?? 0)).toBeCloseTo(0.7, 9);
    expect(state.hauled?.lip.x).toBeCloseTo(0.5, 9);
    expect(state.hauled?.lip.y).toBeCloseTo(1, 9);
    expect(reading.facing).toBe(1);
    expect(reading.onLine?.taut[0]).toEqual({ x: 20, y: 5 });
  });

  it("brings a casualty hauled up a stepped wall straight up the rope's way over the steps, facing the anchor, not in and out along them (#279)", () => {
    // A wall from a floor at 0 up to a lip at 4 m, in two steps of 2 m, the upper one 0.4 m
    // further back; its top beyond, where the anchor is.
    const steps = new Terrain([
      [0, 0],
      [10, 0],
      [10, 2],
      [10.4, 2],
      [10.4, 4],
      [16, 4],
    ]);
    const stepped: ReadSlope = {
      ...slope,
      terrain: steps,
      lines: [
        {
          id: "line",
          top: 0,
          foot: 0,
          shape: [
            { x: 10.8, y: 4 },
            { x: 10.4, y: 4 },
            { x: 10.4, y: 2 },
            { x: 10, y: 2 },
            { x: 10, y: 0 },
          ],
          built: 1,
        },
      ],
    };
    const reading = new ClimberReading(stepped);
    const hauled = view({ down: true, hauled: true, onLine: "line", injuries: [BROKEN_LEG] });
    const drawnAs = (x: number, y: number): Point => {
      reading.read(hauled, BODY, drawn(x, y));
      return reading.drawnAt;
    };
    // Up the lower step, out along its ledge, up the upper one, as the physics goes.
    const physics = [
      { x: 10, y: 0.5 },
      { x: 10, y: 1.9 },
      { x: 10.2, y: 2 },
      { x: 10.4, y: 2.1 },
      { x: 10.4, y: 3.5 },
    ];
    const ways = physics.map(({ x, y }) => drawnAs(x, y));

    // On the rope's straight runs: up the lower step's face to its corner, then straight from
    // there to the lip, rising all the way, never along the ledge and back.
    ways.forEach((at, index) => {
      expect(at.x).toBeCloseTo(at.y <= 2 ? 10 : 10 + 0.2 * (at.y - 2), 9);
      expect(at.y).toBeGreaterThan(ways[index - 1]?.y ?? -1);
    });
    expect(reading.facing).toBe(1);
  });

  it("kneels a rescuer at the hurt limb where it's drawn, turned to it, their legs still", () => {
    const reading = new ClimberReading(slope);
    reading.read(view({ walking: "right" }), BODY, drawn(5, 0));
    const helping = { kind: "aid", whom: "anna", progress: 0.3 } as const;
    const beside = { mount: null, wound: { x: 4.4, y: 0.2 } };
    // The physics has them level with the casualty, facing as they walked: the picture turns
    // them to the limb, drawn a step aside.
    const state = reading.read(
      view({ helping, haulHeld: true, moving: true, facing: 1 }),
      BODY,
      drawn(5, 0),
      beside,
    );

    expect(reading.facing).toBe(-1);
    expect(state.tending?.what).toBe("aid");
    expect(state.tending?.at?.x).toBeCloseTo(0.6, 9);
    expect(state.tending?.at?.y).toBeCloseTo(0.2, 9);
    expect(state).toMatchObject({ moving: false, bracing: false, hauling: false });
  });

  it("turns a rescuer to whom they work for where no limb is drawn yet, and kneels them to lift too", () => {
    const reading = new ClimberReading(slope);
    reading.read(view({ walking: "right" }), BODY, drawn(5, 0));
    const lift = { kind: "lift", whom: "anna", progress: 0.5 } as const;
    const state = reading.read(
      view({ helping: lift, haulHeld: true, facing: -1 }),
      BODY,
      drawn(5, 0),
    );
    // Hauling on a rescue line, they stand to it, turned to the casualty.
    const haul = { kind: "line-haul", whom: "anna", progress: 0.5 } as const;
    const hauling = reading.read(
      view({ helping: haul, haulHeld: true, hauling: true, facing: 1 }),
      BODY,
      drawn(5, 0),
    );

    expect(state.tending).toEqual({ what: "aid", at: null });
    expect(hauling).toMatchObject({ tending: null, hauling: true });
    expect(reading.facing).toBe(1);
  });

  it("kneels a rescuer at a rescue line's anchor, turned to the screw going in", () => {
    const reading = new ClimberReading(withLine(0.2));
    reading.read(view({ walking: "right" }), BODY, drawn(20.9, 5));
    const anchor = { kind: "anchor", whom: "anna", progress: 0.2 } as const;
    const state = reading.read(
      view({ helping: anchor, haulHeld: true, facing: -1 }),
      BODY,
      drawn(20.9, 5),
    );

    expect(reading.facing).toBe(-1);
    expect(state.tending?.what).toBe("anchor");
    // The first screw, 0.16 m back from the lip, its head still well out of the ice.
    expect(state.tending?.at?.x).toBeCloseTo(0.74, 9);
    expect(state.tending?.at?.y).toBeGreaterThan(0.1);
    expect(state.tending?.at?.y).toBeLessThan(0.2);
  });

  it("puts a casualty on their rescuer's back: facing their way, where their hips are drawn", () => {
    const reading = new ClimberReading(slope);
    const carried = view({ down: true, carriedBy: "boris", injuries: [BROKEN_LEG] });
    const mount = { facing: -1, hips: { x: 5.1, y: 0.8 }, lean: 0.4 } as const;
    const state = reading.read(carried, BODY, drawn(5, 0), { mount, wound: null });
    // Nobody drawn to ride on: they sit where they are.
    const alone = new ClimberReading(slope).read(carried, BODY, drawn(5, 0));

    expect(reading.facing).toBe(-1);
    expect(state.riding?.hips.x).toBeCloseTo(-0.1, 9);
    expect(state.riding?.hips.y).toBeCloseTo(0.8, 9);
    expect(state.riding?.lean).toBe(0.4);
    expect(state).toMatchObject({ falling: false, hurt: "leg" });
    expect(alone.riding).toBeNull();
  });

  it("tells a rescuer with a casualty on their back", () => {
    const reading = new ClimberReading(slope);

    expect(reading.read(view({ carrying: "anna" }), BODY, drawn(5, 0)).carrying).toBe(true);
    expect(reading.read(view(), BODY, drawn(5, 0)).carrying).toBe(false);
  });
});
