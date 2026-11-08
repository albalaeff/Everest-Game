import { SimulationClock } from "../../simulation";
import type { Scenario } from "../../simulation";
import type { SectionAltitude } from "../section-scale";
import { SlopePhysics } from "../slope-physics";
import type {
  AlongStretch,
  ClimberLayout,
  LadderLayout,
  RopeLayout,
  SlopeLayout,
  SlopeSettings,
} from "../slope-physics";
import type { SnowLayout } from "../snow";
import { Terrain } from "../terrain";
import type { Pair } from "../terrain";

/**
 * Ground and numbers for the slope physics' tests: each mountain is a piece of ground to lay a
 * section out on. They're made up, and aren't game data: the game's numbers come from the
 * knowledge base (docs/conventions/slope-physics.md). Only tests import it.
 */
export class TestMountain {
  /** The altitude of every test mountain's foot. A layout is drawn at life size unless it says
   * otherwise: a climber's altitude is this and their height on the picture. */
  static readonly FOOT = 5000;
  /** Friction 0.4 holds a slide on ground up to about 22°, and footing goes past 25°: two whole
   * footings a second on 45°, so a slip comes at once there. A whole stride walks the flat at the
   * fastest walk, 1 m/s, on all its power; down a gentle slope at it on less, and up one slower;
   * past 45°, each metre of height costs the same. Footing comes back only standing still, a
   * whole of it a second; there's no ice, and no ladder bounces, unless a test lays them; and no
   * landing kills, unless a test says so. */
  static readonly SETTINGS: SlopeSettings = {
    gravity: 9.8,
    friction: 0.4,
    cowstail: 0.8,
    walkingCost: [
      [-1, 2],
      [-0.1, 0.5],
      [0, 1],
      [0.27, 1.3],
      [1, 2.6],
    ],
    steepest: 60,
    walkingPower: 1,
    fastestWalk: 1,
    uphillCostShare: 1,
    footingLoss: [
      [-45, 2],
      [-25, 0],
      [25, 0],
      [45, 2],
    ],
    ladderSpeed: [
      [-90, 0.4],
      [0, 0.5],
      [90, 0.3],
    ],
    ladderFootingLoss: [[0, 0.05]],
    footing: {
      still: 1,
      moving: 0,
      ice: 0,
      iceSteep: 0,
      iceFriction: 0.1,
      bounce: { excite: 0, damp: 1, loss: 0 },
      afterSlip: 0.5,
      crampon: { looseAfter: 2, loose: 0.3, refit: 1 },
    },
    lethalLanding: 1000,
    climbBack: 0.5,
    knock: 3,
    arrestSpeed: 5,
    axeReach: 1.5,
  };
  /** Nobody ever slips. */
  static readonly CALM: SlopeSettings = {
    ...TestMountain.SETTINGS,
    footingLoss: [[0, 0]],
    ladderFootingLoss: [[0, 0]],
  };
  /** Every step taken on any ground, or on a ladder, takes all of a climber's footing: a slip. */
  static readonly HARSH: SlopeSettings = {
    ...TestMountain.SETTINGS,
    footingLoss: [[0, SimulationClock.STEPS_PER_SECOND]],
    ladderFootingLoss: [[0, SimulationClock.STEPS_PER_SECOND]],
  };
  /** A slip now and then on steep ground: after about 13 seconds of walking a 40° slope. */
  static readonly FIRM: SlopeSettings = {
    ...TestMountain.CALM,
    footingLoss: [
      [-45, 0.1],
      [-25, 0],
      [25, 0],
      [45, 0.1],
    ],
  };
  /** Nobody slips but on a ladder, where a second on it takes all of a climber's footing. */
  static readonly ICY_LADDERS: SlopeSettings = {
    ...TestMountain.CALM,
    ladderFootingLoss: [[0, 1]],
  };
  /** Snow costs nothing, but each second on blue ice takes half of a climber's footing on the
   * level at a whole stride, and a moving climber gets back a fifth of it at a steady pace's
   * sureness: on ice, a steady climber slips after a few seconds and one at three times the
   * sureness doesn't. A ladder across bounces as it's walked; and a landing faster than 12 m/s,
   * a drop of about 7 m, kills. */
  static readonly SLIPPERY: SlopeSettings = {
    ...TestMountain.CALM,
    footing: {
      still: 1,
      moving: 0.2,
      ice: 0.5,
      iceSteep: 2,
      iceFriction: 0.05,
      bounce: { excite: 0.5, damp: 1, loss: 0.15 },
      afterSlip: 0.5,
      crampon: { looseAfter: 2, loose: 0.3, refit: 1 },
    },
    lethalLanding: 12,
  };
  /** Snow to lay on a test mountain's ground: hummocks 3 m long rising 20 cm, and the crust's
   * bumps on them, level a metre round the walls and the ladders and rising over 2 m past. */
  static readonly SNOW: SnowLayout = {
    waves: [
      { length: 3, height: 0.2 },
      { length: 1, height: 0.05 },
    ],
    rounding: 1,
    margin: 1,
    blend: 2,
    seed: 1,
    level: [],
  };

  /** A hundred metres of flat ground. */
  static readonly FLAT = new TestMountain([
    [0, 0],
    [100, 0],
  ]);
  /** A run-out of 40 m, a 40° slope 65.3 m long, and a ledge above it. */
  static readonly SLOPE = new TestMountain([
    [0, 0],
    [40, 0],
    [90, 42],
    [120, 42],
  ]);
  /** A 15° slope, where friction holds a slide. */
  static readonly GENTLE = new TestMountain([
    [0, 0],
    [100, 26.8],
  ]);
  /** Steeper than the test's 45°: 21 m up over 20 m across, 29 m long, then 4 up over 3, and a
   * ledge. */
  static readonly STEEP = new TestMountain([
    [0, 0],
    [20, 21],
    [35, 41],
    [60, 41],
  ]);
  /** Flat ground with a crevasse 3 m wide and 30 m deep, from x = 20 to 23. */
  static readonly CREVASSE = new TestMountain([
    [0, 0],
    [20, 0],
    [20, -30],
    [23, -30],
    [23, 0],
    [50, 0],
  ]);
  /** Flat ground up to a wall 10 m high at x = 20, and flat above it: its foot is 20 m along the
   * ground, and its top 30 m. */
  static readonly WALL = new TestMountain([
    [0, 0],
    [20, 0],
    [20, 10],
    [50, 10],
  ]);

  private constructor(readonly ground: readonly Pair[]) {}

  /** Where `metres` up the 40° slope of `SLOPE` is, along its ground. */
  static upTheSlope(metres: number): number {
    return 40 + metres;
  }

  /** A scenario: the seed, and who climbs, in the layout's order. */
  static scenario(seed: number, layout: SlopeLayout): Scenario {
    const climbers = layout.climbers.map((climber) => climber.id);
    return { seed, climbers, start: { [SlopePhysics.NAME]: SlopePhysics.start(layout) } };
  }

  get terrain(): Terrain {
    return new Terrain(this.ground);
  }

  /** A section on this ground, with these climbers, ropes and ladders, drawn at life size unless
   * `altitude` says otherwise, and its `ice`, if any. */
  layout(
    climbers: readonly ClimberLayout[],
    ropes: readonly RopeLayout[] = [],
    ladders: readonly LadderLayout[] = [],
    altitude: SectionAltitude = this.lifeSize,
    ice: readonly AlongStretch[] = [],
  ): SlopeLayout {
    return {
      terrain: this.ground,
      ...(ice.length === 0 ? {} : { ice }),
      altitude,
      ropes,
      ladders,
      climbers,
    };
  }

  /** The ends' altitudes with the ground drawn at life size: `FOOT`, and the rise above it. */
  private get lifeSize(): SectionAltitude {
    const terrain = this.terrain;
    const rise = terrain.point(terrain.length).y - terrain.point(0).y;
    return { start: TestMountain.FOOT, end: TestMountain.FOOT + rise };
  }
}
