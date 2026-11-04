import type { Tool } from "../../simulation";
import type { Pad } from "../gamepad-source";
import type { KeyPress } from "../keyboard-source";
import type { ActionSink, PlayerAction } from "../player-action";
import type { JoystickView, PointerPress } from "../pointer-source";
import type { ScreenSize, SeenClimber, SlopePoint, SlopeView } from "../slope-view";
import type { WheelTurn } from "../wheel-source";

/** A plain mapping of the screen onto the slope, a hundred pixels a metre from the screen's
 * middle, with the climber wherever a test puts them, clipped or not. */
export class FakeSlopeView implements SlopeView {
  private static readonly PIXELS_PER_METRE = 100;
  private static readonly TOOL_REACH_METRES = 1;

  climber: SeenClimber = { x: 0, y: 0, first: null, second: null };

  constructor(private readonly screen: ScreenSize) {}

  at(screenX: number, screenY: number): SlopePoint {
    const { innerWidth, innerHeight } = this.screen;
    return {
      x: (screenX - innerWidth / 2) / FakeSlopeView.PIXELS_PER_METRE,
      y: (innerHeight / 2 - screenY) / FakeSlopeView.PIXELS_PER_METRE,
    };
  }

  ahead(tool: Tool["tool"]): SlopePoint {
    const reach = FakeSlopeView.TOOL_REACH_METRES;
    return { x: this.climber.x + reach, y: this.climber.y + (tool === "ice-axe" ? reach : -reach) };
  }
}

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

/** The mouse wheel over the slope. Time is in milliseconds, as a test says. */
export class FakeWheel extends FakeEvents<WheelTurn> {
  private time = 0;

  /** Lets time go by between turns. */
  wait(milliseconds: number): void {
    this.time += milliseconds;
  }

  /** A notch away from the player, or towards them, as the browser counts it: 100 px each. */
  away(details: Partial<WheelTurn> = {}): void {
    this.fire("wheel", { deltaY: -100, ctrlKey: false, timeStamp: this.time, ...details });
  }

  towards(details: Partial<WheelTurn> = {}): void {
    this.fire("wheel", { deltaY: 100, ctrlKey: false, timeStamp: this.time, ...details });
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
