import type { GameAction } from "./game-action";
import type { Json } from "./json";
import type { SeededRandom } from "./seeded-random";

/** Each rule's state, by its name: a scenario's start, and part of a save. */
export type RuleStates = Readonly<Record<string, Json>>;

/** What a rule is given on each step. */
export interface Moment {
  /** How many steps came before this one. */
  readonly step: number;
  /** The seconds played, on the simulation's clock. */
  readonly seconds: number;
  /** Every climber's actions of this step, in the scenario's order of climbers. */
  readonly actions: readonly GameAction[];
  /** The expedition's one generator: every rule draws from it, in the rules' order. */
  readonly random: SeededRandom;
}

/**
 * One part of the game's rules: the body, the oxygen, the weather, the slope physics, the agents.
 * Each is a class that holds its own state, and an expedition runs them in the order it's given.
 * The core only knows this interface: the agents and the physics sit above it, and it may not
 * import them (docs/conventions.md → Modules).
 */
export interface Rule {
  /** Its key in a scenario's start and in a save: never change it once saves exist. */
  readonly name: string;
  /** Takes its whole state from a scenario's start, or from a save. */
  load(state: Json): void;
  /** Its whole state, as plain data: `load` of it goes on exactly from here. */
  save(): Json;
  /** Works out one step: the same state, moment and draws must give the same result. */
  advance(moment: Moment): void;
}
