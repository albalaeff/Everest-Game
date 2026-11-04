import { GameActionSink } from "../input/player-action";
import type { ActionSink, PlayerAction } from "../input/player-action";
import type { ZoomControl } from "../rendering";
import type { GameAction } from "../simulation";

/** The player's actions since the last step, for the next one. A page request isn't queued. */
export class ActionQueue extends GameActionSink {
  private queued: GameAction[] = [];

  /** Everything queued, which the queue then forgets. */
  take(): readonly GameAction[] {
    const taken = this.queued;
    this.queued = [];
    return taken;
  }

  protected queue(action: GameAction): void {
    this.queued.push(action);
  }
}

/** Tells every listener what the player did: the game, the zoom, and the list on the page. */
export class EverySink implements ActionSink {
  constructor(private readonly sinks: readonly ActionSink[]) {}

  send(action: PlayerAction): void {
    for (const sink of this.sinks) {
      sink.send(action);
    }
  }
}

/** Hands the player's view, farther or closer, to the zoom: the page's own, never the game's. */
export class ZoomSink implements ActionSink {
  constructor(private readonly zoom: ZoomControl) {}

  send(action: PlayerAction): void {
    if (action.kind === "view") {
      this.zoom.step(action.change);
    }
  }
}
