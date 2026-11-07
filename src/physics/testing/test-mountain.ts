import { SimulationClock } from "../../simulation";
import type { Scenario } from "../../simulation";
import type { SectionAltitude } from "../section-scale";
import { SlopePhysics } from "../slope-physics";
import type {
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
  /** Friction 0.4 holds a slide on ground up to about 22°, and slips start past 25°. A whole
   * stride walks the flat at the fastest walk, 1 m/s, on all its power; down a gentle slope at
   * it on less, and up one slower; past 45°, each metre of height costs the same. */
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
    slipChance: [
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
    ladderSlipChance: [[0, 0.05]],
    knock: 3,
    arrestSpeed: 5,
    axeReach: 1.5,
  };
  /** Nobody ever slips. */
  static readonly CALM: SlopeSettings = {
    ...TestMountain.SETTINGS,
    slipChance: [[0, 0]],
    ladderSlipChance: [[0, 0]],
  };
  /** Every step taken on any ground, or on a ladder, is a slip. */
  static readonly HARSH: SlopeSettings = {
    ...TestMountain.SETTINGS,
    slipChance: [[0, SimulationClock.STEPS_PER_SECOND]],
    ladderSlipChance: [[0, SimulationClock.STEPS_PER_SECOND]],
  };
  /** A slip now and then on steep ground, about once in 13 seconds on a 40° slope. */
  static readonly FIRM: SlopeSettings = {
    ...TestMountain.CALM,
    slipChance: [
      [-45, 0.1],
      [-25, 0],
      [25, 0],
      [45, 0.1],
    ],
  };
  /** Nobody slips but on a ladder, where it's about once a second. */
  static readonly ICY_LADDERS: SlopeSettings = {
    ...TestMountain.CALM,
    ladderSlipChance: [[0, 1]],
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
   * `altitude` says otherwise. */
  layout(
    climbers: readonly ClimberLayout[],
    ropes: readonly RopeLayout[] = [],
    ladders: readonly LadderLayout[] = [],
    altitude: SectionAltitude = this.lifeSize,
  ): SlopeLayout {
    return { terrain: this.ground, altitude, ropes, ladders, climbers };
  }

  /** The ends' altitudes with the ground drawn at life size: `FOOT`, and the rise above it. */
  private get lifeSize(): SectionAltitude {
    const terrain = this.terrain;
    const rise = terrain.point(terrain.length).y - terrain.point(0).y;
    return { start: TestMountain.FOOT, end: TestMountain.FOOT + rise };
  }
}
