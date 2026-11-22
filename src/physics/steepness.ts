import { Curve } from "../simulation";

/** A point of a curve by steepness: an angle in degrees, uphill positive, and the value there. */
export type SteepnessPoint = readonly [degrees: number, value: number];

/** A point of a curve by gradient: the rise over the run, uphill positive, and the value there. */
export type GradientPoint = readonly [gradient: number, value: number];

/**
 * How steep a way over the ground is, as the sine of its angle: up is positive, down negative, a
 * wall ±1. The data gives angles in degrees, as climbers and sources do, or gradients, as the
 * physiologists' treadmills do. An angle's sine is worked out here with `+ - * /` alone, because
 * each browser rounds `Math.sin` its own way (docs/conventions/simulation-core.md → The same
 * result everywhere).
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

  /** The steepness of a gradient: `gradient` metres up for each metre across. */
  static ofGradient(gradient: number): Steepness {
    return Steepness.ofWay(1, gradient);
  }

  /** The same way gone the other way: down what this goes up, and up what it goes down. */
  get reversed(): Steepness {
    return new Steepness(-this.sine);
  }
}

/**
 * A number that depends on how steep the ground is, such as the slip chance: the data's points,
 * from the steepest down to the steepest up, joined by straight lines over the sine, a `Curve` of
 * the core. Past its ends it keeps its end values.
 */
export class SteepnessCurve {
  private readonly curve: Curve;

  constructor(points: readonly SteepnessPoint[]) {
    this.curve = new Curve(
      points.map(([degrees, value]) => [Steepness.ofDegrees(degrees).sine, value] as const),
    );
  }

  at(steepness: Steepness): number {
    return this.curve.at(steepness.sine);
  }

  /** Whether it's steeper up than the curve's last point. */
  steeperUp(steepness: Steepness): boolean {
    return steepness.sine > this.curve.end;
  }

  /** Whether it's steeper down than the curve's first point. */
  steeperDown(steepness: Steepness): boolean {
    return steepness.sine < this.curve.start;
  }
}
