import { describe, expect, it } from "vitest";

import { Expedition, SimulationClock } from "../simulation";
import type { ExpeditionSave } from "../simulation";
import { SlopePhysics } from "./slope-physics";
import type { LadderLayout, RopeLayout, SlopeLayout } from "./slope-physics";
import { Climb } from "./testing/climb";
import { TestMountain } from "./testing/test-mountain";

const { walk, clip } = Climb;

/** The steps in `seconds`. */
const steps = (seconds: number): number => seconds * SimulationClock.STEPS_PER_SECOND;

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

/** The step a climber first slips on, from now, within `limit` steps: Infinity if never. */
function firstSlip(climb: Climb, id: string, limit: number): number {
  for (let step = 0; step < limit; step += 1) {
    const climber = climb.physics.climber(id);
    if (climber.falling || climber.falls.length > 0) {
      return step;
    }
    climb.play(1);
  }
  return Infinity;
}

/**
 * Footing (#190): a slip is never chance's. Blue ice and a long ladder bouncing under hurried
 * steps take a climber's footing faster than they get it back; the rest step's care gets it back,
 * and a pause steadies them; with none left, they slip. Clipped, the rope holds them, and they
 * climb back up it; unclipped, the crevasse kills them.
 */
describe("Blue ice: a careful step crosses it, a hurried one slips, a pause steadies", () => {
  /** Twenty metres of flat ground, blue ice from 5 m to 45 m along it. */
  const onIce = (sureness: number): Climb => {
    const layout = TestMountain.FLAT.layout([{ id: "anna", along: 5 }], [], [], undefined, [
      { from: 5, to: 45 },
    ]);
    const climb = new Climb(TestMountain.SLIPPERY, layout);
    climb.physics.sureness("anna", sureness);
    climb.play(1, [walk("anna", "right")]);
    return climb;
  };

  it("slips a steady climber after a few seconds on it, and never a careful one", () => {
    // Half their footing a second, a fifth back: gone in a little over three seconds.
    const steady = firstSlip(onIce(1), "anna", steps(10));

    expect(steady).toBeGreaterThan(steps(3));
    expect(steady).toBeLessThan(steps(3.5));
    expect(firstSlip(onIce(3), "anna", steps(30))).toBe(Infinity);
  });

  it("slides a climber who slips on the flat no further than a metre or so", () => {
    const climb = onIce(1);
    firstSlip(climb, "anna", steps(10));
    const slipped = climb.physics.climber("anna").x;
    climb.play(1, [walk("anna", "stop")]);
    climb.play(steps(5));
    const anna = climb.physics.climber("anna");

    expect(anna).toMatchObject({ falling: false, dead: false });
    expect(anna.x - slipped).toBeLessThan(1.5);
  });

  it("shows the footing going, and a pause bringing it back", () => {
    const climb = onIce(1);
    climb.play(steps(2));
    const going = climb.physics.climber("anna").footing;
    climb.play(1, [walk("anna", "stop")]);
    climb.play(steps(1));

    expect(going).toBeLessThan(0.5);
    expect(going).toBeGreaterThan(0.3);
    expect(climb.physics.climber("anna").footing).toBe(1);
  });

  it("costs nothing on snow beside it", () => {
    const layout = TestMountain.FLAT.layout([{ id: "anna", along: 50 }]);
    const climb = new Climb(TestMountain.SLIPPERY, layout);
    climb.play(steps(20), [walk("anna", "right")]);

    expect(climb.physics.climber("anna")).toMatchObject({ footing: 1, falls: [] });
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
    expect(back.footing).toBeGreaterThan(0);
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
  /** Climbers at the ladder's near end at these sureness shares, walking right onto it. */
  const onTheLadder = (...sureness: readonly number[]): Climb => {
    const ids = sureness.map((_, index) => `climber-${index}`);
    const climb = new Climb(
      TestMountain.SLIPPERY,
      overTheWideCrevasse(ids.map((id) => ({ id, along: 20 }))),
    );
    for (const [index, id] of ids.entries()) {
      climb.physics.sureness(id, sureness[index] ?? 1);
    }
    climb.play(1, [...ids.map((id) => clip(id, "second")), ...ids.map((id) => walk(id, "right"))]);
    return climb;
  };

  it("slips a hurried climber on it before the far end, and lets a careful one across", () => {
    const hurried = onTheLadder(0.5);
    const slipped = firstSlip(hurried, "climber-0", steps(20));
    const careful = onTheLadder(2);
    careful.play(steps(20));

    // 8 m at 0.5 m/s takes 16 seconds: the hurried one slips on the way.
    expect(slipped).toBeGreaterThan(steps(2));
    expect(slipped).toBeLessThan(steps(16));
    expect(careful.physics.climber("climber-0").falls).toEqual([]);
    expect(careful.physics.climber("climber-0").x).toBeGreaterThanOrEqual(28);
  });

  it("bounces twice as hard under two at once, and slips the careful pair", () => {
    const one = onTheLadder(2);
    const two = onTheLadder(2, 2);
    one.play(steps(4));
    two.play(steps(4));

    expect(two.physics.ladderBounce("long")).toBeCloseTo(2 * one.physics.ladderBounce("long"), 6);
    two.play(steps(10));
    const slipped = ["climber-0", "climber-1"].filter(
      (id) => two.physics.climber(id).falls.length > 0 || two.physics.climber(id).falling,
    );
    expect(slipped.length).toBeGreaterThan(0);
  });

  it("settles once nobody steps on it", () => {
    const climb = onTheLadder(2);
    climb.play(steps(4));
    const bouncing = climb.physics.ladderBounce("long");
    climb.play(1, [walk("climber-0", "stop")]);
    climb.play(steps(10));

    expect(bouncing).toBeGreaterThan(1);
    expect(climb.physics.ladderBounce("long")).toBe(0);
  });

  it("kills the climber who slips off it unclipped, and hangs the clipped one under it, to climb back onto it", () => {
    const unclipped = new Climb(
      TestMountain.SLIPPERY,
      overTheWideCrevasse([{ id: "anna", along: 20 }]),
    );
    unclipped.physics.sureness("anna", 0.5);
    unclipped.play(steps(20), [walk("anna", "right")]);
    const clipped = onTheLadder(0.5);
    clipped.play(steps(16));
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

describe("A save keeps the footing, the hang and the bounce", () => {
  it("resumes a climber hanging under the ladder as they were, and they climb back the same", () => {
    const climb = new Climb(
      TestMountain.SLIPPERY,
      overTheWideCrevasse([{ id: "anna", along: 20 }]),
    );
    climb.physics.sureness("anna", 0.5);
    climb.play(1, [clip("anna", "second"), walk("anna", "right")]);
    climb.play(steps(16));
    const saved = JSON.parse(JSON.stringify(climb.expedition.save())) as ExpeditionSave;
    const resumed = new Climb(TestMountain.SLIPPERY, saved);

    climb.play(1, [walk("anna", "up")]);
    climb.play(steps(5));
    resumed.play(1, [walk("anna", "up")]);
    resumed.play(steps(5));

    expect(resumed.physics.climber("anna")).toEqual(climb.physics.climber("anna"));
    expect(resumed.physics.ladderBounce("long")).toBe(climb.physics.ladderBounce("long"));
  });

  it("starts old saves steady and sure", () => {
    const physics = new SlopePhysics(TestMountain.SLIPPERY);
    const layout = TestMountain.FLAT.layout([{ id: "anna", along: 10 }]);
    const expedition = Expedition.start(TestMountain.scenario(1, layout), [physics]);
    const save = expedition.save() as unknown as {
      rules: { [SlopePhysics.NAME]: { climbers: Record<string, unknown>[] } };
    };
    for (const climber of save.rules[SlopePhysics.NAME].climbers) {
      delete climber.footing;
      delete climber.sureness;
    }
    const resumed = new Climb(TestMountain.SLIPPERY, save as unknown as ExpeditionSave);

    expect(resumed.physics.climber("anna").footing).toBe(1);
  });
});
