import type { ClimberId, GameAction } from "../game-action";
import type { Json } from "../json";
import type { Moment, Rule } from "../rule";
import type { Scenario } from "../scenario";
import { SimulationClock } from "../simulation-clock";

/** One climber on the test slope. A change makes a new value. */
export type TestClimber = {
  readonly metres: number;
  readonly walking: "up" | "down" | "stop";
  readonly clipped: boolean;
  readonly fallen: boolean;
  /** The steps they slipped on. */
  readonly slips: readonly number[];
};

/** What a scenario sets in advance on the test slope. */
export type TestConditions = {
  readonly top: number;
  readonly metresPerSecond: number;
  readonly slipChancePerSecond: number;
};

type TestSlopeState = TestConditions & { readonly climbers: Readonly<Record<string, TestClimber>> };

/**
 * The small test expedition: climbers on one straight slope, standing in for the game's rules
 * until they come (the slope physics in #20, the ropes in #21), so the core's tests play
 * something in real time. A walking climber goes on walking until told otherwise, and may slip;
 * a slip is nothing on the rope, and a fall off it. Its numbers are made up, and it isn't game
 * code: only tests import it.
 */
export class TestSlope implements Rule {
  static readonly MILD: TestConditions = {
    top: 100,
    metresPerSecond: 1,
    slipChancePerSecond: 0.2,
  };
  static readonly CALM: TestConditions = { ...TestSlope.MILD, slipChancePerSecond: 0 };
  static readonly HARSH: TestConditions = { ...TestSlope.MILD, slipChancePerSecond: 1 };

  private static readonly AT_THE_BOTTOM: TestClimber = {
    metres: 0,
    walking: "stop",
    clipped: false,
    fallen: false,
    slips: [],
  };

  readonly name = "test-slope";

  private conditions = TestSlope.MILD;
  private readonly climbers = new Map<ClimberId, TestClimber>();

  /** A scenario on this slope: the seed, who climbs, and the conditions set in advance. */
  static scenario(
    seed: number,
    climbers: readonly ClimberId[],
    conditions: TestConditions = TestSlope.MILD,
  ): Scenario {
    const atTheBottom = climbers.map((climber) => [climber, TestSlope.AT_THE_BOTTOM] as const);
    const state: TestSlopeState = { ...conditions, climbers: Object.fromEntries(atTheBottom) };
    return { seed, climbers, start: { "test-slope": state } };
  }

  climber(id: ClimberId): TestClimber {
    const climber = this.climbers.get(id);
    if (climber === undefined) {
      throw new RangeError(`${id} isn't on the test slope`);
    }
    return climber;
  }

  /** Whether every climber has reached the top or fallen. */
  get everyoneDone(): boolean {
    const climbers = [...this.climbers.values()];
    return climbers.every((climber) => climber.fallen || climber.metres >= this.conditions.top);
  }

  load(state: Json): void {
    const { climbers, ...conditions } = state as unknown as TestSlopeState;
    this.conditions = conditions;
    this.climbers.clear();
    for (const [id, climber] of Object.entries(climbers)) {
      this.climbers.set(id, climber);
    }
  }

  save(): Json {
    return { ...this.conditions, climbers: Object.fromEntries(this.climbers) };
  }

  advance(moment: Moment): void {
    for (const action of moment.actions) {
      this.hear(action);
    }
    for (const id of this.climbers.keys()) {
      this.move(id, moment);
    }
  }

  private hear(action: GameAction): void {
    const climber = this.climber(action.climber);
    if (climber.fallen) {
      return;
    }
    if (action.kind === "walk") {
      this.climbers.set(action.climber, { ...climber, walking: action.direction });
    }
    if (action.kind === "clip") {
      this.climbers.set(action.climber, { ...climber, clipped: true });
    }
    if (action.kind === "unclip") {
      this.climbers.set(action.climber, { ...climber, clipped: false });
    }
  }

  private move(id: ClimberId, moment: Moment): void {
    const climber = this.climber(id);
    if (climber.fallen || climber.walking === "stop") {
      return;
    }
    const { top, metresPerSecond, slipChancePerSecond } = this.conditions;
    const way = climber.walking === "up" ? 1 : -1;
    const walked = climber.metres + way * metresPerSecond * SimulationClock.STEP_SECONDS;
    const metres = Math.min(Math.max(walked, 0), top);
    const slipped = moment.random.chance(slipChancePerSecond * SimulationClock.STEP_SECONDS);
    this.climbers.set(id, {
      ...climber,
      metres,
      walking: metres === 0 || metres === top ? "stop" : climber.walking,
      fallen: slipped && !climber.clipped,
      slips: slipped ? [...climber.slips, moment.step] : climber.slips,
    });
  }
}
