import type { SeededRandom } from "../simulation";

/** One star: where it is, as shares of the screen's width and height, its size in CSS pixels,
 * and where in its twinkle it starts. */
export interface Star {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly phase: number;
}

/**
 * The stars of the night sky, in screen space: so many, scattered over the open sky above the
 * mountains by a seeded generator of the picture's own, each twinkling a little on its own clock.
 * The drawing is the sky layer's; this is where the stars are.
 */
export class Stars {
  /** How far down the screen the stars reach: the faces cover the sky below. */
  static readonly SKY_SHARE = 0.7;
  private static readonly SIZE_PIXELS = { min: 0.6, max: 1.7 };
  private static readonly TWINKLE_A_SECOND = 1.3;
  private static readonly TWINKLE_DEPTH = 0.3;

  readonly stars: readonly Star[];

  constructor(count: number, random: SeededRandom) {
    const between = (low: number, high: number): number => low + random.fraction() * (high - low);
    this.stars = Array.from({ length: count }, () => ({
      x: random.fraction(),
      y: random.fraction() * Stars.SKY_SHARE,
      size: between(Stars.SIZE_PIXELS.min, Stars.SIZE_PIXELS.max),
      phase: between(0, 2 * Math.PI),
    }));
  }

  /** How bright a star is at `elapsed` seconds of picture, 0 to 1: it twinkles a little. */
  static twinkle(star: Star, elapsed: number): number {
    const depth = Stars.TWINKLE_DEPTH;
    return (
      1 - depth + depth * (0.5 + 0.5 * Math.sin(elapsed * Stars.TWINKLE_A_SECOND + star.phase))
    );
  }
}
