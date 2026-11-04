import type { BodyNumbers, PaceNumbers } from "../simulation";
import type { KnowledgeBase } from "./knowledge-base";

/**
 * The body's numbers, from the knowledge base (docs/conventions/body.md → Numbers): the SpO2
 * measured at each place of the route, at the route's altitude for it; what a litre of oxygen
 * buys; the capacity the altitude leaves; the paces; and what fatigue, rest, water, food and sleep
 * do.
 */
export class BodyFacts {
  /** The places of the route SpO2 was measured at, from the foot up, after sea level. */
  private static readonly PLACES = ["base-camp", "camp-2", "south-col", "balcony"];
  /** The pace the others are measured against. */
  private static readonly STEADY: PaceNumbers = { speed: 1, effort: 1 };

  readonly numbers: BodyNumbers;

  constructor(knowledge: KnowledgeBase) {
    const number = (id: string): number => knowledge.number(id);
    const places = BodyFacts.PLACES.map(
      (place) => [number(`route.${place}-altitude`), number(`body.saturation-${place}`)] as const,
    );
    this.numbers = {
      saturation: [[0, number("body.saturation-sea-level")], ...places],
      oxygenGain: {
        moving: number("body.oxygen-gain-climbing"),
        resting: number("body.oxygen-gain-resting"),
      },
      capacity: {
        onset: number("body.vo2max-decline-onset"),
        decline: number("body.capacity-decline"),
      },
      paces: {
        "rest-step": {
          speed: number("body.rest-step-speed"),
          effort: number("body.rest-step-effort"),
        },
        steady: BodyFacts.STEADY,
        faster: { speed: number("body.faster-speed"), effort: number("body.faster-effort") },
      },
      endurance: number("body.steady-endurance"),
      recovery: number("body.recovery-hours"),
      deathZone: number("medicine.death-zone"),
      tired: number("body.tired"),
      profoundlyTired: number("body.profoundly-tired"),
      water: {
        loss: number("body.water-loss"),
        threshold: number("body.dehydration-threshold"),
        cost: number("body.dehydration-cost"),
      },
      food: {
        expenditure: number("body.energy-expenditure"),
        hungryAfter: number("body.hungry-after"),
        cost: number("body.hunger-cost"),
      },
      sleep: { sleepyAfter: number("body.sleepy-after"), cost: number("body.sleep-loss-cost") },
    };
  }
}
