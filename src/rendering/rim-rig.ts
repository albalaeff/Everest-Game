import { Graphics } from "pixi.js";

import { FigureRig } from "./figure-rig";
import type { RigParts } from "./figure-rig";
import { FigureShapes } from "./figure-shapes";
import type { Outline } from "./figure-shapes";

/**
 * The rim of light round a climber's figure (#168): its silhouette, part for part, drawn white
 * and `width` wider than the figure, to be tinted the hour's light and set behind the figure a
 * little towards where the light comes from, so only that edge of it shows.
 */
export class RimRig extends FigureRig {
  constructor(width: number) {
    super(RimRig.drawParts(width));
    const { parts } = this;
    for (const side of [1, 0] as const) {
      this.addChild(
        parts.thighs[side],
        parts.shins[side],
        parts.boots[side],
        parts.upperArms[side],
        parts.forearms[side],
      );
    }
    this.addChild(parts.pack, parts.torso, parts.neck, parts.head);
  }

  private static drawParts(width: number): RigParts {
    const part = (...outlines: Outline[]): Graphics => {
      const silhouette = new Graphics();
      for (const outline of outlines) {
        silhouette.poly([...outline]).fill(0xffffff).stroke({ width, color: 0xffffff, join: "round" });
      }
      return silhouette;
    };
    const pair = (...outlines: Outline[]): [Graphics, Graphics] => [part(...outlines), part(...outlines)];
    const { THIGH, SHIN, BOOT, UPPER_ARM, FOREARM, MITT, PACK, LID, TORSO, NECK, HOOD, MASK } =
      FigureShapes;
    return {
      thighs: pair(THIGH),
      shins: pair(SHIN),
      boots: pair(BOOT),
      upperArms: pair(UPPER_ARM),
      forearms: pair(FOREARM, MITT),
      pack: part(PACK, LID),
      torso: part(TORSO),
      neck: part(NECK),
      head: part(HOOD, MASK),
    };
  }
}
