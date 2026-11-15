import { Sherpa } from "../agents";
import type { SherpaSettings } from "../agents";
import { Lamplight, Logbook, SlopePhysics } from "../physics";
import type { Kit } from "../physics";
import { Body, Jolts, MountainClock, ObjectiveHazards, OxygenSystem, Packs } from "../simulation";
import type {
  HazardKind,
  HazardOdds,
  HazardSettings,
  JoltKind,
  JoltOdds,
  JoltSettings,
  PackCounts,
  Rule,
  Scenario,
} from "../simulation";
import type { KnowledgeBase } from "./knowledge-base";
import { BodyFacts } from "./body-facts";
import { ClimberFacts } from "./climber-facts";
import { Questionnaire } from "./questionnaire";
import type { ClimberAnswers } from "./questionnaire";
import { Section } from "./section";

/** One expedition's rules, with their numbers: the page draws from the physics and reads the
 * clock, and the expedition runs them all, in this order. */
export interface ExpeditionRules {
  readonly clock: MountainClock;
  readonly body: Body;
  readonly oxygen: OxygenSystem;
  readonly hazards: ObjectiveHazards;
  /** The gusts and the ladders' twists, which jolt the climbers off balance (#197). */
  readonly jolts: Jolts;
  readonly physics: SlopePhysics;
  /** The climb's logbook, which the debrief reads (#194). */
  readonly logbook: Logbook;
  /** Whose headlamps are lit, and who's in the dark (#196). */
  readonly lamps: Lamplight;
  /** What each climber carries, and what the camps hold. */
  readonly packs: Packs;
  /** The climbers' Sherpa, Pemba, who guides them (#212). */
  readonly sherpa: Sherpa;
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
  private static readonly SECONDS_AN_HOUR = 60 * 60;

  /** What the player's answers make of their climber. */
  readonly climbers: ClimberFacts;

  constructor(
    private readonly knowledge: KnowledgeBase,
    readonly route: Section = new Section(knowledge),
    readonly questionnaire: Questionnaire = new Questionnaire(),
  ) {
    this.climbers = new ClimberFacts(knowledge, questionnaire);
  }

  /** A new expedition's scenario on the route, from its seed, with the player as their `answers`
   * make them (#145), or as the route has them, with what they checked of their `kit` before
   * setting off (#196), or all of it, and the training events the seed stages (#209), unless
   * `training` is off; `alone`, with the player and their Sherpa only, and no seat for a
   * teammate (#212). */
  scenario(
    seed: number,
    answers?: ClimberAnswers,
    kit?: Kit,
    training = true,
    pack?: PackCounts,
    alone = false,
  ): Scenario {
    const player = answers === undefined ? undefined : this.climbers.climber(answers);
    const scenario = this.route.scenario(
      seed,
      player,
      kit === undefined
        ? undefined
        : { kit, unchecked: this.knowledge.number("body.unchecked-water") },
      training,
      pack,
      alone,
    );
    return {
      ...scenario,
      start: {
        ...scenario.start,
        [Logbook.NAME]: Logbook.start(scenario.climbers),
      },
    };
  }

  /** Rules for one expedition, fresh: it loads its state into them, and nothing else shares them.
   * The clock runs first, so the hazards read this step's hour, and the hazards and the jolts
   * before the physics, so a climber they knock or upset falls in the same step. */
  rules(): ExpeditionRules {
    const clock = new MountainClock(this.knowledge.number(Mountain.COMPRESSION));
    const physics = new SlopePhysics(this.route.settings);
    const bodyFacts = new BodyFacts(this.knowledge);
    const oxygen = new OxygenSystem(bodyFacts.oxygenNumbers(), clock);
    // The body moves the climbers through the light they see their feet by (#196).
    const lamps = new Lamplight(physics, clock, {
      lasts: this.knowledge.number("technique.dead-lamp-hours") * Mountain.SECONDS_AN_HOUR,
      firstLight: this.knowledge.number("time.first-light") * Mountain.SECONDS_AN_HOUR,
      dark: this.knowledge.number("technique.dark-footing"),
    });
    const body = new Body(bodyFacts.numbers, clock, lamps, oxygen);
    // The packs first: the body carries this step what they weigh, and the physics climbs on
    // what's on the harness.
    const packs = new Packs(this.route.packNumbers, body, physics, oxygen);
    const hazards = new ObjectiveHazards(this.hazardSettings(), clock, physics);
    const jolts = new Jolts(this.joltSettings(), clock, physics);
    const logbook = new Logbook(physics, hazards, clock, this.route.logged);
    // The Sherpa acts at the start of each step, from where the last left everyone (#212).
    const sherpa = new Sherpa(this.sherpaSettings(), physics, hazards, clock);
    return {
      clock,
      oxygen,
      body,
      hazards,
      jolts,
      physics,
      logbook,
      lamps,
      packs,
      sherpa,
      all: [clock, packs, oxygen, body, hazards, jolts, physics, logbook, sherpa],
    };
  }

  /** The Sherpa's numbers, from their records in content/facts/technique.json: how far ahead he
   * leads (`technique.sherpa-lead`), when he waits (`-wait`), how far back he follows (`-behind`),
   * how long he rests with a client he pulled out (`-rest`), how long a client ahead of him stands
   * before he goes past them (`-pass`, #197), and the haul's reach. */
  sherpaSettings(): SherpaSettings {
    const range = (name: string) => this.knowledge.range(`technique.sherpa-${name}`);
    const lead = range("lead");
    const behind = range("behind");
    return {
      lead: { near: lead.min, far: lead.max },
      wait: this.knowledge.number("technique.sherpa-wait"),
      behind: { near: behind.min, far: behind.max },
      rest: this.knowledge.number("technique.sherpa-rest") * 60,
      pass: this.knowledge.number("technique.sherpa-pass"),
      reach: this.knowledge.number("technique.haul-reach"),
    };
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
      training: { crack: number("training-crack") },
    };
  }

  /** The jolts' numbers (#197), from their records in content/facts/hazards.json: each kind's
   * `hazards.<kind>-rate`, `-warmth`, `-snow`, `-wind`, `-warning` and `-slip`, and the day's
   * warmth, the hazards'. */
  joltSettings(): JoltSettings {
    const number = (name: string) => this.knowledge.number(`hazards.${name}`);
    const odds = (kind: JoltKind): JoltOdds => ({
      rate: number(`${kind}-rate`),
      warmth: number(`${kind}-warmth`),
      snow: number(`${kind}-snow`),
      wind: number(`${kind}-wind`),
      warning: number(`${kind}-warning`),
      slip: number(`${kind}-slip`),
    });
    const { warmth, sun } = this.hazardSettings();
    return { kinds: { gust: odds("gust"), twist: odds("twist") }, warmth, sun };
  }
}
