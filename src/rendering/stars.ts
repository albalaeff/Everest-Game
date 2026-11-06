import type { SeededRandom } from "../simulation";
import type { ThinAir } from "./thin-air";

/** One star: where it is, as shares of the screen's width and height, its size in CSS pixels,
 * where in its twinkle it starts, and how faint it is, 0 for the brightest to 1 for the faintest. */
export interface Star {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly phase: number;
  readonly faint: number;
}

/**
 * The stars of the night sky, in screen space: so many, scattered over the open sky above the
 * mountains by a seeded generator of the picture's own, each twinkling a little on its own clock.
 * The thinner the air above, the more of the faint ones show and the less they twinkle, as from a
 * high camp (docs/guidelines/graphics.md → light tells the altitude). The drawing is the sky
 * layer's; this is where the stars are.
 */
export class Stars {
  /** How far down the screen the stars reach: the faces cover the sky below. */
  static readonly SKY_SHARE = 0.7;
  private static readonly SIZE_PIXELS = { min: 0.6, max: 1.7 };
  private static readonly TWINKLE_A_SECOND = 1.3;
  private static readonly TWINKLE_DEPTH = 0.3;
  /** How much steadier the stars are under none of the air than under all of it. */
  private static readonly STEADIER = 0.6;
  /** The faintest star that shows at sea level, and how gradually the fainter ones fade out. */
  private static readonly SEEN_AT_SEA_LEVEL = 0.3;
  private static readonly FADE = 0.15;

  readonly stars: readonly Star[];

  constructor(count: number, random: SeededRandom) {
    const { min, max } = Stars.SIZE_PIXELS;
    this.stars = Array.from({ length: count }, () => {
      const x = random.fraction();
      const y = random.fraction() * Stars.SKY_SHARE;
      const faint = random.fraction();
      return {
        x,
        y,
        size: max - faint * (max - min),
        phase: random.fraction() * 2 * Math.PI,
        faint,
      };
    });
  }

  /** How bright a star is at `elapsed` seconds of picture under `air`, 0 to 1: it twinkles a
   * little, less the thinner the air, and the fainter it is, the thinner the air it needs to
   * show. */
  static twinkle(star: Star, elapsed: number, air: ThinAir): number {
    const seen = Stars.SEEN_AT_SEA_LEVEL + (1 - Stars.SEEN_AT_SEA_LEVEL) * air.share;
    const shows = Math.min(Math.max((seen - star.faint) / Stars.FADE, 0), 1);
    const depth = Stars.TWINKLE_DEPTH * (1 - Stars.STEADIER * air.share);
    return (
      shows *
      (1 - depth + depth * (0.5 + 0.5 * Math.sin(elapsed * Stars.TWINKLE_A_SECOND + star.phase)))
    );
  }
}
