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

  private readonly pacer = new StepPacer(SoloGame.MAX_STEPS_A_FRAME);
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

  advance(seconds: number): number {
    const steps = this.pacer.due(seconds);
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
