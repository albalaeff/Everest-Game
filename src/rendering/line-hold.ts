import type { Point } from "../physics";

/**
 * Where a climber on a rescue line is tied into it (#241): the point of the line, hanging down the
 * ground's line from its anchor, a short way up it from where the climber is, or its anchor where
 * that's nearer. The figure's cowstail runs to it and the rope is drawn to it, taut from the
 * anchor: one place for both, so they meet.
 */
export class LineHold {
  /** How far up the line from the climber's point they're tied in, in metres at life size: an
   * arm's reach up the rope. */
  static readonly ABOVE = 0.7;

  /** On a line of this `shape`, its anchor first, for a climber drawn `at`, `grown` times life
   * size. */
  constructor(
    private readonly shape: readonly Point[],
    private readonly at: Point,
    private readonly grown: number,
  ) {}

  /** How far down the line from its anchor the climber is: where on it they're nearest. */
  get down(): number {
    const { shape, at } = this;
    let along = 0;
    let total = 0;
    let nearest = Infinity;
    for (let link = 1; link < shape.length; link += 1) {
      const from = shape[link - 1];
      const to = shape[link];
      if (from === undefined || to === undefined) {
        continue;
      }
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length = Math.hypot(dx, dy);
      const onIt = length > 0 ? ((at.x - from.x) * dx + (at.y - from.y) * dy) / length ** 2 : 0;
      const share = Math.min(Math.max(onIt, 0), 1);
      const away = Math.hypot(from.x + dx * share - at.x, from.y + dy * share - at.y);
      if (away < nearest) {
        nearest = away;
        along = total + length * share;
      }
      total += length;
    }
    return along;
  }

  /** How much rope runs from the anchor down to where they're tied in, in metres. */
  get fromTop(): number {
    return Math.max(0, this.down - LineHold.ABOVE * this.grown);
  }

  /** Where they're tied in. */
  get point(): Point {
    return LineHold.along(this.shape, this.fromTop);
  }

  /** The line from its anchor down to where they're tied in, corner by corner: the rope that
   * bears them, taut. */
  get taut(): readonly Point[] {
    return LineHold.upTo(this.shape, this.fromTop);
  }

  /** The point `metres` down a line of this `shape` from its anchor: its foot past its end. */
  static along(shape: readonly Point[], metres: number): Point {
    const taut = LineHold.upTo(shape, metres);
    return taut[taut.length - 1] ?? { x: 0, y: 0 };
  }

  /** A line of this `shape` from its anchor as far as `metres` down it. */
  static upTo(shape: readonly Point[], metres: number): readonly Point[] {
    const points: Point[] = [];
    let left = Math.max(metres, 0);
    for (let link = 0; link < shape.length; link += 1) {
      const to = shape[link];
      const from = points[points.length - 1];
      if (to === undefined) {
        continue;
      }
      if (from === undefined) {
        points.push(to);
        continue;
      }
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      if (length >= left) {
        const share = length > 0 ? left / length : 0;
        points.push({ x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share });
        return points;
      }
      left -= length;
      points.push(to);
    }
    return points;
  }
}
