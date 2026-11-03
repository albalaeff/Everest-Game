import { ActionButton } from "./action-button";
import { CONTROLS } from "./controls";
import type { ControlName } from "./controls";
import { FloatingJoystick } from "./floating-joystick";
import { GamepadSource } from "./gamepad-source";
import { InputLayer } from "./input-layer";
import { KeyboardSource } from "./keyboard-source";
import { PageElements } from "./page-elements";
import type { ActionSink } from "./player-action";
import { PlayerInput } from "./player-input";
import { PointerSource } from "./pointer-source";
import type { SlopeView } from "./slope-view";
import { TouchMode } from "./touch-mode";

/** The page's words, in one language of content/controls.json. */
export type ControlTexts = Readonly<
  Record<ControlName | "hint-click" | "hint-tap" | "turn-phone", string>
>;

/** Puts the page's controls together, around index.html's elements: the player's actions go to
 * `sink`, and the slope is seen through `slope`, the camera. */
export class ControlsPage {
  private static readonly CLIMBER = "player";

  private readonly elements: PageElements;

  constructor(
    private readonly window: Window,
    texts: ControlTexts,
    slope: SlopeView,
    sink: ActionSink,
  ) {
    this.elements = new PageElements(window.document);
    const player = new PlayerInput(ControlsPage.CLIMBER, slope, sink);
    const joystick = new FloatingJoystick(this.element("#joystick"), this.element("#knob"));
    const keyboard = new KeyboardSource(window, player);
    const pointer = new PointerSource(this.element("#slope"), player, joystick, window);
    const buttons = CONTROLS.map((control) => {
      const button = new ActionButton(control, texts[control.name], player);
      button.appendTo(this.element(`#controls .${control.group}`));
      return button;
    });
    new InputLayer([keyboard, pointer, ...buttons, player], window, window.document);
    new TouchMode(window, window.document.documentElement);
    for (const text of ["hint-click", "hint-tap", "turn-phone"] as const) {
      this.element(`#${text}`).textContent = texts[text];
    }
    this.pollGamepads(player);
  }

  /** Each frame: the Gamepad API has no events. An insecure page, as on a LAN, has no gamepads. */
  private pollGamepads(player: PlayerInput): void {
    const { navigator } = this.window;
    if (!("getGamepads" in navigator)) {
      return;
    }
    const gamepads = new GamepadSource(navigator, player);
    const poll = (): void => {
      gamepads.poll();
      this.window.requestAnimationFrame(poll);
    };
    poll();
  }

  private element(selector: string): HTMLElement {
    return this.elements.find(selector);
  }
}
