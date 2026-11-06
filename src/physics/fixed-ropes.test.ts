import { describe, expect, it } from "vitest";

import type { ExpeditionSave } from "../simulation";
import type { RopeLayout, SlopeLayout } from "./slope-physics";
import type { Point } from "./terrain";
import { Climb } from "./testing/climb";
import { TestMountain } from "./testing/test-mountain";

const { walk, clip, unclip, jumar, distance } = Climb;
const up = (metres: number): number => TestMountain.upTheSlope(metres);

/** Two fixed ropes up the 40° slope of `TestMountain.SLOPE`, each 20 m with a metre slack, and
 * an anchor between them 30 m up it. */
const LOWER: RopeLayout = { id: "lower", from: up(10), to: up(30), length: 21 };
const UPPER: RopeLayout = { id: "upper", from: up(30), to: up(50), length: 21 };
const slopeGround = TestMountain.SLOPE.terrain;
const BOTTOM = slopeGround.point(LOWER.from);
const ANCHOR = slopeGround.point(LOWER.to);

/** Slipping on a rope, a climber on its carabiner goes no further than half the slack and a
 * cowstail past an anchor. */
const HELD_WITHIN = 0.5 + TestMountain.SETTINGS.cowstail;

const onTheLine = (along: number): SlopeLayout =>
  TestMountain.SLOPE.layout([{ id: "anna", along }], [LOWER, UPPER]);

/** How far a point is from a rope's chain of points: its nearest link. */
function fromTheRope(rope: readonly Point[], point: Point): number {
  let nearest = Infinity;
  for (const [index, from] of rope.slice(0, -1).entries()) {
    const to = rope[index + 1] ?? from;
    const x = to.x - from.x;
    const y = to.y - from.y;
    const share = Math.min(
      Math.max(((point.x - from.x) * x + (point.y - from.y) * y) / (x * x + y * y || 1), 0),
      1,
    );
    nearest = Math.min(nearest, distance(point, { x: from.x + x * share, y: from.y + y * share }));
  }
  return nearest;
}

/** Anna, 20 m up the slope, goes up the lower rope on the jumar until it stops her past the
 * anchor. */
function toTheAnchor(): Climb {
  const climb = new Climb(TestMountain.CALM, onTheLine(up(20)));
  climb.play(600, [clip("anna", "first"), jumar("anna", true), walk("anna", "right")]);
  return climb;
}

describe("SlopePhysics: anchors between ropes", () => {
  it("stops a climber a cowstail past the anchor, where the next rope is the one to clip", () => {
    const climb = toTheAnchor();

    climb.play(1, [clip("anna", "second")]);
    const anna = climb.physics.climber("anna");

    expect(anna).toMatchObject({ first: "lower", second: "upper" });
    expect(anna.y).toBeGreaterThan(ANCHOR.y);
    expect(distance(anna, ANCHOR)).toBeLessThanOrEqual(HELD_WITHIN + 0.01);
    expect(distance(anna, ANCHOR)).toBeGreaterThan(HELD_WITHIN - 0.05);
  });

  it("goes on up the next rope once the first cowstail is off the old one and on it too", () => {
    const climb = toTheAnchor();
    climb.play(1, [clip("anna", "second")]);
    const there = climb.physics.climber("anna");

    climb.play(400, [unclip("anna", "first"), clip("anna", "first")]);
    const anna = climb.physics.climber("anna");

    expect(anna).toMatchObject({ first: "upper", second: "upper" });
    expect(anna.y).toBeGreaterThan(there.y);
    expect(distance(anna, there)).toBeGreaterThan(3);
  });

  it("holds a slip at the anchor when the second went on the next rope first", () => {
    const climb = toTheAnchor();
    climb.play(1, [clip("anna", "second"), unclip("anna", "first")]);

    const gust = climb.under(TestMountain.HARSH);
    gust.step("anna", "right");
    gust.play(400);
    const anna = gust.physics.climber("anna");

    expect(anna).toMatchObject({ first: null, second: "upper", falling: false });
    expect(anna.falls).toHaveLength(1);
    expect(distance(anna, ANCHOR)).toBeLessThanOrEqual(HELD_WITHIN + 0.01);
  });

  it("lets a climber take their last cowstail off, and then nothing holds a slip", () => {
    const climb = toTheAnchor();
    climb.play(1, [unclip("anna", "first")]);

    const gust = climb.under(TestMountain.HARSH);
    gust.step("anna", "right");
    gust.play(400);
    const anna = gust.physics.climber("anna");

    expect(anna).toMatchObject({ first: null, second: null, falling: false });
    expect(anna.y).toBeCloseTo(0, 6);
    expect(anna.falls[0]?.drop).toBeGreaterThan(15);
  });
});

describe("SlopePhysics: the jumar", () => {
  it("grips where it's let go: its climber goes no further than a cowstail and the slack", () => {
    const climb = new Climb(TestMountain.CALM, onTheLine(up(15)));
    const start = climb.physics.climber("anna");

    climb.play(600, [clip("anna", "first"), walk("anna", "right")]);
    const anna = climb.physics.climber("anna");

    expect(anna.first).toBe("lower");
    expect(distance(anna, start)).toBeGreaterThan(TestMountain.SETTINGS.cowstail / 2);
    expect(distance(anna, start)).toBeLessThan(TestMountain.SETTINGS.cowstail + 1);
  });

  it("slides along the rope with its climber while held, and grips again when let go", () => {
    const climb = new Climb(TestMountain.CALM, onTheLine(up(15)));
    const start = climb.physics.climber("anna");

    climb.play(200, [clip("anna", "first"), jumar("anna", true), walk("anna", "right")]);
    const held = climb.physics.climber("anna");
    climb.play(600, [jumar("anna", false)]);
    const letGo = climb.physics.climber("anna");

    expect(distance(held, start)).toBeGreaterThan(3);
    expect(distance(letGo, held)).toBeLessThan(TestMountain.SETTINGS.cowstail + 1);
  });

  it("holds a slip where it is, held or not: on the carabiner alone it slides to the anchor", () => {
    const onTheJumar = new Climb(TestMountain.HARSH, onTheLine(up(25)));
    onTheJumar.step("anna", "right", [clip("anna", "first"), jumar("anna", true)]);
    onTheJumar.play(400);
    const onTheCarabiner = new Climb(TestMountain.HARSH, onTheLine(up(25)));
    onTheCarabiner.step("anna", "right", [clip("anna", "second")]);
    onTheCarabiner.play(400);
    const jumared = onTheJumar.physics.climber("anna");
    const slid = onTheCarabiner.physics.climber("anna");

    expect(jumared).toMatchObject({ first: "lower", falling: false });
    expect(jumared.falls).toHaveLength(1);
    expect(jumared.falls[0]?.drop).toBeLessThan(2);
    expect(distance(jumared, BOTTOM)).toBeGreaterThan(12);
    expect(slid.falls[0]?.drop).toBeGreaterThan(8);
    expect(distance(slid, BOTTOM)).toBeLessThanOrEqual(HELD_WITHIN + 0.01);
  });

  it("shows where each carabiner is on its rope, within a cowstail of its climber, for the picture", () => {
    const climb = new Climb(TestMountain.CALM, onTheLine(up(15)));
    const unclipped = climb.physics.climber("anna");

    climb.play(200, [
      clip("anna", "first"),
      clip("anna", "second"),
      jumar("anna", true),
      walk("anna", "right"),
    ]);
    const anna = climb.physics.climber("anna");
    const rope = climb.physics.rope("lower");

    expect(unclipped).toMatchObject({ firstAt: null, secondAt: null, jumarHeld: false });
    expect(anna.jumarHeld).toBe(true);
    for (const at of [anna.firstAt, anna.secondAt]) {
      const carabiner = at ?? { x: Infinity, y: Infinity };
      expect(distance(anna, carabiner)).toBeLessThan(TestMountain.SETTINGS.cowstail + 0.1);
      expect(fromTheRope(rope, carabiner)).toBeLessThan(1e-9);
    }
  });

  it("goes on exactly from a save with the jumar held, through JSON", () => {
    const actions = [clip("anna", "first"), jumar("anna", true), walk("anna", "right")];
    const straight = new Climb(TestMountain.SETTINGS, onTheLine(up(15)), 7);
    straight.play(400, actions);
    const halfway = new Climb(TestMountain.SETTINGS, onTheLine(up(15)), 7);
    halfway.play(200, actions);

    const save = JSON.parse(JSON.stringify(halfway.expedition.save())) as ExpeditionSave;
    const resumed = new Climb(TestMountain.SETTINGS, save);
    resumed.play(200);

    expect(resumed.expedition.save()).toEqual(straight.expedition.save());
  });
});
