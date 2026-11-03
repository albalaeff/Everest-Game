/**
 * Frames a second, counted over the last second of the browser's clock: a check on the targets
 * by hand, 60 on a laptop and 30 on a phone (spec.md → Technical architecture), and nothing the
 * game depends on.
 */
export class FrameRate {
  private static readonly WINDOW_MILLISECONDS = 1000;

  private frames = 0;
  private since: number | null = null;
  private reading: number | null = null;

  /** A frame drawn at `nowMilliseconds`; says whether a new reading came of it. */
  frame(nowMilliseconds: number): boolean {
    if (this.since === null) {
      this.since = nowMilliseconds;
      return false;
    }
    this.frames += 1;
    const elapsed = nowMilliseconds - this.since;
    if (elapsed < FrameRate.WINDOW_MILLISECONDS) {
      return false;
    }
    this.reading = Math.round((this.frames * 1000) / elapsed);
    this.frames = 0;
    this.since = nowMilliseconds;
    return true;
  }

  /** The last second's frames, or none before the first second has passed. */
  get fps(): number | null {
    return this.reading;
  }
}
