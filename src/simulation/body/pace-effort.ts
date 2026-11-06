import { Curve } from "../curve";
import type { CurvePoint } from "../curve";
import type { BodyNumbers, PaceNumbers } from "./body-numbers";

/**
 * How fast a climber's steps tire them, by the work they do against the steady pace's up a
 * slope: a pace's speed times the share of their stride's power their steps take. Up a slope
 * they take all of it, and each pace tires them at its own rate; down one, or on the flat, their
 * footing holds them back, and the less of their power their steps take, the less they tire, down
 * to nothing standing. Between the paces it goes in straight lines.
 */
export class PaceEffort {
  private readonly curve: Curve;

  constructor(paces: BodyNumbers["paces"]) {
    const points = Object.values(paces).map(({ speed, effort }) => {
      const point: CurvePoint = [speed, effort];
      return point;
    });
    if (points.some(([speed, effort]) => !(speed > 0 && effort > 0))) {
      throw new RangeError("Each pace needs a speed and an effort");
    }
    this.curve = new Curve([[0, 0], ...points.sort(([one], [other]) => one - other)]);
  }

  /** How many times faster than at the steady pace up a slope a climber tires, at `pace`, their
   * steps taking `exertion` of its power. */
  at(pace: PaceNumbers, exertion: number): number {
    return this.curve.at(pace.speed * exertion);
  }
}
