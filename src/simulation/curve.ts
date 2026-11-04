/** A point of a curve: where along it, and the value there. */
export type CurvePoint = readonly [at: number, value: number];

/**
 * A number that depends on another, such as a climber's blood oxygen on the altitude: the data's
 * points, in order, joined by straight lines. Past its ends it keeps its end values. It's built
 * from `+ - * /` alone, so it gives the same digits everywhere
 * (docs/conventions/simulation-core.md → The same result everywhere).
 */
export class Curve {
  private readonly first: CurvePoint;
  private readonly last: CurvePoint;

  constructor(private readonly points: readonly CurvePoint[]) {
    const [first] = points;
    const last = points.at(-1);
    if (first === undefined || last === undefined) {
      throw new RangeError("A curve needs a point at least");
    }
    if (points.some(([at], index) => index > 0 && at <= (points[index - 1]?.[0] ?? at))) {
      throw new RangeError("A curve's points go in order, each further along than the one before");
    }
    this.first = first;
    this.last = last;
  }

  /** Where its first point is. */
  get start(): number {
    return this.first[0];
  }

  /** Where its last point is. */
  get end(): number {
    return this.last[0];
  }

  at(where: number): number {
    if (where <= this.first[0]) {
      return this.first[1];
    }
    let below = this.first;
    for (const point of this.points) {
      if (where <= point[0]) {
        const share = (where - below[0]) / (point[0] - below[0]);
        return below[1] + (point[1] - below[1]) * share;
      }
      below = point;
    }
    return this.last[1];
  }
}
