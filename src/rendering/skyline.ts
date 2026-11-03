import type { Point } from "../physics";
import { SeededRandom } from "../simulation";

export interface SkylineOptions {
  /** Where the line runs, in the layer's metres. */
  readonly from: number;
  readonly to: number;
  /** Metres between its points. */
  readonly step: number;
  /** How far above the base the line runs: its lowest saddle and its highest peak. */
  readonly low: number;
  readonly high: number;
  /** The height the line rises from at each x: a ridge follows the ground at its depth, so it
   * stays above the slope over a whole section. */
  readonly base: (x: number) => number;
  readonly seed: number;
}

/**
 * A ridge's outline for a background layer: a line of peaks and saddles, drawn by a seeded
 * generator of its own, never the simulation's, so the same seed gives the same ridge and the
 * mountain draws nothing from the expedition's chance.
 */
export class Skyline {
  /** The most the line rises or falls over a step, as a share of the step: about 40°. */
  private static readonly STEEPNESS = 0.85;

  /** Left to right, x always growing. */
  readonly points: readonly Point[];

  constructor(options: SkylineOptions) {
    const { from, to, step, low, high, base } = options;
    const random = SeededRandom.fromSeed(options.seed);
    const points: Point[] = [];
    let height = low + random.fraction() * (high - low);
    for (let x = from; x < to + step; x += step) {
      const swing = (random.fraction() * 2 - 1) * step * Skyline.STEEPNESS;
      height = Math.min(Math.max(height + swing, low), high);
      points.push({ x, y: base(x) + height });
    }
    this.points = points;
  }
}
