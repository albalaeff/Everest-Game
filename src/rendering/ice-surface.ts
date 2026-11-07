import { Terrain } from "../physics";
import type { Point } from "../physics";

/** Where a ladder across a crevasse rests: its two ends, on the crevasse's lips. */
export interface Crossing {
  readonly start: Point;
  readonly finish: Point;
}

/**
 * The glacier's top as the picture draws the ice under it (#184): the ground's surface, with each
 * crevasse a ladder crosses closed between its lips. The ice's layers run on under a crevasse, as
 * they did before it opened, and what stands behind the route stands on its lips, never down in it.
 */
export class IceSurface {
  /** How near two lengths along the ground are to be the same point. */
  private static readonly SAME_ALONG = 1e-9;
  /** How finely a stretch is looked along for its highest and lowest ground. */
  private static readonly LOOK_EVERY = 0.25;

  /** The surface, left to right, x never going back. */
  readonly points: readonly Point[];
  private readonly lid: Terrain;
  /** Each crevasse's lips, across. */
  private readonly gaps: readonly { readonly left: number; readonly right: number }[];

  constructor(terrain: Terrain, crossings: readonly Crossing[]) {
    const spans = crossings.map(({ start, finish }) => {
      const [one, other] = [terrain.nearest(start).along, terrain.nearest(finish).along];
      return {
        from: Math.min(one, other) + IceSurface.SAME_ALONG,
        to: Math.max(one, other) - IceSurface.SAME_ALONG,
      };
    });
    this.points = terrain.points.flatMap(([x, y], index) => {
      const along = terrain.alongs[index] ?? 0;
      return spans.some(({ from, to }) => along > from && along < to) ? [] : [{ x, y }];
    });
    this.lid = new Terrain(this.points.map(({ x, y }) => [x, y] as const));
    this.gaps = crossings.map(({ start, finish }) => ({
      left: Math.min(start.x, finish.x),
      right: Math.max(start.x, finish.x),
    }));
  }

  /** The surface's height at `x`: the line between the lips over a crevasse, a wall's top on it. */
  height(x: number): number {
    return this.lid.height(x);
  }

  /** Whether `x` is over an open crevasse, between the lips of one a ladder crosses. */
  open(x: number): boolean {
    return this.gaps.some(({ left, right }) => x > left && x < right);
  }

  /** The highest the surface goes from `left` to `right` across. */
  highest(left: number, right: number): number {
    let highest = -Infinity;
    for (const x of this.across(left, right)) {
      highest = Math.max(highest, this.height(x));
    }
    return highest;
  }

  /** The lowest the surface goes from `left` to `right` across. */
  lowest(left: number, right: number): number {
    let lowest = Infinity;
    for (const x of this.across(left, right)) {
      lowest = Math.min(lowest, this.lowAt(x));
    }
    return lowest;
  }

  /** The surface's height at `x`, a wall's foot on the wall. */
  private lowAt(x: number): number {
    const before = this.height(x - IceSurface.SAME_ALONG);
    const after = this.height(x + IceSurface.SAME_ALONG);
    return Math.min(before, after, this.height(x));
  }

  /** Where a stretch is looked at: its ends, the surface's corners in it, and every so often. */
  private across(left: number, right: number): number[] {
    const xs = [left, right];
    for (let x = left; x < right; x += IceSurface.LOOK_EVERY) {
      xs.push(x);
    }
    for (const { x } of this.points) {
      if (x > left && x < right) {
        xs.push(x);
      }
    }
    return xs;
  }
}
