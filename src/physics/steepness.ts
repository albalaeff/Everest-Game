/** A point of a curve by steepness: an angle in degrees, uphill positive, and the value there. */
export type SteepnessPoint = readonly [degrees: number, value: number];

/**
 * How steep a way over the ground is, as the sine of its angle: up is positive, down negative, a
 * wall ±1. The data gives angles in degrees, as climbers and sources do. Their sine is worked out
 * here with `+ - * /` alone, because each browser rounds `Math.sin` its own way
 * (docs/conventions/simulation-core.md → The same result everywhere).
 */
export class Steepness {
  /** Terms of the sine's series past the first: the last is below 10⁻¹⁸ at a wall. */
  private static readonly TERMS = 10;

  private constructor(readonly sine: number) {}

  static ofDegrees(degrees: number): Steepness {
    if (!(Math.abs(degrees) <= 90)) {
      throw new RangeError(`${degrees}° is past the vertical`);
    }
    const angle = (degrees * Math.PI) / 180;
    let term = angle;
    let sine = angle;
    for (let power = 1; power <= Steepness.TERMS; power += 1) {
      term = (-term * angle * angle) / (2 * power * (2 * power + 1));
      sine += term;
    }
    return new Steepness(sine);
  }

  /** The steepness of a way `across` and `up` metres over the ground. */
  static ofWay(across: number, up: number): Steepness {
    const length = Math.sqrt(across * across + up * up);
    if (length === 0) {
      throw new RangeError("A way of no length has no steepness");
    }
    return new Steepness(up / length);
  }
}

/**
 * A number that depends on how steep the ground is, such as the walking speed: the data's points,
 * from the steepest down to the steepest up, joined by straight lines over the sine. Past its
 * ends it keeps its end values.
 */
export class SteepnessCurve {
  private readonly points: readonly { readonly sine: number; readonly value: number }[];
  private readonly first: { readonly sine: number; readonly value: number };
  private readonly last: { readonly sine: number; readonly value: number };

  constructor(points: readonly SteepnessPoint[]) {
    this.points = points.map(([degrees, value]) => ({
      sine: Steepness.ofDegrees(degrees).sine,
      value,
    }));
    const [first] = this.points;
    const last = this.points.at(-1);
    if (first === undefined || last === undefined) {
      throw new RangeError("A curve needs a point at least");
    }
    if (points.some(([degrees], index) => index > 0 && degrees <= (points[index - 1]?.[0] ?? 0))) {
      throw new RangeError("A curve's points go from the steepest down to the steepest up");
    }
    this.first = first;
    this.last = last;
  }

  at(steepness: Steepness): number {
    const { sine } = steepness;
    if (sine <= this.first.sine) {
      return this.first.value;
    }
    let below = this.first;
    for (const point of this.points) {
      if (sine <= point.sine) {
        const share = (sine - below.sine) / (point.sine - below.sine);
        return below.value + (point.value - below.value) * share;
      }
      below = point;
    }
    return this.last.value;
  }

  /** Whether it's steeper up than the curve's last point. */
  steeperUp(steepness: Steepness): boolean {
    return steepness.sine > this.last.sine;
  }

  /** Whether it's steeper down than the curve's first point. */
  steeperDown(steepness: Steepness): boolean {
    return steepness.sine < this.first.sine;
  }
}
