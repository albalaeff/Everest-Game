import type { Point } from "../physics";
import { SeededRandom } from "../simulation";
import type { Faces, Fluting } from "./mountain-faces";

/** How big a line of ice towers' towers are, in its layer's metres. */
export interface TowerSizes {
  /** A tower's width, and how high its top stands over the base. */
  readonly width: { readonly min: number; readonly max: number };
  readonly height: { readonly min: number; readonly max: number };
  /** How far apart they stand, and how high the ice between them lies over the base: below it,
   * where they stand alone. */
  readonly apart: { readonly min: number; readonly max: number };
  readonly saddle: { readonly min: number; readonly max: number };
}

export interface TowersOptions {
  /** Where the line runs, in its layer's metres. */
  readonly from: number;
  readonly to: number;
  readonly sizes: TowerSizes;
  /** The height the towers stand on at each x. */
  readonly base: (x: number) => number;
  /** How big the towers are at each x, as a share of their sizes: none at nought. */
  readonly scale?: (x: number) => number;
  readonly seed: number;
}

/** A tower of the line: where it stands across, how tall it is over its base, and its corners
 * from its left foot over its top to its right foot. */
export interface Tower {
  readonly left: number;
  readonly right: number;
  readonly height: number;
  readonly corners: readonly Point[];
}

/**
 * A line of ice towers, the Icefall's seracs and blocks seen from the side (#184): flat-sided and
 * broken at the top, leaning a little, as the photos show them, standing close or alone, with a cap
 * of snow on each top, streaks down their faces, and a face on each side for the sun to light or
 * leave in shade. What a layer draws in place of a ridge of mountains, built once; the colours and
 * the light are the layer's. Laid out by a seeded generator of the picture's own.
 */
export class IceTowers implements Faces {
  /** How far a tower's side leans in from its foot, as a share of its width, at the most. */
  private static readonly LEAN = 0.14;
  /** How many corners break a tower's top, at the most, and how far down they break it, as a
   * share of its height. */
  private static readonly BREAKS = 3;
  private static readonly BROKEN = 0.22;
  /** The snow on a tower's top, as a share of its height, the least and the most. */
  private static readonly CAP = { min: 0.025, max: 0.07 };
  /** A streak every so many of a tower's widths, down so much of its height. */
  private static readonly STREAKS = 0.22;
  private static readonly STREAK_DOWN = { min: 0.25, max: 0.7 };
  /** How much of its width each side's face is. */
  private static readonly FACE = 0.38;
  /** How finely the ice between towers follows the base. */
  private static readonly STEP = 1;

  /** The line, left to right, x never going back. */
  readonly outline: readonly Point[];
  readonly towers: readonly Tower[];
  readonly flutings: readonly Fluting[];
  readonly bands: readonly (readonly Point[])[] = [];
  /** The snow on each tower's top, closed. */
  readonly caps: readonly (readonly Point[])[];

  constructor(private readonly options: TowersOptions) {
    const { from, to, sizes, base, seed } = options;
    const scale = options.scale ?? ((): number => 1);
    const random = SeededRandom.fromSeed(seed);
    const between = ({ min, max }: { readonly min: number; readonly max: number }): number =>
      min + random.fraction() * (max - min);
    const outline: Point[] = [];
    const towers: Tower[] = [];
    let x = from;
    while (x <= to) {
      const size = scale(x);
      if (size <= 0) {
        outline.push({ x, y: base(x) + between(sizes.saddle) });
        x += IceTowers.STEP;
        continue;
      }
      const width = Math.min(
        between(sizes.width) * (0.6 + 0.4 * Math.min(size, 1)),
        sizes.width.max,
      );
      const height = between(sizes.height) * size;
      const corners = IceTowers.tower(x, width, height, base, random);
      outline.push(...corners);
      towers.push({ left: x, right: x + width, height, corners });
      // The ice between this tower and the next, at a saddle in the gap's middle.
      const gap = between(sizes.apart);
      const middle = x + width + gap / 2;
      outline.push({ x: middle, y: base(middle) + between(sizes.saddle) });
      x += width + gap;
    }
    this.outline = outline;
    this.towers = towers;
    this.caps = towers.map(({ corners, height }) => {
      const top = corners.slice(1, -1);
      const deep = height * between(IceTowers.CAP);
      return [...top, ...top.map(({ x: across, y }) => ({ x: across, y: y - deep })).reverse()];
    });
    const flutings: Fluting[] = [];
    for (const { left, right, height, corners } of towers) {
      const width = right - left;
      for (
        let at = left + width * 0.15;
        at < right - width * 0.1;
        at += width * IceTowers.STREAKS
      ) {
        const top = IceTowers.heightOn(corners, at);
        flutings.push({
          top: { x: at, y: top },
          foot: { x: at, y: top - height * between(IceTowers.STREAK_DOWN) },
        });
      }
    }
    this.flutings = flutings;
  }

  /** The line's height at `x`, between its corners. */
  top(x: number): number {
    return IceTowers.heightOn(this.outline, x);
  }

  /** The tops the first and last light touches: under each tower at least `share` as tall as the
   * tallest, `depth` deep, closed. */
  crests(depth: number, share: number): readonly (readonly Point[])[] {
    const tallest = Math.max(0, ...this.towers.map(({ height }) => height));
    return this.towers
      .filter(({ height }) => height >= tallest * share)
      .map(({ corners }) => {
        const top = corners.slice(1, -1);
        return [...top, ...top.map(({ x, y }) => ({ x, y: y - depth })).reverse()];
      });
  }

  /** Each tower's face on one `side`, 1 the right and -1 the left, down to `below` under its base,
   * closed: what the layer shades when the sun is on the other side. */
  shades(side: 1 | -1, below: number): readonly (readonly Point[])[] {
    const { base } = this.options;
    return this.towers.map(({ left, right, corners }) => {
      const cut =
        side === -1
          ? left + (right - left) * IceTowers.FACE
          : right - (right - left) * IceTowers.FACE;
      const kept = corners.map(({ x, y }) => ({
        x: side === -1 ? Math.min(x, cut) : Math.max(x, cut),
        y,
      }));
      const [first] = kept;
      const last = kept.at(-1);
      const foot = (across: number): Point => ({ x: across, y: base(across) - below });
      return side === -1
        ? [...kept.filter(({ x }) => x <= cut), foot(cut), foot(first?.x ?? left)]
        : [...kept.filter(({ x }) => x >= cut), foot(last?.x ?? right), foot(cut)];
    });
  }

  /** A tower's corners, from its left foot over its broken top to its right foot. */
  private static tower(
    left: number,
    width: number,
    height: number,
    base: (x: number) => number,
    random: SeededRandom,
  ): Point[] {
    const share = (low: number, high: number): number => low + random.fraction() * (high - low);
    const right = left + width;
    const top = (across: number, down: number): Point => ({
      x: across,
      y: base(across) + height * (1 - down),
    });
    const leftTop = left + width * share(0, IceTowers.LEAN);
    const rightTop = right - width * share(0, IceTowers.LEAN);
    const breaks = Math.floor(share(0, IceTowers.BREAKS + 0.999));
    const corners: Point[] = [
      { x: left, y: base(left) + height * share(-0.1, 0.05) },
      top(leftTop, share(0, IceTowers.BROKEN)),
    ];
    for (let corner = 1; corner <= breaks; corner += 1) {
      const across = leftTop + ((rightTop - leftTop) * corner) / (breaks + 1);
      corners.push(top(across, share(0, IceTowers.BROKEN)));
    }
    corners.push(top(rightTop, share(0, IceTowers.BROKEN)), {
      x: right,
      y: base(right) + height * share(-0.1, 0.05),
    });
    return corners;
  }

  /** The height of a line of corners at `x`, between them, or at its nearer end. */
  private static heightOn(line: readonly Point[], x: number): number {
    const first = line[0];
    const last = line.at(-1);
    if (first === undefined || last === undefined) {
      return 0;
    }
    if (x <= first.x) {
      return first.y;
    }
    for (let index = 1; index < line.length; index += 1) {
      const before = line[index - 1];
      const after = line[index];
      if (before !== undefined && after !== undefined && x <= after.x) {
        const span = after.x - before.x;
        return span === 0
          ? Math.max(before.y, after.y)
          : before.y + ((after.y - before.y) * (x - before.x)) / span;
      }
    }
    return last.y;
  }
}
