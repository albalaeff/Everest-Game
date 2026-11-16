import type { ClimberView, Point } from "../physics";

/** A step of a changeover (#247): a cowstail's carabiner off the rope the player came on, or onto
 * the next one. The second cowstail ends in the carabiner and the first in the jumar. */
export type ChangeoverStep = "carabiner-off" | "carabiner-on" | "jumar-off" | "jumar-on";

/** Where a step stands for the climber as they are: done, its carabiner going on now, the one to
 * do now, or one for later. */
export type StepState = "done" | "going" | "now" | "later";

/**
 * A changeover at a rope's end (#247): the anchor where the rope the player came on (`from`)
 * ends, and the next rope (`next`) to move onto, a cowstail at a time, the carabiner first and then
 * the jumar, so one is always on (technique.changeover), as the agents' `Footwork` changes over;
 * or, where no rope goes on from there within reach, both cowstails off it, to walk on to where the
 * next one starts. The coach keeps one while the player is at it, the card ticks its steps off and
 * the arrow points at the one to do now. A value: where it is never changes, and what's done is
 * read off the climber each time it's asked.
 */
export class Changeover {
  private static readonly ACROSS: readonly ChangeoverStep[] = [
    "carabiner-off",
    "carabiner-on",
    "jumar-off",
    "jumar-on",
  ];
  private static readonly OFF: readonly ChangeoverStep[] = ["carabiner-off", "jumar-off"];

  constructor(
    readonly anchor: Point,
    readonly from: string,
    readonly next: string | null,
  ) {}

  /** Its steps, in order: onto the next rope, the carabiner off the old one and onto the next, then
   * the jumar; with no next rope, both off. */
  get steps(): readonly ChangeoverStep[] {
    return this.next === null ? Changeover.OFF : Changeover.ACROSS;
  }

  /** Whether a step is done, as the climber's cowstails are now: off is off the rope they came on,
   * on is on the next. */
  done(step: ChangeoverStep, view: ClimberView): boolean {
    const rope = step.startsWith("carabiner") ? view.second : view.first;
    return step.endsWith("-off") ? rope !== this.from : this.next !== null && rope === this.next;
  }

  /** Whether it's over: both cowstails on the next rope, or, with none, both off the old one. */
  over(view: ClimberView): boolean {
    return this.steps.every((step) => this.done(step, view));
  }

  /** The step to do now, or none once it's over. A cowstail that's off goes back on before
   * anything else, the carabiner before the jumar, so neither is off a moment longer than it must
   * be; then the carabiner moves over, then the jumar. */
  now(view: ClimberView): ChangeoverStep | null {
    if (this.over(view)) {
      return null;
    }
    if (this.next === null) {
      return view.second === this.from ? "carabiner-off" : "jumar-off";
    }
    if (view.second === null) {
      return "carabiner-on";
    }
    if (view.first === null) {
      return "jumar-on";
    }
    return view.second === this.next ? "jumar-off" : "carabiner-off";
  }

  /** The step whose carabiner is going onto the next rope now, the hands at it (#197), or none. */
  going(view: ClimberView): ChangeoverStep | null {
    if (this.next === null || view.clipping === null) {
      return null;
    }
    return view.clipping === "second" ? "carabiner-on" : "jumar-on";
  }

  /** Where a step stands for the climber as they are. */
  state(step: ChangeoverStep, view: ClimberView): StepState {
    if (this.done(step, view)) {
      return "done";
    }
    if (this.going(view) === step) {
      return "going";
    }
    return this.now(view) === step ? "now" : "later";
  }

  /** How far a point is from its anchor, in metres. */
  away(point: Point): number {
    return Math.hypot(point.x - this.anchor.x, point.y - this.anchor.y);
  }
}
