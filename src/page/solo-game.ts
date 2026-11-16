import type { ExpeditionStore } from "../saves";
import { Expedition, LetGo, SimulationClock, StepPacer } from "../simulation";
import type { ClimberId, ExpeditionSave, Rule } from "../simulation";
import type { ActionQueue } from "./action-queue";
import type { Played } from "./game-loop";

/**
 * The expedition played alone, paced by the browser's clock: each frame turns the real time gone
 * by into whole steps, through a `StepPacer`, and sends the player's queued actions with the first
 * of them. A phone at 30 frames a second and a PC at 60 take the same steps. Every ten seconds of
 * play, and whenever the page asks, the expedition is saved on the device, so a reload or a visit
 * tomorrow goes on from where it was (#28). The player's climber starts holding nothing, as the
 * controls do: a climb saved mid-stride doesn't walk on alone.
 */
export class SoloGame implements Played {
  /** The most steps one frame takes, a second's worth. A longer frame is a browser that drew
   * nothing, a tab in the background or a locked screen, and that pauses the climb alone (spec.md
   * → Phone and PC): it goes on where it was, rather than leaping ahead. */
  static readonly MAX_STEPS_A_FRAME = SimulationClock.STEPS_PER_SECOND;
  static readonly SAVE_EVERY_SECONDS = 10;

  private pacer = new StepPacer(SoloGame.MAX_STEPS_A_FRAME);
  /** How many times faster than real time it runs: once, but at the god mode's word (#245). */
  private times = 1;
  private unsaved = 0;

  constructor(
    private readonly expedition: Expedition,
    private readonly actions: ActionQueue,
    private readonly store: ExpeditionStore,
    player: ClimberId,
  ) {
    for (const action of new LetGo(player).actions()) {
      actions.send(action);
    }
  }

  /** The climb saved on the device, resumed on `rules`, or null when there's none, or none this
   * build can go on with: a save from before a rule changed, which a new climb replaces. */
  static resume(saved: ExpeditionSave | null, rules: readonly Rule[]): Expedition | null {
    if (saved === null) {
      return null;
    }
    try {
      return Expedition.resume(saved, rules);
    } catch {
      return null;
    }
  }

  /** How many steps have been played: the next is the god mode's to stage what comes on (#245). */
  get step(): number {
    return this.expedition.step;
  }

  /** Runs `times` times faster than real time from now on, a frame taking that many seconds'
   * steps at most: the god mode's speed (#245), and 1 for real time. */
  faster(times: number): void {
    if (!(times >= 1)) {
      throw new RangeError(`The climb can't run ${times} times faster than real time`);
    }
    this.times = times;
    this.pacer = new StepPacer(SoloGame.MAX_STEPS_A_FRAME * times);
  }

  advance(seconds: number): number {
    const steps = this.pacer.due(seconds * this.times);
    for (let step = 0; step < steps; step += 1) {
      this.expedition.advance(step === 0 ? this.actions.take() : []);
    }
    this.unsaved += steps;
    if (this.unsaved >= SoloGame.SAVE_EVERY_SECONDS * SimulationClock.STEPS_PER_SECOND) {
      this.save();
    }
    return steps;
  }

  get progress(): number {
    return this.pacer.progress;
  }

  /** Saves the expedition now: the tab going to the background, the page closing. */
  save(): void {
    this.unsaved = 0;
    void this.store.store(this.expedition.save());
  }
}
