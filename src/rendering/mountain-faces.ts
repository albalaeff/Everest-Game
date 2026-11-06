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
  /** A rock band's depth, as a share of the massif's height, and how uneven its edges are, as a
   * share of its depth. */
  private static readonly BAND_DEPTH = 0.05;
  private static readonly BAND_UNEVEN = 0.3;
  /** How a band breaks where the snow runs down through it: the share of its depth it keeps on
   * average, and how far that swings either way, so it thins out and stops in places. */
  private static readonly BAND_KEPT = 0.55;
  private static readonly BAND_BROKEN = 0.8;
  /** A shaded flank's spine: how far its foot leans from under the summit, as a share of the
   * massif's half width, and in how many pieces it's drawn. */
  private static readonly SPINE_LEAN = 0.2;
  private static readonly SPINE_PIECES = 6;

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
      height = Math.max(height, MountainFaces.rise(massif, x));
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

  /** The flanks on one `side` of the summits, 1 the right and -1 the left, that the layer shades
   * when the sun is on the other: from each summit down the skyline as far as its massif holds it,
   * down to `below` under the base, and back up a spine that leans from under the summit the
   * flank's way. As closed outlines, one a massif. */
  shades(side: 1 | -1, below: number): readonly (readonly Point[])[] {
    const { base } = this.options;
    const outward = side === 1 ? this.outline : [...this.outline].reverse();
    const shades: (readonly Point[])[] = [];
    for (const massif of this.options.massifs) {
      const peak = { x: massif.summit, y: this.top(massif.summit) };
      const flank: Point[] = [peak];
      for (const point of outward) {
        if ((point.x - massif.summit) * side <= 0) {
          continue;
        }
        const rise = MountainFaces.rise(massif, point.x);
        if (rise <= 0 || rise < this.massifs(point.x)) {
          break;
        }
        flank.push(point);
      }
      const end = flank.at(-1);
      if (flank.length < 2 || end === undefined) {
        continue;
      }
      const lean = Math.min(
        massif.halfWidth * MountainFaces.SPINE_LEAN,
        Math.abs(end.x - massif.summit) / 2,
      );
      const foot = massif.summit + side * lean;
      const spine: Point[] = [];
      for (let piece = MountainFaces.SPINE_PIECES; piece > 0; piece -= 1) {
        const down = piece / MountainFaces.SPINE_PIECES;
        const x = massif.summit + side * lean * down ** 1.5;
        spine.push({ x, y: peak.y + (base(x) - peak.y) * down });
      }
      shades.push([
        ...flank,
        { x: end.x, y: base(end.x) - below },
        { x: foot, y: base(foot) - below },
        ...spine,
      ]);
    }
    return shades;
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

  /** A band across a massif at `share` of its height: level, as strata lie, as wide as the
   * massif's face stands above it, thinning out at its ends and where the snow runs down through
   * it, its edges a little uneven. */
  private band(massif: Massif, share: number): readonly Point[] {
    const { base, step } = this.options;
    const { BAND_KEPT, BAND_BROKEN } = MountainFaces;
    const depth = massif.height * MountainFaces.BAND_DEPTH;
    const level = massif.height * share;
    const upper: Point[] = [];
    const lower: Point[] = [];
    for (
      let x = massif.summit - massif.halfWidth;
      x <= massif.summit + massif.halfWidth;
      x += step / 2
    ) {
      const above = MountainFaces.rise(massif, x) - level - depth;
      if (above <= 0) {
        continue;
      }
      const kept = BAND_KEPT + BAND_BROKEN * Math.sin(x * 0.9 + share * 11) * Math.sin(x * 0.37);
      const thickness = depth * Math.min(1, above / depth) * Math.min(Math.max(kept, 0), 1);
      const middle =
        base(x) + level + depth * MountainFaces.BAND_UNEVEN * Math.sin(x * 1.3 + share * 7);
      upper.push({ x, y: middle + thickness / 2 });
      lower.push({ x, y: middle - thickness / 2 });
    }
    return [...upper, ...lower.reverse()];
  }

  /** How high one massif rises over the ridge at `x`, the others aside. */
  private static rise(massif: Massif, x: number): number {
    const across = Math.abs(x - massif.summit) / massif.halfWidth;
    return across < 1 ? massif.height * (1 - across) ** massif.shape : 0;
  }
}
