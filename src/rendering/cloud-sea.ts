import type { Point } from "../physics";
import { SeededRandom } from "../simulation";

export interface CloudSeaOptions {
  /** Where the sea runs, in the layer's metres. */
  readonly from: number;
  readonly to: number;
  /** Metres between the outline's points. */
  readonly step: number;
  /** How high over the layer's base the sea's flat top lies, and how wide its puffs are. */
  readonly height: number;
  readonly puff: { readonly min: number; readonly max: number };
  readonly seed: number;
}

/**
 * The sea of clouds in the valley below, in a layer's metres: a flat top with cumulus puffs
 * rising from it, rounded, overlapping, laid by a seeded generator of the picture's own. The
 * drawing is the layer's; this is the outline of its top, left to right.
 */
export class CloudSea {
  /** How high a puff rises, as a share of its half-width, and how close the puffs stand. */
  private static readonly PUFF_RISE = 0.55;
  private static readonly PUFF_APART = { min: 0.7, max: 1.3 };

  readonly outline: readonly Point[];

  constructor(options: CloudSeaOptions) {
    const { from, to, step, height, puff, seed } = options;
    const random = SeededRandom.fromSeed(seed);
    const between = (low: number, high: number): number => low + random.fraction() * (high - low);
    const puffs: { readonly centre: number; readonly halfWidth: number }[] = [];
    for (let centre = from; centre <= to;) {
      const halfWidth = between(puff.min, puff.max);
      puffs.push({ centre, halfWidth });
      centre += halfWidth * between(CloudSea.PUFF_APART.min, CloudSea.PUFF_APART.max);
    }
    const outline: Point[] = [];
    for (let x = from; x <= to + step; x += step) {
      let rise = 0;
      for (const { centre, halfWidth } of puffs) {
        const across = (x - centre) / halfWidth;
        if (Math.abs(across) < 1) {
          rise = Math.max(rise, halfWidth * CloudSea.PUFF_RISE * Math.sqrt(1 - across * across));
        }
      }
      outline.push({ x, y: height + rise });
    }
    this.outline = outline;
  }
}
