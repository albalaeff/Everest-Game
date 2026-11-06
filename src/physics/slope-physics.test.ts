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

describe("SlopePhysics: the stride", () => {
  it("walks a climber at their stride's share of the speed, and not at all at nought", () => {
    const layout = TestMountain.FLAT.layout([
      { id: "anna", along: 10 },
      { id: "boris", along: 50 },
    ]);
    const climb = new Climb(TestMountain.CALM, layout);

    climb.physics.stride("anna", 0.5);
    climb.physics.stride("boris", 0);
    climb.play(20, [walk("anna", "right"), walk("boris", "right")]);

    expect(climb.physics.climber("anna").x).toBeCloseTo(10.5, 9);
    expect(climb.physics.climber("boris")).toMatchObject({ x: 50, moving: false });
  });

  it("climbs a ladder at the stride's share of the ladder's speed", () => {
    const bridge = { id: "bridge", from: 20, to: 83 };
    const climb = new Climb(
      TestMountain.CALM,
      TestMountain.CREVASSE.layout([{ id: "anna", along: 20 }], [], [bridge]),
    );

    climb.physics.stride("anna", 0.5);
    climb.play(40, [walk("anna", "right")]);

    expect(climb.physics.climber("anna")).toMatchObject({ ladder: "bridge", y: 0 });
    expect(climb.physics.climber("anna").x).toBeCloseTo(20.5, 6);
  });

  it("says whether a climber took a step: not standing, held back by the ground or falling", () => {
    const climb = new Climb(TestMountain.CALM, alone(TestMountain.CREVASSE, 51.5));
    const standing = climb.physics.climber("anna").moving;

    climb.play(1, [walk("anna", "left")]);
    const walking = climb.physics.climber("anna").moving;
    climb.play(100);
    const atTheWall = climb.physics.climber("anna");

    expect([standing, walking]).toEqual([false, true]);
    expect(atTheWall).toMatchObject({ x: 20, moving: false });
  });

  it("slips as often for each metre at a shorter stride: half as often a second at half", () => {
    // Every step on the test's harsh ground is a slip at a whole stride.
    let slips = 0;
    for (let seed = 1; seed <= 200; seed += 1) {
      const climb = new Climb(TestMountain.HARSH, alone(TestMountain.GENTLE, 50), seed);
      climb.physics.stride("anna", 0.5);
      climb.step("anna", "right");
      climb.play(8);
      slips += climb.physics.climber("anna").falls.length;
    }

    expect(slips).toBeGreaterThan(70);
    expect(slips).toBeLessThan(130);
  });

  it("draws nothing for a climber who can't move", () => {
    const still = new Climb(TestMountain.HARSH, alone(TestMountain.GENTLE, 50));
    const spent = new Climb(TestMountain.HARSH, alone(TestMountain.GENTLE, 50));

    spent.physics.stride("anna", 0);
    still.play(20);
    spent.play(20, [walk("anna", "right")]);

    expect(spent.physics.climber("anna")).toMatchObject({ x: still.physics.climber("anna").x });
    expect(spent.physics.climber("anna").falls).toEqual([]);
    expect(spent.expedition.save().random).toEqual(still.expedition.save().random);
  });

  it("keeps the stride in a save, and refuses one below nought", () => {
    const climb = new Climb(TestMountain.CALM, alone(TestMountain.FLAT, 10));
    climb.physics.stride("anna", 0.5);
    const resumed = new Climb(
      TestMountain.CALM,
      JSON.parse(JSON.stringify(climb.expedition.save())) as ExpeditionSave,
    );

    resumed.play(20, [walk("anna", "right")]);

    expect(resumed.physics.climber("anna").x).toBeCloseTo(10.5, 9);
    expect(() => {
      climb.physics.stride("anna", -0.5);
    }).toThrow(RangeError);
  });
});

describe("SlopePhysics: what a step costs", () => {
  it("goes up as fast as the stride's power buys, over the energy each metre takes", () => {
    const start = TestMountain.upTheSlope(20);
    const layout = TestMountain.SLOPE.layout([
      { id: "anna", along: start },
      { id: "boris", along: start },
    ]);
    const climb = new Climb(TestMountain.CALM, layout);
    const from = climb.physics.climber("anna");

    climb.physics.stride("boris", 0.5);
    climb.play(20, [walk("anna", "right"), walk("boris", "right")]);

    const strong = distance(from, climb.physics.climber("anna"));
    expect(strong).toBeGreaterThan(0.1);
    expect(strong).toBeLessThan(0.5);
    expect(distance(from, climb.physics.climber("boris"))).toBeCloseTo(strong / 2, 9);
    expect(climb.physics.climber("anna").exertion).toBe(1);
    expect(climb.physics.climber("boris").exertion).toBe(1);
  });

  it("costs each metre of height the same past the steepest gradient measured", () => {
    // 21 m up over 20, about 46°, then 4 up over 3, about 53°: both past the test's 45°.
    const steep = TestMountain.STEEP.layout([
      { id: "anna", along: 1 },
      { id: "boris", along: 30 },
    ]);
    const climb = new Climb(TestMountain.CALM, steep);
    const before = ["anna", "boris"].map((id) => climb.physics.climber(id).y);

    climb.play(20, [walk("anna", "right"), walk("boris", "right")]);

    const [lower = 0, upper = 0] = ["anna", "boris"].map(
      (id, index) => climb.physics.climber(id).y - (before[index] ?? 0),
    );
    expect(lower).toBeGreaterThan(0.1);
    expect(upper).toBeCloseTo(lower, 9);
  });

  it("walks the flat no faster than the fastest walk, however strong: it takes less of their power", () => {
    const layout = TestMountain.FLAT.layout([
      { id: "anna", along: 10 },
      { id: "boris", along: 50 },
    ]);
    const climb = new Climb(TestMountain.CALM, layout);

    climb.physics.stride("boris", 2);
    climb.play(20, [walk("anna", "right"), walk("boris", "right")]);

    expect(climb.physics.climber("anna")).toMatchObject({ exertion: 1 });
    expect(climb.physics.climber("anna").x).toBeCloseTo(11, 9);
    expect(climb.physics.climber("boris")).toMatchObject({ exertion: 0.5 });
    expect(climb.physics.climber("boris").x).toBeCloseTo(51, 9);
  });

  it("comes down a gentle slope faster than it goes up, on less of its power", () => {
    const layout = TestMountain.GENTLE.layout([
      { id: "anna", along: 50 },
      { id: "boris", along: 50 },
    ]);
    const climb = new Climb(TestMountain.CALM, layout);
    const from = climb.physics.climber("anna");

    climb.play(20, [walk("anna", "left"), walk("boris", "right")]);
    const down = climb.physics.climber("anna");
    const up = climb.physics.climber("boris");

    expect(distance(from, down)).toBeGreaterThan(distance(from, up));
    expect(down.exertion).toBeGreaterThan(0.5);
    expect(down.exertion).toBeLessThan(1);
    expect(up.exertion).toBe(1);
  });

  it("takes nothing of a climber standing, and all of their stride on a ladder", () => {
    const bridge = { id: "bridge", from: 20, to: 83 };
    const climb = new Climb(
      TestMountain.CALM,
      TestMountain.CREVASSE.layout([{ id: "anna", along: 20 }], [], [bridge]),
    );
    const standing = climb.physics.climber("anna").exertion;

    climb.physics.stride("anna", 2);
    climb.play(20, [walk("anna", "right")]);

    expect(standing).toBe(0);
    expect(climb.physics.climber("anna")).toMatchObject({ ladder: "bridge", exertion: 1 });
  });

  it("keeps how hard the last step was in a save", () => {
    const climb = new Climb(TestMountain.CALM, alone(TestMountain.GENTLE, 50));
    climb.play(1, [walk("anna", "left")]);
    const resumed = new Climb(
      TestMountain.CALM,
      JSON.parse(JSON.stringify(climb.expedition.save())) as ExpeditionSave,
    );

    expect(resumed.physics.climber("anna").exertion).toBe(climb.physics.climber("anna").exertion);
    expect(resumed.physics.climber("anna").exertion).toBeLessThan(1);
  });
});

describe("SlopePhysics: technique", () => {
  /** Anna at the edge of the crevasse, at the foot of a ladder across it, with this technique. */
  const atTheLadder = (technique: number): SlopeLayout =>
    TestMountain.CREVASSE.layout(
      [{ id: "anna", along: 20, technique }],
      [],
      [{ id: "bridge", from: 20, to: 83 }],
    );

  it("goes at the climber's technique's share of the speed on a ladder and on a rope, not off them", () => {
    const ladder = new Climb(TestMountain.CALM, atTheLadder(0.5));
    const start = TestMountain.upTheSlope(15);
    const layout = TestMountain.SLOPE.layout(
      [
        { id: "anna", along: start, technique: 0.5 },
        { id: "boris", along: start },
        { id: "vera", along: start, technique: 0.5 },
      ],
      [FIXED],
    );
    const slope = new Climb(TestMountain.CALM, layout);
    const from = slope.physics.climber("anna");

    ladder.play(40, [walk("anna", "right")]);
    slope.play(1, [clip("anna"), clip("boris")]);
    slope.play(
      100,
      ["anna", "boris", "vera"].map((id) => walk(id, "right")),
    );

    expect(ladder.physics.climber("anna").x).toBeCloseTo(20.5, 6);
    const [clipped = 0, usual = 0, unclipped = 0] = ["anna", "boris", "vera"].map((id) =>
      distance(from, slope.physics.climber(id)),
    );
    expect(usual).toBeGreaterThan(2);
    expect(clipped).toBeCloseTo(usual / 2, 6);
    expect(unclipped).toBeCloseTo(usual, 6);
  });

  it("slips as often for each metre at a lesser technique: half as often a second on a ladder", () => {
    // About once a second at a whole technique: some 40% slip in their first second at half.
    let slipped = 0;
    for (let seed = 1; seed <= 200; seed += 1) {
      const climb = new Climb(TestMountain.ICY_LADDERS, atTheLadder(0.5), seed);
      climb.play(20, [walk("anna", "right")]);
      const anna = climb.physics.climber("anna");
      slipped += anna.falling || anna.falls.length > 0 ? 1 : 0;
    }

    expect(slipped).toBeGreaterThan(60);
    expect(slipped).toBeLessThan(100);
  });

  it("keeps the technique in a save, and refuses one of nought or less", () => {
    const climb = new Climb(TestMountain.CALM, atTheLadder(0.5));
    const resumed = new Climb(
      TestMountain.CALM,
      JSON.parse(JSON.stringify(climb.expedition.save())) as ExpeditionSave,
    );

    resumed.play(40, [walk("anna", "right")]);

    expect(resumed.physics.climber("anna").x).toBeCloseTo(20.5, 6);
    const none = TestMountain.FLAT.layout([{ id: "anna", along: 10, technique: 0 }]);
    expect(() => SlopePhysics.start(none)).toThrow(RangeError);
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

describe("SlopePhysics: as the hazards' ground", () => {
  it("names its climbers in the layout's order, and says how far along the ground each is", () => {
    const layout = TestMountain.FLAT.layout([
      { id: "boris", along: 30 },
      { id: "anna", along: 10 },
    ]);
    const climb = new Climb(TestMountain.CALM, layout);

    climb.play(20, [walk("anna", "right")]);

    expect(climb.physics.climbers).toEqual(["boris", "anna"]);
    expect(climb.physics.along("boris")).toBe(30);
    expect(climb.physics.along("anna")).toBeCloseTo(11, 9);
  });

  it("knocks a climber off their feet, down the slope: unclipped, they fall to its foot", () => {
    const climb = new Climb(
      TestMountain.CALM,
      alone(TestMountain.SLOPE, TestMountain.upTheSlope(20)),
    );

    climb.physics.knock("anna", climb.expedition.step);
    const knocked = climb.physics.climber("anna");
    climb.play(400);
    const anna = climb.physics.climber("anna");

    expect(knocked.falling).toBe(true);
    expect(anna.falling).toBe(false);
    expect(anna.y).toBeCloseTo(0, 6);
    expect(anna.falls).toHaveLength(1);
    expect(anna.falls[0]?.step).toBe(0);
    expect(climb.physics.along("anna")).toBeLessThan(TestMountain.upTheSlope(0));
  });

  it("knocks over a climber on flat ground too, at the knock's speed", () => {
    const climb = new Climb(TestMountain.CALM, alone(TestMountain.FLAT, 50));

    climb.physics.knock("anna", 0);
    climb.play(100);
    const anna = climb.physics.climber("anna");

    expect(anna.falls).toHaveLength(1);
    expect(anna.falls[0]?.speed).toBeCloseTo(TestMountain.SETTINGS.knock, 1);
    expect(anna.x).toBeLessThan(50);
  });

  it("holds a knocked climber clipped to a rope at the anchor below", () => {
    const layout = alone(TestMountain.SLOPE, TestMountain.upTheSlope(20), [FIXED]);
    const climb = new Climb(TestMountain.CALM, layout);

    climb.play(1, [clip("anna")]);
    climb.physics.knock("anna", climb.expedition.step);
    climb.play(400);
    const anna = climb.physics.climber("anna");

    expect(anna.falls).toHaveLength(1);
    expect(distance(anna, LOWER)).toBeLessThanOrEqual(HELD_WITHIN + 0.01);
  });

  it("says who is clipped to a rope", () => {
    const layout = alone(TestMountain.SLOPE, TestMountain.upTheSlope(20), [FIXED]);
    const climb = new Climb(TestMountain.CALM, layout);
    const before = climb.physics.clipped("anna");

    climb.play(1, [clip("anna")]);

    expect(before).toBe(false);
    expect(climb.physics.clipped("anna")).toBe(true);
  });

  it("kills a climber: they fall, lie where they come to rest, and do nothing more", () => {
    const layout = TestMountain.SLOPE.layout([
      { id: "anna", along: TestMountain.upTheSlope(20) },
      { id: "boris", along: 10 },
    ]);
    const climb = new Climb(TestMountain.CALM, layout);

    climb.physics.kill("anna", 0);
    climb.play(400);
    const lying = climb.physics.climber("anna");
    climb.play(100, [walk("anna", "right")]);

    expect(lying).toMatchObject({ dead: true, falling: false });
    expect(lying.falls).toHaveLength(1);
    expect(climb.physics.climber("anna")).toEqual(lying);
    expect(climb.physics.climbers).toEqual(["boris"]);
    expect(climb.physics.climber("boris").dead).toBe(false);
  });

  it("keeps the dead dead from a save", () => {
    const climb = new Climb(TestMountain.CALM, alone(TestMountain.FLAT, 50));
    climb.physics.kill("anna", 0);
    climb.play(10);

    const resumed = new Climb(TestMountain.CALM, climb.expedition.save());
    resumed.play(100, [walk("anna", "right")]);

    expect(resumed.physics.climber("anna").dead).toBe(true);
    expect(resumed.physics.climber("anna").x).toBeLessThan(50);
    expect(resumed.physics.climbers).toEqual([]);
  });

  it("makes no second fall of a knock in a fall", () => {
    const climb = new Climb(
      TestMountain.CALM,
      alone(TestMountain.SLOPE, TestMountain.upTheSlope(20)),
    );

    climb.physics.knock("anna", 0);
    climb.play(5);
    climb.physics.knock("anna", 5);
    climb.play(400);

    expect(climb.physics.climber("anna").falls).toHaveLength(1);
    expect(climb.physics.climber("anna").falls[0]?.step).toBe(0);
  });
});

describe("SlopePhysics: self-arrest", () => {
  /** Driving the ice axe into the ground `ahead` metres up it from where anna's body is. */
  const axe = (climb: Climb, ahead: number): GameAction => {
    const point = slopeGround.point(climb.physics.along("anna") + ahead);
    return { kind: "tool", climber: "anna", tool: "ice-axe", ...point };
  };
  /** Anna knocked off her feet 20 m up the 40° slope, sliding for `steps`. */
  const sliding = (steps: number): Climb => {
    const climb = new Climb(
      TestMountain.CALM,
      alone(TestMountain.SLOPE, TestMountain.upTheSlope(20)),
    );
    climb.physics.knock("anna", 0);
    climb.play(steps);
    return climb;
  };

  it("stops a slide early, with the axe driven into the slope just above: they stand there", () => {
    const climb = sliding(4);
    const before = climb.physics.along("anna");

    climb.play(1, [axe(climb, 1)]);
    const arrested = climb.physics.climber("anna");
    climb.play(100);

    expect(arrested.falling).toBe(false);
    expect(arrested.falls).toHaveLength(1);
    expect(climb.physics.along("anna")).toBeGreaterThan(before - 1);
    expect(climb.physics.climber("anna")).toEqual(arrested);
  });

  it("can't hold a slide grown too fast: it goes on to the foot of the slope", () => {
    const climb = sliding(40);

    climb.play(1, [axe(climb, 1)]);
    const late = climb.physics.climber("anna");
    climb.play(400);

    expect(late.falling).toBe(true);
    expect(climb.physics.climber("anna").y).toBeCloseTo(0, 6);
  });

  it("holds only with the axe in the slope above, within reach: not below, nor too far", () => {
    const below = sliding(4);
    below.play(1, [axe(below, -1)]);
    const far = sliding(4);
    far.play(1, [axe(far, TestMountain.SETTINGS.axeReach + 1)]);
    const crampons = sliding(4);
    crampons.play(1, [{ ...axe(crampons, 1), tool: "crampons" } as GameAction]);

    expect(below.physics.climber("anna").falling).toBe(true);
    expect(far.physics.climber("anna").falling).toBe(true);
    expect(crampons.physics.climber("anna").falling).toBe(true);
  });

  it("has nothing to drive the axe into in the air", () => {
    const climb = new Climb(TestMountain.CALM, alone(TestMountain.CREVASSE, 19));
    climb.play(30, [walk("anna", "right")]);
    const body = climb.physics.climber("anna");

    climb.play(1, [{ kind: "tool", climber: "anna", tool: "ice-axe", x: 20, y: body.y + 0.5 }]);

    expect(body.falling).toBe(true);
    expect(climb.physics.climber("anna").falling).toBe(true);
  });

  it("stops the same slide resumed from a save as it would have unbroken", () => {
    const unbroken = sliding(4);
    const resumed = new Climb(TestMountain.CALM, unbroken.expedition.save());

    unbroken.play(1, [axe(unbroken, 1)]);
    resumed.play(1, [axe(resumed, 1)]);

    expect(resumed.physics.climber("anna")).toMatchObject({ falling: false });
    expect(resumed.expedition.save()).toEqual(unbroken.expedition.save());
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

describe("SlopePhysics: on the snow", () => {
  const snowy = (layout: SlopeLayout): SlopeLayout => ({ ...layout, snow: TestMountain.SNOW });

  it("walks the snow's hummocks slower than the flat: harder up each, and no faster down", () => {
    const flat = new Climb(TestMountain.CALM, alone(TestMountain.FLAT, 10));
    const bumpy = new Climb(TestMountain.CALM, snowy(alone(TestMountain.FLAT, 10)));
    const heights: number[] = [];
    const exertions: number[] = [];

    for (const climb of [flat, bumpy]) {
      climb.play(1, [walk("anna", "right")]);
    }
    for (let step = 1; step < 400; step += 1) {
      flat.play(1);
      bumpy.play(1);
      const anna = bumpy.physics.climber("anna");
      heights.push(anna.y);
      exertions.push(anna.exertion);
    }

    expect(bumpy.physics.climber("anna").x).toBeLessThan(flat.physics.climber("anna").x - 0.3);
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(0.15);
    expect(Math.min(...exertions)).toBeLessThan(0.9);
    expect(Math.max(...exertions)).toBe(1);
  });

  it("lays the ladders, the ropes and the climbers where the layout has them, on the snow", () => {
    const rope = { id: "fixed", from: 2, to: 18, length: 16.5 };
    const bridge = { id: "bridge", from: 20, to: 83 };
    const layout = snowy(
      TestMountain.CREVASSE.layout([{ id: "anna", along: 10 }], [rope], [bridge]),
    );
    const climb = new Climb(TestMountain.CALM, layout);
    const ground = climb.physics.terrain;

    climb.play(200);

    expect(climb.physics.climber("anna")).toMatchObject({ x: 10, y: ground.height(10) });
    expect(climb.physics.ladder("bridge")).toEqual([
      { x: 20, y: 0 },
      { x: 23, y: 0 },
    ]);
    for (const point of climb.physics.rope("fixed")) {
      expect(point.y).toBeGreaterThanOrEqual(ground.height(point.x) - 1e-9);
    }
    expect(ground.points.length).toBeGreaterThan(TestMountain.CREVASSE.ground.length * 10);
  });

  it("keeps the line and how the snow lies on it in a save, not the snow's every point", () => {
    const save = SlopePhysics.start(snowy(alone(TestMountain.FLAT, 10))) as {
      readonly terrain: unknown;
      readonly snow: unknown;
    };

    expect(save.terrain).toEqual(TestMountain.FLAT.ground);
    expect(save.snow).toEqual(TestMountain.SNOW);
    expect("snow" in (SlopePhysics.start(alone(TestMountain.FLAT, 10)) as object)).toBe(false);
  });

  it("goes on exactly from a save, the snow and all, through JSON", () => {
    const climb = new Climb(TestMountain.CALM, snowy(alone(TestMountain.FLAT, 10)));
    climb.play(100, [walk("anna", "right")]);
    const resumed = new Climb(
      TestMountain.CALM,
      JSON.parse(JSON.stringify(climb.expedition.save())) as ExpeditionSave,
    );

    climb.play(100);
    resumed.play(100);

    expect(resumed.physics.terrain.points).toEqual(climb.physics.terrain.points);
    expect(resumed.expedition.save()).toEqual(climb.expedition.save());
  });

  it("refuses snow lying level off the ground", () => {
    const off = { ...TestMountain.SNOW, level: [{ from: 90, to: 120 }] };

    expect(() => SlopePhysics.start({ ...alone(TestMountain.FLAT, 10), snow: off })).toThrow(
      RangeError,
    );
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
