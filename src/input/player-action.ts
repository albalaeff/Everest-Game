import type { GameAction } from "../simulation";

/**
 * Opens a panel of the page. The simulation never hears it: what comes of the panel does, as a
 * `GameAction`, such as the radio call its phrases make (#79).
 */
export interface PanelRequest {
  readonly kind: "panel";
  readonly panel: "radio" | "inventory";
}

/** Shows more of the slope, or less: the player's own view, which the simulation, the room and
 * the replays never hear. */
export interface ViewRequest {
  readonly kind: "view";
  readonly change: "farther" | "closer";
}

/** What the player asks of the page alone. */
export type PageRequest = PanelRequest | ViewRequest;

/** What the player said, whatever they said it with. */
export type PlayerAction = GameAction | PageRequest;

/** Who listens to the player. */
export interface ActionSink {
  send(action: PlayerAction): void;
}

/** Who queues the game's actions alone for the simulation, alone or in a room: a page request
 * stays on the page. */
export abstract class GameActionSink implements ActionSink {
  send(action: PlayerAction): void {
    if (action.kind !== "panel" && action.kind !== "view") {
      this.queue(action);
    }
  }

  protected abstract queue(action: GameAction): void;
}
