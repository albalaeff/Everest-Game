import { PageElements } from "../input/page-elements";
import type { ActionSink } from "../input/player-action";
import type { BaseCamp, CallScene } from "../interface/base-camp";
import { DEVICES, RADIO_PHRASES } from "../interface/device-texts";
import type { DeviceName, DeviceTextName, RadioPhrase } from "../interface/device-texts";
import type { GpsFix } from "../interface/gps-watch";
import { Readings } from "../interface/readings";
import type { Texts } from "../interface/texts";
import { WindMeter } from "../interface/wind-meter";
import type { ClimberId } from "../simulation";
import type { DeviceReadings } from "./device-readings";

/** What the panel draws the devices for: the route's ground as its file has it, each point
 * metres across and up; the camp it ends at; the minutes between a tracker's points; and the
 * hour the sun comes onto the ice. */
export interface DevicesRoute {
  readonly profile: readonly (readonly number[])[];
  readonly camp: string;
  readonly minutes: number;
  /** When the sun comes onto the ice, in seconds after midnight. */
  readonly sunrise: number;
}

/** An answer of Base Camp's on its way: the line it fills, its words, and the seconds left. */
type Answer = { readonly line: HTMLElement; readonly words: string; left: number };

/**
 * The devices a climber carries (#260), in one card of glass: the handheld radio, the GPS watch,
 * the pocket wind meter and the satellite tracker, each drawn as the thing itself with its own
 * screen. [Devices] or the G key opens it at the device used last, [Radio] or Q at the radio;
 * the same control or Esc closes it, the arrows left and right go from device to device, and up
 * and down through a device's buttons. A phrase on the radio, a press on the tracker: each is an
 * action of the game's, so a room and a replay see it as the player's own climb does. It reads
 * the climb each frame while it's open, and changes the page only where something changed; what
 * it keeps itself is the screen's alone: the radio's last lines, and the wind meter's average
 * and strongest since it was taken out.
 */
export class DevicesPanel {
  /** The seconds of play Base Camp takes to answer, a gust shows on the meter after it came, and
   * the SOS is held; the lines the radio's log keeps; the map's box, in its own units; and the
   * wind meter's flutter. The screen's numbers, not the mountain's (docs/guidelines.md). */
  private static readonly ANSWER_SECONDS = 1.2;
  private static readonly GUST_SECONDS = 2.5;
  private static readonly SOS_HOLD_MILLISECONDS = 3000;
  private static readonly LOG_LINES = 6;
  private static readonly MAP = { left: 8, right: 192, top: 6, bottom: 46 };
  private static readonly SETTLE = 2.5;
  private static readonly SECONDS_AN_HOUR = 3600;

  private readonly readings = new Readings();
  private readonly elements: PageElements;
  private readonly panel: HTMLElement;
  private readonly buttons: Readonly<Record<"devices" | "radio", HTMLElement>>;
  private readonly tabs = new Map<DeviceName, HTMLElement>();
  private readonly faces = new Map<DeviceName, HTMLElement>();
  private shown: DeviceName = "radio";
  private whenOpen: () => void = () => undefined;

  /** The radio: the phrases said and not yet heard back, the calls answered so far, and the
   * answers on their way. */
  private readonly asked: { readonly phrase: string; readonly scene: CallScene }[] = [];
  private answered: number;
  private readonly answers: Answer[] = [];

  /** The watch: where a point of the slope is on its map. */
  private readonly onMap: (x: number, y: number) => readonly [number, number];

  /** The wind meter: the seconds it's been out, what it shows, the sum for its average and its
   * strongest; the gusts it has seen, and the seconds a gust still shows. */
  private wind = { seconds: 0, shown: 0, sum: 0, strongest: 0, gusts: 0, gusting: 0 };

  private sosTimer: number | null = null;

  constructor(
    private readonly window: Window,
    private readonly texts: Texts<DeviceTextName>,
    private readonly sink: ActionSink,
    private readonly player: ClimberId,
    private readonly climb: DeviceReadings,
    private readonly baseCamp: BaseCamp,
    private readonly route: DevicesRoute,
  ) {
    const elements = new PageElements(window.document);
    this.elements = elements;
    this.panel = elements.find("#devices");
    this.buttons = {
      devices: elements.find("[data-control='devices']"),
      radio: elements.find("[data-control='radio']"),
    };
    this.answered = climb.calls.length;
    this.onMap = this.mapOf(route.profile);
    for (const element of this.panel.querySelectorAll<HTMLElement>("[data-text]")) {
      element.textContent = texts.say(element.dataset.text as DeviceTextName);
    }
    this.find("[data-act='close']").setAttribute("aria-label", texts.say("close-label"));
    this.build();
    this.listen();
    this.wind.gusts = climb.wind.gusts;
  }

  /** What to do as the panel opens: close the card it would lie over. */
  whenOpened(callback: () => void): void {
    this.whenOpen = callback;
  }

  close(): void {
    if (this.panel.hidden) {
      return;
    }
    this.letGoOfSos();
    this.panel.hidden = true;
    this.mark();
  }

  /** The devices as they are this frame, `seconds` of play after the last. */
  update(seconds: number): void {
    this.hear(seconds);
    this.feel(seconds);
    if (this.panel.hidden) {
      return;
    }
    if (this.shown === "radio") {
      this.drawRadio();
    } else if (this.shown === "gps") {
      this.drawWatch();
    } else if (this.shown === "wind") {
      this.drawMeter(seconds);
    } else {
      this.drawTracker();
    }
  }

  /** The tabs and the radio's phrases, a button each. */
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
      this.faces.set(device, this.find(`.device[data-device='${device}']`));
    }
    const phrases = this.find(".radio__phrases");
    for (const phrase of RADIO_PHRASES) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.phrase = phrase;
      button.textContent = this.texts.say(`phrase.${phrase}`);
      button.addEventListener("click", () => {
        this.say(phrase);
      });
      phrases.append(button);
    }
    this.find(".radio__log").dataset.empty = this.texts.say("radio.empty");
    const camp = this.texts.say(`camp.${this.route.camp}`);
    this.find("[data-read='left-label']").textContent = this.texts.say("gps.left", { camp });
    this.find("[data-read='arrival-label']").textContent = this.texts.say("gps.arrival", { camp });
    this.find(".watch__route").setAttribute("d", this.pathOf(this.route.profile));
    this.find(".watch__track").setAttribute("d", this.pathOf(this.route.profile));
  }

  private listen(): void {
    const { window } = this;
    this.buttons.devices.addEventListener("click", () => {
      this.toggle(this.shown);
    });
    this.buttons.radio.addEventListener("click", () => {
      this.toggle("radio");
    });
    this.find("[data-act='close']").addEventListener("click", () => {
      this.close();
    });
    this.find("[data-act='reset']").addEventListener("click", () => {
      this.takeOutMeter();
    });
    this.find("[data-act='track']").addEventListener("click", () => {
      this.work(this.climb.tracker.tracking ? "stop" : "track");
    });
    this.find("[data-act='check-in']").addEventListener("click", () => {
      this.work("check-in");
    });
    this.listenForSos(this.find("[data-act='sos']"));
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

  /** The SOS takes a held press, as the real button sits under a cover: a finger, or Enter. */
  private listenForSos(button: HTMLElement): void {
    const hold = (): void => {
      if (this.sosTimer !== null || this.climb.tracker.sos !== "none") {
        return;
      }
      button.classList.add("tracker__sos--held");
      this.sosTimer = this.window.setTimeout(() => {
        this.letGoOfSos();
        this.work("sos");
      }, DevicesPanel.SOS_HOLD_MILLISECONDS);
    };
    button.addEventListener("pointerdown", hold);
    for (const end of ["pointerup", "pointercancel", "pointerleave", "blur"]) {
      button.addEventListener(end, () => {
        this.letGoOfSos();
      });
    }
    button.addEventListener("keydown", (event) => {
      if (event.code === "Enter" && !event.repeat) {
        hold();
      }
    });
    button.addEventListener("keyup", (event) => {
      if (event.code === "Enter") {
        this.letGoOfSos();
      }
    });
  }

  private letGoOfSos(): void {
    if (this.sosTimer !== null) {
      this.window.clearTimeout(this.sosTimer);
      this.sosTimer = null;
    }
    this.find("[data-act='sos']").classList.remove("tracker__sos--held");
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
      this.toggle(this.shown);
    } else if (event.code === "KeyQ" && !event.repeat) {
      this.toggle("radio");
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

  /** Moves the focus through the open device's buttons, round and round. */
  private focus(step: 1 | -1): void {
    const face = this.faces.get(this.shown);
    const buttons = [...(face?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    if (buttons.length === 0) {
      return;
    }
    const at = buttons.indexOf(this.window.document.activeElement as HTMLButtonElement);
    const next = at === -1 ? (step === 1 ? 0 : buttons.length - 1) : at + step;
    buttons[(next + buttons.length) % buttons.length]?.focus();
  }

  /** Opens at `device`, or closes if that's what's open; from another device, goes to it. */
  private toggle(device: DeviceName): void {
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

  private show(device: DeviceName): void {
    const changed = this.shown !== device || this.faces.get(device)?.hidden === true;
    this.shown = device;
    for (const [name, face] of this.faces) {
      face.hidden = name !== device;
      this.tabs.get(name)?.setAttribute("aria-selected", String(name === device));
    }
    if (device === "wind" && changed) {
      this.takeOutMeter();
    }
    this.mark();
    this.update(0);
  }

  /** The menu's buttons take the rope's orange while their panel is open: [Radio] at the radio. */
  private mark(): void {
    const open = !this.panel.hidden;
    this.buttons.devices.setAttribute("aria-expanded", String(open));
    this.buttons.radio.setAttribute("aria-expanded", String(open && this.shown === "radio"));
  }

  /** A ready phrase into the radio: the climber's words in the log, and the call to the game. */
  private say(phrase: RadioPhrase): void {
    const scene = this.climb.scene;
    this.line("you", this.baseCamp.said(phrase, scene));
    this.asked.push({ phrase, scene });
    this.sink.send({ kind: "radio", climber: this.player, channel: "base-camp", phrase });
  }

  private work(what: "track" | "stop" | "check-in" | "sos"): void {
    this.sink.send({ kind: "tracker", climber: this.player, do: what });
  }

  /** The calls the game has heard since the last frame get Base Camp's answer, a moment later:
   * from the mountain as it was when the phrase was said. */
  private hear(seconds: number): void {
    const calls = this.climb.calls;
    for (; this.answered < calls.length; this.answered += 1) {
      const call = calls[this.answered];
      if (call === undefined) {
        break;
      }
      const at = this.asked.findIndex(({ phrase }) => phrase === call.phrase);
      const scene = at === -1 ? this.climb.scene : this.asked.splice(at, 1)[0]?.scene;
      const words = this.baseCamp.answer(call, scene ?? this.climb.scene).join(" ");
      const line = this.line(call.heard ? "base-camp" : "static", this.texts.say("radio.waiting"));
      this.answers.push({ line, words, left: DevicesPanel.ANSWER_SECONDS });
    }
    for (const answer of this.answers) {
      answer.left -= seconds;
      if (answer.left <= 0) {
        answer.line.textContent = answer.words;
        answer.line.dataset.said = "yes";
        const log = this.find(".radio__log");
        log.scrollTop = log.scrollHeight;
      }
    }
    for (let at = this.answers.length - 1; at >= 0; at -= 1) {
      if ((this.answers[at]?.left ?? 0) <= 0) {
        this.answers.splice(at, 1);
      }
    }
  }

  /** A line of the radio's log, the latest last, and its words' element. */
  private line(who: "you" | "base-camp" | "static", words: string): HTMLElement {
    const { document } = this.window;
    const log = this.find(".radio__log");
    const item = document.createElement("li");
    item.dataset.who = who;
    if (who !== "static") {
      const name = document.createElement("strong");
      name.textContent = this.texts.say(`who.${who}`);
      item.append(name, " ");
    }
    const said = document.createElement("span");
    said.textContent = words;
    item.append(said);
    log.append(item);
    while (log.children.length > DevicesPanel.LOG_LINES) {
      log.firstElementChild?.remove();
    }
    log.scrollTop = log.scrollHeight;
    return said;
  }

  private drawRadio(): void {
    const { contact } = this.climb.radio;
    this.find(".radio__lcd").dataset.contact = contact ? "yes" : "no";
    this.set("contact", this.texts.say(contact ? "radio.contact" : "radio.no-contact"));
    for (const button of this.panel.querySelectorAll<HTMLButtonElement>("[data-phrase]")) {
      button.dataset.contact = contact ? "yes" : "no";
    }
  }

  private drawWatch(): void {
    const { texts, readings, baseCamp } = this;
    const fix = this.climb.gps;
    const screen = this.find(".watch__screen");
    screen.dataset.fix = fix.fix ? "yes" : "no";
    if (!fix.fix) {
      // No sky: the screen keeps the last fix, and says so.
      this.set("where", texts.say("gps.no-fix"));
      return;
    }
    const metres = (value: number) => texts.say("gps.metres", { metres: Math.round(value) });
    this.set("where", texts.say("gps.where", { part: texts.say(`part.${fix.part}`) }));
    this.set("altitude", readings.altitude(this.climb.altitude));
    this.set("to-climb", metres(fix.toClimb));
    this.set("done", baseCamp.distance(fix.done));
    this.set("left", baseCamp.distance(fix.left));
    this.set(
      "rate",
      fix.rate === null
        ? texts.say("gps.none")
        : texts.say("gps.rate-value", { rate: Math.round(fix.rate) }),
    );
    this.set(
      "arrival",
      fix.arrival === null ? texts.say("gps.none") : readings.clock(DevicesPanel.day(fix.arrival)),
    );
    this.drawSun(fix);
    const { x, y } = this.climb.spot;
    const [left, top] = this.onMap(x, y);
    const dot = this.find(".watch__dot");
    dot.setAttribute("cx", left.toFixed(1));
    dot.setAttribute("cy", top.toFixed(1));
    this.find(".watch__track").style.strokeDasharray = `${fix.share.toFixed(4)} 1`;
  }

  /** When the sun comes onto the ice, and whether the pace so far gets the climber to the top
   * before it: what they race through the Icefall (route.icefall-lessons). */
  private drawSun(fix: GpsFix): void {
    const { texts, readings } = this;
    const sun = this.climb.sun;
    const verdict = this.find("[data-read='verdict']");
    if (sun.state !== "cold") {
      this.set("sun", texts.say("gps.sun-on"));
      verdict.hidden = true;
      return;
    }
    const { timeOfDay } = this.climb;
    const until = DevicesPanel.day(this.route.sunrise - timeOfDay);
    this.set("sun", readings.clock(this.route.sunrise));
    verdict.hidden = fix.arrival === null;
    if (fix.arrival === null) {
      return;
    }
    const after = fix.arrival - (timeOfDay + until);
    const { hours, minutes } = readings.duration(Math.abs(after));
    const fills = { hours, minutes: String(minutes).padStart(2, "0") };
    verdict.dataset.late = after > 0 ? "yes" : "no";
    DevicesPanel.write(
      verdict,
      `${texts.say("gps.pace")}: ${texts.say(after > 0 ? "gps.late" : "gps.early", fills)}`,
    );
  }

  /** The wind meter in the hand: its number settles on the wind and flutters about it, jumps to
   * a gust as one comes, and keeps its average and its strongest since it was taken out. */
  private drawMeter(seconds: number): void {
    const { texts, wind } = this;
    const now = this.climb.wind;
    const gusting = now.coming || wind.gusting > 0;
    const first = wind.seconds === 0;
    wind.seconds += seconds;
    const flutter =
      1 + 0.08 * Math.sin(wind.seconds * 1.9) + 0.05 * Math.sin(wind.seconds * 5.3 + 1);
    const aim = (gusting ? now.gust : now.steady) * flutter;
    wind.shown = first
      ? aim
      : wind.shown + (aim - wind.shown) * Math.min(1, seconds * DevicesPanel.SETTLE);
    wind.sum += wind.shown * seconds;
    wind.strongest = Math.max(wind.strongest, wind.shown);
    const unit = texts.say("wind.unit");
    const speed = Math.round(wind.shown);
    this.set("now", String(speed));
    this.set(
      "average",
      `${Math.round(wind.seconds > 0 ? wind.sum / wind.seconds : wind.shown)} ${unit}`,
    );
    this.set("strongest", `${Math.round(wind.strongest)} ${unit}`);
    this.set(
      "name",
      gusting ? texts.say("wind.gust") : texts.say(`wind.name.${WindMeter.named(wind.shown)}`),
    );
    const meter = this.find(".meter");
    const gust = gusting ? "yes" : "no";
    if (meter.dataset.gust !== gust) {
      meter.dataset.gust = gust;
    }
    // The impeller turns with the wind: a turn in a quarter of a second in a gale, still in none.
    const turn = speed < 1 ? "0s" : `${Math.min(3, Math.max(0.12, 14 / speed)).toFixed(2)}s`;
    if (meter.style.getPropertyValue("--turn") !== turn) {
      meter.style.setProperty("--turn", turn);
    }
  }

  /** A gust that has just caught the climber still blows for a moment, whether or not the meter
   * is out: one that came before isn't blowing now. */
  private feel(seconds: number): void {
    const { wind } = this;
    const { gusts } = this.climb.wind;
    wind.gusting = gusts > wind.gusts ? DevicesPanel.GUST_SECONDS : wind.gusting - seconds;
    wind.gusting = Math.max(0, wind.gusting);
    wind.gusts = gusts;
  }

  /** The meter as it comes out of the pocket: nothing averaged yet. */
  private takeOutMeter(): void {
    this.wind = { ...this.wind, seconds: 0, shown: 0, sum: 0, strongest: 0 };
  }

  private drawTracker(): void {
    const { texts, readings } = this;
    const tracker = this.climb.tracker;
    const flat = tracker.charge <= 0;
    this.find(".tracker__screen").dataset.tracking = tracker.tracking ? "yes" : "no";
    this.set(
      "state",
      flat
        ? texts.say("tracker.flat")
        : tracker.tracking
          ? texts.say("tracker.on", { minutes: this.route.minutes })
          : texts.say("tracker.off"),
    );
    this.set("points", String(tracker.points));
    this.set("last", tracker.last === null ? texts.say("gps.none") : readings.clock(tracker.last));
    this.set("check-ins", String(tracker.checkIns));
    this.set("battery", texts.say("tracker.percent", { percent: Math.ceil(tracker.charge * 100) }));
    this.set(
      "status",
      !tracker.sky
        ? texts.say("tracker.no-sky")
        : tracker.sos === "sending"
          ? texts.say("tracker.sos-sending")
          : tracker.sos === "sent"
            ? texts.say("tracker.sos-sent")
            : tracker.sending > 0
              ? texts.say("tracker.sending")
              : "",
    );
    const status = this.find("[data-read='status']");
    const sos = tracker.sos === "none" ? "no" : "yes";
    if (status.dataset.sos !== sos) {
      status.dataset.sos = sos;
    }
    const track = this.find("[data-act='track']");
    DevicesPanel.write(track, texts.say(tracker.tracking ? "tracker.stop" : "tracker.track"));
    const pressed = String(tracker.tracking);
    if (track.getAttribute("aria-pressed") !== pressed) {
      track.setAttribute("aria-pressed", pressed);
    }
    for (const act of ["track", "check-in", "sos"]) {
      const button = this.find(`[data-act='${act}']`) as HTMLButtonElement;
      const off = flat || (act === "sos" && tracker.sos !== "none");
      if (button.disabled !== off) {
        button.disabled = off;
      }
    }
  }

  /** The route's ground as a path on the watch's map. */
  private pathOf(profile: readonly (readonly number[])[]): string {
    return profile
      .map(([x = 0, y = 0], index) => {
        const [left, top] = this.onMap(x, y);
        return `${index === 0 ? "M" : "L"}${left.toFixed(1)} ${top.toFixed(1)}`;
      })
      .join("");
  }

  /** Where a point of the slope is on the watch's map: the route fills its box, foot to top. */
  private mapOf(
    profile: readonly (readonly number[])[],
  ): (x: number, y: number) => readonly [number, number] {
    const xs = profile.map(([x = 0]) => x);
    const ys = profile.map(([, y = 0]) => y);
    const [west, east] = [Math.min(...xs), Math.max(...xs)];
    const [low, high] = [Math.min(...ys), Math.max(...ys)];
    const { left, right, top, bottom } = DevicesPanel.MAP;
    return (x, y) => [
      left + ((x - west) / (east - west || 1)) * (right - left),
      bottom - ((y - low) / (high - low || 1)) * (bottom - top),
    ];
  }

  /** A reading's place on a face of the open device, with its words. */
  private set(reading: string, words: string): void {
    DevicesPanel.write(this.find(`[data-device='${this.shown}'] [data-read='${reading}']`), words);
  }

  private find(selector: string): HTMLElement {
    return this.elements.find(`#devices ${selector}`);
  }

  private static write(element: HTMLElement, words: string): void {
    if (element.textContent !== words) {
      element.textContent = words;
    }
  }

  /** A time of day within the day: an arrival past midnight is the next day's hour. */
  private static day(seconds: number): number {
    const day = 24 * DevicesPanel.SECONDS_AN_HOUR;
    return ((seconds % day) + day) % day;
  }
}
