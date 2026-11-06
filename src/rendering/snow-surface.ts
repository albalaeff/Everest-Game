import type { Point, Terrain } from "../physics";
import { SeededRandom } from "../simulation";

/** A stretch of the ground, in metres across, where the snow lies on the physics' line. */
export interface Level {
  readonly from: number;
  readonly to: number;
}

/** One of the waves the snow rises and falls in: its length, and how high its crests rise. */
export interface SnowWave {
  readonly length: number;
  readonly height: number;
}

/** A break of slope the snow rounds: where it is, and how much steeper the ground goes on. */
interface Bend {
  readonly x: number;
  readonly turn: number;
}

/**
 * The snow's surface as the picture draws it (#168): the physics' ground with its hollows filled
 * and its edges rounded, as snow lies on a break of slope, and over it the swells and hummocks of
 * a glacier's snow, a few tens of centimetres high, from a seeded generator of the picture's own.
 * By every wall, along every ladder and over every camp it lies on the physics' line, so a ladder's
 * foot, a wall's top and the tents meet the snow there. It's the picture's alone: the physics walks
 * its own line, whose gradients set the effort (#150), and what lies on the ground, the ropes, the
 * tents and the climbers, is drawn on the snow.
 */
export class SnowSurface {
  /** The waves of the snow, from the long swells to the crust's own bumps. */
  static readonly WAVES: readonly SnowWave[] = [
    { length: 12, height: 0.3 },
    { length: 5, height: 0.14 },
    { length: 2.2, height: 0.06 },
    { length: 0.9, height: 0.025 },
  ];
  /** How far each side of a break of slope the snow evens it out. */
  static readonly ROUNDING = 1.5;
  /** How far round a wall, a ladder or a camp the snow lies on the line, and how far past that
   * it takes to rise to its full relief. */
  static readonly MARGIN = 1;
  static readonly BLEND = 2.5;
  /** Metres between the outline's points. */
  static readonly STEP = 0.25;
  /** How many random heights each wave has, before it repeats: hundreds of metres. */
  private static readonly KNOTS = 512;

  private readonly level: readonly Level[];
  private readonly bends: readonly Bend[];
  private readonly knots: readonly (readonly number[])[];

  constructor(
    private readonly terrain: Terrain,
    level: readonly Level[],
    seed: number,
    private readonly waves: readonly SnowWave[] = SnowSurface.WAVES,
  ) {
    const walls: Level[] = [];
    const bends: Bend[] = [];
    const { points } = terrain;
    for (const [index, [x, y]] of points.entries()) {
      const before = points[index - 1];
      const after = points[index + 1];
      if (before?.[0] === x) {
        walls.push({ from: x, to: x });
      }
      if (before === undefined || after === undefined || before[0] === x || after[0] === x) {
        continue;
      }
      const slopeIn = (y - before[1]) / (x - before[0]);
      const slopeOut = (after[1] - y) / (after[0] - x);
      bends.push({ x, turn: slopeOut - slopeIn });
    }
    this.level = [...walls, ...level].map(({ from, to }) => ({
      from: Math.min(from, to) - SnowSurface.MARGIN,
      to: Math.max(from, to) + SnowSurface.MARGIN,
    }));
    this.bends = bends;
    const random = SeededRandom.fromSeed(seed);
    this.knots = waves.map(() =>
      Array.from({ length: SnowSurface.KNOTS }, () => random.fraction() * 2 - 1),
    );
  }

  /** How far the snow lies above the physics' ground at `x`: below it on a rounded edge. */
  lift(x: number): number {
    const share = this.share(x);
    if (share === 0) {
      return 0;
    }
    let lift = 0;
    for (const { x: at, turn } of this.bends) {
      const away = Math.abs(x - at);
      const reach = SnowSurface.ROUNDING;
      if (away < reach) {
        // The ground averaged over the rounding's reach, less the ground: a parabola either side.
        lift += (turn * (reach - away) * (reach - away)) / (4 * reach);
      }
    }
    for (const [index, { length, height }] of this.waves.entries()) {
      lift += height * this.wave(this.knots[index] ?? [], x / length);
    }
    return lift * share;
  }

  /** The snow's height at `x`: on a wall, its top's. */
  height(x: number): number {
    return this.terrain.height(x) + this.lift(x);
  }

  /** A point that lies on the physics' ground, moved onto the snow. */
  onSnow(point: Point): Point {
    return { x: point.x, y: point.y + this.lift(point.x) };
  }

  /** The point of the snow at a distance along the physics' ground. */
  point(along: number): Point {
    return this.onSnow(this.terrain.point(along));
  }

  /** The snow's surface from `from` to `to`, left to right: a point every `STEP` metres across,
   * and each wall upright, its top and its foot. Past the ground's ends it runs on level. */
  outline(from: number, to: number): readonly Point[] {
    const corners = this.terrain.points.map(([x, y]) => ({ x, y }));
    const first = corners[0];
    const last = corners.at(-1);
    if (first === undefined || last === undefined) {
      return [];
    }
    const outline: Point[] = [this.onSnow({ x: from, y: first.y })];
    const along = (start: Point, end: Point): void => {
      const span = end.x - start.x;
      if (span <= 0) {
        if (end.x === start.x && end.y !== start.y) {
          outline.push(this.onSnow(end));
        }
        return;
      }
      const steps = Math.ceil(span / SnowSurface.STEP);
      for (let step = 1; step <= steps; step += 1) {
        const x = start.x + (span * step) / steps;
        const y = start.y + ((end.y - start.y) * step) / steps;
        outline.push(this.onSnow({ x, y }));
      }
    };
    along({ x: from, y: first.y }, first);
    for (const [index, corner] of corners.entries()) {
      const next = corners[index + 1];
      if (next !== undefined) {
        along(corner, next);
      }
    }
    along(last, { x: to, y: last.y });
    return outline;
  }

  /** How much of its relief the snow has at `x`: none on a level stretch, all of it a blend's
   * width past one, rising smoothly between. */
  private share(x: number): number {
    let away = Infinity;
    for (const { from, to } of this.level) {
      away = Math.min(away, x < from ? from - x : x > to ? x - to : 0);
    }
    const share = Math.min(away / SnowSurface.BLEND, 1);
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
