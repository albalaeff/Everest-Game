import { SlopePhysics } from "../physics";
import { Body, MountainClock, ObjectiveHazards, OxygenSystem } from "../simulation";
import type { HazardKind, HazardOdds, HazardSettings, Rule, Scenario } from "../simulation";
import type { KnowledgeBase } from "./knowledge-base";
import { BodyFacts } from "./body-facts";
import { Section } from "./section";

/** One expedition's rules, with their numbers: the page draws from the physics and reads the
 * clock, and the expedition runs them all, in this order. */
export interface ExpeditionRules {
  readonly clock: MountainClock;
  readonly body: Body;
  readonly oxygen: OxygenSystem;
  readonly hazards: ObjectiveHazards;
  readonly physics: SlopePhysics;
  readonly all: readonly Rule[];
}

/**
 * The mountain as the game has it today: the route's section, the Khumbu Icefall (#26) unless
 * another is given, and the rules that run on it, handed their numbers from the knowledge base
 * (docs/conventions.md → Data, not literals). The page, the room server and the tests build
 * their expeditions from it, so a room's expedition is the page's, step for step.
 */
export class Mountain {
  /** The record the mountain's clock runs at: how many times faster than play. */
  static readonly COMPRESSION = "time.compression";

  constructor(
    private readonly knowledge: KnowledgeBase,
    readonly route: Section = new Section(knowledge),
  ) {}

  /** A new expedition's scenario on the route, from its seed. */
  scenario(seed: number): Scenario {
    const scenario = this.route.scenario(seed);
    const bodyFacts = new BodyFacts(this.knowledge);
    return {
      ...scenario,
      start: {
        ...scenario.start,
        [OxygenSystem.NAME]: OxygenSystem.start(
          scenario.climbers,
          bodyFacts.oxygenNumbers().bottles,
        ),
      },
    };
  }

  /** Rules for one expedition, fresh: it loads its state into them, and nothing else shares them.
   * The clock runs first, so the hazards read this step's hour, and the hazards before the
   * physics, so a climber they knock falls in the same step. */
  rules(): ExpeditionRules {
    const clock = new MountainClock(this.knowledge.number(Mountain.COMPRESSION));
    const physics = new SlopePhysics(this.route.settings);
    const bodyFacts = new BodyFacts(this.knowledge);
    const oxygen = new OxygenSystem(bodyFacts.oxygenNumbers(), clock);
    const body = new Body(bodyFacts.numbers, clock, physics, oxygen);
    const hazards = new ObjectiveHazards(this.hazardSettings(), clock, physics);
    return { clock, oxygen, body, hazards, physics, all: [clock, oxygen, body, hazards, physics] };
  }

  /** The hazards' numbers, from their records in content/facts/hazards.json: each kind's
   * `hazards.<kind>-rate`, `-warmth`, `-snow`, `-wind`, `-warning`, `-deadly` and
   * `-deadly-clipped`, and the day's warmth. */
  hazardSettings(): HazardSettings {
    const number = (name: string) => this.knowledge.number(`hazards.${name}`);
    const odds = (kind: HazardKind): HazardOdds => ({
      rate: number(`${kind}-rate`),
      warmth: number(`${kind}-warmth`),
      snow: number(`${kind}-snow`),
      wind: number(`${kind}-wind`),
      warning: number(`${kind}-warning`),
      deadly: number(`${kind}-deadly`),
      deadlyClipped: number(`${kind}-deadly-clipped`),
    });
    return {
      kinds: {
        serac: odds("serac"),
        avalanche: odds("avalanche"),
        crevasse: odds("crevasse"),
        cornice: odds("cornice"),
      },
      warmth: {
        from: number("warmth-from"),
        peak: number("warmth-peak"),
        until: number("warmth-until"),
      },
      sun: { cloud: number("sun-under-cloud"), snow: number("sun-in-snow") },
    };
  }
}
