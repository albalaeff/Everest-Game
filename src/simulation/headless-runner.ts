import type { Expedition } from "./expedition";
import type { GameAction } from "./game-action";

/** Who acts when nobody is at the keys: a recorded log, or a scripted strategy (#47). */
export interface ActionSource {
  /** The actions of this step. A strategy reads the rules it was built with to choose them. */
  actionsAt(step: number): readonly GameAction[];
}

/**
 * Plays an expedition with no screen and no pacing, each step right after the last, for tests,
 * replays and the balance runner's thousands of expeditions (#47).
 */
export class HeadlessRunner {
  constructor(
    private readonly expedition: Expedition,
    private readonly source: ActionSource,
  ) {}

  /** Plays at most `steps` steps, stopping once `over` says so; returns how many it played. */
  play(steps: number, over: () => boolean = () => false): number {
    let played = 0;
    while (played < steps && !over()) {
      this.expedition.advance(this.source.actionsAt(this.expedition.step));
      played += 1;
    }
    return played;
  }
}
