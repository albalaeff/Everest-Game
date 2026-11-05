import type { Point } from "../physics";
import { Skyline } from "./skyline";

/** A mountain of a layer: where its summit stands, in the layer's metres, how wide its massif
 * is, how high the summit rises over the eye line, and the shape of its flanks. */
export interface Massif {
  readonly name: string;
  readonly summit: number;
  readonly halfWidth: number;
  readonly height: number;
  /** The flanks' curve: under 1 a horn, steep at the top; over 1 a dome or a shoulder. */
  readonly shape: number;
  /** Rock bands across the face, at these shares of its height. */
  readonly bands: readonly number[];
}

export interface FacesOptions {
  /** Where the layer runs, in its metres. */
  readonly from: number;
  readonly to: number;
  readonly step: number;
  readonly massifs: readonly Massif[];
  /** The ridge between and beyond the massifs: the lowest and the highest its line runs over
   * the base, and the massifs rise from it. */
  readonly low: number;
  readonly high: number;
  /** The height the line rises from at each x. */
  readonly base: (x: number) => number;
  readonly seed: number;
  /** Metres between the flutings across a face: a step and a half unless given. */
  readonly flutingEvery?: number;
}

/** A stroke down a face, from its top to its foot. */
export interface Fluting {
  readonly top: Point;
  readonly foot: Point;
}

/**
 * The faces of a background layer, in its metres: a skyline that rises over named massifs,
 * jagged by a seeded line of its own, with flutings running down each face from its ridge, rock
 * bands across it, and the crests the alpenglow lights. What a layer draws, built once; the
 * colours and the light are the layer's.
 */
export class MountainFaces {
  /** Flutings every so many steps across a massif, over this much of its width, down this
   * share of the face, splaying outward this much of their drop. */
  private static readonly FLUTING_STEPS = 1.5;
  private static readonly FLUTED_WIDTH = 0.85;
  private static readonly FLUTING_DROP = 0.45;
  private static readonly FLUTING_SPLAY = 0.12;
  /** A rock band's depth, as a share of the massif's height, and how far down the flanks it
   * runs: where the face is still this share of the summit's height. */
  private static readonly BAND_DEPTH = 0.05;
  private static readonly BAND_REACH = 0.3;

  /** The skyline, left to right. */
  readonly outline: readonly Point[];
  readonly flutings: readonly Fluting[];
  /** Closed outlines, one a band. */
  readonly bands: readonly (readonly Point[])[];

  constructor(private readonly options: FacesOptions) {
    const { from, to, step, low, high, base, seed } = options;
    const skyline = new Skyline({
      from,
      to,
      step,
      low,
      high,
      base: (x) => base(x) + this.massifs(x),
      seed,
    });
    this.outline = skyline.points;
    this.flutings = options.massifs.flatMap((massif) => this.flute(massif));
    this.bands = options.massifs.flatMap((massif) =>
      massif.bands.map((share) => this.band(massif, share)),
    );
  }

  /** How high the massifs rise over the ridge at `x`: the tallest there. */
  massifs(x: number): number {
    let height = 0;
    for (const massif of this.options.massifs) {
      const across = Math.abs(x - massif.summit) / massif.halfWidth;
      if (across < 1) {
        height = Math.max(height, massif.height * (1 - across) ** massif.shape);
      }
    }
    return height;
  }

  /** The skyline's height at `x`, between its points. */
  top(x: number): number {
    const { outline } = this;
    const first = outline[0];
    const last = outline.at(-1);
    if (first === undefined || last === undefined) {
      return 0;
    }
    if (x <= first.x) {
      return first.y;
    }
    if (x >= last.x) {
      return last.y;
    }
    for (let index = 1; index < outline.length; index += 1) {
      const before = outline[index - 1];
      const after = outline[index];
      if (before !== undefined && after !== undefined && x <= after.x) {
        const share = (x - before.x) / (after.x - before.x);
        return before.y + (after.y - before.y) * share;
      }
    }
    return last.y;
  }

  /** The crests the first and last light touches: under the skyline, `depth` deep, wherever a
   * massif stands at least `share` of its height, as closed outlines, one a massif. */
  crests(depth: number, share: number): readonly (readonly Point[])[] {
    const crests: (readonly Point[])[] = [];
    for (const massif of this.options.massifs) {
      const upper: Point[] = [];
      const lower: Point[] = [];
      for (const point of this.outline) {
        const across = Math.abs(point.x - massif.summit);
        if (across <= massif.halfWidth && this.massifs(point.x) >= massif.height * share) {
          upper.push(point);
          lower.push({ x: point.x, y: point.y - depth });
        }
      }
      if (upper.length >= 2) {
        crests.push([...upper, ...lower.reverse()]);
      }
    }
    return crests;
  }

  private flute(massif: Massif): Fluting[] {
    const flutings: Fluting[] = [];
    const reach = massif.halfWidth * MountainFaces.FLUTED_WIDTH;
    const every = this.options.flutingEvery ?? this.options.step * MountainFaces.FLUTING_STEPS;
    for (let x = massif.summit - reach; x <= massif.summit + reach; x += every) {
      const top = this.top(x);
      const foot = this.options.base(x);
      const drop = (top - foot) * MountainFaces.FLUTING_DROP;
      if (drop <= 0) {
        continue;
      }
      const splay = Math.sign(x - massif.summit) * drop * MountainFaces.FLUTING_SPLAY;
      flutings.push({ top: { x, y: top }, foot: { x: x + splay, y: top - drop } });
    }
    return flutings;
  }

  /** A band across a massif at `share` of its height: the line of that height, there and back
   * a band's depth lower, as far down the flanks as the face is still high. */
  private band(massif: Massif, share: number): readonly Point[] {
    const { base, step } = this.options;
    const depth = massif.height * MountainFaces.BAND_DEPTH;
    const upper: Point[] = [];
    const lower: Point[] = [];
    for (
      let x = massif.summit - massif.halfWidth;
      x <= massif.summit + massif.halfWidth;
      x += step
    ) {
      const rise = this.massifs(x);
      if (rise < massif.height * MountainFaces.BAND_REACH) {
        continue;
      }
      const y = base(x) + rise * share;
      upper.push({ x, y: y + depth / 2 });
      lower.push({ x, y: y - depth / 2 });
    }
    return [...upper, ...lower.reverse()];
  }
}
