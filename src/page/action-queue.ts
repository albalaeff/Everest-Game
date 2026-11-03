import type { ActionSink, PlayerAction } from "../input/player-action";
import type { GameAction } from "../simulation";

/** The player's actions since the last step, for the next one. A panel request is the page's,
 * not the game's, and isn't queued. */
export class ActionQueue implements ActionSink {
  private queued: GameAction[] = [];

  send(action: PlayerAction): void {
    if (action.kind !== "panel") {
      this.queued.push(action);
    }
  }

  /** Everything queued, which the queue then forgets. */
  take(): readonly GameAction[] {
    const taken = this.queued;
    this.queued = [];
    return taken;
  }
}

/** Tells every listener what the player did: the game, and the list on the page. */
export class EverySink implements ActionSink {
  constructor(private readonly sinks: readonly ActionSink[]) {}

  send(action: PlayerAction): void {
    for (const sink of this.sinks) {
      sink.send(action);
    }
  }
}
