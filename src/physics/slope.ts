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
  /** The chance a walking climber slips, per second, by the steepness ahead. */
  readonly slipChance: readonly SteepnessPoint[];
  /** A climber's speed along a ladder by its steepness the way they go, in m/s: across a
   * crevasse at 0°, up a wall at 90°, and down it at −90°. */
  readonly ladderSpeed: readonly SteepnessPoint[];
  /** The chance a climber on a ladder slips, per second, by its steepness the way they go. */
  readonly ladderSlipChance: readonly SteepnessPoint[];
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
  readonly slipChance: SteepnessCurve;
  readonly ladderSpeed: SteepnessCurve;
  readonly ladderSlipChance: SteepnessCurve;
  readonly substepSeconds = SimulationClock.STEP_SECONDS / Slope.SUBSTEPS;
  /** The section's scale, which reads the altimeter. */
  readonly scale: SectionScale;

  constructor(
    readonly settings: SlopeSettings,
    readonly terrain: Terrain,
    altitude: SectionAltitude,
    readonly ropes: ReadonlyMap<string, Rope>,
    readonly ladders: ReadonlyMap<string, Ladder>,
  ) {
    this.scale = new SectionScale(terrain, altitude);
    const { walkingCost, steepest, walkingPower, fastestWalk, uphillCostShare } = settings;
    this.walking = new Walking(walkingCost, steepest, walkingPower, fastestWalk, uphillCostShare);
    this.slipChance = new SteepnessCurve(settings.slipChance);
    this.ladderSpeed = new SteepnessCurve(settings.ladderSpeed);
    this.ladderSlipChance = new SteepnessCurve(settings.ladderSlipChance);
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
   * nobody is clipped to waits, so the ropes of a whole section cost nothing until used. */
  advance(climbers: readonly Climber[], moment: Moment): void {
    const { gravity, friction } = this.settings;
    const clipped = new Set(climbers.flatMap((climber) => climber.ropes));
    const ropes = [...this.ropes.values()].filter((rope) => clipped.has(rope) || !rope.resting);
    for (const climber of climbers) {
      climber.walk(this, moment);
      climber.beginStep();
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
