import { describe, expect, it } from "vitest";

import { Expedition, SimulationClock } from "../simulation";
import type { ExpeditionSave } from "../simulation";
import { SlopePhysics } from "./slope-physics";
import type { LadderLayout, RopeLayout, SlopeLayout, SlopeSettings } from "./slope-physics";
import { Climb } from "./testing/climb";
import { TestMountain } from "./testing/test-mountain";

const { walk, clip } = Climb;

/** The steps in `seconds`. */
const steps = (seconds: number): number => seconds * SimulationClock.STEPS_PER_SECOND;

/** The seeds each story's climbers set off on, one climb a seed. */
const SEEDS = Array.from({ length: 20 }, (_, index) => index + 1);

/** Flat to a crevasse 8 m wide and 30 m deep, from x = 20 to 28, and flat beyond: its near lip is
 * 20 m along the ground, its far one 88. */
const WIDE: SlopeLayout["terrain"] = [
  [0, 0],
  [20, 0],
  [20, -30],
  [28, -30],
  [28, 0],
  [60, 0],
];
const LONG_LADDER: LadderLayout = { id: "long", from: 20, to: 88 };
/** A rope fixed along it, from 4 m before it to 4 m past it, a metre slack. */
const ALONG_IT: RopeLayout = { id: "fixed", from: 16, to: 92, length: 17 };

/** The slippery mountain with no slip on a ladder's bounce: the bounce alone, to watch. */
const STILL_RUNGS: SlopeSettings = {
  ...TestMountain.SLIPPERY,
  footing: {
    ...TestMountain.SLIPPERY.footing,
    bounce: { ...TestMountain.SLIPPERY.footing.bounce, slip: 0 },
  },
};
/** Every step on a ladder slips, and a landing faster than 12 m/s kills. */
const ICY_RUNGS: SlopeSettings = { ...TestMountain.ICY_LADDERS, lethalLanding: 12 };

/** The wide crevasse with these climbers on it, its long ladder and the rope along it. */
function overTheWideCrevasse(climbers: SlopeLayout["climbers"]): SlopeLayout {
  return {
    terrain: WIDE,
    altitude: { start: TestMountain.FOOT, end: TestMountain.FOOT },
    ropes: [ALONG_IT],
    ladders: [LONG_LADDER],
    climbers,
  };
}

/** Whether a climber has slipped yet: falling, or a fall behind them. */
const slipped = (climb: Climb, id: string): boolean => {
  const climber = climb.physics.climber(id);
  return climber.falling || climber.falls.length > 0;
};

/**
 * Slips by chance (#208): each metre of blue ice, of a ladder and of steep snow has a chance of
 * slipping, by the ground, a ladder's bounce and how sure-footed the climber is, the careful the
 * surest; standing still never slips, and nothing refills. Clipped, the rope holds a slip, and the
 * climber climbs back up it; unclipped, the crevasse kills them. The chance is the expedition's:
 * the same seed slips the same.
 */
describe("Blue ice: a steady step slips on it now and then, a careful one seldom, and snow never", () => {
  /** Flat ground with blue ice from 5 m to 45 m along it, a climber walking onto it on `seed`, as
   * sure-footed as `sureness`. */
  const onIce = (sureness: number, seed = 1): Climb => {
    const layout = TestMountain.FLAT.layout([{ id: "anna", along: 5 }], [], [], undefined, [
      { from: 5, to: 45 },
    ]);
    const climb = new Climb(TestMountain.SLIPPERY, layout, seed);
    climb.physics.sureness("anna", sureness);
    climb.play(1, [walk("anna", "right")]);
    return climb;
  };
  /** Of the seeds' climbers as sure-footed as `sureness`, how many slip in their first 15 m. */
  const slipsIn15m = (sureness: number): number =>
    SEEDS.filter((seed) => {
      const climb = onIce(sureness, seed);
      while (!slipped(climb, "anna") && climb.physics.along("anna") < 20) {
        climb.play(1);
      }
      return slipped(climb, "anna");
    }).length;

  it("slips most steady climbers within 15 m of it, and few careful ones", () => {
    // A fifth a metre at a steady pace: 95 in a hundred slip; a hundredth twenty times as sure: 14.
    expect(slipsIn15m(1)).toBeGreaterThanOrEqual(SEEDS.length - 4);
    expect(slipsIn15m(20)).toBeLessThanOrEqual(6);
  });

  it("slides a climber who slips on the flat no further than a metre or so", () => {
    const climb = onIce(1);
    while (!slipped(climb, "anna")) {
      climb.play(1);
    }
    const slippedAt = climb.physics.climber("anna").x;
    climb.play(1, [walk("anna", "stop")]);
    climb.play(steps(5));
    const anna = climb.physics.climber("anna");

    expect(anna).toMatchObject({ falling: false, dead: false });
    expect(anna.x - slippedAt).toBeLessThan(1.5);
  });

  it("says how likely each metre of a step is to slip, and that standing still is safe", () => {
    const careful = onIce(4);
    careful.play(steps(0.5));
    const walking = careful.physics.climber("anna");
    careful.play(1, [walk("anna", "stop")]);

    expect(walking.slipChance).toBeCloseTo(0.2 / 4, 9);
    expect(careful.physics.climber("anna").slipChance).toBe(0);
  });

  it("never slips on the snow beside it", () => {
    const layout = TestMountain.FLAT.layout([{ id: "anna", along: 50 }]);
    const climb = new Climb(TestMountain.SLIPPERY, layout);
    climb.play(steps(20), [walk("anna", "right")]);

    expect(climb.physics.climber("anna")).toMatchObject({ slipChance: 0, falls: [] });
  });
});

describe("A slip on a ramp of ice down to a crevasse's lip", () => {
  /** Flat to 10 m, then a ramp of blue ice down to a crevasse's lip at 20 m, 2 m lower, its 3 m
   * wide mouth 30 m deep, and flat beyond: the ramp is 10.2 m long, from 10 to 20.2 m along,
   * and the far lip is 83.2 m along. A rope runs across it from 5 m along to 7 m past the far
   * lip, 2 m slack. */
  const RAMP: SlopeLayout["terrain"] = [
    [0, 0],
    [10, 0],
    [20, -2],
    [20, -32],
    [23, -32],
    [23, -2],
    [50, -2],
  ];
  const rope: RopeLayout = { id: "fixed", from: 5, to: 90.2, length: 27 };
  /** A hurried climber walking down the ramp, clipped or not. */
  const toTheLip = (clipped: boolean): Climb => {
    const layout: SlopeLayout = {
      terrain: RAMP,
      ice: [{ from: 10, to: 20.2 }],
      altitude: { start: TestMountain.FOOT, end: TestMountain.FOOT - 2 },
      ropes: [rope],
      ladders: [],
      climbers: [{ id: "anna", along: 11 }],
    };
    const climb = new Climb(TestMountain.SLIPPERY, layout);
    climb.physics.sureness("anna", 0.5);
    climb.play(1, [...(clipped ? [clip("anna", "second")] : []), walk("anna", "right")]);
    return climb;
  };

  it("slides the climber who isn't clipped over the lip, and the landing at its foot kills them", () => {
    const climb = toTheLip(false);
    climb.play(steps(15));
    const anna = climb.physics.climber("anna");

    expect(anna.dead).toBe(true);
    expect(anna.y).toBeCloseTo(-32, 6);
    expect(anna.falls).toHaveLength(1);
    expect(anna.falls[0]?.impact).toBeGreaterThan(TestMountain.SLIPPERY.lethalLanding);
    expect(anna.falls[0]?.held).toBe(false);
  });

  it("holds the clipped one on the rope under the lip, and up they climb on W, back where they slipped", () => {
    const climb = toTheLip(true);
    climb.play(steps(8));
    const hanging = climb.physics.climber("anna");
    climb.play(1, [walk("anna", "up")]);
    climb.play(steps(40));
    const back = climb.physics.climber("anna");

    expect(hanging).toMatchObject({ falling: true, hanging: true, dead: false, second: "fixed" });
    expect(hanging.y).toBeLessThan(-3);
    expect(hanging.y).toBeGreaterThan(-12);
    expect(back).toMatchObject({ falling: false, hanging: false, dead: false });
    expect(back.x).toBeGreaterThan(10);
    expect(back.x).toBeLessThan(20);
    expect(back.falls).toHaveLength(1);
    expect(back.falls[0]?.held).toBe(true);
  });

  it("leaves the clipped one hanging while nothing points up", () => {
    const climb = toTheLip(true);
    climb.play(steps(8));
    climb.play(1, [walk("anna", "stop")]);
    climb.play(steps(20));

    expect(climb.physics.climber("anna")).toMatchObject({ falling: true, hanging: true });
  });
});

describe("A long ladder across a crevasse bounces under the steps on it", () => {
  /** Climbers at the ladder's near end on `seed`, as sure-footed as `sureness`, walking right onto
   * it on these settings. */
  const onTheLadder = (
    settings: SlopeSettings,
    seed: number,
    ...sureness: readonly number[]
  ): Climb => {
    const ids = sureness.map((_, index) => `climber-${index}`);
    const climb = new Climb(
      settings,
      overTheWideCrevasse(ids.map((id) => ({ id, along: 20 }))),
      seed,
    );
    for (const [index, id] of ids.entries()) {
      climb.physics.sureness(id, sureness[index] ?? 1);
    }
    climb.play(1, [...ids.map((id) => clip(id, "second")), ...ids.map((id) => walk(id, "right"))]);
    return climb;
  };
  /** Of the seeds' climbers as sure-footed as `sureness`, how many slip crossing it. */
  const slipsAcross = (sureness: number): number =>
    SEEDS.filter((seed) => {
      const climb = onTheLadder(TestMountain.SLIPPERY, seed, sureness);
      climb.play(steps(20));
      return slipped(climb, "climber-0");
    }).length;

  it("slips most hurried climbers before the far end, and few careful ones", () => {
    // 8 m at 0.5 m/s: the bounce builds to about 2, a fifth a metre at a steady pace.
    expect(slipsAcross(0.5)).toBeGreaterThanOrEqual(SEEDS.length - 2);
    expect(slipsAcross(10)).toBeLessThanOrEqual(7);
  });

  it("bounces twice as hard under two at once, and a step on it is about twice as likely to slip", () => {
    const one = onTheLadder(STILL_RUNGS, 1, 1);
    const two = onTheLadder(STILL_RUNGS, 1, 1, 1);
    one.play(steps(4));
    two.play(steps(4));

    expect(two.physics.ladderBounce("long")).toBeCloseTo(2 * one.physics.ladderBounce("long"), 6);
    // On the slippery mountain from here, each unit of the bounce adds a tenth to a metre's chance.
    const [alone = 0, together = 0] = [one, two].map((climb) => {
      const slippery = climb.under(TestMountain.SLIPPERY);
      slippery.play(1);
      return slippery.physics.climber("climber-0").slipChance;
    });
    expect(alone).toBeGreaterThan(0.1);
    expect(together / alone).toBeGreaterThan(1.8);
    expect(together / alone).toBeLessThan(2);
  });

  it("settles once nobody steps on it", () => {
    const climb = onTheLadder(STILL_RUNGS, 1, 1);
    climb.play(steps(4));
    const bouncing = climb.physics.ladderBounce("long");
    climb.play(1, [walk("climber-0", "stop")]);
    climb.play(steps(10));

    expect(bouncing).toBeGreaterThan(1);
    expect(climb.physics.ladderBounce("long")).toBe(0);
  });

  it("kills the climber who slips off it unclipped, and hangs the clipped one under it, to climb back onto it", () => {
    const unclipped = new Climb(ICY_RUNGS, overTheWideCrevasse([{ id: "anna", along: 20 }]));
    unclipped.play(steps(20), [walk("anna", "right")]);
    const clipped = onTheLadder(ICY_RUNGS, 1, 1);
    clipped.play(steps(8));
    const hanging = clipped.physics.climber("climber-0");
    clipped.play(1, [walk("climber-0", "up")]);
    clipped.play(steps(30));
    const back = clipped.physics.climber("climber-0");

    expect(unclipped.physics.climber("anna")).toMatchObject({ dead: true, y: -30 });
    expect(hanging).toMatchObject({ falling: true, hanging: true, dead: false });
    expect(back).toMatchObject({ falling: false, ladder: "long", dead: false });
    expect(back.falls[0]?.held).toBe(true);
  });
});

describe("Falls through the air", () => {
  it("lets a climber who drops a few metres off a wall live, and kills one who drops 30", () => {
    // A climber on the wall's top, steered off its edge onto a drop of 10 m, then of 30.
    const drop = (height: number): SlopeLayout => ({
      terrain: [
        [0, 0],
        [20, 0],
        [20, -height],
        [40, -height],
      ],
      altitude: { start: TestMountain.FOOT, end: TestMountain.FOOT },
      ropes: [],
      ladders: [],
      climbers: [{ id: "anna", along: 19 }],
    });
    const landed = (height: number) => {
      const climb = new Climb(TestMountain.SLIPPERY, drop(height));
      climb.play(steps(10), [walk("anna", "right")]);
      return climb.physics.climber("anna");
    };

    // Walking down a wall is a fall; from 3 m the landing is 7.7 m/s, from 30 m 24 m/s.
    expect(landed(3)).toMatchObject({ dead: false, falling: false });
    expect(landed(30)).toMatchObject({ dead: true });
  });
});

describe("The same seed slips the same, and a save keeps the hang and the bounce", () => {
  it("slips the same climber at the same steps on the same seed, and at others on another", () => {
    const slips = (seed: number): readonly number[] => {
      const climb = onIceFor(seed);
      climb.play(steps(30));
      return climb.physics.climber("anna").falls.map((fall) => fall.step);
    };

    expect(slips(3).length).toBeGreaterThan(1);
    expect(slips(3)).toEqual(slips(3));
    expect(slips(4)).not.toEqual(slips(3));
  });

  it("resumes a climber hanging under the ladder as they were, and they climb back the same", () => {
    const climb = new Climb(ICY_RUNGS, overTheWideCrevasse([{ id: "anna", along: 20 }]));
    climb.play(1, [clip("anna", "second"), walk("anna", "right")]);
    climb.play(steps(8));
    const hanging = climb.physics.climber("anna");
    const saved = JSON.parse(JSON.stringify(climb.expedition.save())) as ExpeditionSave;
    const resumed = new Climb(ICY_RUNGS, saved);

    climb.play(1, [walk("anna", "up")]);
    climb.play(steps(5));
    resumed.play(1, [walk("anna", "up")]);
    resumed.play(steps(5));

    expect(hanging).toMatchObject({ falling: true, hanging: true });
    expect(resumed.physics.climber("anna")).toEqual(climb.physics.climber("anna"));
    expect(resumed.physics.ladderBounce("long")).toBe(climb.physics.ladderBounce("long"));
  });

  it("starts old saves safe and sure", () => {
    const physics = new SlopePhysics(TestMountain.SLIPPERY);
    const layout = TestMountain.FLAT.layout([{ id: "anna", along: 10 }]);
    const expedition = Expedition.start(TestMountain.scenario(1, layout), [physics]);
    const save = expedition.save() as unknown as {
      rules: { [SlopePhysics.NAME]: { climbers: Record<string, unknown>[] } };
    };
    for (const climber of save.rules[SlopePhysics.NAME].climbers) {
      delete climber.slipChance;
      delete climber.sureness;
      climber.footing = 0.4;
    }
    const resumed = new Climb(TestMountain.SLIPPERY, save as unknown as ExpeditionSave);

    expect(resumed.physics.climber("anna").slipChance).toBe(0);
    expect(resumed.physics.climber("anna")).not.toHaveProperty("footing");
  });
});

/** A steady climber walking onto a stretch of blue ice 40 m long, on `seed`. */
function onIceFor(seed: number): Climb {
  const layout = TestMountain.FLAT.layout([{ id: "anna", along: 5 }], [], [], undefined, [
    { from: 5, to: 45 },
  ]);
  const climb = new Climb(TestMountain.SLIPPERY, layout, seed);
  climb.play(1, [walk("anna", "right")]);
  return climb;
}
