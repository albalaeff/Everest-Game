import { Coach } from "./coach";
import type { CoachTip, CoachWorld } from "./coach";
import type { Texts } from "./texts";

/** The coach's words, by tip and device: each tip's for a keyboard and for touch. */
export type CoachTextName = `${CoachTip}.${"pc" | "touch"}`;

/**
 * The coach's card on the page (#192): `#coach`, over the slope under the readouts, saying the
 * tip the coach picks each frame for the player's own device, a keyboard's keys or the thumb's
 * controls, as the page's `touch` mark shows one or the other. A tip of the tutorial is marked
 * `data-kind="tip"`, a warning `"warning"`, which the page draws with a mark of its own, a peak or
 * a triangle, so colour is never the only cue. The keys and the buttons a tip names stand out as
 * key caps (`kbd`): a key's name on its own (D, Shift), or a button's name, which the words keep
 * in brackets ([Clip 1]), without them, marked `data-button`. It changes the page only when the
 * tip changes, and never takes a click from the slope.
 */
export class CoachCard {
  private readonly card: HTMLElement;
  private readonly onPc: HTMLElement;
  private readonly onTouch: HTMLElement;
  /** A key or a button in a tip's words: a button's name in brackets, or a key's on its own. The
   * keys are the climb's (content/controls.json); "A" and "I" stay words, as English uses them. */
  private static readonly KEYS = /(\[[^\]]+\]|\b(?:W|S|D|C|E|R|F|Q|T|Z|X|Space|Shift|Tab)\b)/u;

  private shown: CoachTip | null = null;

  constructor(
    document: Document,
    private readonly texts: Pick<Texts<CoachTextName>, "say">,
    private readonly coach: Coach,
    private readonly world: CoachWorld,
  ) {
    this.card = CoachCard.required(document, "#coach");
    this.onPc = CoachCard.required(document, "#coach [data-device='pc']");
    this.onTouch = CoachCard.required(document, "#coach [data-device='touch']");
  }

  /** The tip on the card now, or none: Pemba's voice hears its warnings too (#212). */
  get tip(): CoachTip | null {
    return this.shown;
  }

  /** The tip after `seconds` more of the climb, shown if it's changed. */
  update(seconds: number): void {
    const tip = this.coach.tip(this.world, seconds);
    if (tip === this.shown) {
      return;
    }
    this.shown = tip;
    this.card.hidden = tip === null;
    if (tip === null) {
      delete this.card.dataset.tip;
      return;
    }
    this.card.dataset.tip = tip;
    this.card.dataset.kind = Coach.isWarning(tip) ? "warning" : "tip";
    CoachCard.write(this.onPc, this.texts.say(`${tip}.pc`));
    CoachCard.write(this.onTouch, this.texts.say(`${tip}.touch`));
  }

  /** Writes a tip's words into `into`, each key and button they name as a key cap. */
  private static write(into: HTMLElement, words: string): void {
    const document = into.ownerDocument;
    into.replaceChildren(
      ...words.split(CoachCard.KEYS).map((part, index) => {
        // `split` with a group puts what it matched at the odd places.
        if (index % 2 === 0) {
          return document.createTextNode(part);
        }
        const key = document.createElement("kbd");
        if (part.startsWith("[")) {
          key.dataset.button = "";
          key.textContent = part.slice(1, -1);
        } else {
          key.textContent = part;
        }
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
