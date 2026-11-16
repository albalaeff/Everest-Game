import type { ClimberView } from "../physics";
import { GearDrawing } from "./gear-drawing";
import { KeyCaps } from "./key-caps";
import type { Texts } from "./texts";

/** The two ends of the cowstails the card says what they are: the first's, the jumar, and the
 * second's, a plain carabiner. */
export type GearEnd = "jumar" | "carabiner";

/** A gear line's words, by device: a keyboard's key, or the thumb's button. */
export type GearTextName = `gear.${GearEnd}.${"pc" | "touch"}`;

/**
 * What a jumar and a carabiner are, on the coach's card at the first rope (#247): `.coach__gear`,
 * a line for each end of the cowstails, in the order the tip has them clipped, the carabiner's
 * first, each with its drawing, the pack's own (`GearDrawing`), its key cap and what it does on
 * the rope, for the player's device: the carabiner runs free and holds a slip only at the anchor
 * below, the jumar grips and slides only while its key is held (technique.jumar,
 * gear.fixed-rope-under-weight). Each is marked by where it stands for the climber
 * (`data-state`): on the rope already, the one to clip now, or after it; on a short screen only
 * the one to clip now shows (`style.css`), one thing at a time. Written while the clip's tip is
 * up, where the player first clips both on, and gone with it.
 */
export class CoachGear {
  private static readonly ENDS: readonly GearEnd[] = ["carabiner", "jumar"];

  private shown = false;

  constructor(
    private readonly list: HTMLElement,
    private readonly texts: Pick<Texts<GearTextName>, "say">,
  ) {}

  /** Writes the lines while `shown`, or takes them away, and marks each as the climber stands. */
  update(shown: boolean, view: ClimberView): void {
    if (shown !== this.shown) {
      this.shown = shown;
      this.build(shown);
    }
    let now = true;
    for (const item of this.list.querySelectorAll<HTMLElement>("li[data-gear]")) {
      const on = (item.dataset.gear === "carabiner" ? view.second : view.first) !== null;
      const state = on ? "done" : now ? "now" : "later";
      now &&= on;
      if (item.dataset.state !== state) {
        item.dataset.state = state;
      }
    }
  }

  /** A line for each end, in order, or none. */
  private build(shown: boolean): void {
    const document = this.list.ownerDocument;
    this.list.hidden = !shown;
    this.list.replaceChildren(
      ...(shown ? CoachGear.ENDS : []).map((end) => {
        const item = document.createElement("li");
        item.dataset.gear = end;
        const { svg } = new GearDrawing(document, end);
        svg.setAttribute("aria-hidden", "true");
        item.append(svg);
        for (const device of ["pc", "touch"] as const) {
          const words = document.createElement("span");
          words.dataset.device = device;
          KeyCaps.BRACED.write(words, this.texts.say(`gear.${end}.${device}`));
          item.append(words);
        }
        return item;
      }),
    );
  }
}
