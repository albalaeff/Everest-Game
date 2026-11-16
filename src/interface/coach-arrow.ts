import { CoachPointer } from "./coach-pointer";
import type { PointerSays, PointerWorld } from "./coach-pointer";
import type { CoachTip } from "./coach";
import { Coach } from "./coach";
import type { ScreenPlace } from "./sherpa-bubble";
import type { Texts } from "./texts";

/** The arrow's words, by what it says and the device: a keyboard's keys, or the thumb's buttons. */
export type PointerTextName = `point.${PointerSays}.${"pc" | "touch"}`;

/**
 * The coach's arrow on the page (#233): `#pointer`, on the slope at the place the card's tip is
 * about, where `CoachPointer` finds it each frame: an arrow whose tip is at the place, a ring
 * round it, or whose tail is there, running on the way to go (`data-anchor`), and at the arrow's
 * tail the control to use there, for the player's own device, as the page's
 * `touch` mark shows one or the other. A key's name stands in braces in the words ({R}) and a
 * button's in brackets ([Clip 2]); each is drawn as a key cap, as on the card. A warning's arrow
 * is marked `data-kind="warning"`, as its card. It follows its place each frame through the
 * camera, hides while that's off the screen or the page draws no picture, changes its words only
 * when they change, and never takes a click from the slope. The card's words are what a screen
 * reader reads: the arrow says them again for the eye alone.
 */
export class CoachArrow {
  /** How far in from the screen's edges a place has to be for its arrow to show, in CSS pixels. */
  private static readonly MARGIN = 12;
  /** A key or a button in the arrow's words: a key's name in braces, a button's in brackets. */
  private static readonly CAPS = /(\{[^}]+\}|\[[^\]]+\])/u;

  private readonly arrow: HTMLElement;
  private readonly onPc: HTMLElement;
  private readonly onTouch: HTMLElement;
  private readonly pointer = new CoachPointer();
  private said: PointerSays | null = null;

  constructor(
    private readonly window: Window,
    private readonly texts: Pick<Texts<PointerTextName>, "say">,
    private readonly world: PointerWorld,
    private readonly place: ScreenPlace,
  ) {
    const { document } = window;
    this.arrow = CoachArrow.required(document, "#pointer");
    this.onPc = CoachArrow.required(document, "#pointer [data-device='pc']");
    this.onTouch = CoachArrow.required(document, "#pointer [data-device='touch']");
  }

  /** The arrow for the tip on the card now, where its place is on the screen this frame. */
  update(tip: CoachTip | null): void {
    const { arrow } = this;
    const pointing = this.pointer.point(tip, this.world);
    const at = pointing === null ? null : this.place(pointing.at.x, pointing.at.y);
    const [x = 0, y = 0] = at ?? [];
    const margin = CoachArrow.MARGIN;
    const { innerWidth: width, innerHeight: height } = this.window;
    const shown =
      pointing !== null &&
      tip !== null &&
      at !== null &&
      x >= margin &&
      x <= width - margin &&
      y >= margin &&
      y <= height - margin;
    if (!shown) {
      if (!arrow.hidden) {
        arrow.hidden = true;
        delete arrow.dataset.says;
        this.said = null;
      }
      return;
    }
    if (pointing.says !== this.said) {
      this.said = pointing.says;
      arrow.dataset.says = pointing.says;
      CoachArrow.write(this.onPc, this.texts.say(`point.${pointing.says}.pc`));
      CoachArrow.write(this.onTouch, this.texts.say(`point.${pointing.says}.touch`));
    }
    arrow.dataset.way = pointing.way;
    arrow.dataset.anchor = pointing.anchor;
    arrow.dataset.kind = Coach.isWarning(tip) ? "warning" : "tip";
    arrow.style.left = `${x.toFixed(1)}px`;
    arrow.style.top = `${y.toFixed(1)}px`;
    arrow.hidden = false;
  }

  /** Writes the arrow's words into `into`, each key and button they name as a key cap. */
  private static write(into: HTMLElement, words: string): void {
    const document = into.ownerDocument;
    into.replaceChildren(
      ...words.split(CoachArrow.CAPS).map((part, index) => {
        // `split` with a group puts what it matched at the odd places.
        if (index % 2 === 0) {
          return document.createTextNode(part);
        }
        const key = document.createElement("kbd");
        if (part.startsWith("[")) {
          key.dataset.button = "";
        }
        key.textContent = part.slice(1, -1);
        return key;
      }),
    );
  }

  private static required(document: Document, selector: string): HTMLElement {
    const element = document.querySelector<HTMLElement>(selector);
    if (element === null) {
      throw new RangeError(`The page has no ${selector}`);
    }
    return element;
  }
}
