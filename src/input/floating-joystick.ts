import type { JoystickView } from "./pointer-source";

/** The round joystick, which appears where the thumb lands. */
export class FloatingJoystick implements JoystickView {
  constructor(
    private readonly ring: HTMLElement,
    private readonly knob: HTMLElement,
  ) {}

  show(x: number, y: number): void {
    this.ring.style.setProperty("--x", `${String(x)}px`);
    this.ring.style.setProperty("--y", `${String(y)}px`);
    this.ring.hidden = false;
    this.moveKnob(0, 0);
  }

  moveKnob(x: number, y: number): void {
    this.knob.style.setProperty("--x", String(x));
    this.knob.style.setProperty("--y", String(y));
  }

  hide(): void {
    this.ring.hidden = true;
  }
}
