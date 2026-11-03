import type { SeededRandom } from "../simulation";

/** One flake: where it is on the screen, in CSS pixels, and how it falls. */
export interface Flake {
  x: number;
  y: number;
  /** How far it falls a second, as a share of the screen's height, so a flake crosses a phone's
   * screen in the same time as a PC's. */
  readonly fall: number;
  /** Its own sideways drift, in pixels a second. */
  readonly sway: number;
  /** Its width, in pixels. */
  readonly size: number;
}

/**
 * The falling snow, in screen space: so many flakes, each falling at its own speed and swaying a
 * little, and the wind pushing them all. A flake past the bottom comes back in at the top, and
 * past a side at the other. The drawing is the snow layer's; this is where the flakes are.
 */
export class Snowfall {
  private static readonly FALL = { min: 0.08, max: 0.22 };
  private static readonly SWAY_PIXELS_A_SECOND = 18;
  private static readonly SIZE_PIXELS = { min: 1.5, max: 3.2 };

  readonly flakes: readonly Flake[];
  private width: number;
  private height: number;

  constructor(count: number, width: number, height: number, random: SeededRandom) {
    this.width = width;
    this.height = height;
    const between = (low: number, high: number): number => low + random.fraction() * (high - low);
    this.flakes = Array.from({ length: count }, () => ({
      x: random.fraction() * width,
      y: random.fraction() * height,
      fall: between(Snowfall.FALL.min, Snowfall.FALL.max),
      sway: between(-Snowfall.SWAY_PIXELS_A_SECOND, Snowfall.SWAY_PIXELS_A_SECOND),
      size: between(Snowfall.SIZE_PIXELS.min, Snowfall.SIZE_PIXELS.max),
    }));
  }

  /** The screen's new size: the flakes keep their places on it, by share. */
  resize(width: number, height: number): void {
    if (width === this.width && height === this.height) {
      return;
    }
    for (const flake of this.flakes) {
      flake.x = (flake.x / this.width) * width;
      flake.y = (flake.y / this.height) * height;
    }
    this.width = width;
    this.height = height;
  }

  /** `seconds` more of snow, with the wind blowing `wind` pixels a second to the right. */
  fall(seconds: number, wind = 0): void {
    const { width, height } = this;
    for (const flake of this.flakes) {
      flake.y = Snowfall.wrapped(flake.y + flake.fall * height * seconds, height);
      flake.x = Snowfall.wrapped(flake.x + (flake.sway + wind) * seconds, width);
    }
  }

  private static wrapped(value: number, span: number): number {
    return ((value % span) + span) % span;
  }
}
