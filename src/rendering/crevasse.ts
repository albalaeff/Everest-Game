import type { Point, Terrain } from "../physics";
import { SeededRandom } from "../simulation";
import { Cornice } from "./cornice";
import { Wander } from "./wander";

/**
 * A crevasse a ladder crosses, as the picture draws it (#184): its inside, from one lip down its
 * wall, along its foot and up the other, where the light goes blue and then black, its walls
 * rougher than the ground's line by a hand's breadth, as broken ice is; along each wall
 * a band of ice the light comes through, bright at the top and dark below; a lip of snow standing
 * out over the void on each side, icicles hanging from it; and snow plugging its foot and lying on
 * its gentler steps. Laid out once by a seeded generator of the picture's own; its sizes are the
 * drawing's numbers.
 */
export class Crevasse {
  /** How far into the ice along each wall the light through it shows, from the least to the
   * most, and how long its waves are. */
  static readonly RIM = { min: 0.12, max: 0.45 };
  private static readonly RIM_EVERY = 1.6;
  /** How deep the snow plugging its foot lies, and how thick the crust on a step. */
  static readonly PLUG = { min: 0.3, max: 0.8 };
  static readonly CRUST = 0.1;
  /** The steepest step of a wall that holds snow, as its rise over its run. */
  private static readonly HOLDS_SNOW = 1.4;
  /** How rough its walls are drawn: a corner every so many metres down them, as far as this
   * either side of the ground's line. */
  static readonly ROUGH_EVERY = 0.45;
  static readonly ROUGH = 0.12;
  /** How near two lengths along the ground are to be the same point. */
  private static readonly SAME_ALONG = 1e-9;

  /** The inside as the ground has it, from the left lip down, along the foot and up to the right
   * lip. */
  readonly outline: readonly Point[];
  /** The inside as the picture draws it, its walls rough. */
  readonly inside: readonly Point[];
  /** How deep it goes under its higher lip. */
  readonly depth: number;
  /** The lit ice along each wall, closed: the left wall's, then the right's. */
  readonly rims: readonly (readonly Point[])[];
  /** The snow on each lip: the left, then the right. */
  readonly cornices: readonly Cornice[];
  /** The snow at its foot and on its gentler steps, each closed. */
  readonly snow: readonly (readonly Point[])[];

  /** The crevasse a ladder crosses from `start` to `finish`, on `terrain`. */
  constructor(terrain: Terrain, start: Point, finish: Point, seed: number) {
    const [left, right] =
      terrain.nearest(start).along <= terrain.nearest(finish).along
        ? [start, finish]
        : [finish, start];
    const from = terrain.nearest(left).along + Crevasse.SAME_ALONG;
    const to = terrain.nearest(right).along - Crevasse.SAME_ALONG;
    const between = terrain.points.flatMap(([x, y], index) => {
      const along = terrain.alongs[index] ?? from;
      return along > from && along < to ? [{ x, y }] : [];
    });
    const outline = [left, ...between, right];
    const foot = Math.min(...outline.map(({ y }) => y));
    this.outline = outline;
    this.depth = Math.max(left.y, right.y) - foot;
    const first = outline.findIndex(({ y }) => y === foot);
    const last = outline.findLastIndex(({ y }) => y === foot);
    const random = SeededRandom.fromSeed(seed);
    const rough = new Wander(random, Crevasse.ROUGH_EVERY * 1.5);
    const [leftLine, rightLine] = [outline.slice(0, first + 1), outline.slice(last)];
    const leftWall = Crevasse.rough(leftLine, rough);
    const rightWall = Crevasse.rough(rightLine, rough);
    this.inside = [...leftWall, ...outline.slice(first + 1, last), ...rightWall];
    this.rims = [Crevasse.rim(leftWall, -1, random), Crevasse.rim(rightWall, 1, random)];
    this.cornices = [
      new Cornice(left, 1, (y) => Crevasse.across(leftWall, y), random),
      new Cornice(right, -1, (y) => Crevasse.across(rightWall, y), random),
    ];
    const plug = Crevasse.PLUG.min + random.fraction() * (Crevasse.PLUG.max - Crevasse.PLUG.min);
    const [floorLeft, floorRight] = [outline[first] ?? left, outline[last] ?? right];
    const high = Math.min(foot + plug, left.y, right.y);
    const mid = (floorLeft.x + floorRight.x) / 2;
    const snow: Point[][] = [
      [
        floorLeft,
        { x: Crevasse.across(leftWall, foot + plug * 0.9), y: foot + plug * 0.9 },
        { x: mid, y: high },
        { x: Crevasse.across(rightWall, foot + plug * 0.8), y: foot + plug * 0.8 },
        floorRight,
      ],
    ];
    // The snow lies on the ground's own steps.
    for (const wall of [leftLine, rightLine]) {
      for (const [index, a] of wall.entries()) {
        const b = wall[index + 1];
        if (b === undefined || a.y === foot || b.y === foot || b.x === a.x) {
          continue;
        }
        if (Math.abs(b.y - a.y) <= Crevasse.HOLDS_SNOW * (b.x - a.x)) {
          snow.push(Crevasse.crust(a, b));
        }
      }
    }
    this.snow = snow;
  }

  /** A wall drawn rough: a corner every `ROUGH_EVERY` metres down each of its segments, pushed
   * across it as far as `ROUGH` either way, its own corners where the ground has them. */
  private static rough(wall: readonly Point[], wander: Wander): Point[] {
    const drawn: Point[] = [];
    for (const [index, a] of wall.entries()) {
      drawn.push(a);
      const b = wall[index + 1];
      if (b === undefined) {
        break;
      }
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      const pieces = Math.floor(length / Crevasse.ROUGH_EVERY);
      for (let piece = 1; piece < pieces; piece += 1) {
        const share = piece / pieces;
        const x = a.x + (b.x - a.x) * share;
        const y = a.y + (b.y - a.y) * share;
        const push = Crevasse.ROUGH * wander.at(y + x * 3);
        drawn.push({ x: x + (push * (b.y - a.y)) / length, y: y - (push * (b.x - a.x)) / length });
      }
    }
    return drawn;
  }

  /** The lit band of ice along a wall, `into` the ice (-1 to the left, 1 to the right) by a depth
   * that wanders, closed: down the wall, then back up inside the ice. */
  private static rim(wall: readonly Point[], into: -1 | 1, random: SeededRandom): Point[] {
    const wander = new Wander(random, Crevasse.RIM_EVERY);
    const { RIM } = Crevasse;
    const inside = wall.map(({ x, y }) => ({
      x: x + into * (RIM.min + ((RIM.max - RIM.min) * (wander.at(y) + 1)) / 2),
      y,
    }));
    return [...wall, ...inside.reverse()];
  }

  /** A crust of snow on a step of a wall, from `a` to `b`: thin, and thickest in its middle. */
  private static crust(a: Point, b: Point): Point[] {
    const at = (share: number, up: number): Point => ({
      x: a.x + (b.x - a.x) * share,
      y: a.y + (b.y - a.y) * share + up,
    });
    return [a, at(0.3, Crevasse.CRUST), at(0.7, Crevasse.CRUST * 0.8), b];
  }

  /** Where a wall is across at height `y`: on its segment through it, or at its nearer end. */
  private static across(wall: readonly Point[], y: number): number {
    for (const [index, a] of wall.entries()) {
      const b = wall[index + 1];
      if (b === undefined) {
        break;
      }
      const [low, high] = a.y <= b.y ? [a, b] : [b, a];
      if (y >= low.y && y <= high.y) {
        return high.y === low.y
          ? Math.max(a.x, b.x)
          : low.x + ((high.x - low.x) * (y - low.y)) / (high.y - low.y);
      }
    }
    const ends = [wall[0], wall.at(-1)].filter((end): end is Point => end !== undefined);
    const nearer = ends.reduce<Point | null>(
      (best, end) => (best === null || Math.abs(end.y - y) < Math.abs(best.y - y) ? end : best),
      null,
    );
    return nearer?.x ?? 0;
  }
}
