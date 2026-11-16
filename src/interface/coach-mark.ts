import type { Changeover } from "./changeover";
import type { ScreenPlace } from "./sherpa-bubble";
import { SlopePin } from "./slope-pin";
import type { Texts } from "./texts";

/** The mark's words: the anchor's name, where a next rope goes on from it or none does. */
export type MarkTextName = "mark.anchor" | "mark.rope-end";

/**
 * The coach's mark on the slope (#247): `#mark`, a ring round the anchor of the changeover on the
 * card and its name over it, "Anchor" where the next rope goes on from it and "End of the rope"
 * where none does, so the player sees which of the round things on the rope the card means
 * (docs/guidelines.md → The mountain is the interface). It follows the anchor each frame through
 * the camera (`SlopePin`), hides while that's off the screen, no changeover is on the card or the
 * page draws no picture, changes its words only when they change, and never takes a click. The
 * card says it for a screen reader: the mark is for the eye alone.
 */
export class CoachMark {
  private readonly mark: HTMLElement;
  private readonly name: HTMLElement;
  private readonly pin: SlopePin;
  private said: MarkTextName | null = null;

  constructor(
    window: Window,
    private readonly texts: Pick<Texts<MarkTextName>, "say">,
    place: ScreenPlace,
  ) {
    const { document } = window;
    const mark = document.querySelector<HTMLElement>("#mark");
    const name = document.querySelector<HTMLElement>("#mark .mark__name");
    if (mark === null || name === null) {
      throw new RangeError("The page has no #mark");
    }
    this.mark = mark;
    this.name = name;
    this.pin = new SlopePin(window, mark, place);
  }

  /** The mark on the anchor of the changeover on the card now, or none. */
  update(change: Changeover | null): void {
    if (!this.pin.at(change?.anchor ?? null) || change === null) {
      return;
    }
    const said: MarkTextName = change.next === null ? "mark.rope-end" : "mark.anchor";
    if (said !== this.said) {
      this.said = said;
      this.mark.dataset.says = said === "mark.anchor" ? "anchor" : "rope-end";
      this.name.textContent = this.texts.say(said);
    }
  }
}
