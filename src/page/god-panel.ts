import { PageElements } from "../input/page-elements";
import type { Texts } from "../interface/texts";
import type { Point } from "../physics";
import type { HazardWeather, JoltKind } from "../simulation";
import { GodMode } from "./god-mode";
import { GOD_PLACE_KINDS } from "./god-places";
import type { GodPlaceKind } from "./god-places";

/** The god mode's words (#245): content/god.json's. */
export const GOD_TEXTS = [
  "button",
  "title",
  "close",
  "go-to",
  "go",
  "metres",
  "pick",
  "picking",
  "clock",
  "set",
  "speed",
  "times",
  "weather",
  "clear",
  "cloud",
  "snow",
  "wind",
  "stage",
  "serac",
  "ladder",
  "gust",
  "twist",
  "slip",
  "immortal",
  "camp",
  "part",
  "ladders",
  "face",
  "hazard",
  "training",
  "place",
  "where",
  "where-sherpa",
  "none",
  "no-ladder",
  "no-jolt",
] as const;

export type GodTextName = (typeof GOD_TEXTS)[number];

/** The slope under a point of the screen, in its metres: the camera. */
export interface SlopeUnder {
  at(screenX: number, screenY: number): Point;
}

/**
 * The god mode's panel (#245), a tester's, not a control the game hears: `[God mode]` beside the
 * graphics' button opens it under the readouts, and closes it, and so does its [Close]. It goes to
 * a place of the route's list, to metres along the ground, or to where the next click on the slope
 * lands; sets the clock on, the speed and the weather; stages a serac collapse, the ladder ahead
 * breaking, a gust, a twist or a slip; and keeps the player immortal. Each press is the god mode's
 * (`GodMode`), and gives the keys back to the climb. It says where the player and their Sherpa
 * are, and changes the page only when that changed.
 */
export class GodPanel {
  private static readonly GROUPS: Readonly<Record<GodPlaceKind, GodTextName>> = {
    camp: "camp",
    part: "part",
    ladder: "ladders",
    face: "face",
    hazard: "hazard",
    training: "training",
  };
  /** The panel's words that index.html marks where they go. */
  private static readonly LABELS: readonly GodTextName[] = [
    "title",
    "close",
    "go-to",
    "go",
    "metres",
    "pick",
    "clock",
    "set",
    "speed",
    "weather",
    "stage",
    "immortal",
  ];
  private static readonly STAGES: readonly GodTextName[] = [
    "serac",
    "ladder",
    "gust",
    "twist",
    "slip",
  ];

  private readonly elements: PageElements;
  private readonly panel: HTMLElement;
  private readonly button: HTMLButtonElement;
  private readonly note: HTMLElement;
  private readonly whereabouts: HTMLElement;
  private readonly speeds = new Map<number, HTMLButtonElement>();
  private readonly weathers = new Map<HazardWeather, HTMLButtonElement>();
  /** The pick's listener on the next press on the slope, while it waits for one. */
  private picking: ((event: PointerEvent) => void) | null = null;
  private said = "";

  constructor(
    private readonly window: Window,
    private readonly texts: Texts<GodTextName>,
    private readonly god: GodMode,
    private readonly slope: SlopeUnder,
    /** The player's Sherpa's name, if the climb has him. */
    private readonly sherpa: string | null,
  ) {
    const { document } = window;
    this.elements = new PageElements(document);
    this.panel = this.elements.find("#god");
    this.note = this.find('[data-text="note"]');
    this.whereabouts = this.find('[data-text="where"]');
    for (const name of GodPanel.LABELS) {
      for (const element of this.panel.querySelectorAll(`[data-text="${name}"]`)) {
        element.textContent = texts.say(name);
      }
    }
    this.button = document.createElement("button");
    this.button.type = "button";
    this.button.id = "god-button";
    this.button.className = "setting-button";
    this.button.textContent = texts.say("button");
    this.button.setAttribute("aria-controls", "god");
    this.button.setAttribute("aria-expanded", "false");
    this.button.addEventListener("click", () => {
      this.toggle(this.panel.hidden !== false);
    });
    this.find('[data-act="close"]').addEventListener("click", () => {
      this.toggle(false);
    });
    this.panel.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        this.toggle(false);
      }
    });
    this.places();
    this.forms();
    this.rows();
  }

  /** Puts `[God mode]` in `parent`. */
  appendTo(parent: Element): void {
    parent.append(this.button);
  }

  /** Each frame: where the player and their Sherpa are, when it changed. */
  update(): void {
    const { along, altitude, sherpa } = this.god.where;
    const fills = {
      along: Math.round(along * 10) / 10,
      altitude: Math.round(altitude),
    };
    const said =
      sherpa === null || this.sherpa === null
        ? this.texts.say("where", fills)
        : this.texts.say("where-sherpa", {
            ...fills,
            name: this.sherpa,
            sherpa: Math.round(sherpa * 10) / 10,
          });
    if (said !== this.said) {
      this.said = said;
      this.whereabouts.textContent = said;
    }
  }

  /** Opens the panel, as the god mode has the climb now, a script's changes too, or closes it. */
  private toggle(open: boolean): void {
    this.panel.hidden = !open;
    this.button.setAttribute("aria-expanded", String(open));
    if (!open) {
      this.stopPicking();
      return;
    }
    const { time, speed, weather, immortal } = this.god.state;
    (this.find("#god-clock") as HTMLInputElement).value = time;
    (this.find('[data-act="immortal"]') as HTMLInputElement).checked = immortal;
    this.pressed(this.speeds, speed);
    this.pressed(this.weathers, weather);
  }

  /** The route's places, in the list's groups. */
  private places(): void {
    const select = this.find("#god-place") as HTMLSelectElement;
    const { document } = this.window;
    for (const kind of GOD_PLACE_KINDS) {
      const group = document.createElement("optgroup");
      group.label = this.texts.say(GodPanel.GROUPS[kind]);
      for (const { id, name, along } of this.god.places.filter((place) => place.kind === kind)) {
        const option = document.createElement("option");
        option.value = id;
        option.textContent = this.texts.say("place", { name, along });
        group.append(option);
      }
      select.append(group);
    }
  }

  /** The forms: a place, metres along the ground or a pick on the slope, and the clock. */
  private forms(): void {
    const value = (selector: string): string => (this.find(selector) as HTMLInputElement).value;
    this.submit("place", () => {
      this.god.teleport(value("#god-place"));
    });
    this.submit("metres", () => {
      this.god.teleport(Number(value("#god-metres")));
    });
    this.submit("clock", () => {
      this.god.hour(value("#god-clock"));
    });
    this.find('[data-act="pick"]').addEventListener("click", () => {
      this.pick();
    });
    const immortal = this.find('[data-act="immortal"]') as HTMLInputElement;
    immortal.addEventListener("change", () => {
      this.god.immortal(immortal.checked);
      this.done();
    });
  }

  /** The rows of buttons: the speeds, the weathers and what's staged on the spot. */
  private rows(): void {
    const row = (name: string): HTMLElement => this.find(`[data-row="${name}"]`);
    for (const times of GodMode.SPEEDS) {
      const button = this.add(row("speed"), this.texts.say("times", { times }), () => {
        this.god.speed(times);
        this.pressed(this.speeds, times);
      });
      this.speeds.set(times, button);
    }
    this.pressed(this.speeds, this.god.state.speed);
    for (const weather of GodMode.WEATHERS) {
      const button = this.add(row("weather"), this.texts.say(weather), () => {
        this.god.weather(weather);
        this.pressed(this.weathers, weather);
      });
      this.weathers.set(weather, button);
    }
    this.pressed(this.weathers, this.god.state.weather);
    for (const stage of GodPanel.STAGES) {
      this.add(row("stage"), this.texts.say(stage), () => {
        this.stage(stage);
      });
    }
  }

  /** Stages what a stage's button names, or says why there's nothing to stage. */
  private stage(stage: GodTextName): void {
    if (stage === "serac") {
      this.god.serac();
    } else if (stage === "ladder") {
      if (this.god.ladder() === null) {
        this.tell("none", "no-ladder");
      }
    } else if (stage === "gust" || stage === "twist") {
      const kind: JoltKind = stage;
      if (!this.god.jolt(kind)) {
        this.tell("none", "no-jolt");
      }
    } else {
      this.god.slip();
    }
  }

  /** The next press on the slope puts the player on the ground nearest it, and goes no further:
   * the climb never hears it. A press anywhere else gives the pick up. */
  private pick(): void {
    this.stopPicking();
    this.tell("picking");
    const slope = this.elements.find("#slope");
    const picking = (event: PointerEvent): void => {
      this.stopPicking();
      if (!(event.target instanceof Node) || !slope.contains(event.target)) {
        return;
      }
      event.stopImmediatePropagation();
      event.preventDefault();
      this.tell(null);
      this.god.teleportTo(this.slope.at(event.clientX, event.clientY));
      this.done();
    };
    this.picking = picking;
    this.window.addEventListener("pointerdown", picking, { capture: true });
  }

  private stopPicking(): void {
    if (this.picking !== null) {
      this.window.removeEventListener("pointerdown", this.picking, { capture: true });
      this.picking = null;
    }
  }

  /** A form whose submit is `act`, then the keys back to the climb. */
  private submit(form: string, act: () => void): void {
    this.find(`[data-form="${form}"]`).addEventListener("submit", (event) => {
      event.preventDefault();
      this.tell(null);
      act();
      this.done();
    });
  }

  /** A button in `row` saying `words`, whose press is `act`, then the keys back to the climb. */
  private add(row: HTMLElement, words: string, act: () => void): HTMLButtonElement {
    const button = this.window.document.createElement("button");
    button.type = "button";
    button.className = "god__button";
    button.textContent = words;
    button.addEventListener("click", () => {
      this.tell(null);
      act();
      this.done();
    });
    row.append(button);
    return button;
  }

  /** Marks the button of `chosen` pressed among `buttons`, and the others not. */
  private pressed<Key>(buttons: ReadonlyMap<Key, HTMLButtonElement>, chosen: Key): void {
    for (const [key, button] of buttons) {
      button.setAttribute("aria-pressed", String(key === chosen));
    }
  }

  /** Says a line of the panel's under its rows, `why` filled in from another; none for nothing. */
  private tell(line: GodTextName | null, why?: GodTextName): void {
    this.note.textContent =
      line === null
        ? ""
        : this.texts.say(line, why === undefined ? {} : { why: this.texts.say(why) });
  }

  /** The keys go back to the climb: no button or field of the panel keeps them. */
  private done(): void {
    const focused = this.window.document.activeElement;
    if (focused instanceof HTMLElement && this.panel.contains(focused)) {
      focused.blur();
    }
  }

  private find(selector: string): HTMLElement {
    return this.elements.find(selector.startsWith("#") ? selector : `#god ${selector}`);
  }
}
