import { SlopePhysics } from "../physics";
import { Body, MountainClock } from "../simulation";
import type { Rule, Scenario } from "../simulation";
import { BodyFacts } from "./body-facts";
import type { KnowledgeBase } from "./knowledge-base";
import { StandInRoute } from "./stand-in-route";

/** One expedition's rules, with their numbers: the page draws from the physics and reads the
 * clock and the body, and the expedition runs them all, in this order: the body sets the strides
 * the physics takes next. */
export interface ExpeditionRules {
  readonly clock: MountainClock;
  readonly body: Body;
  readonly physics: SlopePhysics;
  readonly all: readonly Rule[];
}

/**
 * The mountain as the game has it today: the stand-in section until the Icefall (#26), and the
 * rules that run on it, handed their numbers from the knowledge base (docs/conventions.md → Data,
 * not literals). The page, the room server and the tests build their expeditions from it, so a
 * room's expedition is the page's, step for step.
 */
export class Mountain {
  /** The record the mountain's clock runs at: how many times faster than play. */
  static readonly COMPRESSION = "time.compression";

  constructor(
    private readonly knowledge: KnowledgeBase,
    readonly route: StandInRoute = new StandInRoute(),
  ) {}

  /** A new expedition's scenario on the route, from its seed. */
  scenario(seed: number): Scenario {
    return this.route.scenario(seed);
  }

  /** Rules for one expedition, fresh: it loads its state into them, and nothing else shares them. */
  rules(): ExpeditionRules {
    const clock = new MountainClock(this.knowledge.number(Mountain.COMPRESSION));
    const physics = new SlopePhysics(this.route.settings);
    const body = new Body(new BodyFacts(this.knowledge).numbers, clock, physics);
    return { clock, body, physics, all: [clock, body, physics] };
  }
}
