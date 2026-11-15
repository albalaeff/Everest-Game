import type { GameAction } from "./game-action";
import type { ActionSource } from "./headless-runner";

/** One step's actions in a log: only steps where someone did something are kept. */
export interface LoggedStep {
  readonly step: number;
  readonly actions: readonly GameAction[];
}

/**
 * What the players' climbers did, step by step. With its scenario it's a replay
 * (docs/conventions.md → Time and chance): played by a `HeadlessRunner`, it gives the same
 * expedition again, the agents steering their NPCs as they did (#212).
 */
export class ActionLog implements ActionSource {
  private readonly steps = new Map<number, readonly GameAction[]>();

  constructor(logged: readonly LoggedStep[] = []) {
    for (const { step, actions } of logged) {
      this.add(step, actions);
    }
  }

  add(step: number, actions: readonly GameAction[]): void {
    if (actions.length > 0) {
      this.steps.set(step, actions);
    }
  }

  actionsAt(step: number): readonly GameAction[] {
    return this.steps.get(step) ?? [];
  }

  save(): readonly LoggedStep[] {
    return [...this.steps].map(([step, actions]) => ({ step, actions }));
  }
}
