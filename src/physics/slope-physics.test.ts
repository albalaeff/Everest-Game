import { describe, expect, it } from "vitest";

import { ActionLog, Expedition, HeadlessRunner } from "../simulation";
import type { ClimberId, ExpeditionSave, GameAction } from "../simulation";
import { SlopePhysics } from "./slope-physics";
import type { RopeLayout, SlopeLayout } from "./slope-physics";
import { Climb } from "./testing/climb";
import { TestMountain } from "./testing/test-mountain";

const { walk, distance } = Climb;
// The second cowstail's carabiner, which slides: the first's jumar is fixed-ropes.test.ts's.
const clip = (climber: ClimberId): GameAction => Climb.clip(climber, "second");
const unclip = (climber: ClimberId): GameAction => Climb.unclip(climber, "second");

/** A rope on the 40° slope of `TestMountain.SLOPE`, from 10 m up it to 30 m up, a metre slack. */
const FIXED: RopeLayout = {
  id: "fixed",
  from: TestMountain.upTheSlope(10),
  to: TestMountain.upTheSlope(30),
  length: 21,
};

/** Its lower anchor, and the top one. */
const slopeGround = TestMountain.SLOPE.terrain;
const LOWER = slopeGround.point(FIXED.from);
const UPPER = slopeGround.point(FIXED.to);

/** Slipping on it, a clipped climber goes no further than half the slack and a cowstail. */
const HELD_WITHIN = 0.5 + TestMountain.SETTINGS.cowstail;

const alone = (mountain: TestMountain, along: number, ropes: RopeLayout[] = []): SlopeLayout =>
  mountain.layout([{ id: "anna", along }], ropes);

describe("SlopePhysics: walking", () => {
  it("walks along the ground until told to stop, at the speed for its steepness", () => {
    const climb = new Climb(TestMountain.CALM, alone(TestMountain.FLAT, 10));

    climb.play(20, [walk("anna", "right")]);
    const afterOneSecond = climb.physics.climber("anna");
    climb.play(100, [walk("anna", "stop")]);

    expect(afterOneSecond.x).toBeCloseTo(11, 9);
    expect(climb.physics.climber("anna")).toMatchObject({ x: afterOneSecond.x, y: 0 });
  });

  it("climbs a steep slope slower than it walks the flat, and comes down it faster", () => {
    const start = TestMountain.upTheSlope(20);
    const climb = new Climb(TestMountain.CALM, alone(TestMountain.SLOPE, start));
    const from = climb.physics.climber("anna");

    climb.play(200, [walk("anna", "right")]);
    const up = distance(from, climb.physics.climber("anna"));
    const top = climb.physics.climber("anna");
    climb.play(200, [walk("anna", "left")]);
    const down = distance(top, climb.physics.climber("anna"));

    expect(up).toBeGreaterThan(1);
    expect(up).toBeLessThan(10);
    expect(down).toBeGreaterThan(up);
  });

  it("goes no further than the ends of its ground", () => {
    const climb = new Climb(TestMountain.CALM, alone(TestMountain.FLAT, 99));

    climb.play(100, [walk("anna", "right")]);
    const end = climb.physics.climber("anna");
    climb.play(2100, [walk("anna", "left")]);

    expect(end.x).toBe(100);
    expect(climb.physics.climber("anna").x).toBe(0);
  });

  it("can't walk up a wall", () => {
    const climb = new Climb(TestMountain.CALM, alone(TestMountain.CREVASSE, 51.5));

    climb.play(100, [walk("anna", "left")]);

    expect(climb.physics.climber("anna")).toMatchObject({ x: 20, y: -30, falling: false });
  });

  it("leaves `up` and `down` to ladders and ropes, and a diagonal walks its way", () => {
    const climb = new Climb(TestMountain.CALM, alone(TestMountain.FLAT, 10));

    climb.play(20, [walk("anna", "up")]);
    const afterUp = climb.physics.climber("anna").x;
    climb.play(20, [walk("anna", "down-left")]);

    expect(afterUp).toBe(10);
    expect(climb.physics.climber("anna").x).toBeCloseTo(9, 9);
  });

  it("hears only what's its own: the pace, the oxygen and the radio change nothing here", () => {
    const climb = new Climb(TestMountain.CALM, alone(TestMountain.FLAT, 10));
    const before = climb.physics.climber("anna");

    climb.play(20, [
      { kind: "pace", climber: "anna", pace: "faster" },
      { kind: "oxygen", climber: "anna", change: "up" },
      { kind: "radio", climber: "anna", channel: "guide", phrase: "ok" },
    ]);

    expect(climb.physics.climber("anna")).toEqual(before);
  });

  it("refuses an action for a climber who isn't on its slope", () => {
    const start = SlopePhysics.start(alone(TestMountain.FLAT, 10));
    const scenario = {
      seed: 1,
      climbers: ["anna", "boris"],
      start: { [SlopePhysics.NAME]: start },
    };
    const expedition = Expedition.start(scenario, [new SlopePhysics(TestMountain.CALM)]);

    expect(() => expedition.advance([walk("boris", "right")])).toThrow(RangeError);
  });
});

describe("SlopePhysics: slips and falls", () => {
  it("never slips where the slip chance is nought", () => {
    const climb = new Climb(
      TestMountain.CALM,
      alone(TestMountain.SLOPE, TestMountain.upTheSlope(5)),
    );

    climb.play(600, [walk("anna", "right")]);

    expect(climb.physics.climber("anna").falls).toEqual([]);
  });

  it("makes a slip on steep ground a fall, down to where the ground eases", () => {
    const climb = new Climb(
      TestMountain.HARSH,
      alone(TestMountain.SLOPE, TestMountain.upTheSlope(20)),
    );
    const start = climb.physics.climber("anna");

    climb.step("anna", "right");
    climb.play(400);
    const anna = climb.physics.climber("anna");

    expect(anna.falling).toBe(false);
    expect(anna.y).toBeCloseTo(0, 6);
    expect(anna.x).toBeLessThan(40);
    expect(anna.falls).toHaveLength(1);
    expect(anna.falls[0]?.step).toBe(0);
    expect(anna.falls[0]?.drop).toBeCloseTo(start.y, 1);
    expect(anna.falls[0]?.speed).toBeGreaterThan(5);
  });

  it("makes a slip where friction holds no fall: the climber is on their feet at once", () => {
    const climb = new Climb(TestMountain.HARSH, alone(TestMountain.GENTLE, 50));

    climb.step("anna", "right");
    climb.play(8);
    const anna = climb.physics.climber("anna");

    expect(anna.falling).toBe(false);
    expect(anna.falls).toHaveLength(1);
    expect(anna.falls[0]?.drop).toBeLessThan(0.01);
  });

  it("makes walking off the edge of a crevasse a fall to its bottom", () => {
    const climb = new Climb(TestMountain.CALM, alone(TestMountain.CREVASSE, 19));

    climb.play(200, [walk("anna", "right")]);
    const anna = climb.physics.climber("anna");

    expect(anna).toMatchObject({ y: -30, falling: false });
    expect(anna.x).toBeGreaterThanOrEqual(20);
    expect(anna.x).toBeLessThanOrEqual(23);
    expect(anna.falls).toHaveLength(1);
    expect(anna.falls[0]?.drop).toBeCloseTo(30, 6);
    expect(anna.falls[0]?.speed).toBeCloseTo(Math.sqrt(2 * 9.8 * 30), 0);
  });
});

describe("SlopePhysics: the layout", () => {
  it("lists its ropes and ladders in the layout's order, for the rendering to draw", () => {
    const layout = TestMountain.CREVASSE.layout(
      [{ id: "anna", along: 1 }],
      [
        { id: "far", from: 90, to: 105, length: 16 },
        { id: "near", from: 2, to: 18, length: 17 },
      ],
      [{ id: "bridge", from: 20, to: 83 }],
    );
    const climb = new Climb(TestMountain.CALM, layout);

    expect(climb.physics.ropes).toEqual(["far", "near"]);
    expect(climb.physics.ladders).toEqual(["bridge"]);
    expect(climb.physics.ladder("bridge")).toEqual([
      { x: 20, y: 0 },
      { x: 23, y: 0 },
    ]);
  });
});

describe("SlopePhysics: the rope", () => {
  it("clips a cowstail onto the nearest rope within its reach, and onto nothing beyond it", () => {
    const layout = TestMountain.SLOPE.layout(
      [
        { id: "anna", along: TestMountain.upTheSlope(20) },
        { id: "boris", along: TestMountain.upTheSlope(40) },
      ],
      [FIXED],
    );
    const climb = new Climb(TestMountain.CALM, layout);

    climb.play(1, [clip("anna"), clip("boris")]);

    expect(climb.physics.climber("anna")).toMatchObject({ first: null, second: "fixed" });
    expect(climb.physics.climber("boris")).toMatchObject({ first: null, second: null });
  });

  it("holds a clipped climber who slips: they slide down to the anchor below, and stop", () => {
    const layout = alone(TestMountain.SLOPE, TestMountain.upTheSlope(20), [FIXED]);
    const climb = new Climb(TestMountain.HARSH, layout);

    climb.step("anna", "right", [clip("anna")]);
    climb.play(400);
    const anna = climb.physics.climber("anna");

    expect(anna.falling).toBe(false);
    expect(anna.falls).toHaveLength(1);
    expect(anna.y).toBeLessThan(LOWER.y);
    expect(distance(anna, LOWER)).toBeLessThanOrEqual(HELD_WITHIN + 0.01);
    expect(anna.second).toBe("fixed");
  });

  it("holds nothing once the cowstail is off it", () => {
    const layout = alone(TestMountain.SLOPE, TestMountain.upTheSlope(20), [FIXED]);
    const climb = new Climb(TestMountain.HARSH, layout);

    climb.step("anna", "right", [clip("anna"), unclip("anna")]);
    climb.play(400);
    const anna = climb.physics.climber("anna");

    expect(anna.second).toBeNull();
    expect(anna.y).toBeCloseTo(0, 6);
  });

  it("keeps a clipped climber from walking past the reach of its top anchor", () => {
    const layout = alone(TestMountain.SLOPE, TestMountain.upTheSlope(25), [FIXED]);
    const climb = new Climb(TestMountain.CALM, layout);

    climb.play(600, [clip("anna"), walk("anna", "right")]);
    const anna = climb.physics.climber("anna");

    expect(anna.x).toBeGreaterThan(UPPER.x);
    expect(distance(anna, UPPER)).toBeLessThanOrEqual(HELD_WITHIN);
    expect(distance(anna, UPPER)).toBeGreaterThan(HELD_WITHIN - 0.05);
  });

  it("holds a climber who walks off into a crevasse, hanging from a rope across it", () => {
    const across: RopeLayout = { id: "across", from: 20, to: 83, length: 6 };
    const climb = new Climb(TestMountain.CALM, alone(TestMountain.CREVASSE, 19.5, [across]));
    // Its ends 3 m apart: hanging, she's on the ellipse they are the foci of.
    const deepest = -Math.sqrt(3.8 * 3.8 - 1.5 * 1.5);

    climb.play(1, [clip("anna"), walk("anna", "right")]);
    let lowest = 0;
    for (let step = 0; step < 400; step += 1) {
      climb.play(1);
      lowest = Math.min(lowest, climb.physics.climber("anna").y);
    }

    expect(climb.physics.climber("anna").falling).toBe(true);
    expect(lowest).toBeLessThan(-2);
    expect(lowest).toBeGreaterThan(deepest - 0.05);
  });

  it("lies on the ground under its own weight, between anchors that stay put", () => {
    const climb = new Climb(TestMountain.CALM, alone(TestMountain.SLOPE, 0, [FIXED]));

    climb.play(200);
    const points = climb.physics.rope("fixed");
    const links = points.slice(1).map((point, link) => distance(points[link] ?? point, point));

    expect(points[0]).toEqual(LOWER);
    expect(points.at(-1)).toEqual(UPPER);
    expect(points.every((point) => point.y >= slopeGround.height(point.x) - 1e-9)).toBe(true);
    expect(links.reduce((sum, link) => sum + link, 0)).toBeLessThanOrEqual(FIXED.length * 1.001);
  });

  it("lies still once settled while nobody is on it, and moves under a climber who falls", () => {
    const layout = alone(TestMountain.SLOPE, TestMountain.upTheSlope(20), [FIXED]);
    const climb = new Climb(TestMountain.HARSH, layout);

    climb.play(400);
    const settled = climb.physics.rope("fixed");
    climb.play(100);
    const later = climb.physics.rope("fixed");
    climb.step("anna", "right", [clip("anna")]);
    climb.play(100);

    expect(later).toEqual(settled);
    expect(climb.physics.rope("fixed")).not.toEqual(settled);
  });

  it("refuses a rope shorter than the way between its anchors, and a climber off the ground", () => {
    expect(() =>
      SlopePhysics.start(alone(TestMountain.SLOPE, 1, [{ ...FIXED, length: 10 }])),
    ).toThrow(RangeError);
    expect(() => SlopePhysics.start(alone(TestMountain.SLOPE, -1))).toThrow(RangeError);
    expect(() => SlopePhysics.start(alone(TestMountain.SLOPE, 1000))).toThrow(RangeError);
  });
});

describe("SlopePhysics: the same climb everywhere", () => {
  const layout = TestMountain.SLOPE.layout(
    [
      { id: "anna", along: TestMountain.upTheSlope(12) },
      { id: "boris", along: TestMountain.upTheSlope(5) },
    ],
    [FIXED],
  );
  const script = new ActionLog([
    { step: 0, actions: [clip("anna"), walk("anna", "right"), walk("boris", "right")] },
    { step: 300, actions: [walk("anna", "left")] },
  ]);
  const played = (seed: number, steps: number): ExpeditionSave => {
    const expedition = Expedition.start(TestMountain.scenario(seed, layout), [
      new SlopePhysics(TestMountain.SETTINGS),
    ]);
    new HeadlessRunner(expedition, script).play(steps);
    return expedition.save();
  };

  it("gives the same climb for the same seed and actions", () => {
    expect(played(7, 600)).toEqual(played(7, 600));
  });

  it("goes on exactly from a save, through JSON as it's stored and sent", () => {
    const halfway = JSON.parse(JSON.stringify(played(7, 300))) as ExpeditionSave;
    const resumed = Expedition.resume(halfway, [new SlopePhysics(TestMountain.SETTINGS)]);
    new HeadlessRunner(resumed, script).play(300);

    expect(resumed.save()).toEqual(played(7, 600));
  });

  it("slips at other times on another seed", () => {
    const falls = (seed: number) => {
      const physics = new SlopePhysics(TestMountain.SETTINGS);
      const expedition = Expedition.start(TestMountain.scenario(seed, layout), [physics]);
      new HeadlessRunner(expedition, script).play(600);
      return physics.climber("boris").falls.map((fall) => fall.step);
    };

    expect(falls(7).length).toBeGreaterThan(0);
    expect(falls(8)).not.toEqual(falls(7));
  });
});
