import { ActionLog } from "./action-log";
import type { LoggedStep } from "./action-log";
import type { ClimberId, GameAction } from "./game-action";
import type { Moment, Rule, RuleStates } from "./rule";
import type { Scenario } from "./scenario";
import { SeededRandom } from "./seeded-random";
import type { RandomState } from "./seeded-random";
import { SimulationClock } from "./simulation-clock";

/** An expedition's whole state, as plain data: resumed, it goes on exactly from here. */
export interface ExpeditionSave {
  readonly scenario: Scenario;
  readonly step: number;
  readonly random: RandomState;
  readonly rules: RuleStates;
  readonly actions: readonly LoggedStep[];
}

/**
 * One expedition: the same in a browser, in a test and on the room server. `advance` is the only
 * door: it takes one fixed step, with what every climber did since the last, and the rules work
 * out what happens. The players' actions come through it, and the agents' NPCs act at its start,
 * from the state the last step left, in the same scenario order (#212). It runs whether or not
 * anyone acted, so the mountain never waits. Nothing here knows a key, a touch, a screen or a
 * real clock.
 */
export class Expedition {
  private readonly places: ReadonlyMap<ClimberId, number>;

  private constructor(
    readonly scenario: Scenario,
    private readonly rules: readonly Rule[],
    private readonly clock: SimulationClock,
    private readonly random: SeededRandom,
    private readonly log: ActionLog,
  ) {
    this.places = new Map(scenario.climbers.map((climber, place) => [climber, place] as const));
  }

  static start(scenario: Scenario, rules: readonly Rule[]): Expedition {
    const clock = new SimulationClock();
    const random = SeededRandom.fromSeed(scenario.seed);
    const expedition = new Expedition(scenario, rules, clock, random, new ActionLog());
    expedition.loadRules(scenario.start);
    return expedition;
  }

  static resume(save: ExpeditionSave, rules: readonly Rule[]): Expedition {
    const clock = new SimulationClock(save.step);
    const random = SeededRandom.restore(save.random);
    const log = new ActionLog(save.actions);
    const expedition = new Expedition(save.scenario, rules, clock, random, log);
    expedition.loadRules(save.rules);
    return expedition;
  }

  /** How many steps have been played. */
  get step(): number {
    return this.clock.step;
  }

  /** The seconds played, on the simulation's clock. */
  get seconds(): number {
    return this.clock.seconds;
  }

  /** Takes one fixed step, with what every player's climber did since the last, in any order,
   * and what the agents' NPCs do in it (#212). */
  advance(actions: readonly GameAction[] = []): void {
    const ordered = this.inOrder(actions);
    this.log.add(this.clock.step, ordered);
    const sent: Moment = {
      step: this.clock.step,
      seconds: this.clock.seconds,
      actions: ordered,
      random: this.random,
    };
    const steered = this.rules.flatMap((rule) => rule.act?.(sent) ?? []);
    const moment =
      steered.length === 0 ? sent : { ...sent, actions: this.inOrder([...ordered, ...steered]) };
    for (const rule of this.rules) {
      rule.advance(moment);
    }
    this.clock.tick();
  }

  save(): ExpeditionSave {
    return {
      scenario: this.scenario,
      step: this.clock.step,
      random: this.random.save(),
      rules: Object.fromEntries(this.rules.map((rule) => [rule.name, rule.save()] as const)),
      actions: this.log.save(),
    };
  }

  private loadRules(states: RuleStates): void {
    const names = new Set<string>();
    for (const rule of this.rules) {
      const state = states[rule.name];
      if (names.has(rule.name)) {
        throw new RangeError(`Two rules are called ${rule.name}`);
      }
      if (state === undefined) {
        throw new RangeError(`No state for the rule ${rule.name}`);
      }
      names.add(rule.name);
      rule.load(state);
    }
  }

  /** In the scenario's order of climbers, each one's actions as they came, so that which
   * player's message reached the room server first changes nothing. */
  private inOrder(actions: readonly GameAction[]): readonly GameAction[] {
    return actions
      .map((action) => ({ action, place: this.place(action) }))
      .sort((first, second) => first.place - second.place)
      .map(({ action }) => action);
  }

  private place(action: GameAction): number {
    const place = this.places.get(action.climber);
    if (place === undefined) {
      throw new RangeError(`${action.climber} isn't on this expedition`);
    }
    return place;
  }
}
