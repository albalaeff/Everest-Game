import { KeptChoice } from "./kept-choice";
import type { ChoiceStorage } from "./kept-choice";

/** A press of `[-]` or `[+]`: more of the slope, or less. */
export type ZoomChange = "farther" | "closer";

/**
 * How much of the slope the screen shows, from its top to its bottom: one of four frozen levels,
 * from 10 m, close in, to 100 m, to see the slope ahead. A climb starts on 20 m.
 */
export class Zoom {
  static readonly CLOSE = new Zoom(10);
  static readonly STANDARD = new Zoom(20);
  static readonly FAR = new Zoom(50);
  static readonly FARTHEST = new Zoom(100);
  static readonly LEVELS: readonly Zoom[] = [Zoom.CLOSE, Zoom.STANDARD, Zoom.FAR, Zoom.FARTHEST];

  private constructor(readonly metresHigh: number) {}

  /** What the device keeps: the metres. */
  get name(): string {
    return String(this.metresHigh);
  }

  /** The level a press moves to: one farther out or closer in, and none past the ends. */
  towards(change: ZoomChange): Zoom {
    const { LEVELS } = Zoom;
    const index = LEVELS.indexOf(this) + (change === "farther" ? 1 : -1);
    return LEVELS[Math.min(Math.max(index, 0), LEVELS.length - 1)] ?? this;
  }
}

/** The level this device's climbs start on: 20 m, then whatever was chosen last. */
export class ZoomChoice extends KeptChoice<Zoom> {
  static readonly KEY = "everest.zoom";

  constructor(storage: ChoiceStorage | null) {
    super(storage, ZoomChoice.KEY, Zoom.LEVELS, Zoom.STANDARD);
  }
}
