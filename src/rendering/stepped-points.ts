import type { Point } from "../physics";

/** Where a frame falls among the expedition's steps: how many it took, and how far the next one
 * has come since, so the picture draws what moves between the last two. */
export interface BetweenSteps {
  /** The steps the frame took. */
  readonly taken: number;
  /** How far the next step has come, from 0 up to 1. */
  readonly progress: number;
}

/**
 * Points the picture draws between the expedition's last two steps, as Fiedler's "Fix your
 * timestep" does it (docs/guidelines/graphics.md → Motion): a climber, a carabiner, a rope's
 * chain. Each frame hands it the points as the last step left them, and they're drawn as far from
 * where the step before left them as the next step has come, so a climber at 60 frames a second
 * moves every frame rather than one in three, a step, 50 ms, behind the mountain. A frame that took
 * several steps puts the one before on the line between where the points were and where they are
 * now; a jump further than any step goes, a climb resumed or a room's fresh save, is drawn at once.
 * It keeps only the picture's own: the points of the last two steps, in arrays it reuses.
 */
export class SteppedPoints {
  /** How far a point goes in a step, at the most, and is still drawn moving there. */
  static readonly JUMP_METRES = 5;

  /** x and y of each point after the step before the last, after the last, and drawn. */
  private before = new Float64Array(0);
  private after = new Float64Array(0);
  private drawn = new Float64Array(0);
  private count = 0;
  private started = false;
  private movedNow = false;

  /** How many points there are. */
  get length(): number {
    return this.count;
  }

  /** Whether a point is drawn anywhere else this frame than the last: what doesn't move needn't
   * be drawn again. */
  get moved(): boolean {
    return this.movedNow;
  }

  /** Where a point is drawn this frame. */
  x(index: number): number {
    return this.drawn[2 * index] ?? Number.NaN;
  }

  y(index: number): number {
    return this.drawn[2 * index + 1] ?? Number.NaN;
  }

  /** The frame's points: `points` as the last step left them, and where the frame falls. */
  follow(points: readonly Point[], between: BetweenSteps): void {
    const { taken } = between;
    let moved = false;
    if (!this.started || points.length !== this.count || this.jumped(points, taken)) {
      moved = this.restart(points);
    } else if (taken > 0) {
      this.stepTo(points, (taken - 1) / taken);
    }
    const share = Math.min(Math.max(between.progress, 0), 1);
    const { before, after, drawn } = this;
    for (let index = 0; index < 2 * this.count; index += 1) {
      const from = before[index] ?? 0;
      const now = from + ((after[index] ?? 0) - from) * share;
      moved ||= now !== drawn[index];
      drawn[index] = now;
    }
    this.movedNow = moved;
  }

  /** Every point drawn where it is, as if it had always been there. Whether there are more or
   * fewer of them now. */
  private restart(points: readonly Point[]): boolean {
    const recounted = !this.started || points.length !== this.count;
    if (points.length !== this.count) {
      this.count = points.length;
      this.before = new Float64Array(2 * this.count);
      this.after = new Float64Array(2 * this.count);
      this.drawn = new Float64Array(2 * this.count);
    }
    for (let index = 0; index < this.count; index += 1) {
      const point = points[index];
      this.before[2 * index] = this.after[2 * index] = point?.x ?? 0;
      this.before[2 * index + 1] = this.after[2 * index + 1] = point?.y ?? 0;
    }
    this.started = true;
    return recounted;
  }

  /** The last step's points become the step before's, `share` of the way on to the new ones. */
  private stepTo(points: readonly Point[], share: number): void {
    const { before, after } = this;
    for (let index = 0; index < 2 * this.count; index += 1) {
      const point = points[index >> 1];
      const now = (index & 1) === 0 ? (point?.x ?? 0) : (point?.y ?? 0);
      const last = after[index] ?? now;
      before[index] = last + (now - last) * share;
      after[index] = now;
    }
  }

  /** Whether a point went further than `steps` steps could take it: after none, anywhere. */
  private jumped(points: readonly Point[], steps: number): boolean {
    const reach = steps * SteppedPoints.JUMP_METRES;
    const { after } = this;
    for (let index = 0; index < this.count; index += 1) {
      const point = points[index];
      const dx = (point?.x ?? 0) - (after[2 * index] ?? 0);
      const dy = (point?.y ?? 0) - (after[2 * index + 1] ?? 0);
      if (steps === 0 ? dx !== 0 || dy !== 0 : dx * dx + dy * dy > reach * reach) {
        return true;
      }
    }
    return false;
  }
}
