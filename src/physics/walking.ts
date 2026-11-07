import { Curve } from "../simulation";
import type { CurvePoint } from "../simulation";
import { Steepness } from "./steepness";
import type { GradientPoint } from "./steepness";

/** A climber's walking on a piece of ground, before the ropes slow it. */
export interface WalkingStep {
  /** Along the ground, in m/s. */
  readonly speed: number;
  /** The share of their stride's power it takes: all of it where the power holds them back,
   * less where the fastest walk does. */
  readonly exertion: number;
}

/**
 * What walking costs, and how fast it goes (docs/conventions/slope-physics.md → Walking and
 * falls): the energy each metre along the ground takes of each kilogram moved, by the steepness,
 * through the measured points, joined by straight lines over the sine; past the steepest measured,
 * each metre of height costs what it costs there, up to the steepest ground walked, up and down.
 * A climber goes as fast as their stride's share of the walking power pays for, but no faster than
 * the fastest walk: up a slope the power holds them back, down one and on the flat their footing.
 */
export class Walking {
  private readonly cost: Curve;
  private readonly steepest: number;

  constructor(
    measured: readonly GradientPoint[],
    steepest: number,
    private readonly power: number,
    private readonly fastest: number,
    private readonly uphillPowerBoost = 1,
  ) {
    const points = measured.map(([gradient, cost]) => {
      const point: CurvePoint = [Steepness.ofGradient(gradient).sine, cost];
      return point;
    });
    const [first] = points;
    const last = points.at(-1);
    this.steepest = Steepness.ofDegrees(steepest).sine;
    if (!(first !== undefined && last !== undefined && first[0] < 0 && last[0] > 0)) {
      throw new RangeError("Walking needs its cost measured downhill and uphill");
    }
    if (!(-this.steepest <= first[0] && last[0] <= this.steepest)) {
      throw new RangeError(
        `The walking cost is measured past the steepest ground walked, ${steepest}°`,
      );
    }
    if (!(power > 0 && fastest > 0)) {
      throw new RangeError("Walking needs a power and a fastest walk");
    }
    if (!(uphillPowerBoost >= 1)) {
      throw new RangeError("Walking needs an uphill power boost of at least one");
    }
    this.cost = new Curve([
      ...(first[0] > -this.steepest ? [Walking.byHeight(first, -this.steepest)] : []),
      ...points,
      ...(last[0] < this.steepest ? [Walking.byHeight(last, this.steepest)] : []),
    ]);
  }

  /** The cost at `sine` of a metre of height costing what it does at `point`. */
  private static byHeight([measured, cost]: CurvePoint, sine: number): CurvePoint {
    return [sine, (cost * sine) / measured];
  }

  /** How fast a climber walks `steepness` at `stride` of a whole stride's power, and what of it
   * that takes. */
  step(steepness: Steepness, stride: number): WalkingStep {
    const power =
      steepness.sine > 0 ? this.power * this.uphillPowerBoost : this.power;
    const bought = (stride * power) / this.cost.at(steepness.sine);
    if (bought <= this.fastest) {
      return { speed: bought, exertion: 1 };
    }
    return { speed: this.fastest, exertion: this.fastest / bought };
  }

  /** Whether it's steeper up than anyone walks. */
  steeperUp(steepness: Steepness): boolean {
    return steepness.sine > this.steepest;
  }

  /** Whether it's steeper down than anyone walks: a step onto it is a fall. */
  steeperDown(steepness: Steepness): boolean {
    return steepness.sine < -this.steepest;
  }
}
