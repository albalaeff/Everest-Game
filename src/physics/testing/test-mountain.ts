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
  /** A chance a metre that makes every step slip, however short. */
  static readonly SURE = 1e9;
  /** The altitude of every test mountain's foot. A layout is drawn at life size unless it says
   * otherwise: a climber's altitude is this and their height on the picture. */
  static readonly FOOT = 5000;
  /** Friction 0.4 holds a slide on ground up to about 22°, and slips come past 25°: on 45° every
   * step slips. A whole stride walks the flat at the fastest walk, 1 m/s, on all its power; down a
   * gentle slope at it on less, and up one slower; past 45°, each metre of height costs the same.
   * A ladder's rungs slip a twentieth of the time a metre; there's no ice, and no ladder bounces,
   * unless a test lays them; and no landing kills, unless a test says so. A clip goes on at once,
   * standing still never slips, and nobody passing anyone jolts them (#197), unless a test says
   * so. No landing hurts, unless a test says so (#241): then every hard one does, a leg on ground
   * a climber could stand on and an arm on a face; a rescue's anchor takes 4 s, a tourniquet 1,
   * a splint 3 and a wrap 2, a lift 1, a whole stride hauls a casualty up a rescue line at
   * 0.5 m/s, and a rescuer carries one at half their stride. */
  static readonly SETTINGS: SlopeSettings = {
    gravity: 9.8,
    friction: 0.4,
    cowstail: 0.8,
    clip: 0,
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
    pace: 1,
    uphillCostShare: 1,
    slipChance: [
      [-45, TestMountain.SURE],
      [-25, 0],
      [25, 0],
      [45, TestMountain.SURE],
    ],
    ladderSpeed: [
      [-90, 0.4],
      [0, 0.5],
      [90, 0.3],
    ],
    ladderSlipChance: [[0, 0.05]],
    footing: {
      ice: 0,
      iceSteep: 0,
      iceFriction: 0.1,
      bounce: { excite: 0, damp: 1, slip: 0, held: 0.5 },
      crampon: { looseAfter: 2, loose: 0.3, refit: 1 },
      still: { steepness: 30, frontPoints: 0, bounce: 0, bounceFrom: 1 },
      braced: 0.5,
      passing: { near: 1, slip: 0 },
    },
    lethalLanding: 1000,
    climbBack: 0.5,
    rappel: 1,
    ladderBreak: { creak: 1, reset: 10 },
    haul: { speed: 0.5, reach: 3 },
    knock: 3,
    arrestSpeed: 5,
    axeReach: 1.5,
    iceClimb: {
      speed: 0.5,
      oneTool: 0.5,
      reach: 2.2,
      lockOff: 1.4,
      stretch: 2,
      snap: 0.6,
      overLip: 0.5,
      slip: 0,
      oneToolSlip: 4,
      poor: 5,
      swingSlip: 0,
      hang: 0.5,
    },
    injury: {
      sprain: 1000,
      fracture: 1000,
      open: 1000,
      unhurt: { soft: 0, hard: 0 },
      leg: { flat: 1, steep: 0 },
      sore: 0.5,
      wrapped: 0.8,
    },
    rescue: {
      reach: 1.5,
      anchor: 4,
      aid: { tourniquet: 1, splint: 3, wrap: 2 },
      haul: 0.5,
      lift: 1,
      carry: 0.5,
    },
  };
  /** Nobody ever slips. */
  static readonly CALM: SlopeSettings = {
    ...TestMountain.SETTINGS,
    slipChance: [[0, 0]],
    ladderSlipChance: [[0, 0]],
  };
  /** Every step taken on any ground, or on a ladder, slips. */
  static readonly HARSH: SlopeSettings = {
    ...TestMountain.SETTINGS,
    slipChance: [[0, TestMountain.SURE]],
    ladderSlipChance: [[0, TestMountain.SURE]],
  };
  /** A slip now and then on steep ground: about one in 13 m of a 40° slope. */
  static readonly FIRM: SlopeSettings = {
    ...TestMountain.CALM,
    slipChance: [
      [-45, 0.1],
      [-25, 0],
      [25, 0],
      [45, 0.1],
    ],
  };
  /** Nobody slips but on a ladder, where every step slips. */
  static readonly ICY_LADDERS: SlopeSettings = {
    ...TestMountain.CALM,
    ladderSlipChance: [[0, TestMountain.SURE]],
  };
  /** Snow never slips, but a metre of blue ice on the level does one time in five at a steady
   * pace, and one in two on a slope of 30°: a steady climber slips within a few metres of it,
   * and one twenty times as sure-footed seldom does. A ladder across bounces as it's walked, each
   * unit of it adding a tenth to a metre's chance; and a landing faster than 12 m/s, a drop of
   * about 7 m, kills. */
  static readonly SLIPPERY: SlopeSettings = {
    ...TestMountain.CALM,
    footing: {
      ...TestMountain.CALM.footing,
      ice: 0.2,
      iceSteep: 3,
      iceFriction: 0.05,
      bounce: { excite: 0.5, damp: 1, slip: 0.1, held: 0.5 },
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
