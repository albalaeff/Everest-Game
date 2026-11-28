import type { QualityName } from "../rendering/graphics-quality";

/**
 * How sharp the 3D picture is drawn: how many of the screen's own pixels it fills, as a ratio
 * to the page's. A laptop's built-in graphics draws about two million pixels of this picture in
 * a frame at 60 a second (#311), so a level of the graphics setting is a budget of pixels, not a
 * ratio: a screen with more of them is drawn softer and stretched. And the budget gives: while
 * frames run long the picture is drawn a step softer, and stays so until the level is chosen
 * again, so the game holds its frame rate before its sharpness. Pure: the scene tells it how
 * long each frame took.
 */
export class Sharpness {
  /** The pixels a frame may fill at each level. */
  static readonly BUDGET: Readonly<Record<QualityName, number>> = {
    low: 0.9e6,
    medium: 1.5e6,
    high: 2.1e6,
  };
  /** A frame this long, in seconds, has missed 60 a second by a good way. */
  private static readonly LONG = 1 / 48;
  /** Out of how many frames, how many long ones draw the picture softer; by how much of the
   * budget's ratio a step; and the softest it goes. */
  private static readonly WINDOW = 40;
  private static readonly TOO_MANY = 14;
  private static readonly STEP = 0.1;
  private static readonly SOFTEST = 0.6;

  private share = 1;
  private frames = 0;
  private long = 0;

  constructor(private readonly quality: QualityName) {}

  /** The ratio of drawn pixels to the page's, for a page `width` by `height` on a screen of
   * `devicePixelRatio`: the screen's own at the most. */
  ratio(width: number, height: number, devicePixelRatio: number): number {
    const fits = Math.sqrt(Sharpness.BUDGET[this.quality] / Math.max(width * height, 1));
    return Math.min(devicePixelRatio, fits) * this.share;
  }

  /** A frame took `seconds`. Whether the picture is to be drawn softer from now. */
  frame(seconds: number): boolean {
    const { WINDOW, TOO_MANY, STEP, SOFTEST, LONG } = Sharpness;
    this.frames += 1;
    this.long += seconds > LONG ? 1 : 0;
    if (this.frames < WINDOW) {
      return false;
    }
    const softer = this.long >= TOO_MANY && this.share > SOFTEST;
    this.frames = 0;
    this.long = 0;
    if (softer) {
      this.share = Math.max(this.share - STEP, SOFTEST);
    }
    return softer;
  }
}
