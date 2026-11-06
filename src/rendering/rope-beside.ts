import type { Joint } from "./climber-pose";

/**
 * A fixed rope beside a climber, in their figure's metres (`ClimberPose`): the feet at the origin,
 * x the way they face, y up. It finds the rope's point nearest the gear, and walks along it ahead
 * of a point: the way the climber faces, whichever end the rope was fixed from, or up where it
 * runs up and down, as up a ladder's wall; held at its anchors. It tells whether the rope lies
 * along the ground at the feet, where a hand can lift it off the snow. Pure, so where the gear goes
 * on the rope is tested in Node.
 */
export class RopeBeside {
  /** How far each way along the rope from the feet its lie is read, to tell which way is ahead,
   * and how much rising counts beside going the way the climber faces. */
  private static readonly PROBE_METRES = 0.5;
  private static readonly RISING = 0.25;
  /** How far the rope goes on ahead of the feet, at least, where it lies along the ground, and how
   * steeply it rises at most there: a slope's rope, not a wall's. */
  private static readonly LYING_METRES = 0.3;
  private static readonly LYING_RISE = 1.5;

  /** How far along the rope each point is, from the first. */
  private readonly lengths: readonly number[];
  /** How far along it, from its first point, it's nearest the feet. */
  private readonly here: number;
  /** Which way along it is ahead: towards its last point, or its first. */
  private readonly way: 1 | -1;

  constructor(private readonly points: readonly Joint[]) {
    if (points.length === 0) {
      throw new RangeError("A rope needs points to lie beside a climber");
    }
    let along = 0;
    this.lengths = points.map((point, index) => {
      const before = points[index - 1];
      along += before === undefined ? 0 : Math.hypot(point.x - before.x, point.y - before.y);
      return along;
    });
    const here = this.along({ x: 0, y: 0 });
    const lead = (metres: number): number => {
      const there = this.at(here + metres);
      const from = this.at(here);
      return there.x - from.x + RopeBeside.RISING * (there.y - from.y);
    };
    this.here = here;
    this.way = lead(RopeBeside.PROBE_METRES) >= lead(-RopeBeside.PROBE_METRES) ? 1 : -1;
  }

  /** Whether the rope lies along the ground at the feet, for a hand to lift it off the snow: it
   * goes on ahead of them no steeper than a slope, not up a wall nor ended at an anchor there. */
  lies(): boolean {
    const length = this.lengths.at(-1) ?? 0;
    const left = this.way > 0 ? length - this.here : this.here;
    if (left < RopeBeside.LYING_METRES) {
      return false;
    }
    const from = this.at(this.here);
    const to = this.at(this.here + this.way * Math.min(left, RopeBeside.PROBE_METRES));
    return Math.abs(to.y - from.y) <= RopeBeside.LYING_RISE * Math.abs(to.x - from.x);
  }

  /** The rope's point nearest `to`. */
  nearest(to: Joint): Joint {
    return this.at(this.along(to));
  }

  /** The point `metres` ahead along the rope of where it's nearest `from`, or behind it for less
   * than nought; an anchor, past the rope's end. */
  ahead(from: Joint, metres: number): Joint {
    return this.at(this.along(from) + this.way * metres);
  }

  /** How far along the rope, from its first point, it's nearest `to`. */
  private along(to: Joint): number {
    let nearest = 0;
    let least = Infinity;
    for (const [index, point] of this.points.entries()) {
      const next = this.points[index + 1] ?? point;
      const dx = next.x - point.x;
      const dy = next.y - point.y;
      const squared = dx * dx + dy * dy;
      const share =
        squared === 0
          ? 0
          : Math.min(Math.max(((to.x - point.x) * dx + (to.y - point.y) * dy) / squared, 0), 1);
      const off = Math.hypot(point.x + dx * share - to.x, point.y + dy * share - to.y);
      if (off < least) {
        least = off;
        nearest = (this.lengths[index] ?? 0) + share * Math.sqrt(squared);
      }
    }
    return nearest;
  }

  /** The point `metres` along the rope from its first point, held at its ends. */
  private at(metres: number): Joint {
    const { points, lengths } = this;
    const first = points[0];
    const last = points.at(-1);
    if (first === undefined || last === undefined || metres <= 0) {
      return first ?? { x: 0, y: 0 };
    }
    for (const [index, point] of points.entries()) {
      const next = points[index + 1];
      const start = lengths[index] ?? 0;
      const end = lengths[index + 1] ?? start;
      if (next !== undefined && metres <= end && end > start) {
        const share = (metres - start) / (end - start);
        return { x: point.x + (next.x - point.x) * share, y: point.y + (next.y - point.y) * share };
      }
    }
    return last;
  }
}
