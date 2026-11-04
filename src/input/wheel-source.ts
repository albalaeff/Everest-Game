import { CONTROLS } from "./controls";
import type { ControlName } from "./controls";
import type { PlayerInput } from "./player-input";

/** What the wheel source reads of a wheel's event. */
export type WheelTurn = Pick<WheelEvent, "deltaY" | "ctrlKey" | "timeStamp">;

/** Where the wheel turns come from: `#slope`, on the page. */
export interface WheelEvents {
  addEventListener(type: "wheel", listener: (event: WheelTurn) => void): void;
}

/**
 * The mouse wheel over the slope: a notch away from the player shows the slope closer, one towards
 * them farther, pressing the same rows as X and Z. Ctrl and the wheel stay the browser's own zoom.
 * A trackpad sends a stream of small turns for one swipe, so the view moves a level at most every
 * quarter of a second, the time the camera takes to glide there.
 */
export class WheelSource {
  private static readonly LEVEL_MILLISECONDS = 250;

  private last = -Infinity;

  constructor(
    wheel: WheelEvents,
    private readonly player: PlayerInput,
  ) {
    wheel.addEventListener("wheel", (event) => {
      this.turn(event);
    });
  }

  private turn(event: WheelTurn): void {
    if (
      event.ctrlKey ||
      event.deltaY === 0 ||
      event.timeStamp - this.last < WheelSource.LEVEL_MILLISECONDS
    ) {
      return;
    }
    this.last = event.timeStamp;
    const name: ControlName = event.deltaY < 0 ? "view-closer" : "view-farther";
    const control = CONTROLS.find((row) => row.name === name);
    if (control !== undefined) {
      this.player.press(control);
    }
  }
}
