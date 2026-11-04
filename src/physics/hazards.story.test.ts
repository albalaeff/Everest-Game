import { describe, expect, it } from "vitest";

import {
  ActionLog,
  Expedition,
  HeadlessRunner,
  MountainClock,
  ObjectiveHazards,
} from "../simulation";
import type { GameAction, HazardSettings, HazardZone, Scenario } from "../simulation";
import { SlopePhysics } from "./slope-physics";
import type { RopeLayout, SlopeLayout } from "./slope-physics";
import { Climb } from "./testing/climb";
import { TestMountain } from "./testing/test-mountain";

const { walk, clip, distance } = Climb;

/** The story's own numbers, not the game's: a mountain hour in six minutes of play, and a serac
 * that goes about once in half an hour under it before dawn, five times as often at 14:00. */
const COMPRESSION = 10;
const SERAC_ODDS = { rate: 2, warmth: 5, snow: 1, wind: 1, warning: 0 };
const SETTINGS: HazardSettings = {
  kinds: {
    serac: SERAC_ODDS,
    avalanche: SERAC_ODDS,
    crevasse: SERAC_ODDS,
    cornice: SERAC_ODDS,
  },
  warmth: { from: 6, peak: 14, until: 20 },
  sun: { cloud: 0.5, snow: 0 },
};
/** A serac that cracks on the first step anyone is under it, and comes down ten mountain seconds
 * later: a second of play, half a metre up a 40° slope. */
const CRACKING: HazardSettings = {
  ...SETTINGS,
  kinds: { ...SETTINGS.kinds, serac: { ...SERAC_ODDS, rate: 100_000, warmth: 1, warning: 10 } },
};

/** A rope up the 40° slope of `TestMountain.SLOPE`, from 10 m up it to 30 m up, a metre slack,
 * and a serac above the middle of it. */
const FIXED: RopeLayout = {
  id: "fixed",
  from: TestMountain.upTheSlope(10),
  to: TestMountain.upTheSlope(30),
  length: 21,
};
const SERAC: HazardZone = {
  id: "serac",
  kind: "serac",
  from: TestMountain.upTheSlope(15),
  to: TestMountain.upTheSlope(25),
};
const LOWER = TestMountain.SLOPE.terrain.point(FIXED.from);

/** The clock, the hazards and the physics, in the game's order, on the story's numbers. */
class Icefall {
  readonly clock = new MountainClock(COMPRESSION);
  readonly physics = new SlopePhysics(TestMountain.CALM);
  readonly hazards: ObjectiveHazards;
  readonly expedition: Expedition;

  constructor(scenario: Scenario, settings: HazardSettings = SETTINGS) {
    this.hazards = new ObjectiveHazards(settings, this.clock, this.physics);
    this.expedition = Expedition.start(scenario, this.rules);
  }

  static scenario(seed: number, time: string, layout: SlopeLayout): Scenario {
    return {
      seed,
      climbers: layout.climbers.map((climber) => climber.id),
      start: {
        [MountainClock.NAME]: MountainClock.start({ date: "2026-04-20", time }),
        [ObjectiveHazards.NAME]: ObjectiveHazards.start({ weather: "clear", zones: [SERAC] }),
        [SlopePhysics.NAME]: SlopePhysics.start(layout),
      },
    };
  }

  get rules(): readonly [MountainClock, ObjectiveHazards, SlopePhysics] {
    return [this.clock, this.hazards, this.physics];
  }

  play(steps: number, actions: readonly GameAction[] = []): void {
    this.expedition.advance(actions);
    for (let step = 1; step < steps; step += 1) {
      this.expedition.advance();
    }
  }

  /** The debrief: the same climb played again from the save, with no screen. */
  debrief(): Icefall {
    const save = this.expedition.save();
    const again = new Icefall(save.scenario);
    new HeadlessRunner(again.expedition, new ActionLog(save.actions)).play(save.step);
    return again;
  }
}

describe("Two climbers rest under a serac in the afternoon, one clipped to the rope", () => {
  const layout = TestMountain.SLOPE.layout(
    [
      { id: "anna", along: TestMountain.upTheSlope(20) },
      { id: "boris", along: TestMountain.upTheSlope(22) },
    ],
    [FIXED],
  );
  const icefall = new Icefall(Icefall.scenario(3, "14:00", layout));
  icefall.play(1, [clip("anna", "second")]);
  while (icefall.hazards.strikes.length === 0 && icefall.expedition.seconds < 600) {
    icefall.play(1);
  }
  icefall.play(400);

  it("the serac comes down on both of them", () => {
    expect(icefall.hazards.strikes).toHaveLength(1);
    expect(icefall.hazards.strikes[0]).toMatchObject({
      zone: "serac",
      climbers: ["anna", "boris"],
    });
  });

  it("the rope holds the one clipped to it at its anchor below", () => {
    const anna = icefall.physics.climber("anna");

    expect(anna.falls).toHaveLength(1);
    expect(distance(anna, LOWER)).toBeLessThanOrEqual(0.5 + TestMountain.SETTINGS.cowstail + 0.01);
  });

  it("the other falls to the foot of the slope", () => {
    const boris = icefall.physics.climber("boris");

    expect(boris.falls).toHaveLength(1);
    expect(boris).toMatchObject({ falling: false });
    expect(boris.y).toBeCloseTo(0, 6);
  });

  it("the debrief replays it exactly from the save", () => {
    const again = icefall.debrief();

    expect(again.hazards.strikes).toEqual(icefall.hazards.strikes);
    expect(again.expedition.save()).toEqual(icefall.expedition.save());
  });
});

describe("The serac cracks over two climbers, and the one near its edge walks clear", () => {
  const layout = TestMountain.SLOPE.layout([
    { id: "anna", along: TestMountain.upTheSlope(24.8) },
    { id: "boris", along: TestMountain.upTheSlope(20) },
  ]);
  const icefall = new Icefall(Icefall.scenario(1, "14:00", layout), CRACKING);
  icefall.play(1);
  const warned = icefall.hazards.warningAt(icefall.physics.along("anna"));
  icefall.play(25, [walk("anna", "right")]);

  it("the crack warns whoever is under it", () => {
    expect(warned).toBe("serac");
  });

  it("the ice comes down on the one who stayed, and spares the one who got clear", () => {
    expect(icefall.hazards.strikes).toMatchObject([{ zone: "serac", climbers: ["boris"] }]);
    expect(icefall.physics.climber("anna")).toMatchObject({ falling: false, falls: [] });
    expect(icefall.physics.climber("boris")).toMatchObject({ falling: true });
  });
});

describe("Crossing under the serac before dawn is safer than in the afternoon", () => {
  /** Of 60 expeditions, how many lose a climber's footing to the serac as they walk up through it
   * from below, starting at `time`. */
  const caught = (time: string): number => {
    const layout = TestMountain.SLOPE.layout([{ id: "anna", along: TestMountain.upTheSlope(12) }]);
    let caught = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      const icefall = new Icefall(Icefall.scenario(seed, time, layout));
      icefall.play(800, [walk("anna", "right")]);
      caught += icefall.hazards.strikes.length > 0 ? 1 : 0;
    }
    return caught;
  };

  it("far fewer are caught at 04:00 than at 14:00, on the same seeds", () => {
    const dawn = caught("04:00");
    const afternoon = caught("14:00");

    expect(dawn).toBeGreaterThan(0);
    expect(afternoon).toBeGreaterThan(2 * dawn);
  });
});
