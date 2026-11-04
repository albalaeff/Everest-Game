import type { ClimberId, HazardGround, HazardKind, ObjectiveHazards } from "../simulation";

/** What the notice says for each kind of hazard going over the player. */
export type HazardTexts = Readonly<Record<`warning-${HazardKind}`, string>>;

/**
 * The line over the slope while a serac cracks or an avalanche roars above the player: the
 * moment they have to get clear before it comes down (#24). It reads the hazards each frame,
 * and goes once the player is out of the zone or it's come down.
 */
export class HazardNotice {
  constructor(
    private readonly element: Pick<HTMLElement, "textContent" | "hidden">,
    private readonly texts: HazardTexts,
    private readonly hazards: ObjectiveHazards,
    private readonly ground: HazardGround,
    private readonly player: ClimberId,
  ) {}

  frame(): void {
    const going = this.hazards.warningAt(this.ground.along(this.player));
    if (going === null) {
      this.element.hidden = true;
      return;
    }
    this.element.textContent = this.texts[`warning-${going}`];
    this.element.hidden = false;
  }
}
