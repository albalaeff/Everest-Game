import type { Point } from "../physics";
import { SeededRandom } from "../simulation";
import { Drift } from "./drift";

/** A puff of a plume: where it is, how big and how dense, in its layer's metres, 0 for one that
 * doesn't show. The plume moves its puffs each frame, so a frame makes no new ones. */
export interface Puff {
  x: number;
  y: number;
  radius: number;
  alpha: number;
}

/**
 * The plume off a summit, in its layer's metres: snow the wind tears off the top and streams
 * downwind, to the right, as motes the gust blows along. The stronger the wind, the farther it
 * reaches and the denser it shows, so its length is the wind up there (docs/guidelines/graphics.md
 * → an effect tells something); a breath of wind shows none. It comes in softly at the summit,
 * spreads as it goes, trailing down the lee, and thins out towards its end. Laid by a seeded
 * generator of the picture's own; the drawing is the layer's.
 */
export class Plume {
  private static readonly MOTES = 70;
  /** From what gust it shows, and how much of its length it reaches when it just shows. */
  private static readonly FROM_GUST = 0.1;
  private static readonly SHORTEST = 0.2;
  /** How dense it is near the summit in a full gale. */
  private static readonly ALPHA = 0.7;
  /** Over what share of its length a puff comes in, torn off the summit. */
  private static readonly TORN_OFF = 0.08;
  /** How far it spreads below and above the summit by its end, as shares of its length. */
  private static readonly SPREAD = { below: 0.1, above: 0.05 };
  /** How big its puffs are at the summit, as shares of its length: twice as big by its end. */
  private static readonly SIZE = { min: 0.02, max: 0.05 };
  /** How fast its motes go at full gust, in its lengths a second: slowly, as a far plume seems
   * to stream. */
  private static readonly SPEED = { min: 0.05, max: 0.16 };

  /** One a mote, moved each frame. */
  readonly puffs: readonly Puff[];
  private readonly drift: Drift;

  constructor(
    readonly summit: Point,
    readonly length: number,
    seed: number,
  ) {
    const share = (range: { readonly min: number; readonly max: number }) => ({
      min: range.min * length,
      max: range.max * length,
    });
    this.drift = new Drift(
      {
        count: Plume.MOTES,
        from: 0,
        to: length,
        height: share({ min: -Plume.SPREAD.below, max: Plume.SPREAD.above }),
        size: share(Plume.SIZE),
        speed: share(Plume.SPEED),
      },
      SeededRandom.fromSeed(seed),
    );
    this.puffs = this.drift.motes.map(() => ({ x: summit.x, y: summit.y, radius: 0, alpha: 0 }));
  }

  /** `seconds` more of wind at `gust`, 0 to 1, at `elapsed` seconds of picture. */
  blow(seconds: number, gust: number, elapsed: number): void {
    const strength = Math.max(0, (gust - Plume.FROM_GUST) / (1 - Plume.FROM_GUST));
    const { length, summit, puffs } = this;
    if (strength > 0) {
      this.drift.blow(seconds, gust, () => 0, elapsed);
    }
    const reach = length * (Plume.SHORTEST + (1 - Plume.SHORTEST) * strength);
    const density = Plume.ALPHA * Math.sqrt(strength);
    const { motes } = this.drift;
    for (let index = 0; index < motes.length; index += 1) {
      const mote = motes[index];
      const puff = puffs[index];
      if (mote === undefined || puff === undefined) {
        continue;
      }
      const along = mote.x / length;
      const torn = Math.min(1, along / Plume.TORN_OFF);
      puff.x = summit.x + mote.x;
      puff.y = summit.y + mote.y * along;
      puff.radius = mote.size * (1 + along);
      puff.alpha = density * torn * Math.max(0, 1 - mote.x / reach);
    }
  }
}
