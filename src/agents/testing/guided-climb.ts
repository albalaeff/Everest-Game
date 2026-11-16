import { SlopePhysics } from "../../physics";
import type { SlopeLayout, SlopeSettings } from "../../physics";
import { TestMountain } from "../../physics/testing/test-mountain";
import { Expedition, MountainClock, ObjectiveHazards } from "../../simulation";
import type {
  ClimberId,
  ExpeditionSave,
  GameAction,
  HazardSettings,
  HazardStart,
  Walk,
} from "../../simulation";
import { Sherpa } from "../sherpa";
import type { SherpaSettings, SherpaStart } from "../sherpa";

/**
 * A guided climb for the agents' tests: a Sherpa among the slope physics, the hazards and the
 * mountain's clock, played through `Expedition` on a seed, on a test mountain's ground and
 * numbers, and the actions a test sends his clients. Its numbers are made up, and it isn't game
 * code: only tests import it.
 */
export class GuidedClimb {
  /** The Sherpa leads 3 to 6 m ahead, waits for a client 10 m behind, follows 2 to 3 m back,
   * goes past one ahead who has stood half a mountain minute, rests a mountain minute with a
   * client he pulled out, and hauls from 3 m. */
  static readonly SHERPA: SherpaSettings = {
    lead: { near: 3, far: 6 },
    wait: 10,
    behind: { near: 2, far: 3 },
    rest: 60,
    pass: 30,
    reach: 3,
  };
  /** No hazard goes of itself; a staged one cracks for a minute of the mountain's: six seconds
   * of play. */
  static readonly QUIET: HazardSettings = (() => {
    const odds = {
      rate: 0,
      warmth: 1,
      snow: 1,
      wind: 1,
      warning: 0,
      deadly: 0,
      deadlyClipped: 0,
      fall: 0,
    };
    return {
      kinds: { serac: odds, avalanche: odds, crevasse: odds, cornice: odds },
      warmth: { from: 6, peak: 14, until: 20 },
      sun: { cloud: 1, snow: 1 },
      training: { crack: 60 },
    };
  })();
  /** A step is half a mountain second. */
  static readonly COMPRESSION = 10;

  static readonly walk = (climber: ClimberId, direction: Walk["direction"]): GameAction => ({
    kind: "walk",
    climber,
    direction,
  });

  readonly physics: SlopePhysics;
  readonly hazards: ObjectiveHazards;
  readonly clock: MountainClock;
  readonly sherpa: Sherpa;
  readonly expedition: Expedition;

  /** A climb from a layout's start with its hazards and a Sherpa, or on from a save. */
  constructor(
    start:
      | {
          readonly layout: SlopeLayout;
          readonly hazards?: HazardStart;
          readonly sherpa: SherpaStart;
        }
      | ExpeditionSave,
    settings: SlopeSettings = TestMountain.CALM,
    seed = 1,
  ) {
    this.physics = new SlopePhysics(settings);
    this.clock = new MountainClock(GuidedClimb.COMPRESSION);
    this.hazards = new ObjectiveHazards(GuidedClimb.QUIET, this.clock, this.physics);
    this.sherpa = new Sherpa(GuidedClimb.SHERPA, this.physics, this.hazards, this.clock);
    const rules = [this.clock, this.sherpa, this.hazards, this.physics];
    if ("scenario" in start) {
      this.expedition = Expedition.resume(start, rules);
      return;
    }
    const { layout, hazards = { weather: "clear", zones: [] }, sherpa } = start;
    this.expedition = Expedition.start(
      {
        seed,
        climbers: layout.climbers.map(({ id }) => id),
        npcs: [sherpa.climber],
        start: {
          [MountainClock.NAME]: MountainClock.start({ date: "2026-04-20", time: "03:00" }),
          [Sherpa.NAME]: Sherpa.start(sherpa),
          [ObjectiveHazards.NAME]: ObjectiveHazards.start(hazards),
          [SlopePhysics.NAME]: SlopePhysics.start(layout),
        },
      },
      rules,
    );
  }

  /** How far along the ground a climber is. */
  along(id: ClimberId): number {
    return this.physics.along(id);
  }

  /** Plays `steps` steps, with `actions` in the first. */
  play(steps: number, actions: readonly GameAction[] = []): void {
    this.expedition.advance(actions);
    for (let step = 1; step < steps; step += 1) {
      this.expedition.advance();
    }
  }

  /** Plays up to `steps` steps until `done` says so: whether it did. */
  until(done: () => boolean, steps: number): boolean {
    for (let step = 0; step < steps && !done(); step += 1) {
      this.expedition.advance();
    }
    return done();
  }
}
