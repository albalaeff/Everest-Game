import { SeededRandom } from "../simulation";
import { Terrain } from "./terrain";
import type { Pair } from "./terrain";

/** A stretch of the ground, by how far along it its ends are. */
export type Stretch = {
  readonly from: number;
  readonly to: number;
};

/** One of the waves the snow rises and falls in: its length, and how high its crests rise. */
export type SnowWave = {
  readonly length: number;
  readonly height: number;
};

/** How the snow lies on a section's line, in metres, as the section's file gives it and saves
 * keep it. */
export type SnowLayout = {
  /** The waves it rises and falls in, from the long swells to the crust's own bumps. */
  readonly waves: readonly SnowWave[];
  /** How far each side of a break of slope it evens the line out. */
  readonly rounding: number;
  /** How far round a wall, a ladder or a level stretch it lies on the line, and how far past
   * that it takes to rise to its full relief. */
  readonly margin: number;
  readonly blend: number;
  /** Its draw: the same seed, the same snow. */
  readonly seed: number;
  /** Where else it lies on the line: the camps' stretches. */
  readonly level: readonly Stretch[];
};

/** A break of slope the snow rounds: where it is across, and how much steeper the line goes on. */
interface Bend {
  readonly x: number;
  readonly turn: number;
}

/** A stretch across, in metres, where the snow lies on the line. */
interface Flat {
  readonly from: number;
  readonly to: number;
}

/**
 * How far the snow lies above its line at each point across: the line's hollows filled and its
 * edges rounded, as snow lies on a break of slope, and over it the swells and hummocks of a
 * glacier's snow, from the seeded generator of its own. By every wall, along every ladder and over
 * every level stretch it lies on the line, and it rises smoothly to its full relief past them.
 */
class Relief {
  /** How many random heights each wave has, before it repeats: hundreds of metres. */
  private static readonly KNOTS = 512;

  private readonly flats: readonly Flat[];
  private readonly bends: readonly Bend[];
  private readonly knots: readonly (readonly number[])[];

  constructor(
    line: Terrain,
    private readonly layout: SnowLayout,
    ladders: readonly Stretch[],
  ) {
    const { rounding, margin, blend, waves, seed } = layout;
    if (!(rounding > 0 && margin >= 0 && blend > 0 && waves.every(({ length }) => length > 0))) {
      throw new RangeError("The snow needs its rounding, its blend and its waves' lengths");
    }
    const across = ({ from, to }: Stretch): Flat => {
      if (!(from >= 0 && from <= to && to <= line.length)) {
        throw new RangeError(`The snow lies level from ${from} to ${to} m along, off the ground`);
      }
      return { from: line.point(from).x, to: line.point(to).x };
    };
    const flats = [...ladders, ...layout.level].map(across);
    const bends: Bend[] = [];
    const { points } = line;
    for (const [index, [x, y]] of points.entries()) {
      const before = points[index - 1];
      const after = points[index + 1];
      if (before?.[0] === x) {
        flats.push({ from: x, to: x });
      }
      if (before === undefined || after === undefined || before[0] === x || after[0] === x) {
        continue;
      }
      const slopeIn = (y - before[1]) / (x - before[0]);
      const slopeOut = (after[1] - y) / (after[0] - x);
      bends.push({ x, turn: slopeOut - slopeIn });
    }
    this.flats = flats.map(({ from, to }) => ({ from: from - margin, to: to + margin }));
    this.bends = bends;
    const random = SeededRandom.fromSeed(seed);
    this.knots = waves.map(() =>
      Array.from({ length: Relief.KNOTS }, () => random.fraction() * 2 - 1),
    );
  }

  /** How far the snow lies above the line at `x`: below it on a rounded edge. */
  lift(x: number): number {
    const share = this.share(x);
    if (share === 0) {
      return 0;
    }
    const { rounding, waves } = this.layout;
    let lift = 0;
    for (const { x: at, turn } of this.bends) {
      const away = Math.abs(x - at);
      if (away < rounding) {
        // The line averaged over the rounding's reach, less the line: a parabola either side.
        lift += (turn * (rounding - away) * (rounding - away)) / (4 * rounding);
      }
    }
    for (const [index, { length, height }] of waves.entries()) {
      lift += height * this.wave(this.knots[index] ?? [], x / length);
    }
    return lift * share;
  }

  /** How much of its relief the snow has at `x`: none on a level stretch, all of it a blend's
   * width past one, rising smoothly between. */
  private share(x: number): number {
    let away = Infinity;
    for (const { from, to } of this.flats) {
      away = Math.min(away, x < from ? from - x : x > to ? x - to : 0);
    }
    const share = Math.min(away / this.layout.blend, 1);
    return share * share * (3 - 2 * share);
  }

  /** A wave's height at `place`, in its own lengths: its random heights at each whole length,
   * eased from one to the next, between −1 and 1. */
  private wave(knots: readonly number[], place: number): number {
    const count = knots.length;
    if (count === 0) {
      return 0;
    }
    const below = Math.floor(place);
    const share = place - below;
    const index = ((below % count) + count) % count;
    const from = knots[index] ?? 0;
    const to = knots[(index + 1) % count] ?? 0;
    const eased = share * share * (3 - 2 * share);
    return from + (to - from) * eased;
  }
}

/**
 * The snow on a section's line (#168, docs/conventions/slope-physics.md → The slope): a ground of
 * its own, its points `STEP` apart across, the walls upright as the line has them. It's measured
 * along the line under it, so whatever the layout lays by how far along the ground, a ladder's
 * end, a rope's anchor, a camp, a hazard or a climber, stays where it was; and it turns only at
 * the line's corners, so a step stops there and walks the snow's slope where it sets off.
 */
export class Snow extends Terrain {
  /** How far apart across its points are: the engine's number, how finely the physics works the
   * snow out, not the mountain's. */
  static readonly STEP = 0.25;

  /** The snow as `layout` lays it on `line`, level along each of `ladders` too. */
  constructor(line: Terrain, layout: SnowLayout, ladders: readonly Stretch[] = []) {
    const { points, alongs } = Snow.laid(line, new Relief(line, layout, ladders));
    super(points, { alongs, corners: line.corners });
  }

  /** The snow's points over the line, and how far along the line each is: every `STEP` across
   * each of its segments, and each of its corners, a wall's top and foot as they are. */
  private static laid(
    line: Terrain,
    relief: Relief,
  ): { readonly points: readonly Pair[]; readonly alongs: readonly number[] } {
    const points: Pair[] = [];
    const alongs: number[] = [];
    for (const [index, [x, y]] of line.points.entries()) {
      const along = line.alongs[index] ?? 0;
      const before = line.points[index - 1];
      const start = line.alongs[index - 1];
      if (before !== undefined && start !== undefined && x > before[0]) {
        const [fromX, fromY] = before;
        const steps = Math.ceil((x - fromX) / Snow.STEP);
        for (let step = 1; step < steps; step += 1) {
          const share = step / steps;
          const across = fromX + (x - fromX) * share;
          points.push([across, fromY + (y - fromY) * share + relief.lift(across)]);
          alongs.push(start + (along - start) * share);
        }
      }
      points.push([x, y + relief.lift(x)]);
      alongs.push(along);
    }
    return { points, alongs };
  }
}
