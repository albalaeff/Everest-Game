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

  it("puts the carabiners in the figure's metres, from where the climber is drawn", () => {
    const reading = new ClimberReading(slope);
    const jumar = { x: 12, y: 1 };
    const state = reading.read(view({ walking: "left" }), BODY, drawn(11, 0, 2, jumar));

    expect(state.jumar).toEqual({ x: -0.5, y: 0.5 });
    expect(state.carabiner).toBeNull();
  });

  it("measures the rope from the jumar to its nearer anchor, in the figure's metres", () => {
    const reading = new ClimberReading(slope);
    const up = Math.hypot(2, 1);
    const low = reading.read(view({ first: "rise" }), BODY, drawn(11, 0.5, 2, { x: 11, y: 0.5 }));
    const high = reading.read(
      view({ first: "rise" }),
      BODY,
      drawn(13, 1.5, 1, { x: 13.6, y: 1.8 }),
    );

    expect(low.slack).toBeCloseTo(up / 4, 9);
    expect(high.slack).toBeCloseTo(up / 5, 9);
  });
});
