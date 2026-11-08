import type { CurvePoint } from "../curve";
import type { Pace } from "../game-action";

/** What a pace asks of a climber, against the steady pace: its speed, how fast it tires them, and
 * how sure-footed it leaves them (#190). */
export interface PaceNumbers {
  readonly speed: number;
  readonly effort: number;
  readonly footing: number;
}

/**
 * The numbers the body runs on, handed to it (docs/conventions.md → Data, not literals): the page
 * and the room server take them from the knowledge base, and the tests have test numbers of their
 * own.
 */
export interface BodyNumbers {
  /** SpO2 at rest, in %, by the altitude the body feels, in metres, from sea level up. */
  readonly saturation: readonly CurvePoint[];
  /** How many metres lower the body feels for each L/min of supplemental oxygen: on the move,
   * and at rest, breathing slower. */
  readonly oxygenGain: { readonly moving: number; readonly resting: number };
  /** The altitude, in metres, above which a climber's capacity, their VO2max, falls; and the % of
   * their sea-level capacity they lose for each 1,000 m above it. */
  readonly capacity: { readonly onset: number; readonly decline: number };
  /** Each pace against the steady one, which is 1 and 1. */
  readonly paces: Readonly<Record<Pace["pace"], PaceNumbers>>;
  /** Hours on the move at the steady pace that exhaust a fresh climber. */
  readonly endurance: number;
  /** Hours of rest that bring an exhausted climber back to fresh. */
  readonly recovery: number;
  /** The altitude, in metres, above which a resting body doesn't recover: the death zone. */
  readonly deathZone: number;
  /** The shares of their endurance spent at which a climber is tired, and profoundly tired. */
  readonly tired: number;
  readonly profoundlyTired: number;
  /** How sure-footed a tired climber is, and a profoundly tired one, against a fresh one (#190). */
  readonly footing: { readonly tired: number; readonly profoundlyTired: number };
  /** The litres of water a climber loses a day; the % of their body mass lost past which it costs
   * them; and the % of their endurance each further % costs. */
  readonly water: { readonly loss: number; readonly threshold: number; readonly cost: number };
  /** The kcal a climber spends a day; how many days of that they can be short before they're
   * hungry; and the % of their endurance each day short costs. */
  readonly food: {
    readonly expenditure: number;
    readonly hungryAfter: number;
    readonly cost: number;
  };
  /** The hours awake past which a climber is short of sleep, and the % of their endurance each
   * hour past them costs. */
  readonly sleep: { readonly sleepyAfter: number; readonly cost: number };
}
