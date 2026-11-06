/** A puff of snow: where it was kicked up, how many times life size, and how long ago. */
interface Puff {
  x: number;
  y: number;
  grown: number;
  age: number;
}

/**
 * The snow the boots kick up where they come down (docs/guidelines/graphics.md → The animation
 * shows the body's state): a little cloud at each footfall that grows, rises and drifts on the
 * gust the way the wind blows, and fades in a little over half a second. A pool of so many, the
 * oldest taken again when all are in the air, so a frame allocates none. The drawing is the
 * layer's; this is where the puffs are.
 */
export class SnowPuffs {
  static readonly SECONDS = 0.6;
  static readonly COUNT = 16;
  /** How big a puff gets, in metres at life size, how far it rises in its time, how fast it
   * drifts on the full gust, and how strong it shows at first. */
  private static readonly METRES = 0.14;
  private static readonly RISE_METRES = 0.08;
  private static readonly DRIFT = 0.6;
  private static readonly ALPHA = 0.7;

  private readonly puffs: readonly Puff[] = Array.from({ length: SnowPuffs.COUNT }, () => ({
    x: 0,
    y: 0,
    grown: 1,
    age: Infinity,
  }));
  private next = 0;

  /** How many are in the air. */
  get live(): number {
    let live = 0;
    for (const { age } of this.puffs) {
      live += age < SnowPuffs.SECONDS ? 1 : 0;
    }
    return live;
  }

  /** A puff kicked up at `x`, `y`, for a figure drawn `grown` times life size. */
  kick(x: number, y: number, grown: number): void {
    const puff = this.puffs[this.next];
    if (puff !== undefined) {
      puff.x = x;
      puff.y = y;
      puff.grown = grown;
      puff.age = 0;
    }
    this.next = (this.next + 1) % SnowPuffs.COUNT;
  }

  /** `seconds` later, on a gust of `gust`, 0 to 1. */
  advance(seconds: number, gust: number): void {
    const frame = Math.max(seconds, 0);
    for (const puff of this.puffs) {
      if (puff.age < SnowPuffs.SECONDS) {
        puff.age += frame;
        puff.x += SnowPuffs.DRIFT * Math.max(gust, 0) * frame * puff.grown;
      }
    }
  }

  /** Each puff in the air: where its middle is, how wide it is and how strong it shows. */
  forEach(draw: (x: number, y: number, radius: number, alpha: number) => void): void {
    for (const { x, y, grown, age } of this.puffs) {
      if (age < SnowPuffs.SECONDS) {
        const share = age / SnowPuffs.SECONDS;
        const out = 1 - (1 - share) * (1 - share);
        const radius = SnowPuffs.METRES * grown * (0.35 + 0.65 * out);
        const fade = 1 - share;
        draw(x, y + SnowPuffs.RISE_METRES * grown * out, radius, SnowPuffs.ALPHA * fade * fade);
      }
    }
  }
}
