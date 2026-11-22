import type { SeededRandom } from "../simulation";

/**
 * Smooth noise over a plane, 0 to 1: a random value at each corner of a grid a unit apart, eased
 * between them, as the lumps of a wall's ice wander (`IceRelief`). Drawn once from the picture's
 * own seeded generator; it repeats after `Noise.SIZE` units each way, past any wall's size. A
 * wall's relief asks for it at every pixel, several times over, so it's kept quick: its values in
 * one array, and its size a power of two, so a corner past the end wraps with a mask.
 */
export class Noise {
  /** How many corners each way before it repeats: a power of two. */
  static readonly SIZE = 64;
  private static readonly MASK = Noise.SIZE - 1;

  private readonly values: Float64Array;

  constructor(random: SeededRandom) {
    this.values = Float64Array.from({ length: Noise.SIZE * Noise.SIZE }, () => random.fraction());
  }

  /** The noise at a point, 0 to 1. */
  at(x: number, y: number): number {
    const { SIZE, MASK } = Noise;
    const { values } = this;
    const left = Math.floor(x);
    const low = Math.floor(y);
    const across = Noise.eased(x - left);
    const up = Noise.eased(y - low);
    const column = left & MASK;
    const next = (left + 1) & MASK;
    const row = (low & MASK) * SIZE;
    const above = ((low + 1) & MASK) * SIZE;
    const nearLow = values[row + column] ?? 0;
    const nearHigh = values[above + column] ?? 0;
    const under = nearLow + ((values[row + next] ?? 0) - nearLow) * across;
    const over = nearHigh + ((values[above + next] ?? 0) - nearHigh) * across;
    return under + (over - under) * up;
  }

  /** The noise in `octaves` layers, each twice as fine and half as strong as the one before, 0 to
   * 1: big lumps with smaller ones on them. */
  fractal(x: number, y: number, octaves: number): number {
    let sum = 0;
    let weight = 0;
    let scale = 1;
    for (let octave = 0; octave < octaves; octave += 1) {
      sum += this.at(x * scale + octave * 17.3, y * scale + octave * 9.1) / scale;
      weight += 1 / scale;
      scale *= 2;
    }
    return sum / weight;
  }

  /** The noise folded about its middle, 0 to 1: 1 along the crests where it crosses a half, falling
   * off to 0 each side, as ridges run. */
  ridged(x: number, y: number): number {
    return 1 - Math.abs(2 * this.at(x, y) - 1);
  }

  /** A share eased at both ends, so the noise has no creases at the grid's lines. */
  private static eased(share: number): number {
    return share * share * (3 - 2 * share);
  }
}
