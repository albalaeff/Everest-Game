import type { Point } from "../../physics";
import type { PictureRandom } from "./picture-random";

/**
 * A line through points of the start's picture, in its pixels with y down: a ridge, a bank of the
 * Icefall, the route. It writes itself as SVG path data, to a tenth of a pixel, straight from point
 * to point or smooth through them, and says how far along it each of its points is.
 */
export class Polyline {
  /** How far a smooth line's handles reach towards its neighbours: a Catmull-Rom spline's sixth. */
  private static readonly HANDLE = 1 / 6;
  private static readonly TENTHS = 10;

  constructor(readonly points: readonly Point[]) {}

  /** The line through `x, y, x, y, …`, as the picture's own numbers are written. */
  static of(...coordinates: readonly number[]): Polyline {
    const points: Point[] = [];
    for (let index = 0; index + 1 < coordinates.length; index += 2) {
      points.push({ x: coordinates[index] ?? 0, y: coordinates[index + 1] ?? 0 });
    }
    return new Polyline(points);
  }

  /** Its points with these lines' after them, a point of theirs that repeats its last left out. */
  joined(...others: readonly Polyline[]): Polyline {
    const points = [...this.points];
    for (const other of others) {
      for (const point of other.points) {
        const last = points.at(-1);
        if (last === undefined || last.x !== point.x || last.y !== point.y) {
          points.push(point);
        }
      }
    }
    return new Polyline(points);
  }

  reversed(): Polyline {
    return new Polyline([...this.points].reverse());
  }

  /** The same line `by` pixels lower on the picture. */
  lowered(by: number): Polyline {
    return new Polyline(this.points.map(({ x, y }) => ({ x, y: y + by })));
  }

  /** Its points from the `from`th up to, and not including, the `to`th. */
  slice(from: number, to?: number): Polyline {
    return new Polyline(this.points.slice(from, to));
  }

  /** Its length, in pixels. */
  get length(): number {
    return this.runs().at(-1) ?? 0;
  }

  /** How far along the line each of its points is, as a share of its length: 0 to 1. */
  shares(): readonly number[] {
    const runs = this.runs();
    const length = runs.at(-1) ?? 0;
    return runs.map((run) => (length === 0 ? 0 : run / length));
  }

  /** Points every `step` pixels or so along it, each step up to `jitter` of itself off. */
  along(step: number, random: PictureRandom, jitter = 0.3): readonly Point[] {
    const length = this.length;
    const found: Point[] = [];
    for (
      let run = random.within(0, step);
      run < length;
      run += step * random.within(1 - jitter, 1 + jitter)
    ) {
      found.push(this.at(run));
    }
    return found;
  }

  /** The point `run` pixels along it. */
  at(run: number): Point {
    const runs = this.runs();
    for (const [index, point] of this.points.entries()) {
      const next = this.points[index + 1];
      const here = runs[index] ?? 0;
      const there = runs[index + 1] ?? here;
      if (next !== undefined && run <= there && there > here) {
        const share = Math.max(run - here, 0) / (there - here);
        return { x: point.x + (next.x - point.x) * share, y: point.y + (next.y - point.y) * share };
      }
    }
    return this.points.at(-1) ?? { x: 0, y: 0 };
  }

  /** The line as path data, straight from point to point; `closed`, back to its first. */
  path(closed = false): string {
    const line = this.points
      .map(({ x, y }, index) => `${index === 0 ? "M" : "L"}${Polyline.said(x)} ${Polyline.said(y)}`)
      .join("");
    return closed ? `${line}Z` : line;
  }

  /** The line as path data, smooth through every point. */
  smooth(): string {
    const { points } = this;
    const [first] = points;
    if (first === undefined) {
      return "";
    }
    const curves = points.slice(0, -1).map((from, index) => {
      const before = points[index - 1] ?? from;
      const to = points[index + 1] ?? from;
      const after = points[index + 2] ?? to;
      const numbers = [
        from.x + (to.x - before.x) * Polyline.HANDLE,
        from.y + (to.y - before.y) * Polyline.HANDLE,
        to.x - (after.x - from.x) * Polyline.HANDLE,
        to.y - (after.y - from.y) * Polyline.HANDLE,
        to.x,
        to.y,
      ];
      return `C${numbers.map((value) => Polyline.said(value)).join(" ")}`;
    });
    return `M${Polyline.said(first.x)} ${Polyline.said(first.y)}${curves.join("")}`;
  }

  /** How far along the line each point is, in pixels. */
  private runs(): readonly number[] {
    let run = 0;
    return this.points.map((point, index) => {
      const before = this.points[index - 1];
      if (before !== undefined) {
        run += Math.hypot(point.x - before.x, point.y - before.y);
      }
      return run;
    });
  }

  private static said(value: number): string {
    return String(Math.round(value * Polyline.TENTHS) / Polyline.TENTHS);
  }
}
