/**
 * How far a rope gives under a climber's weight (#232), as the picture draws it. A fixed line is
 * static rope: it stretches a few per cent of its loaded length under a body's weight
 * (`gear.fixed-rope-stretch`), so a climber whose weight comes onto it sinks that far, bobs on it
 * once or twice and hangs still, as a weight on a spring does, slower on a longer rope; and comes
 * up again as the weight comes off. As it comes taut the rope quivers across its length for a
 * moment.
 *
 * The spring is the rope's own: a weight that stretches its rope by `d` bobs on it at √(g/d), so
 * the give sets how fast it bobs, and only how soon it dies away is the picture's. Each frame is
 * worked out exactly, so a phone at 30 frames a second ends where a PC at 60 does. It keeps only
 * the picture's own: how far the climber has sunk, how fast, and how long ago the rope came taut.
 * The physics holds the climber where it did; the picture alone draws them this much lower.
 */
export class RopeGive {
  /** The most a climber is drawn below where the physics has them, in metres, at the bottom of
   * their first bob on the longest rope. */
  static readonly MOST_METRES = 0.3;
  /** How far across itself the rope quivers at the middle of its loaded length as it comes taut,
   * in metres, at the most. */
  static readonly QUIVER_METRES = 0.04;
  /** The world's gravity, in m/s². */
  private static readonly GRAVITY = 9.81;
  /** How soon the bob dies away, as a share of the damping that would stop it bobbing at all: a
   * kernmantle rope loses most of a bounce in a swing or two. */
  private static readonly DAMPING = 0.3;
  /** The shortest loaded length the spring is worked out for, in metres: a climber right under
   * their anchor still bobs on their cowstail and their harness. */
  private static readonly LEAST_SPAN = 0.5;
  /** The share of the weight at which the rope has come taut, for its quiver. */
  private static readonly TAUT = 0.5;
  /** The quiver: how often it comes and goes, and the seconds in which it dies away. */
  private static readonly QUIVER_HZ = 9;
  private static readonly QUIVER_SECONDS = 0.18;

  private sunk = 0;
  private speed = 0;
  private loaded = 0;
  /** The seconds since the rope came taut: forever, before it ever has. */
  private taut = Infinity;

  /** `stretch` is how far the rope gives under a climber's whole weight, as a share of its
   * loaded length. */
  constructor(private readonly stretch: number) {
    if (!(stretch >= 0)) {
      throw new RangeError(`A rope can't give ${stretch} of its length`);
    }
  }

  /** How far below where the physics has them the climber is drawn now, in metres. */
  get metres(): number {
    return this.sunk;
  }

  /** How far across itself the middle of the rope's loaded length is drawn now, in metres, either
   * way. */
  get quiver(): number {
    const { QUIVER_METRES, QUIVER_HZ, QUIVER_SECONDS } = RopeGive;
    if (!Number.isFinite(this.taut)) {
      return 0;
    }
    const fading = Math.exp(-this.taut / QUIVER_SECONDS);
    return QUIVER_METRES * fading * Math.sin(2 * Math.PI * QUIVER_HZ * this.taut);
  }

  /** `seconds` on, with `load` of the climber's weight on the rope, 0 to 1, and `span` metres of
   * it between them and the anchor that holds them. */
  advance(seconds: number, load: number, span: number): void {
    const { GRAVITY, DAMPING, LEAST_SPAN, MOST_METRES, TAUT } = RopeGive;
    const frame = Math.max(seconds, 0);
    const weight = Math.min(Math.max(load, 0), 1);
    this.taut = this.loaded < TAUT && weight >= TAUT ? 0 : this.taut + frame;
    this.loaded = weight;
    // The first bob goes this much past where the weight settles: the settled give is kept
    // short enough for it.
    const damped = Math.sqrt(1 - DAMPING * DAMPING);
    const past = Math.exp((-Math.PI * DAMPING) / damped);
    const whole = Math.min(this.stretch * Math.max(span, LEAST_SPAN), MOST_METRES / (1 + past));
    if (!(whole > 0)) {
      this.sunk = 0;
      this.speed = 0;
      return;
    }
    const target = whole * weight;
    const pace = Math.sqrt(GRAVITY / whole);
    const swing = pace * damped;
    const from = this.sunk - target;
    const fading = Math.exp(-DAMPING * pace * frame);
    const cos = Math.cos(swing * frame);
    const sin = Math.sin(swing * frame);
    const sunk =
      target + fading * (from * cos + ((this.speed + DAMPING * pace * from) / swing) * sin);
    this.speed =
      fading *
      (this.speed * cos - ((DAMPING * pace * this.speed + pace * pace * from) / swing) * sin);
    this.sunk = Math.min(Math.max(sunk, 0), MOST_METRES);
  }
}
