/**
 * The camera's way from one zoom to the next, in metres of slope from the top of the screen to the
 * bottom: a quarter of a second, easing out, and even in scale, so each moment shows the same share
 * more or less of the slope. A frozen value: each frame makes the next.
 */
export class ZoomGlide {
  static readonly SECONDS = 0.25;

  private constructor(
    private readonly from: number,
    private readonly to: number,
    private readonly gone: number,
  ) {}

  /** At rest on a level. */
  static at(metres: number): ZoomGlide {
    return new ZoomGlide(metres, metres, ZoomGlide.SECONDS);
  }

  /** The metres from the top of the screen to the bottom, now. */
  get metresHigh(): number {
    const share = this.gone / ZoomGlide.SECONDS;
    if (share >= 1) {
      return this.to;
    }
    const eased = 1 - (1 - share) ** 3;
    return this.from * (this.to / this.from) ** eased;
  }

  /** On to another level, from where this one has got to. */
  towards(metres: number): ZoomGlide {
    return new ZoomGlide(this.metresHigh, metres, 0);
  }

  /** `seconds` further on. */
  after(seconds: number): ZoomGlide {
    return new ZoomGlide(this.from, this.to, this.gone + Math.max(seconds, 0));
  }
}
