/** A point as the data and the saves keep it: metres across the side view, and up. */
export type Pair = readonly [x: number, y: number];

/** A point on the slope, in metres: x across the side view, y up. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A point of the ground's surface, and how far along the ground it is. */
export interface SurfacePoint extends Point {
  readonly along: number;
}

/** Which way a climber walks along the ground: right is 1, left −1. */
export type Way = 1 | -1;

interface Segment {
  readonly from: Point;
  readonly to: Point;
  /** How far along the ground it starts, and how long it is. */
  readonly start: number;
  readonly length: number;
}

/**
 * The slope's ground, seen from the side: a line of points in metres, left to right. Its x never
 * goes back, so nothing overhangs, and a wall is two points one above the other. Below the line
 * is solid, and past its ends the ground goes on flat. A climber on their feet is somewhere
 * along it: the distance from its first point, over the surface.
 */
export class Terrain {
  private readonly segments: readonly Segment[];
  private readonly first: Segment;
  private readonly last: Segment;

  constructor(readonly points: readonly Pair[]) {
    const segments: Segment[] = [];
    let start = 0;
    for (const [index, [x, y]] of points.entries()) {
      const before = points[index - 1];
      if (before === undefined) {
        continue;
      }
      const [fromX, fromY] = before;
      const length = Math.sqrt((x - fromX) * (x - fromX) + (y - fromY) * (y - fromY));
      if (x < fromX || length === 0) {
        throw new RangeError(`The ground goes back on itself, or stands still, at point ${index}`);
      }
      segments.push({ from: { x: fromX, y: fromY }, to: { x, y }, start, length });
      start += length;
    }
    const [first] = segments;
    const last = segments.at(-1);
    if (first === undefined || last === undefined) {
      throw new RangeError("The ground needs two points at least");
    }
    this.segments = segments;
    this.first = first;
    this.last = last;
  }

  /** The distance along the whole ground. */
  get length(): number {
    return this.last.start + this.last.length;
  }

  /** The point at a distance along the ground, which stops at its ends. */
  point(along: number): Point {
    if (along >= this.length) {
      return this.last.to;
    }
    const segment = this.under(Math.max(along, 0), 1);
    const share = (Math.max(along, 0) - segment.start) / segment.length;
    return {
      x: segment.from.x + (segment.to.x - segment.from.x) * share,
      y: segment.from.y + (segment.to.y - segment.from.y) * share,
    };
  }

  /** Which way, a length of 1, the ground goes on from `along` in the walking direction: at a
   * corner, the segment ahead. */
  ahead(along: number, way: Way): Point {
    const { from, to, length } = this.under(along, way);
    return way > 0
      ? { x: (to.x - from.x) / length, y: (to.y - from.y) / length }
      : { x: (from.x - to.x) / length, y: (from.y - to.y) / length };
  }

  /** How far along the ground the next corner in the walking direction is, or its end. */
  cornerAhead(along: number, way: Way): number {
    const segment = this.under(along, way);
    return way > 0 ? segment.start + segment.length : segment.start;
  }

  /** The height of the ground at `x`: a wall's top, on the wall. */
  height(x: number): number {
    if (x <= this.first.from.x) {
      return this.first.from.y;
    }
    if (x >= this.last.to.x) {
      return this.last.to.y;
    }
    let height = -Infinity;
    for (let index = this.firstReaching(x); index < this.segments.length; index += 1) {
      const { from, to } = this.segment(index);
      if (from.x > x) {
        break;
      }
      const y =
        to.x === from.x
          ? Math.max(from.y, to.y)
          : from.y + ((to.y - from.y) * (x - from.x)) / (to.x - from.x);
      height = Math.max(height, y);
    }
    return height;
  }

  /** Whether a point is in the ground, below its surface. */
  holds(point: Point): boolean {
    return point.y < this.height(point.x);
  }

  /** The point of the surface nearest a point, a wall's face beside it. */
  nearest(point: Point): SurfacePoint {
    if (point.x <= this.first.from.x) {
      return { x: point.x, y: this.first.from.y, along: 0 };
    }
    if (point.x >= this.last.to.x) {
      return { x: point.x, y: this.last.to.y, along: this.length };
    }
    // The surface right above or below is this far, so nothing nearer is further across.
    const reach = Math.abs(this.height(point.x) - point.y);
    let nearest: SurfacePoint = { x: point.x, y: this.height(point.x), along: 0 };
    let distance = Infinity;
    for (
      let index = this.firstReaching(point.x - reach);
      index < this.segments.length;
      index += 1
    ) {
      const segment = this.segment(index);
      if (segment.from.x > point.x + reach) {
        break;
      }
      const found = Terrain.onSegment(segment, point);
      const away =
        (found.x - point.x) * (found.x - point.x) + (found.y - point.y) * (found.y - point.y);
      if (away < distance) {
        nearest = found;
        distance = away;
      }
    }
    return nearest;
  }

  /** The segment a climber at `along` walks on, going `way`: at a corner, the one ahead. */
  private under(along: number, way: Way): Segment {
    let low = 0;
    let high = this.segments.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      const { start, length } = this.segment(middle);
      const past = way > 0 ? along >= start + length : along > start + length;
      if (past) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    return this.segment(low);
  }

  /** The first segment that reaches as far right as `x`. */
  private firstReaching(x: number): number {
    let low = 0;
    let high = this.segments.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (this.segment(middle).to.x < x) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    return low;
  }

  private segment(index: number): Segment {
    const segment = this.segments[index];
    if (segment === undefined) {
      throw new RangeError(`The ground has no segment ${index}`);
    }
    return segment;
  }

  private static onSegment(segment: Segment, point: Point): SurfacePoint {
    const { from, to, start, length } = segment;
    const acrossX = to.x - from.x;
    const acrossY = to.y - from.y;
    const projected =
      ((point.x - from.x) * acrossX + (point.y - from.y) * acrossY) / (length * length);
    const share = Math.min(Math.max(projected, 0), 1);
    return {
      x: from.x + acrossX * share,
      y: from.y + acrossY * share,
      along: start + length * share,
    };
  }
}
