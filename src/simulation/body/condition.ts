import type { ClimberId, Pace } from "../game-action";
import type { BodyNumbers } from "./body-numbers";
import type { ColdSymptom } from "./cold";
import type { PaceEffort } from "./pace-effort";

/** How a climber starts an expedition, as its scenario sets them. */
export interface BodyStart {
  readonly id: ClimberId;
  /** Their own mass and their pack's, in kg. */
  readonly mass: number;
  readonly load: number;
  /** Their VO2max at sea level, as a share of the typical client's, whom the body's numbers are
   * fitted to: 1 for them. */
  readonly fitness: number;
  /** The share of their endurance already spent: 0 fresh, 1 exhausted. */
  readonly fatigue: number;
  /** Hours since they last slept. */
  readonly awake: number;
  /** The litres of water and the kcal of food they're short of. */
  readonly water: number;
  readonly food: number;
}

/** How tired a climber feels. */
export type Tiredness = "fresh" | "tired" | "profoundly-tired" | "exhausted";

/** What else a climber feels: out of breath, thirsty, hungry, sleepy, and the cold (#272). */
export type Symptom = "out-of-breath" | "thirsty" | "hungry" | "sleepy" | ColdSymptom;

/**
 * A climber's body as they feel it, and as the self-check (#25) shows it: words, and the one
 * number a pulse oximeter on their finger reads. The player judges by symptoms, never by their
 * condition's numbers (spec.md → Simulation systems).
 */
export interface BodyView {
  readonly tiredness: Tiredness;
  /** In the order of `Symptom`. */
  readonly symptoms: readonly Symptom[];
  /** Their SpO2, in whole %. */
  readonly oximeter: number;
  /** The pace they go at: the one chosen, or the rest step once they're profoundly tired. */
  readonly pace: Pace["pace"];
}

/** A climber's condition, as saves keep it. */
export type ConditionSave = {
  readonly id: ClimberId;
  readonly mass: number;
  readonly load: number;
  /** Missing from the saves of builds before climbers had one (#145), which can't go on. */
  readonly fitness?: number;
  readonly chosen: Pace["pace"];
  readonly fatigue: number;
  readonly exhausted: boolean;
  readonly awake: number;
  readonly water: number;
  readonly food: number;
};

/**
 * One climber's condition: how much of their endurance they've spent, the pace they chose, and
 * how short they are of water, food and sleep. On the move they tire at their pace's rate for
 * the work their steps do, faster the shorter they are; at rest they recover, where the body can.
 * Spent, they're exhausted and stop, until rest brings them back below profound fatigue.
 */
export class Condition {
  private static readonly HOURS_A_DAY = 24;

  private constructor(
    readonly id: ClimberId,
    private readonly mass: number,
    private load: number,
    private readonly fitness: number,
    private chosen: Pace["pace"],
    private fatigue: number,
    private exhausted: boolean,
    private awake: number,
    private water: number,
    private food: number,
  ) {}

  /** A climber as a scenario starts them, at a steady pace. */
  static start(start: BodyStart): Condition {
    const { id, mass, load, fitness, fatigue, awake, water, food } = start;
    const short = [load, awake, water, food];
    const whole = mass > 0 && fitness > 0 && fatigue >= 0 && fatigue <= 1;
    if (!(whole && short.every((amount) => amount >= 0))) {
      throw new RangeError(
        `${id}'s body needs a mass, a fitness, a fatigue from 0 to 1, and nothing below nought`,
      );
    }
    const exhausted = fatigue >= 1;
    return new Condition(id, mass, load, fitness, "steady", fatigue, exhausted, awake, water, food);
  }

  static load(save: ConditionSave): Condition {
    const { id, mass, load, fitness, chosen, fatigue, exhausted, awake, water, food } = save;
    if (fitness === undefined) {
      throw new RangeError(`${id}'s body was saved before climbers had a fitness (#145)`);
    }
    return new Condition(id, mass, load, fitness, chosen, fatigue, exhausted, awake, water, food);
  }

  save(): ConditionSave {
    const { id, mass, load, fitness, chosen, fatigue, exhausted, awake, water, food } = this;
    return { id, mass, load, fitness, chosen, fatigue, exhausted, awake, water, food };
  }

  choose(pace: Pace["pace"]): void {
    this.chosen = pace;
  }

  /** What they carry from now on, in kilograms: their pack's weight changes as they drink, eat
   * and repack at a camp (`Packs`). */
  carry(kilograms: number): void {
    if (!(kilograms >= 0)) {
      throw new RangeError(`${this.id} can't carry ${kilograms} kg`);
    }
    this.load = kilograms;
  }

  /** Drinks `litres`: that much less short of water, and never ahead of it. */
  drink(litres: number): void {
    this.water = Math.max(0, this.water - litres);
  }

  /** Eats `kcal`: that much less short of food, and never ahead of it. */
  eat(kcal: number): void {
    this.food = Math.max(0, this.food - kcal);
  }

  /** How far their strides go, as a share of a fresh typical client's at sea level with nothing
   * to carry: their pace's, of their fitness and the `capacity` the altitude leaves of it, less
   * what their load takes. Exhausted, they don't move. */
  stride(numbers: BodyNumbers, capacity: number): number {
    if (this.exhausted) {
      return 0;
    }
    const { speed } = numbers.paces[this.pace(numbers)];
    return (speed * capacity * this.fitness * this.mass) / (this.mass + this.load);
  }

  /** Lives through `hours` of the mountain's time, on the move, their steps taking `exertion` of
   * their stride's power, or not: they grow short of water, food and sleep, and tire as `effort`
   * says or, where the body `recovers`, rest. `asleep`, in a tent, each hour takes its share of
   * the hours awake off instead of adding one (#258). */
  live(
    hours: number,
    moving: boolean,
    exertion: number,
    recovers: boolean,
    numbers: BodyNumbers,
    effort: PaceEffort,
    asleep = false,
  ): void {
    if (moving) {
      const rate = effort.at(numbers.paces[this.pace(numbers)], exertion);
      const spent = (rate / numbers.endurance) * this.strain(numbers) * hours;
      this.fatigue = Math.min(1, this.fatigue + spent);
    } else if (recovers) {
      this.fatigue = Math.max(0, this.fatigue - hours / numbers.recovery);
    }
    this.exhausted =
      this.fatigue >= 1 || (this.exhausted && this.fatigue >= numbers.profoundlyTired);
    const days = hours / Condition.HOURS_A_DAY;
    this.awake = asleep
      ? Math.max(0, this.awake - hours * numbers.sleep.restores)
      : this.awake + hours;
    this.water += numbers.water.loss * days;
    this.food += numbers.food.expenditure * days;
  }

  /** How they feel, on the move or not, with their SpO2 at `saturation`. */
  view(numbers: BodyNumbers, moving: boolean, saturation: number): BodyView {
    const pace = this.pace(numbers);
    const { water, food, sleep } = numbers;
    const felt: readonly (readonly [Symptom, boolean])[] = [
      ["out-of-breath", moving && pace === "faster"],
      ["thirsty", this.dehydration > water.threshold],
      ["hungry", this.food / food.expenditure > food.hungryAfter],
      ["sleepy", this.awake > sleep.sleepyAfter],
    ];
    return {
      tiredness: this.tiredness(numbers),
      symptoms: felt.filter(([, feels]) => feels).map(([symptom]) => symptom),
      oximeter: Math.round(saturation),
      pace,
    };
  }

  /** How sure-footed they are: their pace's, as tired as they are (#190). */
  sureness(numbers: BodyNumbers): number {
    const { footing } = numbers.paces[this.pace(numbers)];
    const tiredness = this.tiredness(numbers);
    if (tiredness === "fresh") {
      return footing;
    }
    return (
      footing * (tiredness === "tired" ? numbers.footing.tired : numbers.footing.profoundlyTired)
    );
  }

  /** The pace they go at: the one chosen, or the rest step once they're profoundly tired. */
  private pace(numbers: BodyNumbers): Pace["pace"] {
    return this.fatigue >= numbers.profoundlyTired ? "rest-step" : this.chosen;
  }

  private tiredness(numbers: BodyNumbers): Tiredness {
    if (this.exhausted) {
      return "exhausted";
    }
    if (this.fatigue >= numbers.profoundlyTired) {
      return "profoundly-tired";
    }
    return this.fatigue >= numbers.tired ? "tired" : "fresh";
  }

  /** How many times faster than a fresh climber they tire: each % of their endurance that
   * thirst, hunger and lost sleep cost them makes them tire 1% faster. */
  private strain(numbers: BodyNumbers): number {
    const { water, food, sleep } = numbers;
    const thirst = Math.max(0, this.dehydration - water.threshold) * water.cost;
    const hunger = (this.food / food.expenditure) * food.cost;
    const sleepless = Math.max(0, this.awake - sleep.sleepyAfter) * sleep.cost;
    return 1 + (thirst + hunger + sleepless) / 100;
  }

  /** The water they're short of, as a % of their body mass: a litre of it weighs a kilogram. */
  private get dehydration(): number {
    return (100 * this.water) / this.mass;
  }
}
