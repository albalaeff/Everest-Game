import { SteepnessCurve } from "./steepness";
import type { Steepness, SteepnessPoint } from "./steepness";
import type { WalkingStep } from "./walking";

/**
 * How fast a climber goes along a ladder, and what of their stride's power it takes
 * (docs/conventions/slope-physics.md → Ladders): across a crevasse and up a wall at the speed by
 * its steepness times their stride, all their power spent; down one as walking goes down a slope,
 * held back by their footing rather than their breath (#256). Going down, a metre costs
 * `downCost` of what a metre up the same ladder does at a wall, and as much as a crossing's at the
 * level, in a straight line over the sine between, so a stride's power buys the speed up it over
 * that; and they go no faster than the speed down by its steepness, which is their footing's.
 * Fresh, the footing holds them back and the rungs take only a share of their power; high up or
 * tired, the power runs short and slows them, though less than it does up the same ladder.
 */
export class LadderClimbing {
  private readonly speed: SteepnessCurve;

  constructor(
    points: readonly SteepnessPoint[],
    private readonly downCost: number,
  ) {
    if (!(downCost > 0 && downCost <= 1)) {
      throw new RangeError(
        "A metre down a ladder costs a share of a metre up it, above nought and up to all of it",
      );
    }
    this.speed = new SteepnessCurve(points);
  }

  /** How fast a climber goes along a ladder `steepness` the way they go, at `stride` of a whole
   * stride's power, and what of it that takes. */
  step(steepness: Steepness, stride: number): WalkingStep {
    const footing = this.speed.at(steepness);
    if (steepness.sine >= 0) {
      return { speed: footing * stride, exertion: 1 };
    }
    const cost = 1 + (this.downCost - 1) * -steepness.sine;
    const bought = (stride * this.speed.at(steepness.reversed)) / cost;
    if (bought <= footing) {
      return { speed: bought, exertion: 1 };
    }
    return { speed: footing, exertion: footing / bought };
  }
}
