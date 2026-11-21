import type { SeededRandom } from "../simulation";

/**
 * Smooth noise over a plane, 0 to 1: a random value at each corner of a grid a unit apart, eased
 * between them, as the lumps of a wall's ice wander (`IceRelief`). Drawn once from the picture's
 * own seeded generator; it repeats after `Noise.SIZE` units each way, past any wall's size.
 */
export class Noise {
  /** How many corners each way before it repeats. */
  static readonly SIZE = 64;

  private readonly values: readonly number[];

  constructor(random: SeededRandom) {
    this.values = Array.from({ length: Noise.SIZE * Noise.SIZE }, () => random.fraction());
  }

  /** The noise at a point, 0 to 1. */
  at(x: number, y: number): number {
    const left = Math.floor(x);
    const low = Math.floor(y);
    const across = Noise.eased(x - left);
    const up = Noise.eased(y - low);
    const under =
      this.corner(left, low) + (this.corner(left + 1, low) - this.corner(left, low)) * across;
    const over =
      this.corner(left, low + 1) +
      (this.corner(left + 1, low + 1) - this.corner(left, low + 1)) * across;
    return under + (over - under) * up;
  }

  /** The noise in `octaves` layers, each twice as fine and half as strong as the one before, 0 to
   * 1: big lumps with smaller ones on them. */
  fractal(x: number, y: number, octaves: number): number {
    let sum = 0;
    let weight = 0;
    for (let octave = 0; octave < octaves; octave += 1) {
      const scale = 2 ** octave;
      sum += this.at(x * scale + octave * 17.3, y * scale + octave * 9.1) / scale;
      weight += 1 / scale;
    }
    return sum / weight;
  }

  /** The noise folded about its middle, 0 to 1: 1 along the crests where it crosses a half, falling
   * off to 0 each side, as ridges run. */
  ridged(x: number, y: number): number {
    return 1 - Math.abs(2 * this.at(x, y) - 1);
  }

  private corner(x: number, y: number): number {
    const { SIZE } = Noise;
    const column = ((x % SIZE) + SIZE) % SIZE;
    const row = ((y % SIZE) + SIZE) % SIZE;
    return this.values[row * SIZE + column] ?? 0;
  }

  /** A share eased at both ends, so the noise has no creases at the grid's lines. */
  private static eased(share: number): number {
    return share * share * (3 - 2 * share);
  }
}
