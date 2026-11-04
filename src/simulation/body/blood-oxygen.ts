import { Curve } from "../curve";
import type { BodyNumbers } from "./body-numbers";

/**
 * What the air, and the oxygen a climber breathes, leave their body at an altitude: the altitude
 * it feels, the real one less what the oxygen buys; their SpO2 there; and the share of their
 * sea-level capacity left there, which falls in a straight line above the onset.
 */
export class BloodOxygen {
  private readonly saturation: Curve;

  constructor(private readonly numbers: BodyNumbers) {
    this.saturation = new Curve(numbers.saturation);
  }

  /** The altitude the body feels at `altitude` on `flow` L/min, on the move or at rest: no lower
   * than sea level. */
  felt(altitude: number, flow: number, moving: boolean): number {
    const { moving: onTheMove, resting } = this.numbers.oxygenGain;
    return Math.max(0, altitude - (moving ? onTheMove : resting) * flow);
  }

  /** SpO2 at an altitude the body feels, in %. */
  spo2(felt: number): number {
    return this.saturation.at(felt);
  }

  /** The share of a climber's sea-level capacity left at an altitude the body feels, down to
   * nothing. */
  capacity(felt: number): number {
    const { onset, decline } = this.numbers.capacity;
    const thousands = Math.max(0, felt - onset) / 1000;
    return Math.max(0, 1 - (decline / 100) * thousands);
  }
}
