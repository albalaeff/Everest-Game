import type { ActionSink } from "../input/player-action";
import { PageElements } from "../input/page-elements";
import type { Texts } from "../interface/texts";
import { PACK_ITEMS } from "../simulation";
import type { ClimberId, PackItem, PackNumbers, Packs } from "../simulation";
import { PackList } from "./pack-list";
import type { PackRow, PackTextName } from "./pack-list";

/**
 * The pack on the climb: a card of glass the [Inventory] button or the I key opens, with what
 * the player carries, each thing drawn, and what it weighs. Anywhere, [Drink] and [Eat] use the water and the food;
 * in a camp, [−] and [+] leave an item in its store or take one from it, and the card says which
 * camp and what its store holds. Every button is an action of the game's, so a room and a replay
 * see the pack change as the player's own climb does. It reads the packs each frame while it's
 * open, and changes the page only where something changed.
 */
export class InventoryPanel {
  private readonly panel: HTMLElement;
  private readonly button: HTMLElement;
  private readonly where: HTMLElement;
  private readonly weight: HTMLElement;
  private readonly meter: HTMLElement;
  private readonly list: PackList;
  private whenOpen: () => void = () => undefined;

  constructor(
    window: Window,
    private readonly texts: Texts<PackTextName>,
    private readonly packs: Packs,
    numbers: PackNumbers,
    sink: ActionSink,
    private readonly player: ClimberId,
    /** What the player carries besides their pack, in kilograms. */
    private readonly base: number,
  ) {
    const elements = new PageElements(window.document);
    this.panel = elements.find("#inventory");
    this.button = elements.find("[data-control='inventory']");
    this.where = elements.find("#inventory-where");
    this.weight = elements.find("#inventory-weight");
    this.meter = elements.find("#inventory-meter");
    PackList.worn(elements.find("#inventory-worn"), texts);
    for (const text of ["eyebrow", "panel-title", "close"] as const) {
      elements.find(`#inventory [data-text="${text}"]`).textContent = texts.say(text);
    }
    const close = elements.find("#inventory [data-text='close']");
    close.setAttribute("aria-label", texts.say("close-label"));
    close.addEventListener("click", () => {
      this.close();
    });
    this.list = new PackList(
      elements.find("#inventory-items"),
      texts,
      numbers,
      {
        change: (item, change) => {
          sink.send({ kind: "pack", climber: player, item, change });
        },
        use: (item) => {
          sink.send({ kind: "use", climber: player, item });
        },
      },
      "inventory",
    );
    this.button.addEventListener("click", () => {
      this.toggle();
    });
    window.addEventListener("keydown", (event) => {
      if (event.code === "KeyI" && !event.repeat) {
        this.toggle();
      } else if (event.code === "Escape" && !this.panel.hidden) {
        this.close();
      }
    });
  }

  /** What to do as the card opens: close the card it would lie over (#260). */
  whenOpened(callback: () => void): void {
    this.whenOpen = callback;
  }

  /** The pack as it is this frame, while the card is open. */
  update(): void {
    if (this.panel.hidden) {
      return;
    }
    const { texts } = this;
    const view = this.packs.pack(this.player);
    const { camp, stock, items } = view;
    const rows = Object.fromEntries(
      PACK_ITEMS.map((item): [PackItem, PackRow] => {
        const held = stock?.[item];
        const store =
          held === undefined
            ? undefined
            : held === null
              ? texts.say("store-endless")
              : texts.say("store", { count: PackList.rounded(held) });
        return [
          item,
          {
            count: items[item],
            less: camp !== null && items[item] > 0,
            more:
              camp !== null &&
              items[item] + 1 <= this.packs.most(item) &&
              (held === null || (held ?? 0) >= 1),
            ...(store === undefined ? {} : { store }),
            usable: (item === "water" || item === "food") && items[item] > 0,
          },
        ];
      }),
    ) as Record<PackItem, PackRow>;
    this.list.show(rows);
    InventoryPanel.set(
      this.where,
      camp === null
        ? texts.say("where.route")
        : texts.say("where.camp", { camp: texts.say(`camp.${camp}`) }),
    );
    InventoryPanel.set(
      this.weight,
      texts.say("weight", {
        pack: PackList.rounded(view.weight),
        total: PackList.rounded(this.base + view.weight),
      }),
    );
    PackList.meter(this.meter, this.base + view.weight);
  }

  private toggle(): void {
    if (!this.panel.hidden) {
      this.close();
      return;
    }
    this.whenOpen();
    this.panel.hidden = false;
    this.button.setAttribute("aria-expanded", "true");
    this.update();
  }

  close(): void {
    this.panel.hidden = true;
    this.button.setAttribute("aria-expanded", "false");
  }

  private static set(element: HTMLElement, text: string): void {
    if (element.textContent !== text) {
      element.textContent = text;
    }
  }
}
