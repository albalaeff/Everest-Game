import type { Tiredness } from "../simulation";

/**
 * A climber's breath as the picture shows it (docs/guidelines/graphics.md → animation shows the
 * body's state): a breath every few seconds at rest at the mountain's foot, faster on the move,
 * faster the higher and the more tired, and never faster than a gasp. It keeps only where in the
 * breath it is, on the picture's own clock.
 */
export class Breathing {
  /** Seconds a breath takes at rest at the base, and at the fastest, a gasp. */
  static readonly REST_SECONDS = 4;
  static readonly FASTEST_SECONDS = 1.2;
  static readonly BASE_ALTITUDE = 5000;
  /** How much shorter a breath gets for each 1000 m above the base. */
  private static readonly ALTITUDE_SHARE = 0.12;
  /** How much of a breath at rest one on the move takes. */
  private static readonly MOVING_SHARE = 0.6;
  private static readonly TIRED: Readonly<Record<Tiredness, number>> = {
    fresh: 1,
    tired: 0.85,
    "profoundly-tired": 0.7,
    exhausted: 0.55,
  };
  /** The breath out: from the middle of a breath to near its end. */
  static readonly EXHALE = { from: 0.5, to: 0.85 };

  /** Where in the breath, 0 at its start to 1 at its end. */
  private phase = 0;

  /** How many seconds a breath takes at `altitude`, `tiredness` and on the move or at rest. */
  static period(altitude: number, tiredness: Tiredness, moving: boolean): number {
    const above = Math.max(0, altitude - Breathing.BASE_ALTITUDE) / 1000;
    const slower = Math.max(0, 1 - Breathing.ALTITUDE_SHARE * above) * Breathing.TIRED[tiredness];
    const seconds = Breathing.REST_SECONDS * slower * (moving ? Breathing.MOVING_SHARE : 1);
    return Math.max(Breathing.FASTEST_SECONDS, seconds);
  }

  get where(): number {
    return this.phase;
  }

  get exhaling(): boolean {
    return this.phase >= Breathing.EXHALE.from && this.phase < Breathing.EXHALE.to;
  }

  /** How far the chest has risen, 0 to 1: full in the middle of a breath. */
  get chest(): number {
    return 0.5 - 0.5 * Math.cos(2 * Math.PI * this.phase);
  }

  /** `seconds` more of breathing, a breath taking `period` seconds. */
  advance(seconds: number, period: number): void {
    const phase = this.phase + Math.max(seconds, 0) / Math.max(period, 1e-6);
    this.phase = phase - Math.floor(phase);
  }
}
