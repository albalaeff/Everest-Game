import type { ClimberView } from "../physics";
import type { Changeover, ChangeoverStep } from "./changeover";
import { KeyCaps } from "./key-caps";
import type { Texts } from "./texts";

/** A changeover step's words, by device: a keyboard's key, or the thumb's button. */
export type StepTextName = `step.${ChangeoverStep}.${"pc" | "touch"}`;

/**
 * The changeover's steps on the coach's card (#247): `.coach__steps`, a numbered list under the
 * tip, each step its number, its key cap and its words for the player's device. Each is marked by
 * where it stands for the climber (`data-state`): ticked off once done, the one to do now in the
 * rope's orange and `aria-current`, its number and its weight marking it too, so colour is never
 * the only cue; a carabiner going onto the rope says so while the hands are at it. On a short
 * screen, a phone's held sideways, the numbers make one row and only the step to do now says its
 * words after them (`style.css`), so the card leaves the climber in view. It's built when the
 * changeover on the card changes, and its marks change only when they do.
 */
export class CoachSteps {
  private static readonly TICK = "✓";

  private shown: Changeover | null = null;

  constructor(
    private readonly list: HTMLElement,
    private readonly texts: Pick<Texts<StepTextName>, "say">,
  ) {}

  /** The steps of the changeover on the card, or none, as the climber stands now. */
  update(change: Changeover | null, view: ClimberView): void {
    if (change !== this.shown) {
      this.shown = change;
      this.build(change);
    }
    if (change === null) {
      return;
    }
    this.list.querySelectorAll<HTMLElement>("li[data-step]").forEach((item, index) => {
      const state = change.state(item.dataset.step as ChangeoverStep, view);
      if (item.dataset.state === state) {
        return;
      }
      item.dataset.state = state;
      const number = item.querySelector(".coach__number");
      if (number !== null) {
        number.textContent = state === "done" ? CoachSteps.TICK : String(index + 1);
      }
      if (state === "now" || state === "going") {
        item.setAttribute("aria-current", "step");
      } else {
        item.removeAttribute("aria-current");
      }
    });
  }

  /** A list item for each step, in order, or none: its number, which the list says to a screen
   * reader itself, and its words for each device. */
  private build(change: Changeover | null): void {
    const document = this.list.ownerDocument;
    this.list.hidden = change === null;
    this.list.replaceChildren(
      ...(change?.steps ?? []).map((step, index) => {
        const item = document.createElement("li");
        item.dataset.step = step;
        const number = document.createElement("span");
        number.className = "coach__number";
        number.setAttribute("aria-hidden", "true");
        number.textContent = String(index + 1);
        item.append(number);
        for (const device of ["pc", "touch"] as const) {
          const words = document.createElement("span");
          words.dataset.device = device;
          KeyCaps.BRACED.write(words, this.texts.say(`step.${step}.${device}`));
          item.append(words);
        }
        return item;
      }),
    );
  }
}
