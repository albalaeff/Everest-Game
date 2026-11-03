import { StepPacer } from "../simulation";
import type { Expedition } from "../simulation";
import type { ActionQueue } from "./action-queue";

/** What the loop draws after the steps: the scene. */
export interface Picture {
  draw(seconds: number): void;
}

/**
 * The page's loop: each frame turns the real time gone by into whole steps of the expedition,
 * sends the player's queued actions with the first of them, and then has the picture drawn. The
 * mountain never waits (docs/conventions/simulation-core.md): a phone at 30 frames a second and
 * a PC at 60 take the same steps.
 */
export class GameLoop {
  /** The most steps one frame takes, five seconds' worth: a phone back from a call doesn't
   * freeze catching up. */
  static readonly MAX_STEPS_A_FRAME = 100;

  private readonly pacer = new StepPacer(GameLoop.MAX_STEPS_A_FRAME);

  constructor(
    private readonly expedition: Expedition,
    private readonly actions: ActionQueue,
    private readonly picture: Picture,
  ) {}

  /** A frame, `seconds` after the last. */
  frame(seconds: number): void {
    const steps = this.pacer.due(seconds);
    for (let step = 0; step < steps; step += 1) {
      this.expedition.advance(step === 0 ? this.actions.take() : []);
    }
    this.picture.draw(seconds);
  }
}
