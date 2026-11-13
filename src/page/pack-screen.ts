import { PageElements } from "../input/page-elements";
import type { Texts } from "../interface/texts";
import { Packs } from "../simulation";
import type { PackCounts, PackNumbers } from "../simulation";
import { PackList } from "./pack-list";
import type { PackTextName } from "./pack-list";

/**
 * The pack at Base Camp: after Your climber and before the gear check, the player chooses what
 * they carry up the route, the jumar, a second ice tool, water, food and oxygen, each drawn as
 * the thing it is, with why it matters and the pack's weight as it grows, and [Next] goes on
 * with it. Under them is what every climber has on them anyway. It opens on the
 * route's pack, the guide's list, which the player changes or keeps. Its words are
 * content/pack.json's.
 */
export class PackScreen {
  private readonly elements: PageElements;
  private readonly dialog: HTMLElement;
  private readonly weight: HTMLElement;
  private readonly meter: HTMLElement;
  private readonly next: HTMLElement;
  private readonly list: PackList;
  private items: Record<keyof PackCounts, number>;

  constructor(
    window: Window,
    private readonly texts: Texts<PackTextName>,
    private readonly numbers: PackNumbers,
    /** The route's pack, and what the climber carries besides it, in kilograms. */
    packed: PackCounts,
    private readonly base: number,
  ) {
    this.elements = new PageElements(window.document);
    this.dialog = this.elements.find("#pack");
    for (const text of ["title", "intro", "always", "next"] as const) {
      this.elements.find(`#pack [data-text="${text}"]`).textContent = texts.say(text);
    }
    this.weight = this.elements.find("#pack-weight");
    this.meter = this.elements.find("#pack-meter");
    PackList.worn(this.elements.find("#pack-worn"), texts);
    this.next = this.elements.find('#pack [data-text="next"]');
    this.items = { ...packed };
    this.list = new PackList(
      this.elements.find("#pack-items"),
      texts,
      numbers,
      {
        change: (item, change) => {
          const count = this.items[item] + (change === "take" ? 1 : -1);
          if (count >= 0 && count <= numbers.most[item]) {
            this.items = { ...this.items, [item]: count };
            this.draw();
          }
        },
      },
      "pack",
    );
  }

  /** Shows it, and goes on with the pack the player chose. */
  show(then: (pack: PackCounts) => void): void {
    this.next.addEventListener("click", () => {
      if (this.dialog.hidden) {
        return;
      }
      this.dialog.hidden = true;
      then(this.items);
    });
    this.draw();
    this.dialog.hidden = false;
    this.dialog.scrollTop = 0;
    this.next.focus({ preventScroll: true });
  }

  private draw(): void {
    this.list.show(PackList.free(this.items, this.numbers.most));
    const pack = Packs.weight(this.items, this.numbers);
    this.weight.textContent = this.texts.say("weight", {
      pack: PackList.rounded(pack),
      total: PackList.rounded(this.base + pack),
    });
    PackList.meter(this.meter, this.base + pack);
  }
}
