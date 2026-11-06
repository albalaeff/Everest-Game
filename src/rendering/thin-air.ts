/**
 * How thin the air above an altitude is, as the sky shows it: the share of the atmosphere's mass
 * below, 0 at sea level and nearer 1 the higher, so the less air there is above to scatter the
 * light, the deeper the sky's blue overhead and the more faint stars show (docs/guidelines/
 * graphics.md → light tells the time and the altitude). The pressure falls by e every scale
 * height: the picture's own model, not the body's. Pure.
 */
export class ThinAir {
  /** The atmosphere's scale height, in metres. */
  private static readonly SCALE_METRES = 8_000;
  /** How near two airs look the same, so the colours aren't mixed again for every metre. */
  private static readonly SAME = 0.004;

  /** The share of the air's mass below, 0 to nearly 1. */
  readonly share: number;

  private constructor(altitude: number) {
    this.share = 1 - Math.exp(-Math.max(altitude, 0) / ThinAir.SCALE_METRES);
  }

  /** The air at `altitude` metres above the sea. */
  static at(altitude: number): ThinAir {
    return new ThinAir(altitude);
  }

  /** Whether two airs draw the same sky. */
  same(other: ThinAir): boolean {
    return Math.abs(this.share - other.share) < ThinAir.SAME;
  }
}
