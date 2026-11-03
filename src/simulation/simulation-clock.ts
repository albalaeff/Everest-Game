/**
 * The simulation's time, and the one thing it knows of time: a count of fixed steps. Twenty a
 * second is far too short to notice, so the game plays in real time, and a rule scales its
 * rates by `STEP_SECONDS`. The step is the engine's own number, not the mountain's, so it lives
 * here and not in the content data (docs/conventions/simulation-core.md).
 */
export class SimulationClock {
  static readonly STEPS_PER_SECOND = 20;
  static readonly STEP_SECONDS = 1 / SimulationClock.STEPS_PER_SECOND;

  constructor(private steps = 0) {}

  get step(): number {
    return this.steps;
  }

  /** The seconds played, from the count, so that they never drift. */
  get seconds(): number {
    return this.steps / SimulationClock.STEPS_PER_SECOND;
  }

  tick(): void {
    this.steps += 1;
  }
}
