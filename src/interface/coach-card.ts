import type { Coach, CoachTip, CoachWorld } from "./coach";
import type { Texts } from "./texts";

/** The coach's words, by tip and device: each tip's for a keyboard and for touch. */
export type CoachTextName = `${CoachTip}.${"pc" | "touch"}`;

/**
 * The coach's card on the page (#192): `#coach`, over the slope under the readouts, saying the
 * tip the coach picks each frame for the player's own device, a keyboard's keys or the thumb's
 * controls, as the page's `touch` mark shows one or the other; a warning edged in the warning's
 * colour. It changes the page only when the tip changes, and never takes a click from the slope.
 */
export class CoachCard {
  private readonly card: HTMLElement;
  private readonly onPc: HTMLElement;
  private readonly onTouch: HTMLElement;
  private shown: CoachTip | null = null;

  constructor(
    document: Document,
    private readonly texts: Texts<CoachTextName>,
    private readonly coach: Coach,
    private readonly world: CoachWorld,
  ) {
    this.card = CoachCard.required(document, "#coach");
    this.onPc = CoachCard.required(document, "#coach [data-device='pc']");
    this.onTouch = CoachCard.required(document, "#coach [data-device='touch']");
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
    this.onPc.textContent = this.texts.say(`${tip}.pc`);
    this.onTouch.textContent = this.texts.say(`${tip}.touch`);
  }

  private static required(document: Document, selector: string): HTMLElement {
    const element = document.querySelector<HTMLElement>(selector);
    if (element === null) {
      throw new RangeError(`The page has no ${selector}`);
    }
    return element;
  }
}
