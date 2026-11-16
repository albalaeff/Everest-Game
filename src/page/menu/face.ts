import type { Point } from "../../physics";
import type { PictureRandom } from "./picture-random";
import { Polyline } from "./polyline";

/** One thing drawn on the start's picture: path data, filled or stroked in a colour as `Palette`
 * writes one, the stroke so many pixels wide. */
export interface Shape {
  readonly path: string;
  readonly fill?: number;
  readonly stroke?: number;
  readonly width?: number;
  readonly opacity?: number;
}

/** How a face's ribs or ledges lie: the way they run, in degrees clockwise from the picture's
 * right, and how far off it at most; their lengths and their widths, in pixels. */
export interface Lie {
  readonly angle: number;
  readonly spread: number;
  readonly lengths: readonly [number, number];
  readonly widths: readonly [number, number];
}

/**
 * A face of a mountain on the start's picture: its outline, which everything drawn on it is cut
 * to, and what gives it its texture, drawn by a seeded generator: ribs down its fall line, the
 * flutings, buttresses and gullies a face has, and ledges scattered across it, snow on rock or
 * rock through snow. A part of a face is a face too, inside it, and so is a face without another
 * that stands in front of it.
 */
export class Face {
  /** How many places are tried for each one found inside the face. */
  private static readonly TRIES = 60;
  /** A rib's width down its length: nothing at its ends, widest two fifths of the way. */
  private static readonly TAPER: readonly (readonly [number, number])[] = [
    [0, 0],
    [0.2, 0.75],
    [0.45, 1],
    [0.75, 0.7],
    [1, 0],
  ];
  /** How far a rib and a ledge bow, as a share of their length, and how uneven their edges are. */
  private static readonly RIB_BOW = 0.07;
  private static readonly LEDGE_BOW = 0.12;
  private static readonly UNEVEN = { least: 0.75, most: 1.2 };

  constructor(
    readonly id: string,
    readonly outline: Polyline,
    private readonly inside: Face | null = null,
    private readonly outside: Face | null = null,
  ) {}

  /** Its outline as path data, closed. */
  get path(): string {
    return this.outline.path(true);
  }

  /** Whether a point of the picture is on the face. */
  contains(point: Point): boolean {
    if (this.inside?.contains(point) === false || this.outside?.contains(point) === true) {
      return false;
    }
    const { points } = this.outline;
    let within = false;
    for (const [index, here] of points.entries()) {
      const there = points[(index + 1) % points.length] ?? here;
      const crosses = here.y > point.y !== there.y > point.y;
      if (
        crosses &&
        point.x < here.x + ((point.y - here.y) / (there.y - here.y)) * (there.x - here.x)
      ) {
        within = !within;
      }
    }
    return within;
  }

  /** The part of the face inside an outline. */
  part(id: string, outline: Polyline): Face {
    return new Face(id, outline, this);
  }

  /** The part of the face from `top` to `bottom` pixels down the picture. */
  between(top: number, bottom: number): Face {
    const { left, right } = this.reach();
    return this.part(
      `${this.id}-${top}-${bottom}`,
      Polyline.of(left, top, right, top, right, bottom, left, bottom),
    );
  }

  /** The part of the face between two beds of its rock, `top` and `bottom` pixels down at
   * `hinge` across, and dipping `dip` pixels a pixel to the left. */
  bed(top: number, bottom: number, dip: number, hinge: number): Face {
    const { left, right } = this.reach();
    const at = (x: number, y: number): readonly [number, number] => [x, y + (hinge - x) * dip];
    return this.part(
      `${this.id}-bed-${top}`,
      Polyline.of(...at(left, top), ...at(right, top), ...at(right, bottom), ...at(left, bottom)),
    );
  }

  /** The face but for what another, in front of it, covers. */
  without(id: string, other: Face): Face {
    return new Face(id, this.outline, this.inside, other);
  }

  /** So many places on the face, by chance; the higher `high`, the more of them near its top. */
  scatter(count: number, random: PictureRandom, high = 0): readonly Point[] {
    const { left, right, top, bottom } = this.reach();
    const found: Point[] = [];
    for (let tries = 0; found.length < count && tries < count * Face.TRIES; tries++) {
      const point = {
        x: random.within(left, right),
        y: top + (bottom - top) * random.fraction() ** (1 + high),
      };
      if (this.contains(point)) {
        found.push(point);
      }
    }
    return found;
  }

  /** Ribs down the face from the places they start at, as path data. */
  ribs(starts: readonly Point[], lie: Lie, random: PictureRandom): string {
    return starts.map((start) => Face.rib(start, lie, Face.RIB_BOW, random)).join("");
  }

  /** So many ledges scattered across the face, each lying about a place on it, as path data. */
  ledges(count: number, lie: Lie, random: PictureRandom, high = 0): string {
    return this.scatter(count, random, high)
      .map((middle) => Face.rib(middle, lie, Face.LEDGE_BOW, random, true))
      .join("");
  }

  /** One tapered sliver from `start`, or about it, the way `lie` says. */
  private static rib(
    start: Point,
    lie: Lie,
    bow: number,
    random: PictureRandom,
    about = false,
  ): string {
    const angle = ((lie.angle + random.swing(lie.spread)) * Math.PI) / 180;
    const length = random.within(...lie.lengths);
    const width = random.within(...lie.widths);
    const along = { x: Math.cos(angle), y: Math.sin(angle) };
    const across = { x: -along.y, y: along.x };
    const from = about
      ? { x: start.x - (along.x * length) / 2, y: start.y - (along.y * length) / 2 }
      : start;
    const bend = random.swing(bow) * length;
    const near: Point[] = [];
    const far: Point[] = [];
    for (const [share, wide] of Face.TAPER) {
      const bowed = bend * Math.sin(share * Math.PI);
      const x = from.x + along.x * length * share + across.x * bowed;
      const y = from.y + along.y * length * share + across.y * bowed;
      const half = ((width * wide) / 2) * random.within(Face.UNEVEN.least, Face.UNEVEN.most);
      near.push({ x: x + across.x * half, y: y + across.y * half });
      far.push({ x: x - across.x * half, y: y - across.y * half });
    }
    return new Polyline([...near, ...far.reverse().slice(1, -1)]).path(true);
  }

  /** The box the face's own outline fills. */
  private reach(): { left: number; right: number; top: number; bottom: number } {
    const xs = this.outline.points.map(({ x }) => x);
    const ys = this.outline.points.map(({ y }) => y);
    return {
      left: Math.min(...xs),
      right: Math.max(...xs),
      top: Math.min(...ys),
      bottom: Math.max(...ys),
    };
  }
}
