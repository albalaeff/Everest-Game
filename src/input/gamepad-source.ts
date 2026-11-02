import { CONTROLS, TOOL_BUTTONS } from "./controls";
import type { PlayerInput } from "./player-input";
import { Steering } from "./steering";

/** What the gamepad source reads of a `Gamepad`. */
export interface Pad {
  readonly mapping: string;
  readonly axes: readonly number[];
  readonly buttons: readonly { readonly pressed: boolean }[];
}

/** Where the gamepads come from: `navigator`, on the page. */
export interface Pads {
  getGamepads(): readonly (Pad | null)[];
}

/**
 * The first gamepad with the standard mapping: without it, its buttons could be anything. The
 * Gamepad API has no events, so `poll` reads it each frame, and only a change goes on.
 */
export class GamepadSource {
  private steering = Steering.STOPPED;
  private down: ReadonlySet<number> = new Set();

  constructor(
    private readonly pads: Pads,
    private readonly player: PlayerInput,
  ) {}

  poll(): void {
    const pad = this.pads.getGamepads().find((found) => found?.mapping === "standard");
    this.readStick(pad?.axes ?? []);
    this.readButtons(pad?.buttons ?? []);
  }

  private readStick([x = 0, y = 0]: readonly number[]): void {
    const steering = Steering.ofStick(x, y);
    if (!steering.equals(this.steering)) {
      this.steering = steering;
      this.player.steer(steering);
    }
  }

  private readButtons(buttons: Pad["buttons"]): void {
    const down = new Set(buttons.flatMap(({ pressed }, index) => (pressed ? [index] : [])));
    for (const control of CONTROLS) {
      if (down.has(control.gamepadButton) && !this.down.has(control.gamepadButton)) {
        this.player.press(control);
      }
      if (!down.has(control.gamepadButton) && this.down.has(control.gamepadButton)) {
        this.player.release(control);
      }
    }
    for (const { button, tool } of TOOL_BUTTONS) {
      if (down.has(button) && !this.down.has(button)) {
        this.player.useToolAhead(tool);
      }
    }
    this.down = down;
  }
}
