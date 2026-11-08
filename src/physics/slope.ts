import { SimulationClock } from "../simulation";
import type { Moment, Walk } from "../simulation";
import type { Climber } from "./climber";
import type { Ladder } from "./ladder";
import type { Rope, Slide } from "./rope";
import { SectionScale } from "./section-scale";
import type { SectionAltitude } from "./section-scale";
import { SteepnessCurve } from "./steepness";
import type { GradientPoint, SteepnessPoint } from "./steepness";
import type { Point, Terrain, Way } from "./terrain";
import { Walking } from "./walking";

/** A stretch of the ground, by how far along it its ends are: plain data, as saves keep it. */
export type AlongStretch = {
  readonly from: number;
  readonly to: number;
};

/**
 * How a climber keeps their feet (#190): each second they lose footing to what's under them and
 * get it back as far as they're sure-footed, and when it runs out they slip. All a second at a
 * sure-footedness of 1, a careful pace's more and a hurried or tired one's less (`Legs.sureness`).
 */
export interface FootingSettings {
  /** Footing got back a second standing still, and on the move. */
  readonly still: number;
  readonly moving: number;
  /** Footing lost a second walking blue ice on the level, and how much more for each unit of the
   * sine of its slope, up or down. */
  readonly ice: number;
  readonly iceSteep: number;
  /** How hard blue ice holds what slides on it: snow's `friction` for ice. */
  readonly iceFriction: number;
  /** A ladder across a crevasse bounces under the steps on it: how much each metre walked on it
   * sets it going for each metre of its length, how much of it dies away a second, and how much
   * footing a second each unit of it takes from a climber on it. */
  readonly bounce: { readonly excite: number; readonly damp: number; readonly loss: number };
  /** The footing a climber has back once they're up from a slip. */
  readonly afterSlip: number;
  /** A crampon not checked before setting off (#196): the seconds on the move after which it comes
   * loose, on the next ladder; how sure-footed a loose one leaves its climber, a share; and the
   * seconds a refit takes, standing. */
  readonly crampon: { readonly looseAfter: number; readonly loose: number; readonly refit: number };
}

/**
 * The numbers the slope physics runs on, handed to it (docs/conventions.md → Data, not
 * literals): the page and the room server take them from the knowledge base, and the tests have
 * test numbers of their own.
 */
export interface SlopeSettings {
  /** Gravity's pull, in m/s². */
  readonly gravity: number;
  /** How hard snow and ice hold what slides on them, a climber or a rope: the push into the
   * ground times this is how much friction takes from a slide, and its arctangent is the
   * steepest ground that stops one. */
  readonly friction: number;
  /** How far a cowstail reaches from a climber to their rope, in metres. */
  readonly cowstail: number;
  /** The energy a metre of walking takes of each kilogram moved, in J/kg/m, by the gradient
   * ahead: from the steepest measured down to the steepest measured up. */
  readonly walkingCost: readonly GradientPoint[];
  /** The steepest ground a climber walks, up or down, in degrees: steeper up stops them, and
   * steeper down is a fall. */
  readonly steepest: number;
  /** The power a whole stride walks on, in W for each kilogram moved. */
  readonly walkingPower: number;
  /** The fastest a climber walks, in m/s, whatever power they have to spare. */
  readonly fastestWalk: number;
  /** The share of the climb's extra cost, a metre up a slope over a metre on the level, that a
   * stride pays: 1 as measured, less where the game eases the climb. */
  readonly uphillCostShare: number;
  /** The footing a walking climber loses a second, by the steepness ahead, at a whole stride
   * (#190): on snow, before what ice and their care do to it. */
  readonly footingLoss: readonly SteepnessPoint[];
  /** A climber's speed along a ladder by its steepness the way they go, in m/s: across a
   * crevasse at 0°, up a wall at 90°, and down it at −90°. */
  readonly ladderSpeed: readonly SteepnessPoint[];
  /** The footing a climber on a ladder loses a second, by its steepness the way they go: the
   * rungs' own, before a crossing's bounce. */
  readonly ladderFootingLoss: readonly SteepnessPoint[];
  /** How a climber keeps their feet, gets them back, and loses them. */
  readonly footing: FootingSettings;
  /** The speed a falling body hits the ground at, in m/s, past which the fall kills: life size,
   * as the falls are. */
  readonly lethalLanding: number;
  /** How fast a climber hanging on their rope climbs back up it to where they slipped, at a whole
   * stride, in m/s. */
  readonly climbBack: number;
  /** How fast a hazard that goes throws a climber down the slope, in m/s. */
  readonly knock: number;
  /** The fastest slide a climber can stop with the ice axe driven into the slope, in m/s:
   * self-arrest works in a slide's first moments, or not at all. */
  readonly arrestSpeed: number;
  /** How far from their body a sliding climber can drive the ice axe in, in metres. */
  readonly axeReach: number;
}

/**
 * The ground with its ropes and ladders, and how everything on them moves in a step: the climbers
 * walk, the falling bodies move in sub-steps of Verlet integration, held by their ropes and the
 * ground, then the ropes move in one, pulled after their climbers.
 */
export class Slope {
  /** Sub-steps of a step for a falling body, and the constraints' rounds in each: the engine's
   * numbers, not the mountain's. Short sub-steps keep a fast body from passing through a wall.
   * A rope holds its climber by its length alone (`Rope`), so it can move in whole steps. */
  static readonly SUBSTEPS = 10;
  static readonly ITERATIONS = 4;
  /** Slower than this, in metres a second, a body on the ground lies still, and so does a rope
   * nobody is clipped to, which then waits for someone to move it: the engine's number too. */
  static readonly REST_SPEED = 0.01;

  readonly walking: Walking;
  readonly footingLoss: SteepnessCurve;
  readonly ladderSpeed: SteepnessCurve;
  readonly ladderFootingLoss: SteepnessCurve;
  readonly substepSeconds = SimulationClock.STEP_SECONDS / Slope.SUBSTEPS;
  /** The section's scale, which reads the altimeter. */
  readonly scale: SectionScale;

  constructor(
    readonly settings: SlopeSettings,
    readonly terrain: Terrain,
    altitude: SectionAltitude,
    readonly ropes: ReadonlyMap<string, Rope>,
    readonly ladders: ReadonlyMap<string, Ladder>,
    /** The stretches of the ground that are bare blue ice, not snow. */
    private readonly ice: readonly AlongStretch[] = [],
  ) {
    this.scale = new SectionScale(terrain, altitude);
    const { walkingCost, steepest, walkingPower, fastestWalk, uphillCostShare } = settings;
    this.walking = new Walking(walkingCost, steepest, walkingPower, fastestWalk, uphillCostShare);
    this.footingLoss = new SteepnessCurve(settings.footingLoss);
    this.ladderSpeed = new SteepnessCurve(settings.ladderSpeed);
    this.ladderFootingLoss = new SteepnessCurve(settings.ladderFootingLoss);
  }

  rope(id: string): Rope {
    const rope = this.ropes.get(id);
    if (rope === undefined) {
      throw new RangeError(`There's no rope ${id} on the slope`);
    }
    return rope;
  }

  ladder(id: string): Ladder {
    const ladder = this.ladders.get(id);
    if (ladder === undefined) {
      throw new RangeError(`There's no ladder ${id} on the slope`);
    }
    return ladder;
  }

  /** The ladder a climber standing at `along` steps onto, walking `direction`: one with an end
   * there that the direction goes along it from. */
  ladderFrom(along: number, direction: Walk["direction"]): Ladder | null {
    for (const ladder of this.ladders.values()) {
      const way = ladder.way(direction);
      if (way !== 0 && ladder.into(along) === way) {
        return ladder;
      }
    }
    return null;
  }

  /** Whether the ground at `along` is bare blue ice. */
  onIce(along: number): boolean {
    return this.ice.some(({ from, to }) => along >= from && along <= to);
  }

  /** How hard the ground at `point` holds what slides on it: snow's friction, or ice's. */
  frictionAt(point: Point): number {
    const { friction, footing } = this.settings;
    return this.ice.length > 0 && this.onIce(this.terrain.nearest(point).along)
      ? footing.iceFriction
      : friction;
  }

  /** Whether the ground `way` from `along` is under a ladder, which walking crosses on instead. */
  underLadder(along: number, way: Way): boolean {
    return [...this.ladders.values()].some((ladder) => ladder.into(along) === way);
  }

  /** Where a step `way` from `along` stops: at the next corner of the ground or end of a ladder. */
  stopAhead(along: number, way: Way): number {
    let stop = this.terrain.cornerAhead(along, way);
    for (const ladder of this.ladders.values()) {
      for (const end of ladder.ends) {
        const nearer = way > 0 ? end > along && end < stop : end < along && end > stop;
        if (nearer) {
          stop = end;
        }
      }
    }
    return stop;
  }

  /** The rope nearest a climber within a cowstail's reach, if any, and where on it. */
  ropeWithin(climber: Point): { readonly rope: Rope; readonly slide: Slide } | null {
    let found: { readonly rope: Rope; readonly slide: Slide; readonly distance: number } | null =
      null;
    for (const rope of this.ropes.values()) {
      const { slide, distance } = rope.nearest(climber);
      if (distance <= this.settings.cowstail && distance < (found?.distance ?? Infinity)) {
        found = { rope, slide, distance };
      }
    }
    return found;
  }

  /** One step for every climber on it, in the scenario's order. A rope that lay still and
   * nobody is clipped to waits, so the ropes of a whole section cost nothing until used. The
   * ladders' bounce dies away after the climbers' steps set it going. */
  advance(climbers: readonly Climber[], moment: Moment): void {
    const { gravity, friction, footing } = this.settings;
    const clipped = new Set(climbers.flatMap((climber) => climber.ropes));
    const ropes = [...this.ropes.values()].filter((rope) => clipped.has(rope) || !rope.resting);
    for (const climber of climbers) {
      climber.walk(this, moment);
      climber.beginStep();
    }
    for (const ladder of this.ladders.values()) {
      ladder.settle(SimulationClock.STEP_SECONDS, footing.bounce.damp);
    }
    for (let substep = 0; substep < Slope.SUBSTEPS; substep += 1) {
      for (const climber of climbers) {
        climber.integrate(this);
      }
      for (let round = 0; round < Slope.ITERATIONS; round += 1) {
        for (const climber of climbers) {
          climber.holdOn(this);
          climber.land(this);
        }
      }
      for (const climber of climbers) {
        climber.note(this);
      }
    }
    for (const rope of ropes) {
      rope.integrate(gravity, SimulationClock.STEP_SECONDS);
    }
    for (let round = 0; round < Slope.ITERATIONS; round += 1) {
      for (const climber of climbers) {
        climber.pullRopes(this);
      }
      for (const rope of ropes) {
        rope.relax();
        rope.land(this.terrain, friction);
      }
    }
    for (const rope of ropes) {
      rope.rest(Slope.REST_SPEED * SimulationClock.STEP_SECONDS);
    }
    for (const climber of climbers) {
      climber.slide(this);
      climber.settle(this);
    }
  }
}
