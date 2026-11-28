/** What the look needs of the page: the element it listens on, and the document that holds the
 * pointer while the mouse turns the head. */
export interface LookHost {
  addEventListener(type: string, listener: (event: Event) => void): void;
  requestPointerLock?(): Promise<void> | undefined;
}

export interface LookDocument {
  readonly pointerLockElement: unknown;
  addEventListener(type: string, listener: (event: Event) => void): void;
}

/** A mouse or a finger moving, as the look reads it. */
interface Moved {
  readonly movementX?: number;
  readonly movementY?: number;
  readonly clientX?: number;
  readonly clientY?: number;
  readonly buttons?: number;
  readonly pointerType?: string;
}

/**
 * Which way the climber looks: the head turned left and right (`yaw`) and up and down (`pitch`),
 * in radians, by the mouse once a click on the picture has taken hold of it, as first-person
 * games do, or by a finger dragged over the picture. It's the picture's own, as the 2D camera's
 * zoom is: the simulation never hears where a climber looks. A head turns no further than a
 * neck and shoulders let it, and looks down to its own boots.
 */
export class FirstPersonLook {
  /** Radians a pixel of mouse turns the head, and a pixel of a finger's drag. */
  private static readonly MOUSE = 0.0022;
  private static readonly DRAG = 0.005;
  /** How far the head tips: down to the boots, and up past the towers' tops. */
  static readonly DOWN = -1.45;
  static readonly UP = 1.3;

  private turned = 0;
  private tipped = -0.08;
  private last: { x: number; y: number } | null = null;

  /** The head's turn about the vertical: 0 looks up the valley, and it grows to the left. */
  get yaw(): number {
    return this.turned;
  }

  /** The head's tip: 0 level, up positive. */
  get pitch(): number {
    return this.tipped;
  }

  /** Looks a way, at once: where the climb starts, and a test's. */
  face(yaw: number, pitch = this.tipped): void {
    this.turned = yaw;
    this.tipped = Math.min(Math.max(pitch, FirstPersonLook.DOWN), FirstPersonLook.UP);
  }

  /** Turns the head by so many radians, left and up positive. */
  turn(left: number, up: number): void {
    this.face(this.turned + left, this.tipped + up);
  }

  /** Listens on the picture: a click takes hold of the mouse, which then turns the head; a
   * finger, or a mouse with its button down before it's held, drags it. */
  listen(host: LookHost, document: LookDocument): void {
    host.addEventListener("click", () => {
      if (document.pointerLockElement === null) {
        void host.requestPointerLock?.()?.catch(() => undefined);
      }
    });
    host.addEventListener("pointerdown", (event) => {
      const { clientX = 0, clientY = 0 } = event as Moved;
      this.last = { x: clientX, y: clientY };
    });
    for (const type of ["pointerup", "pointercancel", "pointerleave"]) {
      host.addEventListener(type, () => {
        this.last = null;
      });
    }
    host.addEventListener("pointermove", (event) => {
      const moved = event as Moved;
      if (document.pointerLockElement !== null) {
        this.turn(
          -(moved.movementX ?? 0) * FirstPersonLook.MOUSE,
          -(moved.movementY ?? 0) * FirstPersonLook.MOUSE,
        );
        return;
      }
      const { last } = this;
      if (last === null || (moved.pointerType === "mouse" && (moved.buttons ?? 0) === 0)) {
        return;
      }
      const { clientX = last.x, clientY = last.y } = moved;
      this.turn(
        (clientX - last.x) * FirstPersonLook.DRAG,
        (clientY - last.y) * FirstPersonLook.DRAG,
      );
      this.last = { x: clientX, y: clientY };
    });
  }
}
