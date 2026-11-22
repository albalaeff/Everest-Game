import { PageElements } from "../input/page-elements";
import type { ActionSink } from "../input/player-action";
import type { BaseCamp } from "../interface/base-camp";
import { DEVICES } from "../interface/device-texts";
import type { DeviceName, DeviceTextName } from "../interface/device-texts";
import type { Texts } from "../interface/texts";
import { DayLight } from "../rendering/day-light";
import type { ClimberId } from "../simulation";
import type { DeviceReadings } from "./device-readings";
import type { DeviceFace } from "./devices/device-face";
import { MessengerFace } from "./devices/messenger-face";
import { MeterFace } from "./devices/meter-face";
import { RadioFace } from "./devices/radio-face";
import { WatchFace } from "./devices/watch-face";

/** What the panel draws the devices for: the route's ground as its file has it, each point
 * metres across and up; the camp it ends at; the minutes between a tracker's points; and the
 * hour the sun comes onto the ice. */
export interface DevicesRoute {
  readonly profile: readonly (readonly number[])[];
  /** The length of that ground, as far along as a climber can be. */
  readonly ground: number;
  readonly camp: string;
  readonly minutes: number;
  /** When the sun comes onto the ice, in seconds after midnight. */
  readonly sunrise: number;
}

/**
 * The devices a climber carries (#260), in one card of glass: the handheld radio, the GPS watch,
 * the pocket weather meter and the satellite messenger, each drawn as the thing itself, with its
 * own screen and its own buttons, worked as the real one's are (#284). [Devices] or the G key
 * opens it at the device used last, [Radio] or Q at the radio; the same control or Esc closes it,
 * the arrows left and right go from device to device, and up and down through a device's
 * buttons. A phrase on the radio, a row on the messenger: each is an action of the game's, so a
 * room and a replay see it as the player's own climb does. It reads the climb each frame while
 * it's open, and changes the page only where something changed; what the devices keep is the
 * screens' alone: the radio's last lines, the watch's pauses, the meter's average and strongest.
 */
export class DevicesPanel {
  private readonly elements: PageElements;
  private readonly panel: HTMLElement;
  private readonly buttons: Readonly<Record<"devices" | "radio", HTMLElement>>;
  private readonly tabs = new Map<DeviceName, HTMLElement>();
  private readonly faces = new Map<DeviceName, HTMLElement>();
  private readonly radio: RadioFace;
  private readonly watch: WatchFace;
  private readonly meter: MeterFace;
  private readonly messenger: MessengerFace;
  private shown: DeviceName = "radio";
  private whenOpen: () => void = () => undefined;
  /** The device the card last told the climber to hold: the one a climb that's gone on from a
   * save still has out, if any. */
  private taken: DeviceName | null;

  constructor(
    private readonly window: Window,
    private readonly texts: Texts<DeviceTextName>,
    private readonly sink: ActionSink,
    private readonly player: ClimberId,
    private readonly climb: DeviceReadings,
    baseCamp: BaseCamp,
    route: DevicesRoute,
  ) {
    const elements = new PageElements(window.document);
    this.elements = elements;
    this.panel = elements.find("#devices");
    this.buttons = {
      devices: elements.find("[data-control='devices']"),
      radio: elements.find("[data-control='radio']"),
    };
    this.taken = climb.hand.device;
    for (const element of this.panel.querySelectorAll<HTMLElement>("[data-text]")) {
      element.textContent = texts.say(element.dataset.text as DeviceTextName);
    }
    this.find("[data-act='close']").setAttribute("aria-label", texts.say("close-label"));
    const face = (device: DeviceName): HTMLElement => {
      const found = this.find(`.device[data-device='${device}']`);
      this.faces.set(device, found);
      return found;
    };
    this.radio = new RadioFace(face("radio"), texts, climb, baseCamp, sink, player);
    this.watch = new WatchFace(face("gps"), texts, climb, baseCamp, route);
    this.meter = new MeterFace(face("wind"), texts, climb);
    this.messenger = new MessengerFace(face("tracker"), texts, climb, sink, player, route.minutes);
    this.build();
    this.listen();
    // The card opens shut: a device a saved climb left out goes back.
    this.take(null);
  }

  /** What to do as the panel opens: close the card it would lie over. */
  whenOpened(callback: () => void): void {
    this.whenOpen = callback;
  }

  close(): void {
    if (this.panel.hidden) {
      return;
    }
    for (const device of DEVICES) {
      this.face(device).release();
    }
    this.panel.hidden = true;
    this.mark();
    this.take(null);
  }

  /** Whether the card is open. */
  get open(): boolean {
    return !this.panel.hidden;
  }

  /** Opens the card at the device used last, or closes it: the tent's [Devices] (#271). */
  toggle(): void {
    this.toggleAt(this.shown);
  }

  /** The devices as they are this frame, `seconds` of play after the last: what happens
   * whether or not the card is open, then the device it shows. */
  update(seconds: number): void {
    this.radio.hear(seconds);
    this.meter.feel(seconds);
    this.watch.locate(seconds, !this.panel.hidden && this.shown === "gps");
    if (this.panel.hidden) {
      return;
    }
    this.face(this.shown).draw(seconds, DayLight.at(this.climb.timeOfDay).daylight);
  }

  /** The tabs, a button each. */
  private build(): void {
    const { document } = this.window;
    const tabs = this.find(".devices__tabs");
    for (const device of DEVICES) {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.setAttribute("role", "tab");
      tab.dataset.tab = device;
      tab.textContent = this.texts.say(`tab.${device}`);
      tab.addEventListener("click", () => {
        this.show(device);
      });
      tabs.append(tab);
      this.tabs.set(device, tab);
    }
  }

  private listen(): void {
    const { window } = this;
    this.buttons.devices.addEventListener("click", () => {
      this.toggle();
    });
    this.buttons.radio.addEventListener("click", () => {
      this.toggleAt("radio");
    });
    this.find("[data-act='close']").addEventListener("click", () => {
      this.close();
    });
    // A click leaves the keys with the climb: focus would let Space press the button again.
    this.panel.addEventListener("mousedown", (event) => {
      if (event.target instanceof Element && event.target.closest("button") !== null) {
        event.preventDefault();
      }
    });
    window.addEventListener("keydown", (event) => {
      this.key(event);
    });
    window.addEventListener("resize", () => {
      if (!this.panel.hidden) {
        this.fit();
      }
    });
  }

  /** The panel's keys: G and Q open and close it, Esc closes it, and while it's open the arrows
   * go between the devices and through the open one's buttons. A text field keeps its keys. */
  private key(event: KeyboardEvent): void {
    const typing =
      event.target instanceof Element && event.target.closest("input, select, textarea") !== null;
    if (typing || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (event.code === "KeyG" && !event.repeat) {
      this.toggle();
    } else if (event.code === "KeyQ" && !event.repeat) {
      this.toggleAt("radio");
    } else if (this.panel.hidden) {
      return;
    } else if (event.code === "Escape") {
      this.close();
    } else if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
      event.preventDefault();
      const next = DEVICES.indexOf(this.shown) + (event.code === "ArrowRight" ? 1 : -1);
      this.show(DEVICES[(next + DEVICES.length) % DEVICES.length] ?? "radio");
    } else if (event.code === "ArrowUp" || event.code === "ArrowDown") {
      event.preventDefault();
      this.focus(event.code === "ArrowDown" ? 1 : -1);
    }
  }

  /** Moves the focus through the open device's buttons that show, round and round: the rows on
   * its screen first, then its own buttons, then those beside it. */
  private focus(step: 1 | -1): void {
    const face = this.faces.get(this.shown);
    const buttons = [
      ...(face?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []),
    ].filter((button) => button.getClientRects().length > 0);
    if (buttons.length === 0) {
      return;
    }
    const at = buttons.indexOf(this.window.document.activeElement as HTMLButtonElement);
    const next = at === -1 ? (step === 1 ? 0 : buttons.length - 1) : at + step;
    buttons[(next + buttons.length) % buttons.length]?.focus();
  }

  /** Opens at `device`, or closes if that's what's open; from another device, goes to it. */
  private toggleAt(device: DeviceName): void {
    if (!this.panel.hidden && this.shown === device) {
      this.close();
      return;
    }
    if (this.panel.hidden) {
      this.whenOpen();
      this.panel.hidden = false;
      this.fit();
    }
    this.show(device);
  }

  /** Where the panel has to end: at the top of the controls along the bottom, which wrap to
   * more rows in a narrower window. A phone's layout doesn't read it (style.css). */
  private fit(): void {
    const { top } = this.elements.find("#controls").getBoundingClientRect();
    this.panel.style.setProperty("--floor", `${Math.round(top)}px`);
  }

  /** The device the card shows: taken out of the pocket, lit as it comes, the weather meter
   * switched on afresh. */
  private show(device: DeviceName): void {
    const changed = this.shown !== device || this.faces.get(device)?.hidden === true;
    this.shown = device;
    for (const [name, face] of this.faces) {
      face.hidden = name !== device;
      this.tabs.get(name)?.setAttribute("aria-selected", String(name === device));
    }
    if (changed) {
      if (device === "wind") {
        this.meter.takeOut();
      } else {
        this.face(device).lightUp();
      }
    }
    this.mark();
    this.take(device);
    this.update(0);
  }

  private face(device: DeviceName): DeviceFace {
    return device === "radio"
      ? this.radio
      : device === "gps"
        ? this.watch
        : device === "wind"
          ? this.meter
          : this.messenger;
  }

  /** The device the card shows comes out into the climber's hand, and goes back as the card
   * closes (#271): an action of the game's, so a teammate and a replay see it. Said once: the
   * hand may not have heard the last word yet. */
  private take(device: DeviceName | null): void {
    if (device === this.taken) {
      return;
    }
    this.taken = device;
    this.sink.send({ kind: "device", climber: this.player, device: device ?? "none" });
  }

  /** The menu's buttons take the rope's orange while their panel is open: [Radio] at the radio. */
  private mark(): void {
    const open = !this.panel.hidden;
    this.buttons.devices.setAttribute("aria-expanded", String(open));
    this.buttons.radio.setAttribute("aria-expanded", String(open && this.shown === "radio"));
  }

  private find(selector: string): HTMLElement {
    return this.elements.find(`#devices ${selector}`);
  }
}
