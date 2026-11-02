import type { Control } from "./controls";
import type { PlayerInput } from "./player-input";

/** A control's button on the screen, the same on a PC and on a phone. */
export class ActionButton {
  private static readonly PRESSED = "action-button--pressed";
  private static readonly BUZZ_MILLISECONDS = 10;

  private readonly element = document.createElement("button");

  constructor(
    private readonly control: Control,
    label: string,
    private readonly player: PlayerInput,
  ) {
    const key = document.createElement("kbd");
    key.textContent = control.keyName;
    this.element.type = "button";
    this.element.className = "action-button";
    this.element.dataset.control = control.name;
    this.element.append(label, " ", key);
    this.element.addEventListener("pointerdown", () => {
      this.press();
    });
    for (const end of ["pointerup", "pointercancel", "pointerleave"]) {
      this.element.addEventListener(end, () => {
        this.release();
      });
    }
    // Focus would let Space press the button again, on top of its own action.
    this.element.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });
  }

  appendTo(parent: Element): void {
    parent.append(this.element);
  }

  /** Stops looking pressed, when the release will never come. */
  letGo(): void {
    this.element.classList.remove(ActionButton.PRESSED);
  }

  private press(): void {
    this.element.classList.add(ActionButton.PRESSED);
    if ("vibrate" in navigator) {
      navigator.vibrate(ActionButton.BUZZ_MILLISECONDS);
    }
    this.player.press(this.control);
  }

  private release(): void {
    this.letGo();
    this.player.release(this.control);
  }
}
