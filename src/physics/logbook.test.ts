import { describe, expect, it } from "vitest";

import { Expedition, MountainClock, ObjectiveHazards, SimulationClock } from "../simulation";
import type { GameAction, HazardSettings, Scenario } from "../simulation";
import { Logbook } from "./logbook";
import { SlopePhysics } from "./slope-physics";
import type { SlopeLayout } from "./slope-physics";
import { Climb } from "./testing/climb";
import { TestMountain } from "./testing/test-mountain";

const { walk, clip } = Climb;

/** A mountain hour in six minutes of play; seracs that never come down. */
const COMPRESSION = 10;
const STILL_ODDS = {
  rate: 0,
  warmth: 1,
  snow: 1,
  wind: 1,
  warning: 0,
  deadly: 0,
  deadlyClipped: 0,
};
const SETTINGS: HazardSettings = {
  kinds: { serac: STILL_ODDS, avalanche: STILL_ODDS, crevasse: STILL_ODDS, cornice: STILL_ODDS },
  warmth: { from: 6, peak: 14, until: 20 },
  sun: { cloud: 0.5, snow: 0 },
  training: { crack: 5 },
};

/** A hundred metres of flat ground: the logbook counts from 10 m to 90, a rope runs from 30 m to
 * 40, blue ice from 40 m to 50, and seracs stand over 60 m to 70. */
const LAYOUT: SlopeLayout = TestMountain.FLAT.layout(
  [{ id: "anna", along: 5 }],
  [{ id: "fixed", from: 30, to: 40, length: 11 }],
  [],
  undefined,
  [{ from: 40, to: 50 }],
);

/** The clock, the hazards, the physics and the logbook, in the game's order. */
class Logged {
  readonly clock = new MountainClock(COMPRESSION);
  readonly physics = new SlopePhysics(TestMountain.CALM);
  readonly logbook: Logbook;
  readonly expedition: Expedition;

  constructor() {
    const hazards = new ObjectiveHazards(SETTINGS, this.clock, this.physics);
    this.logbook = new Logbook(this.physics, hazards, this.clock, { from: 10, to: 90 });
    const scenario: Scenario = {
      seed: 1,
      climbers: ["anna"],
      start: {
        [MountainClock.NAME]: MountainClock.start({ date: "2026-04-20", time: "03:00" }),
        [ObjectiveHazards.NAME]: ObjectiveHazards.start({
          weather: "clear",
          zones: [{ id: "seracs", kind: "serac", from: 60, to: 70 }],
        }),
        [SlopePhysics.NAME]: SlopePhysics.start(LAYOUT),
        [Logbook.NAME]: Logbook.start(["anna"]),
      },
    };
    this.expedition = Expedition.start(scenario, [this.clock, hazards, this.physics, this.logbook]);
  }

  /** Plays `steps` steps, with `actions` in the first. */
  play(steps: number, actions: readonly GameAction[] = []): void {
    this.expedition.advance(actions);
    for (let step = 1; step < steps; step += 1) {
      this.expedition.advance();
    }
  }

  /** Plays until anna is `along` the ground, at most two minutes of play. */
  walkTo(along: number): void {
    for (let step = 0; step < 120 * SimulationClock.STEPS_PER_SECOND; step += 1) {
      if (this.physics.along("anna") >= along) {
        return;
      }
      this.expedition.advance();
    }
  }
}

/** The mountain's seconds a second of play. */
const MOUNTAIN_SECONDS = COMPRESSION;

describe("Logbook: what the climb was, step by step (#194)", () => {
  it("counts nothing before the route needs a rope", () => {
    const log = new Logged();
    log.play(1, [walk("anna", "right")]);
    log.walkTo(9);

    expect(log.logbook.page("anna")).toMatchObject({ unclipped: 0, exposed: 0 });
  });

  it("counts the time unclipped on the route, and on the ice of it as where a slip was a fall", () => {
    const log = new Logged();
    log.play(1, [walk("anna", "right")]);
    log.walkTo(55);
    const page = log.logbook.page("anna");

    // 45 m at 1 m/s, the ice's 10 m of it: a mountain second for each of play, ten.
    expect(page.unclipped).toBeCloseTo(45 * MOUNTAIN_SECONDS, -1);
    expect(page.exposed).toBeCloseTo(10 * MOUNTAIN_SECONDS, -1);
  });

  it("counts nothing unclipped while a cowstail is on the rope", () => {
    const log = new Logged();
    log.play(1, [walk("anna", "right")]);
    log.walkTo(31);
    const before = log.logbook.page("anna").unclipped;
    log.play(1, [clip("anna", "second")]);
    log.walkTo(39);

    expect(log.logbook.page("anna").unclipped).toBeCloseTo(before, -1);
  });

  it("counts the time under the seracs, and of it the time standing still", () => {
    const log = new Logged();
    log.play(1, [walk("anna", "right")]);
    log.walkTo(65);
    log.play(1, [walk("anna", "stop")]);
    log.play(3 * SimulationClock.STEPS_PER_SECOND);
    const page = log.logbook.page("anna");

    expect(page.underSeracs).toBeCloseTo(8 * MOUNTAIN_SECONDS, -1);
    expect(page.stopped).toBeCloseTo(3 * MOUNTAIN_SECONDS, -1);
  });

  it("writes the hour of the arrival, and counts no more after it", () => {
    const log = new Logged();
    log.play(1, [walk("anna", "right")]);
    log.walkTo(91);
    log.play(2);
    const page = log.logbook.page("anna");
    log.play(5 * SimulationClock.STEPS_PER_SECOND);

    expect(page.arrived).not.toBeNull();
    expect(page.arrived).toBeGreaterThan(3 * 3600);
    expect(log.logbook.page("anna")).toEqual(page);
  });

  it("goes on exactly from a save", () => {
    const log = new Logged();
    log.play(1, [walk("anna", "right")]);
    log.walkTo(45);
    const saved = JSON.parse(JSON.stringify(log.logbook.save())) as unknown;
    const resumed = new Logged();
    resumed.logbook.load(saved as Parameters<Logbook["load"]>[0]);

    expect(resumed.logbook.page("anna")).toEqual(log.logbook.page("anna"));
  });
});
