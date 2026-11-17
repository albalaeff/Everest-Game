import type { TentNumbers } from "../simulation";
import type { KnowledgeBase } from "./knowledge-base";

/** The tents' sizes, in metres, as the picture draws them: a camp's dome along its floor and up
 * to its peak, its front vestibule and the smaller one behind, and Base Camp's big dome across
 * and up. */
export interface TentSizes {
  readonly length: number;
  readonly height: number;
  readonly vestibule: number;
  readonly tail: number;
  readonly dome: { readonly width: number; readonly height: number };
}

/**
 * The tents' numbers, from the knowledge base (content/facts/gear.json, time.json, #258): what
 * the stove takes to melt a litre of snow and to cook a meal, in the mountain's seconds and grams
 * of gas (the records give kilograms), the meal's water and energy, a nap's length and the hour
 * the alarm rings, a breakfast before the hour climbers leave Base Camp; and the tents' sizes
 * for the picture. A vestibule's reach is its ground over half the tent's width: it narrows to a
 * point.
 */
export class TentFacts {
  /** How near a tent's door a climber stands to go in, in metres along the ground: the engine's
   * number, a long step, as `SlopePhysics.AT_LIP` is. */
  static readonly REACH = 1.25;
  /** The vestibule behind a tent covers half the ground of the one in front (gear.tent-vestibule's
   * source gives both). */
  private static readonly TAIL = 0.5;
  private static readonly SECONDS_A_MINUTE = 60;
  private static readonly SECONDS_AN_HOUR = 3600;
  private static readonly GRAMS_A_KILOGRAM = 1000;

  readonly numbers: TentNumbers;
  readonly sizes: TentSizes;
  /** The grams of gas a full canister holds. */
  readonly canister: number;

  constructor(knowledge: KnowledgeBase) {
    const number = (name: string): number => knowledge.number(name);
    const minute = TentFacts.SECONDS_A_MINUTE;
    const hour = TentFacts.SECONDS_AN_HOUR;
    const gram = TentFacts.GRAMS_A_KILOGRAM;
    this.numbers = {
      reach: TentFacts.REACH,
      melt: {
        seconds: number("gear.melt-minutes") * minute,
        gas: number("gear.melt-gas") * gram,
        litres: 1,
      },
      meal: {
        seconds: number("gear.meal-minutes") * minute,
        gas: number("gear.meal-gas") * gram,
        water: number("gear.meal-water"),
        kcal: number("gear.meal-energy"),
      },
      nap: number("time.nap") * hour,
      wake: (number("time.base-camp-departure") - number("time.breakfast")) * hour,
    };
    this.canister = number("gear.gas-canister") * gram;
    const vestibule = (2 * number("gear.tent-vestibule")) / number("gear.tent-width");
    this.sizes = {
      length: number("gear.tent-length"),
      height: number("gear.tent-height"),
      vestibule,
      tail: vestibule * TentFacts.TAIL,
      dome: { width: number("gear.dome-tent-width"), height: number("gear.dome-tent-height") },
    };
  }
}
