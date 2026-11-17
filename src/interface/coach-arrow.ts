import type { Changeover } from "./changeover";
import { CoachPointer } from "./coach-pointer";
import type { PointerSays, PointerWorld } from "./coach-pointer";
import type { CoachTip } from "./coach";
import { Coach } from "./coach";
import { KeyCaps } from "./key-caps";
import type { ScreenPlace } from "./sherpa-bubble";
import { SlopePin } from "./slope-pin";
import type { Texts } from "./texts";

/** The arrow's words, by what it says and the device: a keyboard's keys, or the thumb's buttons. */
export type PointerTextName = `point.${PointerSays}.${"pc" | "touch"}`;

/**
 * The coach's arrow on the page (#233): `#pointer`, on the slope at the place the card's tip is
 * about, where `CoachPointer` finds it each frame, at a changeover the step to do now (#247): an
 * arrow whose tip is at the place, a ring round it, or whose tail is there, running on the way to
 * go (`data-anchor`), and at the arrow's tail the control to use there, for the player's own
 * device, as the page's `touch` mark shows one or the other. A key's name stands in braces in the
 * words ({R}) and a button's in brackets ([Clip 2]); each is drawn as a key cap, as on the card
 * (`KeyCaps`). A warning's arrow is marked `data-kind="warning"`, as its card. It follows its place
 * each frame through the camera (`SlopePin`), hides while that's off the screen or the page draws
 * no picture, changes its words only when they change, and never takes a click from the slope.
 * The card's words are what a screen reader reads: the arrow says them again for the eye alone.
 */
export class CoachArrow {
  private readonly arrow: HTMLElement;
  private readonly onPc: HTMLElement;
  private readonly onTouch: HTMLElement;
  private readonly pin: SlopePin;
  private readonly pointer = new CoachPointer();
  private said: PointerSays | null = null;

  constructor(
    window: Window,
    private readonly texts: Pick<Texts<PointerTextName>, "say">,
    private readonly world: PointerWorld,
    place: ScreenPlace,
  ) {
    const { document } = window;
    this.arrow = CoachArrow.required(document, "#pointer");
    this.onPc = CoachArrow.required(document, "#pointer [data-device='pc']");
    this.onTouch = CoachArrow.required(document, "#pointer [data-device='touch']");
    this.pin = new SlopePin(window, this.arrow, place);
  }

  /** The arrow for the tip on the card now, and its changeover if it's one, where its place is on
   * the screen this frame. */
  update(tip: CoachTip | null, change: Changeover | null = null): void {
    const { arrow } = this;
    const pointing = this.pointer.point(tip, this.world, change);
    // Pinned at its place, or hidden: off the screen, or no place to point at (#247).
    if (!this.pin.at(pointing?.at ?? null) || tip === null || pointing === null) {
      if (this.said !== null) {
        delete arrow.dataset.says;
        this.said = null;
      }
      return;
    }
    if (pointing.says !== this.said) {
      this.said = pointing.says;
      arrow.dataset.says = pointing.says;
      KeyCaps.BRACED.write(this.onPc, this.texts.say(`point.${pointing.says}.pc`));
      KeyCaps.BRACED.write(this.onTouch, this.texts.say(`point.${pointing.says}.touch`));
    }
    arrow.dataset.way = pointing.way;
    arrow.dataset.anchor = pointing.anchor;
    arrow.dataset.kind = Coach.isWarning(tip) ? "warning" : "tip";
  }

  private static required(document: Document, selector: string): HTMLElement {
    const element = document.querySelector<HTMLElement>(selector);
    if (element === null) {
      throw new RangeError(`The page has no ${selector}`);
    }
    return element;
  }
}
