import type { ExpeditionStore } from "../saves";
import { SimulationClock, StepPacer } from "../simulation";
import type { Expedition } from "../simulation";
import type { ActionQueue } from "./action-queue";
import type { Played } from "./game-loop";

/**
 * The expedition played alone, paced by the browser's clock: each frame turns the real time gone
 * by into whole steps, through a `StepPacer`, and sends the player's queued actions with the first
 * of them. A phone at 30 frames a second and a PC at 60 take the same steps. Every ten seconds of
 * play, and whenever the page asks, the expedition is saved on the device, so a reload or a visit
 * tomorrow goes on from where it was (#28).
 */
export class SoloGame implements Played {
  /** The most steps one frame takes, five seconds' worth: a phone back from a call doesn't
   * freeze catching up. */
  static readonly MAX_STEPS_A_FRAME = 100;
  static readonly SAVE_EVERY_SECONDS = 10;

  private readonly pacer = new StepPacer(SoloGame.MAX_STEPS_A_FRAME);
  private unsaved = 0;

  constructor(
    private readonly expedition: Expedition,
    private readonly actions: ActionQueue,
    private readonly store: ExpeditionStore,
  ) {}

  advance(seconds: number): void {
    const steps = this.pacer.due(seconds);
    for (let step = 0; step < steps; step += 1) {
      this.expedition.advance(step === 0 ? this.actions.take() : []);
    }
    this.unsaved += steps;
    if (this.unsaved >= SoloGame.SAVE_EVERY_SECONDS * SimulationClock.STEPS_PER_SECOND) {
      this.save();
    }
  }

  /** Saves the expedition now: the tab going to the background, the page closing. */
  save(): void {
    this.unsaved = 0;
    void this.store.store(this.expedition.save());
  }
}
