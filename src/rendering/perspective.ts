import { Zoom } from "./zoom";

/**
 * How a layer behind the slope looks as the camera pulls back or comes closer: the camera stands
 * as far from the slope as the metres it shows, and a layer of depth k at the standard view lies
 * (1/k − 1) of that distance behind the slope. At a view H metres high it moves H / (H + its
 * distance) of the slope's way and is drawn that share over k as large as at the standard view,
 * as a camera sees mountains: zoomed out, the slope shrinks to a fifth and a far range barely
 * changes. The slope and what's in front of it zoom as they are, and what stays on the screen
 * doesn't move.
 */
export class Perspective {
  /** How far behind the slope the layer lies, in the camera's distance at the standard view's
   * metres; 0 for a layer that keeps its depth. */
  private readonly behind: number;

  constructor(private readonly depth: number) {
    this.behind = depth > 0 && depth < 1 ? (1 / depth - 1) * Zoom.STANDARD.metresHigh : 0;
  }

  /** The share of the slope's motion the layer moves at a view `metresHigh` high. */
  share(metresHigh: number): number {
    return this.behind === 0 ? this.depth : metresHigh / (metresHigh + this.behind);
  }

  /** How large the layer is drawn at a view `metresHigh` high, against the standard view. */
  scale(metresHigh: number): number {
    return this.behind === 0 ? 1 : this.share(metresHigh) / this.depth;
  }
}
