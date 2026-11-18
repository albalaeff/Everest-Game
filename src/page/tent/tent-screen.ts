import type { ActionSink } from "../../input/player-action";
import { PageElements } from "../../input/page-elements";
import { GearDrawing } from "../../interface/gear-drawing";
import type { Texts } from "../../interface/texts";
import { Atmosphere } from "../../rendering/atmosphere";
import type { TentSizes } from "../../rendering/camp-signs";
import { CHORES } from "../../simulation";
import type {
  BodyView,
  Chore,
  ClimberId,
  HazardWeather,
  MountainClock,
  PackView,
  TentView,
} from "../../simulation";
import { DwellerActs } from "./dweller-acts";
import { DwellerBlend } from "./dweller-blend";
import { DwellerPose } from "./dweller-pose";
import { TentPicture } from "./tent-picture";
import type { TentStock } from "./tent-picture";
import type {
  Chip,
  ChoreRow,
  Note,
  StockName,
  StockRow,
  TentReadout,
  TentState,
  TentTextName,
} from "./tent-readout";

/** The climb as the tent's screen reads it: the tents' rule, the packs, the body, the clock, the
 * weather and the altimeter. The expedition's rules are this. */
export interface TentWorld {
  readonly tents: { tent(id: ClimberId): TentView | null };
  readonly packs: { pack(id: ClimberId): PackView; most(item: "water"): number };
  readonly body: { climber(id: ClimberId): BodyView };
  readonly clock: MountainClock;
  readonly hazards: { readonly weather: HazardWeather };
  readonly physics: { climber(id: ClimberId): { readonly altitude: number } };
}

/** Where the player is on their way through a tent's door, as the slope's picture shows it. */
export type Passage = "outside" | "going-in" | "inside" | "coming-out";

/**
 * The tent's inside, over the slope (#258): once the player's climber has gone in at a tent's
 * door, and the slope has shown them through it, the screen opens on the tent cut open from end
 * to end (`TentPicture`), the person in it doing what they do (`DwellerActs`, `DwellerPose`), and
 * a panel under it, in pictures and few words (#264): where and when, how they feel, a mark and a
 * word each; the water, gas, meals, bars and oxygen there are, each drawn as the pack draws it
 * (`GearDrawing`) with its number; and the chores, each a button with its mark and its word, and
 * what it takes and gives as marks with numbers (`TentReadout`): the mark of what it lacks crossed
 * out, and in hand a ring of its progress round its mark, the time left and its stop. Each says
 * the whole of it in a sentence, as its tooltip and to a screen reader. A chore's button begins
 * it, and stops the one in hand; [Drink] and [Eat] use the pack; [Pack] opens the pack's card, to
 * take from the camp's store or leave things in it; [Leave], or the tent's key, goes out, and the
 * screen closes as they crawl to the door. The stove's warning shows while it burns, and the sleep
 * slept by the clock until the next chore. Every button is an action of the game's, so a room and
 * a replay see the tent as the player's own climb does. It reads the rules each frame while it's
 * open, and changes the page only where something changed.
 */
export class TentScreen {
  /** The camp whose tents stand on rubble, with what came up on a yak. */
  private static readonly BASE_CAMP = "base-camp";
  /** What the tent has, each drawn as the pack draws it (`#art-…`); and each chore's mark. */
  private static readonly ART: Readonly<Record<StockName, string>> = {
    water: "water",
    gas: "gas",
    meals: "meal",
    bars: "food",
    oxygen: "oxygen",
  };
  private static readonly MARKS: Readonly<Record<Chore, string>> = {
    melt: "snow",
    cook: "pot",
    nap: "nap",
    sleep: "bag",
    guitar: "guitar",
  };
  /** How long the screen takes to close behind someone leaving, at the most, in seconds. */
  private static readonly CLOSING = 1.4;
  /** How long it takes to fade in over the slope, in seconds: the style sheet's, and a little. */
  private static readonly OPENING = 0.7;
  /** How dark it has to be for the lamp to be on, as the headlamps' share; and how many of the
   * mountain's seconds the light is mixed again after. */
  private static readonly LAMP_FROM = 0.3;
  private static readonly LIGHT_EVERY = 120;

  private readonly screen: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly picture: TentPicture;
  private readonly rows = new Map<Chore, ChoreElements>();
  private readonly stocks = new Map<StockName, StockElements>();
  private readonly feel: HTMLElement;
  private readonly slept: HTMLElement;
  private readonly note: HTMLElement;
  private readonly drink: HTMLButtonElement;
  private readonly eat: HTMLButtonElement;
  private readonly pack: HTMLButtonElement;
  private readonly pose = new DwellerPose();
  private acts: DwellerActs | null = null;
  private blend = new DwellerBlend();
  private elapsed = 0;
  /** How long it has been open, and closing, in seconds. */
  private shown = 0;
  private closing = 0;
  /** The hour and the weather the light was last mixed for, and whether they were awake. */
  private lit: { at: number; weather: HazardWeather; awake: boolean } | null = null;
  private stocked = "";
  /** The wind outside, 0 to 1, as the light was last mixed; and the panel's elements written to,
   * by their selectors. */
  private gust = 0;
  private readonly written = new Map<string, HTMLElement>();
  /** What the last frame read, for the buttons to act on. */
  private last: { readonly tent: TentView; readonly pack: PackView } | null = null;

  constructor(
    window: Window,
    texts: Texts<TentTextName>,
    private readonly world: TentWorld,
    private readonly readout: TentReadout,
    sizes: TentSizes,
    /** The grams of gas a full canister holds. */
    private readonly canister: number,
    private readonly sink: ActionSink,
    private readonly player: ClimberId,
    /** Where the slope's picture has the player on their way through the door. */
    private readonly passage: () => Passage,
    /** Opens the pack's card. */
    private readonly openPack: () => void,
  ) {
    const elements = new PageElements(window.document);
    this.screen = elements.find("#tent");
    this.stage = elements.find("#tent .tent-stage");
    this.picture = new TentPicture(this.stage, sizes);
    const { document } = window;
    elements.find('#tent [data-text="title"]').textContent = texts.say("title");
    this.feel = elements.find('#tent [data-text="feel"]');
    this.slept = elements.find("#tent .tent-slept");
    this.note = elements.find("#tent .tent-note");
    for (const stock of ["water", "gas", "meals", "bars", "oxygen"] as const) {
      const row = elements.find(`#tent [data-stock="${stock}"]`);
      const name = row.querySelector("span");
      const amount = row.querySelector("output");
      if (name === null || amount === null) {
        throw new RangeError(`The tent's ${stock} needs its name and its amount`);
      }
      name.textContent = texts.say(`stock.${stock}`);
      const { svg } = new GearDrawing(document, TentScreen.ART[stock]);
      svg.setAttribute("class", "art");
      svg.setAttribute("aria-hidden", "true");
      row.prepend(svg);
      this.stocks.set(stock, { row, amount, gauge: row.querySelector<HTMLElement>("b") });
    }
    const list = elements.find("#tent .tent-chores");
    list.replaceChildren(
      ...CHORES.map((chore) => {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.chore = chore;
        const ring = document.createElement("span");
        ring.className = "tent-ring";
        ring.dataset.mark = TentScreen.MARKS[chore];
        ring.append(TentScreen.mark(document));
        const name = document.createElement("strong");
        name.textContent = texts.say(`chore.${chore}`);
        const chips = document.createElement("span");
        chips.className = "tent-chips";
        button.append(ring, name, chips);
        button.addEventListener("click", () => {
          this.choose(chore);
        });
        item.append(button);
        this.rows.set(chore, { button, ring, chips });
        return item;
      }),
    );
    const act = (name: "leave" | "drink" | "eat" | "pack", heard: () => void) => {
      const button = elements.find(`#tent [data-act="${name}"]`) as HTMLButtonElement;
      const words = button.querySelector("span");
      if (words === null) {
        throw new RangeError(`The tent's [${name}] needs its words`);
      }
      words.textContent = texts.say(name);
      const label = name === "leave" || name === "eat" ? texts.say(`${name}.label`) : null;
      if (label !== null) {
        button.setAttribute("aria-label", label);
        button.title = label;
      }
      button.addEventListener("click", heard);
      return button;
    };
    act("leave", () => {
      sink.send({ kind: "tent", climber: player, go: "out" });
    });
    this.drink = act("drink", () => {
      if ((this.last?.pack.items.water ?? 0) > 0) {
        this.acts?.play("drink");
        sink.send({ kind: "use", climber: player, item: "water" });
      }
    });
    this.eat = act("eat", () => {
      if ((this.last?.pack.items.food ?? 0) >= 1) {
        this.acts?.play("bar");
        sink.send({ kind: "use", climber: player, item: "food" });
      }
    });
    this.pack = act("pack", () => {
      this.acts?.play("pack");
      this.openPack();
    });
  }

  /** Whether the tent's screen is over the slope. */
  get open(): boolean {
    return !this.screen.hidden;
  }

  /** Whether it hides the whole slope: open, once it has faded in, and not yet closing. */
  get covering(): boolean {
    return this.acts !== null && this.closing === 0 && this.shown >= TentScreen.OPENING;
  }

  /** Each frame, `seconds` after the last: opens once the player is in a tent, shows it, and
   * closes behind them. */
  update(seconds: number): void {
    const { world, player } = this;
    const tent = world.tents.tent(player);
    if (tent === null) {
      this.leave(seconds);
      return;
    }
    if (this.acts === null) {
      if (this.passage() !== "inside") {
        return;
      }
      this.acts = new DwellerActs(tent.slept?.to ?? null);
      this.blend = new DwellerBlend();
      this.shown = 0;
      this.closing = 0;
      this.lit = null;
      this.stocked = "";
      this.picture.pitch(tent.camp === TentScreen.BASE_CAMP);
      this.screen.dataset.state = "open";
      this.screen.hidden = false;
    }
    this.shown += seconds;
    const pack = world.packs.pack(player);
    this.last = { tent, pack };
    const acting = this.acts.advance(seconds, {
      chore: tent.chore,
      progress: tent.progress,
      sleptTo: tent.slept?.to ?? null,
    });
    this.draw(seconds, acting.act === "sleep", tent, pack);
    const look = this.blend.next(this.pose.look(acting.act, acting.seconds), acting.act, seconds);
    this.picture.pose(look, acting.act, this.elapsed, this.gust, tent.chore);
    this.frame(seconds, look.shift, look.lying);
    this.say(tent, pack, this.acts.asleep);
  }

  /** The way out: the person crawls to the door as the screen closes over the slope, where the
   * climber comes out of the tent. */
  private leave(seconds: number): void {
    const { acts } = this;
    if (acts === null) {
      return;
    }
    acts.leave();
    this.closing += seconds;
    const acting = acts.advance(seconds, { chore: null, progress: 0, sleptTo: null });
    const look = this.blend.next(this.pose.look(acting.act, acting.seconds), acting.act, seconds);
    this.elapsed += seconds;
    this.picture.pose(look, acting.act, this.elapsed, this.gust);
    this.frame(seconds, look.shift, 0);
    if (this.screen.dataset.state !== "closing") {
      this.screen.dataset.state = "closing";
    }
    if (acts.gone || this.closing >= TentScreen.CLOSING) {
      this.screen.hidden = true;
      this.acts = null;
      this.last = null;
    }
  }

  /** The light and what's in the tent, where they changed. */
  private draw(seconds: number, asleep: boolean, tent: TentView, pack: PackView): void {
    const { world, player, picture } = this;
    this.elapsed += seconds;
    const { timeOfDay } = world.clock;
    const { weather } = world.hazards;
    const { altitude } = world.physics.climber(player);
    const { lit } = this;
    const awake = !asleep;
    if (
      lit === null ||
      lit.weather !== weather ||
      lit.awake !== awake ||
      Math.abs(lit.at - timeOfDay) >= TentScreen.LIGHT_EVERY
    ) {
      const atmosphere = Atmosphere.at(timeOfDay, weather, altitude);
      picture.light(atmosphere, awake && atmosphere.light.lamps >= TentScreen.LAMP_FROM);
      this.gust = atmosphere.wind;
      this.lit = { at: timeOfDay, weather, awake };
    }
    const stock: TentStock = {
      water: pack.items.water,
      bottles: world.packs.most("water"),
      meals: tent.meals,
      gas: tent.gas,
      canister: this.canister,
      oxygen: pack.items.oxygen,
      tool: pack.items["ice-tool"] >= 1,
      jumar: pack.items.jumar >= 1,
      left: {
        tool: (pack.stock?.["ice-tool"] ?? 0) >= 1,
        jumar: (pack.stock?.jumar ?? 0) >= 1,
      },
      guitar: tent.guitar,
    };
    const key = JSON.stringify(stock);
    if (key !== this.stocked) {
      this.stocked = key;
      picture.stock(stock);
    }
  }

  private frame(seconds: number, shift: number, lying: number): void {
    const { clientWidth, clientHeight } = this.stage;
    this.picture.frame(clientWidth, clientHeight, this.picture.focus(shift, lying), seconds);
  }

  /** The panel's words, where they changed. */
  private say(tent: TentView, pack: PackView, asleep: boolean): void {
    const { world, player } = this;
    const state: TentState = {
      tent,
      body: world.body.climber(player),
      timeOfDay: world.clock.timeOfDay,
      altitude: world.physics.climber(player).altitude,
      water: pack.items.water,
      bottles: world.packs.most("water"),
      bars: pack.items.food,
      oxygen: pack.items.oxygen,
    };
    const panel = this.readout.of(state);
    this.write('[data-text="where"]', panel.where);
    this.write('[data-text="clock"]', panel.clock);
    TentScreen.show(this.slept, panel.slept);
    TentScreen.show(this.note, panel.note);
    TentScreen.chips(this.feel, panel.feel, "li");
    TentScreen.label(this.feel, panel.feeling);
    for (const name of ["water", "gas", "meals", "bars", "oxygen"] as const) {
      this.showStock(name, panel.stock[name]);
    }
    for (const row of panel.chores) {
      this.showChore(row, asleep);
    }
    this.drink.disabled = asleep || !(pack.items.water > 0);
    this.eat.disabled = asleep || !(pack.items.food >= 1);
    this.pack.disabled = asleep;
  }

  private showStock(name: StockName, row: StockRow): void {
    const elements = this.stocks.get(name);
    if (elements === undefined) {
      return;
    }
    TentScreen.set(elements.amount, row.text);
    if (elements.row.title !== row.label) {
      elements.row.title = row.label;
    }
    if (elements.gauge !== null && row.share !== null) {
      const width = `${Math.round(row.share * 100)}%`;
      if (elements.gauge.style.width !== width) {
        elements.gauge.style.width = width;
      }
    }
  }

  private showChore(row: ChoreRow, asleep: boolean): void {
    const elements = this.rows.get(row.chore);
    if (elements === undefined) {
      return;
    }
    const { button, ring, chips } = elements;
    TentScreen.chips(chips, row.chips, "span");
    TentScreen.label(button, row.label);
    const state = row.doing ? "doing" : row.able ? "ready" : "lacking";
    if (button.dataset.state !== state) {
      button.dataset.state = state;
      button.setAttribute("aria-pressed", String(row.doing));
    }
    // Asleep, only the sleep in hand can be stopped: nothing else begins.
    const disabled = !row.doing && (!row.able || asleep);
    if (button.disabled !== disabled) {
      button.disabled = disabled;
    }
    const done = row.progress.toFixed(3);
    if (ring.style.getPropertyValue("--done") !== done) {
      ring.style.setProperty("--done", done);
    }
  }

  /** A chore's button: begins it, or stops it when it's the one in hand. */
  private choose(chore: Chore): void {
    const doing = this.last?.tent.chore === chore;
    this.sink.send({ kind: "chore", climber: this.player, chore: doing ? "stop" : chore });
  }

  private write(selector: string, text: string): void {
    let element = this.written.get(selector);
    if (element === undefined) {
      const found = this.screen.querySelector<HTMLElement>(selector);
      if (found === null) {
        throw new RangeError(`No #tent ${selector} on the page`);
      }
      element = found;
      this.written.set(selector, found);
    }
    TentScreen.set(element, text);
  }

  private static set(element: HTMLElement, text: string): void {
    if (element.textContent !== text) {
      element.textContent = text;
    }
  }

  /** What an element says in full: its tooltip, and its name to a screen reader. */
  private static label(element: HTMLElement, label: string): void {
    if (element.getAttribute("aria-label") !== label) {
      element.setAttribute("aria-label", label);
      element.title = label;
    }
  }

  /** A mark and its words, shown, or hidden when there's none. */
  private static show(element: HTMLElement, note: Note | null): void {
    if (element.hidden !== (note === null)) {
      element.hidden = note === null;
    }
    if (note === null) {
      return;
    }
    if (element.dataset.mark !== note.mark) {
      element.dataset.mark = note.mark;
    }
    const words = element.querySelector("span");
    if (words !== null) {
      TentScreen.set(words, note.text);
    }
    TentScreen.label(element, note.label);
  }

  /** `list`'s chips, written again when they changed: each a mark and its words, crossed out
   * when it's what's lacking. */
  private static chips(list: HTMLElement, chips: readonly Chip[], tag: "li" | "span"): void {
    const key = chips.map(({ mark, text, lacking }) => `${mark} ${text} ${lacking}`).join("|");
    if (list.dataset.chips === key) {
      return;
    }
    list.dataset.chips = key;
    const { ownerDocument } = list;
    list.replaceChildren(
      ...chips.map(({ mark, text, lacking }) => {
        const chip = ownerDocument.createElement(tag);
        chip.className = "tent-chip";
        chip.dataset.mark = mark;
        if (lacking) {
          chip.dataset.lacking = "yes";
        }
        const words = ownerDocument.createElement("span");
        words.textContent = text;
        chip.append(TentScreen.mark(ownerDocument), words);
        return chip;
      }),
    );
  }

  /** A mark's element: the mask of its parent's `data-mark`, which a screen reader skips. */
  private static mark(document: Document): HTMLElement {
    const mark = document.createElement("i");
    mark.setAttribute("aria-hidden", "true");
    return mark;
  }
}

/** A chore's button, the ring round its mark, and its chips. */
interface ChoreElements {
  readonly button: HTMLButtonElement;
  readonly ring: HTMLElement;
  readonly chips: HTMLElement;
}

/** A stock's row: its amount, and its gauge if it has one. */
interface StockElements {
  readonly row: HTMLElement;
  readonly amount: HTMLElement;
  readonly gauge: HTMLElement | null;
}
