import icefall from "../../content/route/icefall.json";
import { SlopePhysics, Terrain } from "../physics";
import type {
  ClimberLayout,
  LadderLayout,
  RopeLayout,
  SlopeLayout,
  SlopeSettings,
} from "../physics";
import { Body, MountainClock, ObjectiveHazards, OxygenSystem } from "../simulation";
import type { BodyStart, ClimberId, ClockStart, HazardStart, Scenario } from "../simulation";
import type { KnowledgeBase, KnowledgeRange } from "./knowledge-base";
import { SlopeFacts } from "./slope-facts";

/** A point as the data file keeps it: two numbers. */
type DataPair = readonly number[];

/** A camp's stretch of the ground, as the data file keeps it: where its tents stand. */
export interface CampData {
  readonly id: string;
  readonly from: number;
  readonly to: number;
}

/** A section of the route as its file in content/route/ has it: its ground and what's fixed on
 * it, its camps at each end, its hazards, and who sets off on it. Its numbers come from the
 * knowledge base by its ids: the camps' altitudes, the hours it takes, its length and the hour
 * it's set off on. */
export interface SectionData {
  readonly id: string;
  /** The camp it starts at, and the one it ends at: `route.<camp>-altitude` in the knowledge
   * base, and `time.<from>-to-<to>` its hours. */
  readonly from: string;
  readonly to: string;
  /** The day the expedition sets off on it. */
  readonly date: string;
  readonly layout: {
    readonly terrain: readonly DataPair[];
    readonly ropes: readonly RopeLayout[];
    readonly ladders: readonly LadderLayout[];
    readonly climbers: readonly ClimberLayout[];
  };
  readonly camps: readonly CampData[];
  readonly hazards: {
    readonly weather: string;
    readonly zones: readonly {
      readonly id: string;
      readonly kind: string;
      readonly from: number;
      readonly to: number;
    }[];
  };
  readonly bodies: readonly BodyStart[];
}

/** A camp on the section: its stretch of the ground, and its altitude from the knowledge base. */
export interface Camp extends CampData {
  readonly altitude: number;
}

/**
 * A section of the route, as the page plays it: the Khumbu Icefall, Base Camp to Camp 1, unless
 * another file is given (#26). Its ground, ropes and ladders are the file's; its ends' altitudes,
 * the hour it sets off at, its hours and its length are the knowledge base's, by the file's ids,
 * and so are the physics' numbers (`SlopeFacts`). It names its camps' stretches for the picture,
 * and the one it ends at for the arrival.
 */
export class Section {
  /** The player's climber in the layout. */
  static readonly PLAYER: ClimberId = "player";

  readonly id: string;
  readonly settings: SlopeSettings;
  readonly layout: SlopeLayout;
  /** Its camps, in the layout's order: the first at its foot, the last at its top. */
  readonly camps: readonly Camp[];
  /** Each climber's body as they set off, in the layout's order. */
  readonly bodies: readonly BodyStart[];
  /** Its weather and the stretches of it under a hazard, which `ObjectiveHazards.start` checks. */
  readonly hazards: HazardStart;
  readonly clock: ClockStart;
  /** The hours the sources give it the first time. */
  readonly hours: KnowledgeRange;
  /** Its real length, in metres. */
  readonly length: number;

  constructor(knowledge: KnowledgeBase, data: SectionData = icefall) {
    const { layout, hazards, bodies } = data;
    this.id = data.id;
    this.settings = new SlopeFacts(knowledge).settings;
    this.layout = {
      terrain: Section.pairs(layout.terrain, data.id),
      altitude: {
        start: knowledge.number(`route.${data.from}-altitude`),
        end: knowledge.number(`route.${data.to}-altitude`),
      },
      ropes: layout.ropes,
      ladders: layout.ladders,
      climbers: layout.climbers,
    };
    const ground = new Terrain(this.layout.terrain);
    this.camps = data.camps.map((camp) => {
      if (!(camp.from >= 0 && camp.from < camp.to && camp.to <= ground.length)) {
        throw new RangeError(`The camp ${camp.id} isn't on the ground of ${data.id}`);
      }
      return { ...camp, altitude: knowledge.number(`route.${camp.id}-altitude`) };
    });
    if (!this.camps.some((camp) => camp.id === data.to)) {
      throw new RangeError(`${data.id} ends at ${data.to}, which isn't one of its camps`);
    }
    this.hazards = hazards as HazardStart;
    this.bodies = layout.climbers.map(({ id }) => {
      const body = bodies.find((start) => start.id === id);
      if (body === undefined) {
        throw new RangeError(`${id} has no body on ${data.id}`);
      }
      return body;
    });
    this.clock = {
      date: data.date,
      time: MountainClock.text(knowledge.number(`time.${data.from}-departure`) * 3600),
    };
    this.hours = knowledge.range(`time.${data.from}-to-${data.to}`);
    this.length = knowledge.number(`route.${data.id}-length`);
  }

  /** The camp the section ends at: reaching its stretch is the arrival. */
  get destination(): Camp {
    const camp = this.camps.at(-1);
    if (camp === undefined) {
      throw new RangeError(`${this.id} has no camps`);
    }
    return camp;
  }

  /** A scenario on the section: the seed, the climbers in the layout's order, the clock at its
   * start. */
  scenario(seed: number): Scenario {
    return {
      seed,
      climbers: this.layout.climbers.map((climber) => climber.id),
      start: {
        [MountainClock.NAME]: MountainClock.start(this.clock),
        [OxygenSystem.NAME]: OxygenSystem.start(this.layout.climbers.map(({ id }) => id)),
        [Body.NAME]: Body.start(this.bodies),
        [ObjectiveHazards.NAME]: ObjectiveHazards.start(this.hazards),
        [SlopePhysics.NAME]: SlopePhysics.start(this.layout),
      },
    };
  }

  private static pairs(points: readonly DataPair[], id: string): (readonly [number, number])[] {
    return points.map((point, index) => {
      const [x, y] = point;
      if (point.length !== 2 || x === undefined || y === undefined) {
        throw new RangeError(`Point ${index} of ${id} isn't a pair of numbers`);
      }
      return [x, y];
    });
  }
}
