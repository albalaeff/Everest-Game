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

  it("holds the clipped one on the rope under the lip, and up they climb on the jumar, back where they slipped", () => {
    const climb = toTheLip(true);
    climb.play(steps(8));
    const hanging = climb.physics.climber("anna");
    climb.play(1, [clip("anna", "first"), walk("anna", "up")]);
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

  it("bounces half as hard while someone holds its line taut from its far end, with nobody to haul (#212)", () => {
    const crossing = (held: boolean): Climb => {
      const climb = new Climb(
        STILL_RUNGS,
        overTheWideCrevasse([
          { id: "climber-0", along: 20 },
          { id: "pemba", along: 88 },
        ]),
        1,
      );
      climb.play(1, [
        clip("climber-0", "second"),
        walk("climber-0", "right"),
        { kind: "haul", climber: "pemba", held },
      ]);
      climb.play(steps(4));
      return climb;
    };
    const free = crossing(false);
    const held = crossing(true);

    expect(free.physics.ladderBounce("long")).toBeGreaterThan(1);
    expect(held.physics.ladderBounce("long")).toBeCloseTo(
      STILL_RUNGS.footing.bounce.held * free.physics.ladderBounce("long"),
      6,
    );
    expect(held.physics.climber("pemba")).toMatchObject({ haulHeld: true, hauling: false });
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

  it("kills the climber who slips off it unclipped, and hangs the clipped one under it, to climb back to its end", () => {
    const unclipped = new Climb(ICY_RUNGS, overTheWideCrevasse([{ id: "anna", along: 20 }]));
    unclipped.play(steps(20), [walk("anna", "right")]);
    const clipped = onTheLadder(ICY_RUNGS, 1, 1);
    clipped.play(steps(8));
    const hanging = clipped.physics.climber("climber-0");
    clipped.play(1, [clip("climber-0", "first"), walk("climber-0", "up")]);
    clipped.play(steps(30));
    const back = clipped.physics.climber("climber-0");

    expect(unclipped.physics.climber("anna")).toMatchObject({ dead: true, y: -30 });
    expect(hanging).toMatchObject({ falling: true, hanging: true, dead: false });
    // Against the crevasse's wall under the ladder's end, they go up the ice to the lip it stands on.
    expect(back).toMatchObject({ falling: false, ladder: null, dead: false, x: 20, y: 0 });
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

/** Standing still on the front points, on blue ice past 30°, slips about twice a second at a
 * sure-footedness of 1; on a ladder, five times a second for each unit of its bounce past 2.5,
 * more than a crossing at a steady pace sets the long ladder going on its own, about 2, with steps
 * that never slip (#197). */
const HARD_STANCES: SlopeSettings = {
  ...STILL_RUNGS,
  footing: {
    ...STILL_RUNGS.footing,
    still: { steepness: 30, frontPoints: 2, bounce: 5, bounceFrom: 2.5 },
  },
};

/**
 * Standing still isn't safe everywhere (#197): where a stance is hard, on blue ice steeper than a
 * flat foot holds on and on a ladder that bounces hard, a climber standing still slips now and
 * then too; on gentler ice, on a ladder swaying from their own crossing, and anywhere else,
 * standing never slips.
 */
describe("Where standing still isn't safe", () => {
  /** Anna standing still on blue ice on `mountain`, `along` it, for 10 s. */
  const standing = (mountain: TestMountain, along: number, seed: number): Climb => {
    const layout = mountain.layout([{ id: "anna", along }], [], [], undefined, [
      { from: 0, to: 200 },
    ]);
    const climb = new Climb(HARD_STANCES, layout, seed);
    climb.play(steps(10));
    return climb;
  };

  it("slips a climber standing on blue ice steeper than a flat foot holds on, and never on gentle ice", () => {
    const steep = SEEDS.filter((seed) => slipped(standing(TestMountain.SLOPE, 60, seed), "anna"));
    const gentle = SEEDS.filter((seed) => slipped(standing(TestMountain.GENTLE, 30, seed), "anna"));
    const flat = standing(TestMountain.FLAT, 30, 1);

    expect(steep).toEqual(SEEDS);
    expect(gentle).toEqual([]);
    expect(flat.physics.climber("anna")).toMatchObject({ falling: false, stillChance: 0 });
  });

  it("slips a climber standing on a ladder while another hurries onto it, and never one standing on it alone", () => {
    /** Anna 2 m onto the long ladder, standing, and Ben, if he comes, hurrying onto it behind
     * her, both clipped to the rope along it. */
    const onIt = (ben: boolean, seed: number): Climb => {
      const climbers = [{ id: "anna", along: 20 }, ...(ben ? [{ id: "ben", along: 18 }] : [])];
      const climb = new Climb(HARD_STANCES, overTheWideCrevasse(climbers), seed);
      climb.play(1, [clip("anna", "second"), walk("anna", "right")]);
      climb.play(steps(4) - 1);
      climb.play(steps(4), [walk("anna", "stop")]);
      if (ben) {
        climb.physics.stride("ben", 2);
        climb.play(steps(6), [clip("ben", "second"), walk("ben", "right")]);
      } else {
        climb.play(steps(6));
      }
      return climb;
    };
    const alone = SEEDS.filter((seed) => slipped(onIt(false, seed), "anna"));
    const bounced = SEEDS.filter((seed) => slipped(onIt(true, seed), "anna"));

    expect(alone).toEqual([]);
    expect(bounced.length).toBeGreaterThanOrEqual(SEEDS.length - 4);
  });
});

/**
 * A climber passing another on a rope they share (#197), as Sherpas pass their clients: the one
 * passed, standing aside, is jolted where a slip can happen, on blue ice, a ladder or steep snow,
 * and never on the flat snow; braced, standing still, it's less likely than on the move. Clipped,
 * the rope holds them.
 */
describe("Passing on a shared rope", () => {
  /** Every passing on blue ice slips the one passed, and never on snow. */
  const PASSING: SlopeSettings = {
    ...TestMountain.CALM,
    footing: { ...TestMountain.CALM.footing, passing: { near: 1, slip: TestMountain.SURE } },
  };
  /** Anna standing at 10 m and Ben walking past her from 8, both clipped to a rope along the
   * flat, on blue ice or not. */
  const passed = (ice: boolean): Climb => {
    const rope: RopeLayout = { id: "fixed", from: 2, to: 40, length: 38.5 };
    const layout = TestMountain.FLAT.layout(
      [
        { id: "anna", along: 10 },
        { id: "ben", along: 8 },
      ],
      [rope],
      [],
      undefined,
      ice ? [{ from: 0, to: 50 }] : [],
    );
    const climb = new Climb(PASSING, layout);
    climb.play(1, [clip("anna", "second"), clip("ben", "second")]);
    climb.play(steps(5), [walk("ben", "right")]);
    return climb;
  };

  it("slips the climber passed on blue ice, whom the rope holds, and never on snow", () => {
    const onIce = passed(true).physics;
    const onSnow = passed(false).physics;

    expect(onIce.climber("anna").falls.length + (onIce.climber("anna").falling ? 1 : 0)).toBe(1);
    expect(onIce.climber("anna").dead).toBe(false);
    expect(onIce.climber("ben").falls).toEqual([]);
    expect(onSnow.climber("anna")).toMatchObject({ falling: false, falls: [] });
    expect(onSnow.climber("ben").x).toBeGreaterThan(10);
  });

  it("takes less of a jolt's chance from one braced, standing still, than from one on the move", () => {
    const layout = TestMountain.FLAT.layout([{ id: "anna", along: 10 }], [], [], undefined, [
      { from: 0, to: 50 },
    ]);
    const climb = new Climb(TestMountain.CALM, layout);
    climb.play(1);
    const braced = climb.physics.unsteadiness("anna");
    climb.play(1, [walk("anna", "right")]);
    const moving = climb.physics.unsteadiness("anna");
    climb.physics.sureness("anna", 2);
    const sure = climb.physics.unsteadiness("anna");

    expect(braced).toBe(TestMountain.CALM.footing.braced);
    expect(moving).toBe(1);
    expect(sure).toBe(0.5);
  });

  it("says who is coming past a climber on their rope: behind them and stepping their way, and nobody once they're by", () => {
    const rope: RopeLayout = { id: "fixed", from: 2, to: 40, length: 38.5 };
    const layout = TestMountain.FLAT.layout(
      [
        { id: "anna", along: 10 },
        { id: "ben", along: 8 },
        { id: "cleo", along: 5 },
      ],
      [rope],
    );
    const climb = new Climb(TestMountain.CALM, layout);
    climb.play(1, [clip("anna", "second"), clip("ben", "second")]);
    climb.play(steps(1), [walk("ben", "right"), walk("cleo", "right")]);
    const coming = climb.physics.passerOf("anna", 3);
    climb.play(steps(3));
    const gone = climb.physics.passerOf("anna", 3);

    // Cleo walks on no rope of Anna's; Ben is past her after 3 s.
    expect(coming).toBe("ben");
    expect(gone).toBeNull();
  });

  it("jolts nobody off their feet where nothing slips, nor anyone already falling", () => {
    const climb = new Climb(
      TestMountain.CALM,
      TestMountain.FLAT.layout([{ id: "anna", along: 10 }]),
    );
    climb.play(1);

    expect(climb.physics.unsteadiness("anna")).toBe(0);
  });
});

/**
 * The rope's cost is in the handling, not the walking (#197): a climber walks as fast clipped as
 * unclipped, their technique's share of the speed in crampons and never past the fastest walk;
 * a clip takes the typical client's hands its seconds, standing, and the carabiner is on only
 * then, a novice's longer and a veteran's shorter, by their technique.
 */
describe("Clipping takes its time", () => {
  /** A clip takes the typical client 1 s. */
  const HANDLED: SlopeSettings = { ...TestMountain.CALM, clip: 1 };
  /** A climber of `technique` at 10 m of the flat, a rope along it. */
  const atTheRope = (technique: number, settings: SlopeSettings = HANDLED): Climb => {
    const rope: RopeLayout = { id: "fixed", from: 2, to: 90, length: 88.5 };
    return new Climb(
      settings,
      TestMountain.FLAT.layout([{ id: "anna", along: 10, technique }], [rope]),
    );
  };

  it("puts the carabiner on the rope once the clip's second is up, and the climber takes no step meanwhile", () => {
    const climb = atTheRope(1);
    climb.play(steps(0.5), [clip("anna", "second"), walk("anna", "right")]);
    const clipping = climb.physics.climber("anna");
    climb.play(steps(0.5) + 1);
    const clipped = climb.physics.climber("anna");

    expect(clipping).toMatchObject({ second: null, clipping: "second", x: 10 });
    expect(clipped).toMatchObject({ second: "fixed", clipping: null });
  });

  it("takes a novice twice as long as the typical client, and a veteran half as long", () => {
    const clippedAfter = (technique: number): number => {
      const climb = atTheRope(technique);
      climb.play(1, [clip("anna", "second")]);
      let taken = 1;
      while (climb.physics.climber("anna").second === null && taken < steps(10)) {
        climb.play(1);
        taken += 1;
      }
      return taken / SimulationClock.STEPS_PER_SECOND;
    };

    expect(clippedAfter(0.5)).toBeCloseTo(2, 1);
    expect(clippedAfter(1)).toBeCloseTo(1, 1);
    expect(clippedAfter(2)).toBeCloseTo(0.5, 1);
  });

  it("clips both cowstails in turn when both are asked for at once, and drops a clip let go of", () => {
    const climb = atTheRope(1);
    climb.play(steps(1) + 1, [clip("anna", "first"), clip("anna", "second")]);
    const first = climb.physics.climber("anna");
    climb.play(steps(1));
    const both = climb.physics.climber("anna");
    const dropped = atTheRope(1);
    dropped.play(steps(0.5), [clip("anna", "second")]);
    dropped.play(steps(1), [{ kind: "unclip", climber: "anna", cowstail: "second" }]);

    expect(first).toMatchObject({ first: "fixed", second: null, clipping: "second" });
    expect(both).toMatchObject({ first: "fixed", second: "fixed", clipping: null });
    expect(dropped.physics.climber("anna")).toMatchObject({ second: null, clipping: null });
  });

  it("walks a veteran no faster clipped than unclipped, and never past the fastest walk", () => {
    const walked = (technique: number, clipped: boolean): number => {
      const climb = atTheRope(technique, TestMountain.CALM);
      climb.play(1, clipped ? [clip("anna", "second")] : []);
      climb.play(steps(5), [walk("anna", "right")]);
      return climb.physics.climber("anna").x - 10;
    };

    // A whole stride walks the flat at the fastest walk, 1 m/s.
    expect(walked(1.35, true)).toBeCloseTo(walked(1.35, false), 6);
    expect(walked(1.35, true)).toBeLessThanOrEqual(5 + 1e-6);
    expect(walked(0.7, true)).toBeCloseTo(walked(0.7, false), 6);
    expect(walked(0.7, false)).toBeCloseTo(0.7 * walked(1, false), 6);
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

    climb.play(1, [clip("anna", "first"), walk("anna", "up")]);
    climb.play(steps(5));
    resumed.play(1, [clip("anna", "first"), walk("anna", "up")]);
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
