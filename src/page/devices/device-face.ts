import type { DeviceName, DeviceTextName } from "../../interface/device-texts";
import type { Texts } from "../../interface/texts";
import type { DeviceDrawing, DrawnBox, DrawnControl } from "./device-drawing";

/** A button that does something when held: for how long, in milliseconds, and what. */
interface LongPress {
  readonly milliseconds: number;
  readonly done: () => void;
}

/**
 * One device on the devices' card as the thing itself (#284): its drawing, with its screen's
 * readings laid over the drawing's glass and a button over each of its buttons, named, with its
 * tooltip; a part that isn't pressed, a knob or a light, has its tooltip alone. A press sinks the
 * cap while it's held and lights the screen for a few seconds, as a real one's backlight does;
 * unlit, the screen is as dark as the hour, and readable in the headlamp's light. A button can do
 * something of its own when it's held long enough, as an SOS does. Each device is a subclass,
 * which says what its buttons do and fills its screen.
 */
export abstract class DeviceFace {
  /** How long a press keeps the screen lit unless the device says, in seconds of play; and how
   * dark an unlit screen is at night, under the headlamp, as a share of its day's brightness.
   * The screen's numbers, not the mountain's (docs/guidelines.md). */
  private static readonly LIGHT_SECONDS = 8;
  private static readonly NIGHT = 0.62;

  protected readonly body: HTMLElement;
  protected readonly screen: HTMLElement;
  private readonly buttons = new Map<string, HTMLButtonElement>();
  private readonly held = new Set<string>();
  private readonly longs = new Map<string, LongPress>();
  /** The long press under way, and the button whose long press has just been done, whose click
   * as it's let go of does nothing more. */
  private longTimer: { readonly name: string; readonly id: number } | null = null;
  private longDone: string | null = null;
  private lit = 0;

  constructor(
    protected readonly device: DeviceName,
    protected readonly face: HTMLElement,
    protected readonly drawing: DeviceDrawing,
    protected readonly texts: Texts<DeviceTextName>,
    private readonly lightSeconds = DeviceFace.LIGHT_SECONDS,
  ) {
    this.body = DeviceFace.inside(face, ".device__body");
    this.screen = DeviceFace.inside(this.body, ".device__screen");
    this.body.insertAdjacentHTML("afterbegin", drawing.svg());
    this.body.style.setProperty("--ratio", `${drawing.width} / ${drawing.height}`);
    this.place(this.screen, drawing.screen);
    for (const control of drawing.controls) {
      this.body.append(control.kind === "button" ? this.button(control) : this.part(control));
    }
  }

  /** Every button let go of, as the card closes: a long press under way is given up. */
  release(): void {
    for (const name of [...this.held]) {
      this.up(name);
    }
    if (this.longTimer !== null) {
      this.up(this.longTimer.name);
    }
  }

  /** Lights the screen, as a press does: the device coming out of the pocket, say. */
  lightUp(): void {
    this.lit = this.lightSeconds;
    this.shine();
  }

  /** The device on the card this frame, `seconds` of play after the last, in a daylight of 0
   * at night to 1 by day: its screen's light, then its readings. */
  abstract draw(seconds: number, daylight: number): void;

  /** What the device does as its button `name` is pressed: the subclass's. */
  protected abstract pressed(name: string): void;

  /** The screen's light this frame, `seconds` of play after the last, in a daylight of 0 at
   * night to 1 by day. */
  protected light(seconds: number, daylight: number): void {
    this.lit = Math.max(0, this.lit - seconds);
    this.shine();
    const ambient = (DeviceFace.NIGHT + (1 - DeviceFace.NIGHT) * daylight).toFixed(2);
    if (this.body.style.getPropertyValue("--ambient") !== ambient) {
      this.body.style.setProperty("--ambient", ambient);
    }
  }

  /** Puts the screen's light out, as switching the device off does. */
  protected dark(): void {
    this.lit = 0;
    this.shine();
  }

  /** What button `name` does once it has been held for `milliseconds`. */
  protected holdLong(name: string, milliseconds: number, done: () => void): void {
    this.longs.set(name, { milliseconds, done });
  }

  /** Whether button `name` is being held for its long press. */
  protected holding(name: string): boolean {
    return this.longTimer?.name === name;
  }

  /** The button over the drawn control `name`. */
  protected control(name: string): HTMLButtonElement {
    const button = this.buttons.get(name);
    if (button === undefined) {
      throw new RangeError(`The ${this.device} has no button called ${name}`);
    }
    return button;
  }

  /** Holds a cap down, as a finger does, until it's let go of. */
  protected hold(name: string): void {
    this.held.add(name);
    this.mark();
  }

  protected letGo(name: string): void {
    this.held.delete(name);
    this.mark();
  }

  /** A reading's place on this device's face, with its words. */
  protected set(reading: string, words: string): void {
    DeviceFace.write(this.find(`[data-read='${reading}']`), words);
  }

  /** A mark on an element of the face, changed only when it changes. */
  protected static mark(element: HTMLElement, name: string, value: string): void {
    if (element.dataset[name] !== value) {
      element.dataset[name] = value;
    }
  }

  protected find(selector: string): HTMLElement {
    return DeviceFace.inside(this.face, selector);
  }

  protected static write(element: HTMLElement, words: string): void {
    if (element.textContent !== words) {
      element.textContent = words;
    }
  }

  private shine(): void {
    DeviceFace.mark(this.body, "lit", this.lit > 0 ? "yes" : "no");
  }

  /** The caps held down sink into the case, and the body says which are. */
  private mark(): void {
    const held = [...this.held].join(" ");
    if ((this.body.dataset.held ?? "") === held) {
      return;
    }
    this.body.dataset.held = held;
    for (const cap of this.body.querySelectorAll<SVGGElement>(".cap")) {
      cap.classList.toggle("cap--held", this.held.has(cap.dataset.cap ?? ""));
    }
  }

  /** A finger, or Enter or Space, comes down on button `name`: its cap sinks, and a long
   * press starts counting. */
  private down(name: string): void {
    this.hold(name);
    const long = this.longs.get(name);
    const window = this.face.ownerDocument.defaultView;
    if (long === undefined || window === null || this.longTimer !== null) {
      return;
    }
    this.longDone = null;
    const id = window.setTimeout(() => {
      this.longTimer = null;
      this.longDone = name;
      this.mark();
      long.done();
    }, long.milliseconds);
    this.longTimer = { name, id };
    DeviceFace.mark(this.body, "holding", name);
  }

  /** The finger comes up, or leaves: the cap comes back, and a long press not yet done is
   * given up. */
  private up(name: string): void {
    this.letGo(name);
    if (this.longTimer?.name === name) {
      this.face.ownerDocument.defaultView?.clearTimeout(this.longTimer.id);
      this.longTimer = null;
    }
    DeviceFace.mark(this.body, "holding", this.longTimer?.name ?? "");
  }

  /** A button over a drawn one: pressed by a finger, a click, Enter or Space, its cap held down
   * while it is, and the screen lit. */
  private button(control: DrawnControl): HTMLButtonElement {
    const document = this.face.ownerDocument;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "device__button";
    button.dataset.press = control.name;
    this.name(button, control);
    this.place(button, control.box);
    const { name } = control;
    button.addEventListener("pointerdown", () => {
      this.down(name);
    });
    for (const end of ["pointerup", "pointercancel", "pointerleave", "blur"]) {
      button.addEventListener(end, () => {
        this.up(name);
      });
    }
    button.addEventListener("keydown", (event) => {
      if ((event.code === "Enter" || event.code === "Space") && !event.repeat) {
        this.down(name);
      }
    });
    button.addEventListener("keyup", (event) => {
      if (event.code === "Enter" || event.code === "Space") {
        this.up(name);
      }
    });
    button.addEventListener("click", () => {
      if (this.longDone === name) {
        this.longDone = null;
        return;
      }
      this.lightUp();
      this.pressed(name);
    });
    this.buttons.set(name, button);
    return button;
  }

  /** A part that isn't pressed, named for a pointer that rests on it. */
  private part(control: DrawnControl): HTMLElement {
    const document = this.face.ownerDocument;
    const part = document.createElement("span");
    part.className = "device__part";
    part.dataset.part = control.name;
    this.name(part, control);
    this.place(part, control.box);
    return part;
  }

  private name(element: HTMLElement, control: DrawnControl): void {
    const { device, texts } = this;
    const label = texts.say(`button.${device}.${control.name}`);
    element.setAttribute("aria-label", label);
    element.title = `${label}: ${texts.say(`tip.${device}.${control.name}`)}`;
  }

  /** Lays an element over a box of the drawing, in shares of it, so it scales with it. */
  private place(element: HTMLElement, box: DrawnBox): void {
    const { left, top, width, height } = this.drawing.share(box);
    element.style.left = `${left.toFixed(3)}%`;
    element.style.top = `${top.toFixed(3)}%`;
    element.style.width = `${width.toFixed(3)}%`;
    element.style.height = `${height.toFixed(3)}%`;
  }

  private static inside(parent: HTMLElement, selector: string): HTMLElement {
    const found = parent.querySelector<HTMLElement>(selector);
    if (found === null) {
      throw new RangeError(`No ${selector} in ${parent.className || parent.tagName}`);
    }
    return found;
  }
}
