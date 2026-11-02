import type { Pad } from "../gamepad-source";
import type { KeyPress } from "../keyboard-source";
import type { ActionSink, PlayerAction } from "../player-action";
import type { JoystickView, PointerPress } from "../pointer-source";

/** Keeps what the game would receive. */
export class HeardActions implements ActionSink {
  readonly actions: PlayerAction[] = [];

  send(action: PlayerAction): void {
    this.actions.push(action);
  }
}

/** Stands in for the window or an element: a test fires what the page would. */
export class FakeEvents<Fired> {
  private readonly listeners: { type: string; listener: (event: Fired) => void }[] = [];

  addEventListener(type: string, listener: (event: Fired) => void): void {
    this.listeners.push({ type, listener });
  }

  fire(type: string, event: Fired): void {
    for (const heard of this.listeners) {
      if (heard.type === type) {
        heard.listener(event);
      }
    }
  }
}

/** The keyboard, with keys named by `KeyboardEvent.code`. */
export class FakeKeyboard extends FakeEvents<KeyPress> {
  /** Presses a key, and says whether the page kept it from the browser. */
  down(code: string, details: Partial<KeyPress> = {}): boolean {
    let prevented = false;
    this.fire("keydown", {
      code,
      repeat: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      target: null,
      preventDefault: () => {
        prevented = true;
      },
      ...details,
    });
    return prevented;
  }

  up(code: string): void {
    this.fire("keyup", {
      code,
      repeat: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      target: null,
      preventDefault: () => undefined,
    });
  }

  tap(code: string): void {
    this.down(code);
    this.up(code);
  }
}

/** The surface under the fingers and the mouse. Time is in milliseconds, as a test says. */
export class FakeSurface extends FakeEvents<PointerPress> {
  private time = 0;

  /** Lets time go by, for a finger that stays where it is. */
  wait(milliseconds: number): void {
    this.time += milliseconds;
  }

  touch(id: number, x: number, y: number): void {
    this.fire("pointerdown", this.press(id, "touch", x, y));
  }

  drag(id: number, x: number, y: number): void {
    this.fire("pointermove", this.press(id, "touch", x, y));
  }

  lift(id: number, x: number, y: number): void {
    this.fire("pointerup", this.press(id, "touch", x, y));
  }

  /** What the phone does to a touch when a call comes in. */
  cancel(id: number, x: number, y: number): void {
    this.fire("pointercancel", this.press(id, "touch", x, y));
  }

  click(x: number, y: number, button = 0): void {
    this.fire("pointerdown", { ...this.press(1, "mouse", x, y), button });
    this.fire("pointerup", { ...this.press(1, "mouse", x, y), button });
  }

  private press(pointerId: number, pointerType: string, clientX: number, clientY: number) {
    return { pointerId, pointerType, clientX, clientY, button: 0, timeStamp: this.time };
  }
}

/** A gamepad a test holds: the source reads what's pushed on its next poll. */
export class FakePad implements Pad {
  mapping = "standard";
  axes: readonly number[] = [0, 0, 0, 0];
  buttons: readonly { pressed: boolean }[] = [];

  press(...down: readonly number[]): void {
    this.buttons = Array.from({ length: 17 }, (_, index) => ({ pressed: down.includes(index) }));
  }

  push(x: number, y: number): void {
    this.axes = [x, y, 0, 0];
  }
}

/** The joystick on the screen, as far as a test can see it. */
export class FakeJoystick implements JoystickView {
  shownAt: readonly [number, number] | undefined;
  knob: readonly [number, number] = [0, 0];

  show(x: number, y: number): void {
    this.shownAt = [x, y];
  }

  moveKnob(x: number, y: number): void {
    this.knob = [x, y];
  }

  hide(): void {
    this.shownAt = undefined;
  }
}
