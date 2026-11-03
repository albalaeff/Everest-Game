import type { PlayerInput } from "./player-input";
import type { ScreenSize } from "./slope-view";
import { Steering } from "./steering";
import { Thumb } from "./thumb";

/** What the pointer source reads of a Pointer Event. */
export type PointerPress = Pick<
  PointerEvent,
  "pointerId" | "pointerType" | "clientX" | "clientY" | "button" | "timeStamp"
>;

type PointerEventName = "pointerdown" | "pointermove" | "pointerup" | "pointercancel";

/** Where the pointers come from: `#slope`, on the page. */
export interface PointerEvents {
  addEventListener(type: PointerEventName, listener: (event: PointerPress) => void): void;
}

/** The joystick on the screen: `moveKnob` takes shares of its reach. */
export interface JoystickView {
  show(x: number, y: number): void;
  moveKnob(x: number, y: number): void;
  hide(): void;
}

/**
 * The mouse and the fingers on the slope. A click or a tap uses a tool; a touch landing on the left
 * half is the joystick, where the thumb landed, unless a thumb's already on it. Each finger is
 * told by its `pointerId`, so both thumbs work at once.
 */
export class PointerSource {
  private thumb: Thumb | undefined;

  constructor(
    surface: PointerEvents,
    private readonly player: PlayerInput,
    private readonly joystick: JoystickView,
    private readonly screen: ScreenSize,
  ) {
    surface.addEventListener("pointerdown", (event) => {
      this.down(event);
    });
    surface.addEventListener("pointermove", (event) => {
      this.move(event);
    });
    surface.addEventListener("pointerup", (event) => {
      this.up(event);
    });
    surface.addEventListener("pointercancel", (event) => {
      this.cancel(event);
    });
  }

  /** Forgets the thumb, whose lift may never come. */
  letGo(): void {
    this.thumb = undefined;
    this.joystick.hide();
  }

  private down(event: PointerPress): void {
    if (event.button !== 0) {
      return;
    }
    if (this.landsOnTheJoystick(event)) {
      this.thumb = new Thumb(event);
      this.joystick.show(event.clientX, event.clientY);
    } else {
      this.player.useTool(event.clientX, event.clientY);
    }
  }

  private move(event: PointerPress): void {
    if (this.thumb?.pointerId !== event.pointerId) {
      return;
    }
    const [x, y] = this.thumb.stick(event);
    this.joystick.moveKnob(x, y);
    this.player.steer(this.thumb.steering(event));
  }

  private up(event: PointerPress): void {
    const { thumb } = this;
    if (thumb?.pointerId !== event.pointerId) {
      return;
    }
    this.stop();
    if (thumb.tappedAt(event)) {
      this.player.useTool(event.clientX, event.clientY);
    }
  }

  private cancel(event: PointerPress): void {
    if (this.thumb?.pointerId === event.pointerId) {
      this.stop();
    }
  }

  private stop(): void {
    this.letGo();
    this.player.steer(Steering.STOPPED);
  }

  private landsOnTheJoystick(event: PointerPress): boolean {
    return (
      event.pointerType === "touch" &&
      this.thumb === undefined &&
      event.clientX < this.screen.innerWidth / 2
    );
  }
}
