import type { GameAction } from "../simulation";

/**
 * Opens a panel of the page. The simulation never hears it: what comes of the panel does, as a
 * `GameAction`, such as the radio call its phrases make (#79).
 */
export interface PanelRequest {
  readonly kind: "panel";
  readonly panel: "radio" | "inventory";
}

/** What the player said, whatever they said it with. */
export type PlayerAction = GameAction | PanelRequest;

/** Who listens to the player. */
export interface ActionSink {
  send(action: PlayerAction): void;
}
