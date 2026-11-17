import type { Changeover } from "./changeover";
import { Coach } from "./coach";
import type { CoachTip, CoachWorld } from "./coach";
import { CoachGear } from "./coach-gear";
import type { GearTextName } from "./coach-gear";
import { CoachSteps } from "./coach-steps";
import type { StepTextName } from "./coach-steps";
import { KeyCaps } from "./key-caps";
import type { Texts } from "./texts";

/** The coach's words, by tip and device: each tip's for a keyboard and for touch. */
export type CoachTextName = `${CoachTip}.${"pc" | "touch"}`;

/**
 * The coach's card on the page (#192): `#coach`, over the slope under the readouts, saying the
 * tip the coach picks each frame for the player's own device, a keyboard's keys or the thumb's
 * controls, as the page's `touch` mark shows one or the other. A tip of the tutorial is marked
 * `data-kind="tip"`, a warning `"warning"`, which the page draws with a mark of its own, a peak or
 * a triangle, so colour is never the only cue. The keys and the buttons a tip names stand out as
 * key caps (`kbd`, `KeyCaps`): a key's name on its own (D, Shift), or a button's name, which the
 * words keep in brackets ([Clip 1]), without them, marked `data-button`. Under a changeover's tip
 * it lists its steps, ticked off as they're done (`CoachSteps`, #247), and under the clip's what
 * the jumar and the carabiner are (`CoachGear`). It changes the page only when the tip or a step
 * changes, and never takes a click from the slope.
 */
export class CoachCard {
  private readonly card: HTMLElement;
  private readonly onPc: HTMLElement;
  private readonly onTouch: HTMLElement;
  private readonly steps: CoachSteps;
  private readonly gear: CoachGear;

  private shown: CoachTip | null = null;

  constructor(
    document: Document,
    private readonly texts: Pick<Texts<CoachTextName | StepTextName | GearTextName>, "say">,
    private readonly coach: Coach,
    private readonly world: CoachWorld,
  ) {
    this.card = CoachCard.required(document, "#coach");
    this.onPc = CoachCard.required(document, "#coach .coach__words[data-device='pc']");
    this.onTouch = CoachCard.required(document, "#coach .coach__words[data-device='touch']");
    this.steps = new CoachSteps(CoachCard.required(document, "#coach .coach__steps"), texts);
    this.gear = new CoachGear(CoachCard.required(document, "#coach .coach__gear"), texts);
  }

  /** The tip on the card now, or none: Pemba's voice hears its warnings too (#212). */
  get tip(): CoachTip | null {
    return this.shown;
  }

  /** The changeover on the card now, or none (#247): the arrow points at its step to do now, and
   * the mark rings its anchor. */
  get changeover(): Changeover | null {
    return this.coach.changeover;
  }

  /** The tip after `seconds` more of the climb, shown if it's changed, and its steps or its gear
   * as the climber stands. */
  update(seconds: number): void {
    const tip = this.coach.tip(this.world, seconds);
    const view = this.world.player();
    this.steps.update(this.coach.changeover, view);
    this.gear.update(tip === "clip", view);
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
    KeyCaps.BARE.write(this.onPc, this.texts.say(`${tip}.pc`));
    KeyCaps.BARE.write(this.onTouch, this.texts.say(`${tip}.touch`));
  }

  private static required(document: Document, selector: string): HTMLElement {
    const element = document.querySelector<HTMLElement>(selector);
    if (element === null) {
      throw new RangeError(`The page has no ${selector}`);
    }
    return element;
  }
}
