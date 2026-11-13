import type { Texts } from "../interface/texts";
import { PACK_ITEMS } from "../simulation";
import type { PackCounts, PackItem, PackNumbers } from "../simulation";

/** What every climber wears and carries anyway, as the pack's screens show it. */
export const WORN = ["ice-axe", "crampons", "harness", "helmet", "headlamp"] as const;

/** The pack's words, by their names in content/pack.json. */
export type PackTextName =
  | "title"
  | "intro"
  | "always"
  | "next"
  | `item.${PackItem}`
  | `why.${PackItem}`
  | `count.${PackItem}`
  | `worn.${(typeof WORN)[number]}`
  | "less"
  | "more"
  | "weight"
  | "kilograms"
  | "left"
  | "eyebrow"
  | "panel-title"
  | "close"
  | "close-label"
  | "where.camp"
  | "where.route"
  | `camp.${string}`
  | "store"
  | "store-endless"
  | "use.water"
  | "use.food";

/** What a tile of the list shows of its item: how many are packed, whether one more or one less
 * can be, what the camp's store has of it, in words, if it's shown, and whether it's used here. */
export interface PackRow {
  readonly count: number;
  readonly less: boolean;
  readonly more: boolean;
  readonly store?: string;
  readonly usable?: boolean;
}

/** A tile's parts that change as the pack does. */
interface Tile {
  readonly tile: HTMLElement;
  readonly slots: readonly SVGUseElement[];
  readonly count: HTMLElement;
  readonly kilograms: HTMLElement;
  readonly less: HTMLButtonElement;
  readonly more: HTMLButtonElement;
  readonly store: HTMLElement;
  readonly use: HTMLButtonElement | null;
}

/**
 * The pack laid out to look at: a tile an item, with the thing itself drawn in it as many times
 * as a climber can carry it, the ones packed in colour and the ones left behind as ghosts; its
 * name, why it matters, what it weighs, how many are packed between [−] and [+], and [Drink] or
 * [Eat] where the pack can be used. An opened litre is a bottle half full. The screen that owns
 * the list says what each tile shows and hears its buttons; the list only draws, and changes the
 * page where a tile changed. The drawings are index.html's symbols, `#art-…`.
 */
export class PackList {
  private static readonly SVG = "http://www.w3.org/2000/svg";
  /** The load the weight's bar is full at, in kilograms: a porter's, twice a client's. */
  static readonly FULL_LOAD = 20;

  private readonly tiles = new Map<PackItem, Tile>();

  constructor(
    list: HTMLElement,
    private readonly texts: Texts<PackTextName>,
    private readonly numbers: PackNumbers,
    hears: {
      readonly change: (item: PackItem, change: "take" | "leave") => void;
      readonly use?: (item: "water" | "food") => void;
    },
    /** What its ids begin with, so two lists on one page keep theirs apart. */
    name: string,
  ) {
    const document = list.ownerDocument;
    const make = <K extends keyof HTMLElementTagNameMap>(
      tag: K,
      className = "",
    ): HTMLElementTagNameMap[K] => {
      const made = document.createElement(tag);
      if (className !== "") {
        made.className = className;
      }
      return made;
    };
    list.replaceChildren();
    for (const item of PACK_ITEMS) {
      const tile = make("li");
      tile.dataset.item = item;
      const art = make("div", "art");
      art.setAttribute("aria-hidden", "true");
      const slots = Array.from({ length: numbers.most[item] }, () => {
        const { svg, use } = PackList.drawing(document, item);
        art.append(svg);
        return use;
      });
      const words = make("div", "words");
      const title = make("strong");
      title.id = `${name}-${item}`;
      title.textContent = texts.say(`item.${item}`);
      const why = make("small", "why");
      why.textContent = texts.say(`why.${item}`);
      const store = make("small", "store");
      store.hidden = true;
      words.append(title, why, store);
      const foot = make("div", "foot");
      const kilograms = make("span", "kilograms");
      const stepper = make("span", "stepper");
      const button = (sign: string, label: "less" | "more"): HTMLButtonElement => {
        const made = make("button");
        made.type = "button";
        made.textContent = sign;
        made.setAttribute("aria-label", texts.say(label, { item: texts.say(`item.${item}`) }));
        return made;
      };
      const less = button("−", "less");
      const more = button("+", "more");
      const count = make("output");
      count.setAttribute("aria-labelledby", title.id);
      less.addEventListener("click", () => {
        hears.change(item, "leave");
      });
      more.addEventListener("click", () => {
        hears.change(item, "take");
      });
      stepper.append(less, count, more);
      let use: HTMLButtonElement | null = null;
      if ((item === "water" || item === "food") && hears.use !== undefined) {
        const using = hears.use;
        use = make("button", "use");
        use.type = "button";
        use.textContent = texts.say(`use.${item}`);
        use.addEventListener("click", () => {
          using(item);
        });
      }
      foot.append(kilograms, ...(use === null ? [] : [use]), stepper);
      tile.append(art, words, foot);
      list.append(tile);
      this.tiles.set(item, { tile, slots, count, kilograms, less, more, store, use });
    }
  }

  /** Shows each item as `rows` has it. */
  show(rows: Readonly<Record<PackItem, PackRow>>): void {
    for (const [item, tile] of this.tiles) {
      const shown = rows[item];
      for (const [index, slot] of tile.slots.entries()) {
        const left = shown.count - index;
        const state = left >= 1 ? "packed" : left > 0 ? "opened" : "left";
        const drawing = `#art-${item}${state === "opened" && item === "water" ? "-half" : ""}`;
        if (slot.dataset.state !== state) {
          slot.dataset.state = state;
          slot.setAttribute("href", drawing);
        }
      }
      const packed = shown.count > 0 ? "yes" : "no";
      if (tile.tile.dataset.packed !== packed) {
        tile.tile.dataset.packed = packed;
      }
      const count = this.texts.say(`count.${item}`, { count: PackList.rounded(shown.count) });
      PackList.set(tile.count, count);
      const weight = Math.round(shown.count * this.numbers.weights[item] * 100) / 100;
      PackList.set(
        tile.kilograms,
        shown.count > 0
          ? this.texts.say("kilograms", { kilograms: weight })
          : this.texts.say("left"),
      );
      tile.less.disabled = !shown.less;
      tile.more.disabled = !shown.more;
      tile.store.hidden = shown.store === undefined;
      PackList.set(tile.store, shown.store ?? "");
      if (tile.use !== null) {
        tile.use.disabled = shown.usable !== true;
      }
    }
  }

  /** Draws what every climber wears and carries anyway into `list`: each thing and its name. */
  static worn(list: HTMLElement, texts: Texts<PackTextName>): void {
    const document = list.ownerDocument;
    list.replaceChildren(
      ...WORN.map((thing) => {
        const row = document.createElement("li");
        const label = document.createElement("span");
        label.textContent = texts.say(`worn.${thing}`);
        const { svg } = PackList.drawing(document, thing);
        svg.setAttribute("aria-hidden", "true");
        row.append(svg, label);
        return row;
      }),
    );
  }

  /** Fills a weight's bar to the share of a full load that `kilograms` is. */
  static meter(bar: HTMLElement, kilograms: number): void {
    const share = Math.min(1, Math.max(0, kilograms / PackList.FULL_LOAD));
    const width = `${Math.round(share * 100)}%`;
    if (bar.style.width !== width) {
      bar.style.width = width;
      bar.dataset.load = share > 0.75 ? "heavy" : share > 0.55 ? "loaded" : "light";
    }
  }

  /** The tiles for `items` where up to `most` of each can be packed freely: Base Camp's. */
  static free(items: PackCounts, most: PackCounts): Record<PackItem, PackRow> {
    return Object.fromEntries(
      PACK_ITEMS.map((item) => [
        item,
        { count: items[item], less: items[item] > 0, more: items[item] + 1 <= most[item] },
      ]),
    ) as Record<PackItem, PackRow>;
  }

  /** A weight or a count as the page writes it: to a tenth. */
  static rounded(value: number): number {
    return Math.round(value * 10) / 10;
  }

  /** One of index.html's drawings of the gear, as an element of the page. */
  private static drawing(
    document: Document,
    thing: string,
  ): { readonly svg: SVGSVGElement; readonly use: SVGUseElement } {
    const svg = document.createElementNS(PackList.SVG, "svg");
    svg.setAttribute("viewBox", "0 0 64 64");
    const use = document.createElementNS(PackList.SVG, "use");
    use.setAttribute("href", `#art-${thing}`);
    svg.append(use);
    return { svg, use };
  }

  private static set(element: HTMLElement, text: string): void {
    if (element.textContent !== text) {
      element.textContent = text;
    }
  }
}
