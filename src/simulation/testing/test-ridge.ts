import { Body } from "../body/body";
import type { Breathing, Legs } from "../body/body";
import type { BodyNumbers } from "../body/body-numbers";
import type { BodyStart } from "../body/condition";
import type { ClimberId, Walk } from "../game-action";
import type { Json } from "../json";
import { MountainClock } from "../mountain-clock";
import type { Moment, Rule } from "../rule";
import type { Scenario } from "../scenario";
import { SimulationClock } from "../simulation-clock";

/** One climber on the test ridge, as the body sees them and more. A change makes a new value. */
export type RidgeClimber = {
  readonly altitude: number;
  readonly moving: boolean;
  /** Up the ridge, down it, or nowhere. */
  readonly way: -1 | 0 | 1;
  /** The supplemental oxygen they breathe, in L/min. */
  readonly flow: number;
  /** The share of the ridge's climbing speed they go at, as the body last set it. */
  readonly stride: number;
};

/** A climber as a test puts them on the ridge: where, on how much oxygen, and how their body
 * starts, fresh unless it says otherwise. */
export interface RidgeStart extends Partial<BodyStart> {
  readonly id: ClimberId;
  readonly altitude: number;
  readonly flow?: number;
}

type TestRidgeState = {
  readonly climbing: number;
  readonly climbers: Readonly<Record<string, RidgeClimber>>;
};

/**
 * The body's test expedition: climbers on a ridge, standing in for the slope physics and the
 * oxygen system, which sit above the core, where its tests can't import them. A walking climber
 * goes on walking until told otherwise, at `climbing` metres of altitude a second of play times
 * the stride the body gives them, and breathes the oxygen the test gives them. Its numbers, and
 * the body's of `NUMBERS`, are made up, and it isn't game code: only tests import it.
 */
export class TestRidge implements Rule, Legs, Breathing {
  static readonly NAME = "test-ridge";
  /** An hour of the mountain's time in each second of play, so a test lives through hours in a
   * few steps. */
  static readonly COMPRESSION = 3600;
  /** A climber as fit as the typical client, fresh, rested, fed and watered, with nothing on
   * their back. */
  static readonly FRESH: Omit<BodyStart, "id"> = {
    mass: 70,
    load: 0,
    fitness: 1,
    fatigue: 0,
    awake: 0,
    water: 0,
    food: 0,
  };
  static readonly NUMBERS: BodyNumbers = {
    saturation: [
      [0, 98],
      [5000, 80],
      [8000, 60],
    ],
    oxygenGain: { moving: 500, resting: 4000 },
    capacity: { onset: 1000, decline: 10 },
    paces: {
      "rest-step": { speed: 0.5, effort: 0.5 },
      steady: { speed: 1, effort: 1 },
      faster: { speed: 2, effort: 4 },
    },
    endurance: 10,
    recovery: 5,
    deathZone: 8000,
    tired: 0.5,
    profoundlyTired: 0.8,
    water: { loss: 2.4, threshold: 2, cost: 10 },
    food: { expenditure: 4800, hungryAfter: 0.5, cost: 20 },
    sleep: { sleepyAfter: 16, cost: 1 },
  };

  private static readonly WAYS: Readonly<Record<Walk["direction"], RidgeClimber["way"]>> = {
    up: 1,
    "up-left": 1,
    "up-right": 1,
    right: 1,
    down: -1,
    "down-left": -1,
    "down-right": -1,
    left: -1,
    stop: 0,
  };

  readonly name = TestRidge.NAME;

  private climbing = 0;
  private readonly climbers = new Map<ClimberId, RidgeClimber>();

  /** A scenario on the ridge, which rises `climbing` metres a second of play at a whole stride:
   * the clock, each climber's body, and where they stand. */
  static scenario(seed: number, climbers: readonly RidgeStart[], climbing = 0): Scenario {
    const standing = climbers.map(({ id, altitude, flow = 0 }) => {
      const climber: RidgeClimber = { altitude, moving: false, way: 0, flow, stride: 1 };
      return [id, climber] as const;
    });
    const ridge: TestRidgeState = { climbing, climbers: Object.fromEntries(standing) };
    return {
      seed,
      climbers: climbers.map(({ id }) => id),
      start: {
        [MountainClock.NAME]: MountainClock.start({ date: "2026-05-20", time: "00:00" }),
        [Body.NAME]: Body.start(climbers.map((climber) => ({ ...TestRidge.FRESH, ...climber }))),
        [TestRidge.NAME]: ridge,
      },
    };
  }

  climber(id: ClimberId): RidgeClimber {
    const climber = this.climbers.get(id);
    if (climber === undefined) {
      throw new RangeError(`${id} isn't on the test ridge`);
    }
    return climber;
  }

  stride(id: ClimberId, share: number): void {
    this.climbers.set(id, { ...this.climber(id), stride: share });
  }

  flow(id: ClimberId): number {
    return this.climber(id).flow;
  }

  load(state: Json): void {
    const { climbing, climbers } = state as unknown as TestRidgeState;
    this.climbing = climbing;
    this.climbers.clear();
    for (const [id, climber] of Object.entries(climbers)) {
      this.climbers.set(id, climber);
    }
  }

  save(): Json {
    const state: TestRidgeState = {
      climbing: this.climbing,
      climbers: Object.fromEntries(this.climbers),
    };
    return state;
  }

  advance(moment: Moment): void {
    for (const action of moment.actions) {
      if (action.kind === "walk") {
        const way = TestRidge.WAYS[action.direction];
        this.climbers.set(action.climber, { ...this.climber(action.climber), way });
      }
    }
    for (const [id, climber] of this.climbers) {
      const moving = climber.way !== 0 && climber.stride > 0;
      const climbed = climber.way * this.climbing * climber.stride * SimulationClock.STEP_SECONDS;
      this.climbers.set(id, { ...climber, moving, altitude: climber.altitude + climbed });
    }
  }
}
