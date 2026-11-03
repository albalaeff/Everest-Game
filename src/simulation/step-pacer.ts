import { SimulationClock } from "./simulation-clock";

/**
 * Turns real time into whole steps, which is what makes the game real-time: a phone at 30
 * frames a second and a PC at 60 take the same steps a second. The page and the room server
 * each tell it how much real time went by, because the core never reads a clock
 * (docs/conventions.md → Time and chance).
 */
export class StepPacer {
  private behind = 0; // steps owed, a fraction of one once `due` has taken the whole ones

  /** `maxSteps`: the most one call gives, so a phone back from a locked screen doesn't freeze. */
  constructor(private readonly maxSteps: number) {}

  /** How many steps to take now that `realSeconds` more have gone by. A clock that ran back, as
   * a frame's timestamp can, counts as no time. */
  due(realSeconds: number): number {
    this.behind += Math.max(realSeconds, 0) * SimulationClock.STEPS_PER_SECOND;
    const steps = Math.floor(this.behind);
    this.behind -= steps;
    return Math.min(steps, this.maxSteps);
  }

  /** How far the next step has come, from 0 up to 1: the rendering draws between two steps. */
  get progress(): number {
    return this.behind;
  }
}
