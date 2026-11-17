import { SeededRandom } from "../../simulation";

/**
 * The start's picture's own chance: a seeded generator, never the expedition's, so the same seed
 * draws the same mountain every time (docs/conventions/rendering.md → The picture has no clock and
 * no chance of the expedition's).
 */
export class PictureRandom {
  private readonly random: SeededRandom;

  constructor(seed: number) {
    this.random = SeededRandom.fromSeed(seed);
  }

  /** A fraction from 0 up to, and not including, 1. */
  fraction(): number {
    return this.random.fraction();
  }

  /** A number from `low` up to `high`. */
  within(low: number, high: number): number {
    return low + this.random.fraction() * (high - low);
  }

  /** A number up to `size` either side of nought. */
  swing(size: number): number {
    return this.within(-size, size);
  }
}
