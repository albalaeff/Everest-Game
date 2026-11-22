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

describe("SlopePhysics: a clip at an anchor two ropes share (#305)", () => {
  /** A rope along the flat to the foot of `TestMountain.WALL`'s wall, the ladder's own up it from
   * that anchor to its top, and a third on from there along the ledge: each starts where the last
   * ends, at the ladder's ends, where a step stops. */
  const inALine = (along: number): SlopeLayout =>
    TestMountain.WALL.layout(
      [{ id: "anna", along }],
      [
        { id: "flat", from: 10, to: 20, length: 10.5 },
        { id: "wall", from: 20, to: 30, length: 10.5 },
        { id: "ledge", from: 30, to: 40, length: 10.5 },
      ],
      [{ id: "ladder", from: 20, to: 30 }],
    );
  /** Both cowstails across at an anchor, the second first, one always on. */
  const across = [unclip("anna", "second"), clip("anna", "second")];
  const jumarAcross = [unclip("anna", "first"), clip("anna", "first")];

  it("takes the rope that goes on up at a ladder's foot, where the one they came on ends", () => {
    const climb = new Climb(TestMountain.CALM, inALine(17));
    climb.play(200, [
      clip("anna", "first"),
      clip("anna", "second"),
      jumar("anna", true),
      walk("anna", "right"),
    ]);
    const atTheFoot = climb.physics.climber("anna");
    const within = climb.physics.ropeWithin("anna");
    climb.play(1, across);
    const half = climb.physics.climber("anna");
    climb.play(1, jumarAcross);

    expect(atTheFoot).toMatchObject({ x: 20, y: 0, first: "flat", second: "flat" });
    expect(within).toBe("wall");
    expect(half).toMatchObject({ first: "flat", second: "wall" });
    expect(climb.physics.climber("anna")).toMatchObject({ first: "wall", second: "wall" });
  });

  it("takes the next rope again at the ladder's top, and climbs all of it on its own rope", () => {
    const climb = new Climb(TestMountain.CALM, inALine(17));
    climb.play(200, [
      clip("anna", "first"),
      clip("anna", "second"),
      jumar("anna", true),
      walk("anna", "right"),
    ]);
    climb.play(1, across);
    climb.play(1, jumarAcross);
    climb.play(2400, [walk("anna", "up")]);
    const atTheTop = climb.physics.climber("anna");

    expect(atTheTop).toMatchObject({ x: 20, y: 10, ladder: null, heldBack: null });
    expect(atTheTop).toMatchObject({ first: "wall", second: "wall" });
    expect(climb.physics.ropeWithin("anna")).toBe("ledge");
  });

  it("takes the rope that goes on down at the ladder's top and at its foot, coming down", () => {
    const climb = new Climb(TestMountain.CALM, inALine(33));
    climb.play(200, [
      clip("anna", "first"),
      clip("anna", "second"),
      jumar("anna", true),
      walk("anna", "left"),
    ]);
    const atTheTop = climb.physics.climber("anna");
    const within = climb.physics.ropeWithin("anna");
    climb.play(1, across);
    climb.play(1, jumarAcross);
    const onTheWalls = climb.physics.climber("anna");
    climb.play(2400, [walk("anna", "down")]);

    expect(atTheTop).toMatchObject({ x: 20, y: 10, first: "ledge", second: "ledge" });
    expect(within).toBe("wall");
    expect(onTheWalls).toMatchObject({ first: "wall", second: "wall" });
    expect(climb.physics.climber("anna")).toMatchObject({ x: 20, y: 0, ladder: null });
    expect(climb.physics.ropeWithin("anna")).toBe("flat");
  });

  it("takes the nearer rope wherever one is nearer, whichever way they face", () => {
    // A metre short of the anchor, facing it, the rope she walks along; a cowstail past it, held
    // there, the next one, as before.
    const short = new Climb(TestMountain.CALM, onTheLine(up(29)));
    const past = toTheAnchor();

    expect(short.physics.ropeWithin("anna")).toBe("lower");
    expect(past.physics.ropeWithin("anna")).toBe("upper");
  });
});

describe("SlopePhysics: what held a climber back (#247)", () => {
  /** A rope along the flat to the foot of `TestMountain.WALL`'s wall, its ladder up the wall. */
  const toTheWall = (along: number): SlopeLayout =>
    TestMountain.WALL.layout(
      [{ id: "anna", along }],
      [{ id: "flat", from: 10, to: 20, length: 10.5 }],
      [{ id: "wall", from: 20, to: 30 }],
    );

  it("says the jumar held back a climber who walks on without sliding it", () => {
    const climb = new Climb(TestMountain.CALM, onTheLine(up(15)));

    climb.play(600, [clip("anna", "first"), clip("anna", "second"), walk("anna", "right")]);

    expect(climb.physics.climber("anna")).toMatchObject({ moving: false, heldBack: "jumar" });
  });

  it("says the rope held back one who slid the jumar up to its anchor, and nothing one on the move", () => {
    const going = new Climb(TestMountain.CALM, onTheLine(up(20)));
    going.play(20, [clip("anna", "first"), jumar("anna", true), walk("anna", "right")]);
    const held = toTheAnchor();

    expect(going.physics.climber("anna")).toMatchObject({ moving: true, heldBack: null });
    expect(held.physics.climber("anna")).toMatchObject({ moving: false, heldBack: "rope" });
  });

  it("says the rope held back one who climbs a ladder off the end of the rope they came on", () => {
    const climb = new Climb(TestMountain.CALM, toTheWall(20));

    climb.play(200, [clip("anna", "first"), jumar("anna", true), walk("anna", "up")]);
    const anna = climb.physics.climber("anna");

    // Two cowstails and the rope's half metre of slack up the 10 m wall, and no higher.
    expect(anna).toMatchObject({ ladder: "wall", moving: false, heldBack: "rope" });
    expect(anna.y).toBeGreaterThan(1);
    expect(anna.y).toBeLessThan(3);
  });

  it("says nothing held back one whom a wall stops, nor one standing still", () => {
    const climb = new Climb(TestMountain.CALM, toTheWall(17));
    climb.play(200, [clip("anna", "first"), jumar("anna", true), walk("anna", "right")]);
    const atTheWall = climb.physics.climber("anna");
    climb.play(2, [walk("anna", "stop"), jumar("anna", false)]);

    expect(atTheWall).toMatchObject({ x: 20, moving: false, heldBack: null });
    expect(climb.physics.climber("anna").heldBack).toBeNull();
  });

  it("keeps what held them back through a save, through JSON", () => {
    const held = toTheAnchor();

    const save = JSON.parse(JSON.stringify(held.expedition.save())) as ExpeditionSave;
    const resumed = new Climb(TestMountain.CALM, save);

    expect(resumed.physics.climber("anna").heldBack).toBe("rope");
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

  it("grips where its climber stands past the rope's last anchor, the slack taken up: a slip there is held with no jerk (#305)", () => {
    const climb = toTheAnchor();
    const stood = climb.physics.climber("anna");

    climb.physics.upset("anna", 0);
    climb.play(400, [walk("anna", "stop")]);
    const anna = climb.physics.climber("anna");
    const [fall] = anna.falls;

    expect(distance(stood, ANCHOR)).toBeGreaterThan(HELD_WITHIN - 0.05);
    expect(anna).toMatchObject({ first: "lower", falling: false });
    expect(anna.falls).toHaveLength(1);
    // Down the slope past the anchor, as far below it as she stood above it, under 2 m of height,
    // at the few metres a second a slide that long comes to: nothing snaps her back to the anchor.
    expect(anna.y).toBeLessThan(ANCHOR.y);
    expect(distance(anna, ANCHOR)).toBeLessThanOrEqual(HELD_WITHIN + 0.05);
    expect(fall?.drop).toBeLessThan(2);
    expect(fall?.speed).toBeLessThan(6);
  });

  it("lets a climber stopped past the last anchor walk back down with the jumar let go where it is (#305)", () => {
    const climb = toTheAnchor();
    const stopped = climb.physics.climber("anna");

    climb.play(200, [jumar("anna", false), walk("anna", "left")]);
    const anna = climb.physics.climber("anna");

    // To the anchor and as far below it again, where the jumar holds her.
    expect(anna.y).toBeLessThan(ANCHOR.y);
    expect(distance(anna, stopped)).toBeGreaterThan(2 * HELD_WITHIN - 0.1);
    expect(distance(anna, ANCHOR)).toBeLessThanOrEqual(HELD_WITHIN + 0.01);
    expect(anna).toMatchObject({ first: "lower", moving: false, heldBack: "jumar" });
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
