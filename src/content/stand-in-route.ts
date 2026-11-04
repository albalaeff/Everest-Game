import standIn from "../../content/route/stand-in.json";
import { SlopePhysics } from "../physics";
import type {
  ClimberLayout,
  LadderLayout,
  RopeLayout,
  SectionAltitude,
  SlopeLayout,
  SlopeSettings,
} from "../physics";
import { MountainClock, ObjectiveHazards } from "../simulation";
import type { ClimberId, ClockStart, HazardStart, Scenario } from "../simulation";

/** A point or a curve's point as the data file keeps it: two numbers. */
type DataPair = readonly number[];

/** The stand-in section as content/route/stand-in.json has it. */
export interface StandInData {
  readonly settings: {
    readonly gravity: number;
    readonly friction: number;
    readonly cowstail: number;
    readonly walkingSpeed: readonly DataPair[];
    readonly slipChance: readonly DataPair[];
    readonly ladderSpeed: readonly DataPair[];
    readonly ladderSlipChance: readonly DataPair[];
    readonly knock: number;
  };
  readonly layout: {
    readonly terrain: readonly DataPair[];
    readonly altitude: SectionAltitude;
    readonly ropes: readonly RopeLayout[];
    readonly ladders: readonly LadderLayout[];
    readonly climbers: readonly ClimberLayout[];
  };
  readonly hazards: {
    readonly weather: string;
    readonly zones: readonly {
      readonly id: string;
      readonly kind: string;
      readonly from: number;
      readonly to: number;
    }[];
  };
  readonly clock: ClockStart;
}

/**
 * The stand-in section the page plays on until the Khumbu Icefall (#26) brings the real ground and
 * the knowledge base's numbers: its ground and numbers as the physics takes them, its hazards,
 * when its expedition starts, and the scenario that starts on it.
 */
export class StandInRoute {
  /** The player's climber in the stand-in layout. */
  static readonly PLAYER: ClimberId = "player";

  readonly settings: SlopeSettings;
  readonly layout: SlopeLayout;
  /** Its weather and the stretches of it under a hazard, which `ObjectiveHazards.start` checks. */
  readonly hazards: HazardStart;
  readonly clock: ClockStart;

  constructor(data: StandInData = standIn) {
    const { settings, layout, hazards, clock } = data;
    this.settings = {
      gravity: settings.gravity,
      friction: settings.friction,
      cowstail: settings.cowstail,
      walkingSpeed: StandInRoute.pairs(settings.walkingSpeed),
      slipChance: StandInRoute.pairs(settings.slipChance),
      ladderSpeed: StandInRoute.pairs(settings.ladderSpeed),
      ladderSlipChance: StandInRoute.pairs(settings.ladderSlipChance),
      knock: settings.knock,
    };
    this.layout = {
      terrain: StandInRoute.pairs(layout.terrain),
      altitude: layout.altitude,
      ropes: layout.ropes,
      ladders: layout.ladders,
      climbers: layout.climbers,
    };
    this.hazards = hazards as HazardStart;
    this.clock = clock;
  }

  /** A scenario on the section: the seed, the climbers in the layout's order, the clock at its
   * start. */
  scenario(seed: number): Scenario {
    return {
      seed,
      climbers: this.layout.climbers.map((climber) => climber.id),
      start: {
        [MountainClock.NAME]: MountainClock.start(this.clock),
        [ObjectiveHazards.NAME]: ObjectiveHazards.start(this.hazards),
        [SlopePhysics.NAME]: SlopePhysics.start(this.layout),
      },
    };
  }

  private static pairs(points: readonly DataPair[]): (readonly [number, number])[] {
    return points.map((point, index) => {
      const [x, y] = point;
      if (point.length !== 2 || x === undefined || y === undefined) {
        throw new RangeError(`Point ${index} of the stand-in route isn't a pair of numbers`);
      }
      return [x, y];
    });
  }
}
