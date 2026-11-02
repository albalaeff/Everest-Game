import type { Pace } from "../simulation";
import { CONTROLS, STEERING_KEYS } from "./controls";
import type { Control } from "./controls";
import type { PlayerInput } from "./player-input";
import { Steering } from "./steering";

/** What the keyboard source reads of a key's event. */
export type KeyPress = Pick<
  KeyboardEvent,
  "code" | "repeat" | "ctrlKey" | "altKey" | "metaKey" | "target" | "preventDefault"
>;

/** Where the keys come from: `window`, on the page. */
export interface KeyEvents {
  addEventListener(type: "keydown" | "keyup", listener: (event: KeyPress) => void): void;
}

/** The keyboard: `CONTROLS`' keys, and WASD with Shift and C to steer. */
export class KeyboardSource {
  private static readonly STEERING = new Set(Object.values(STEERING_KEYS).flat());
  private static readonly TEXT_FIELDS: readonly string[] = ["INPUT", "TEXTAREA", "SELECT"];

  private readonly held = new Set<string>();

  constructor(
    keys: KeyEvents,
    private readonly player: PlayerInput,
  ) {
    keys.addEventListener("keydown", (event) => {
      this.down(event);
    });
    keys.addEventListener("keyup", (event) => {
      this.up(event);
    });
  }

  /** Forgets the keys held, whose release went to another window. */
  letGo(): void {
    this.held.clear();
  }

  private down(event: KeyPress): void {
    const control = KeyboardSource.controlOf(event.code);
    if (
      (control === undefined && !KeyboardSource.STEERING.has(event.code)) ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      KeyboardSource.isTyping(event.target)
    ) {
      return;
    }
    event.preventDefault();
    if (event.repeat) {
      return;
    }
    this.held.add(event.code);
    if (control === undefined) {
      this.steer();
    } else {
      this.player.press(control);
    }
  }

  private up(event: KeyPress): void {
    if (!this.held.delete(event.code)) {
      return;
    }
    const control = KeyboardSource.controlOf(event.code);
    if (control === undefined) {
      this.steer();
    } else {
      this.player.release(control);
    }
  }

  private steer(): void {
    const { up, down, left, right } = STEERING_KEYS;
    const across = Number(this.anyHeld(right)) - Number(this.anyHeld(left));
    const upward = Number(this.anyHeld(up)) - Number(this.anyHeld(down));
    this.player.steer(Steering.ofKeys(across, upward, this.pace()));
  }

  private pace(): Pace["pace"] {
    const faster = this.anyHeld(STEERING_KEYS.faster);
    if (faster === this.anyHeld(STEERING_KEYS.restStep)) {
      return "steady";
    }
    return faster ? "faster" : "rest-step";
  }

  private anyHeld(keys: readonly string[]): boolean {
    return keys.some((key) => this.held.has(key));
  }

  private static controlOf(code: string): Control | undefined {
    return CONTROLS.find((control) => control.keys.includes(code));
  }

  private static isTyping(target: EventTarget | null): boolean {
    const element = target as Partial<HTMLElement> | null;
    return (
      KeyboardSource.TEXT_FIELDS.includes(element?.tagName ?? "") ||
      element?.isContentEditable === true
    );
  }
}
