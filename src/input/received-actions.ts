import type { ActionSink, PlayerAction } from "./player-action";

/** Names on the page each action the game receives, newest first, until the game comes (#19). */
export class ReceivedActions implements ActionSink {
  constructor(private readonly list: HTMLElement) {}

  send(action: PlayerAction): void {
    const line = document.createElement("li");
    line.textContent = ReceivedActions.nameOf(action);
    this.list.prepend(line);
  }

  private static nameOf(action: PlayerAction): string {
    const fields = Object.entries(action) as [string, unknown][];
    return fields
      .filter(([field]) => field !== "climber")
      .map(([, value]) => String(value))
      .join(" ");
  }
}
