import { Graphics } from "pixi.js";

import { FigureRig } from "./figure-rig";
import type { RigParts } from "./figure-rig";
import type { Outline, ToolOutlines } from "./figure-shapes";

/**
 * The rim of light round a climber's figure (#168): its silhouette, part for part, drawn white
 * and `width` wider than the figure, to be tinted the hour's light and set behind the figure a
 * little towards where the light comes from, so only that edge of it shows.
 */
export class RimRig extends FigureRig {
  constructor(width: number) {
    super(RimRig.drawParts(width));
    const { parts } = this;
    this.addChild(parts.strapped[1], parts.strapped[0], parts.tools[1]);
    for (const side of [1, 0] as const) {
      this.addChild(
        parts.thighs[side],
        parts.shins[side],
        parts.boots[side],
        parts.upperArms[side],
        parts.forearms[side],
      );
    }
    this.addChild(parts.pack, parts.torso, parts.neck, parts.head, parts.mask, parts.tools[0]);
  }

  private static drawParts(width: number): RigParts {
    const part = (...outlines: Outline[]): Graphics => {
      const silhouette = new Graphics();
      for (const outline of outlines) {
        silhouette
          .poly([...outline])
          .fill(0xffffff)
          .stroke({ width, color: 0xffffff, join: "round" });
      }
      return silhouette;
    };
    const pair = (...outlines: Outline[]): [Graphics, Graphics] => [
      part(...outlines),
      part(...outlines),
    ];
    const { thigh, shin, gaiter, boot, upperArm, forearm, mitt } = RimRig.SHAPES;
    const { pack, lid, torso, neck, hood, mask, axe, iceTool } = RimRig.SHAPES;
    const tool = ({ shaft, grip, foot, head, rest }: ToolOutlines): Graphics =>
      part(shaft, grip, foot, head, ...(rest === null ? [] : [rest]));
    return {
      thighs: pair(thigh),
      shins: pair(shin, gaiter),
      boots: pair(boot),
      upperArms: pair(upperArm),
      forearms: pair(forearm, mitt),
      pack: part(pack, lid),
      torso: part(torso),
      neck: part(neck),
      head: part(hood),
      mask: part(mask),
      tools: [tool(axe), tool(iceTool)],
      strapped: [tool(axe), tool(iceTool)],
    };
  }
}
