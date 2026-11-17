import { FillGradient } from "pixi.js";

import type { Joint } from "./climber-pose";
import { Palette } from "./palette";

/** Which way a colour is shaded over a part, in the part's own bounds. Side-on (`SuitRig`):
 * across a limb, from its dark side to its lit one; from the back of a body to its front; from
 * below and behind a head to above it and ahead. From the front (`FrontRig`, #235), lit from the
 * viewer's right: across a part from its left to its right, or from below on the left to above on
 * the right. */
export type Shade = "across" | "front" | "above" | "side";

/**
 * How a climber's kit is painted, the same side-on and from the front (#168, #235): a colour
 * shaded over a part from its dark side, through itself, to its lit side, and itself again at the
 * edge, where the light glances off; and the seams between the down's baffles. The figures share
 * one, so each shading is made once for every figure that wears it.
 */
export class KitShading {
  /** The one every figure paints with. */
  static readonly SHARED = new KitShading();
  /** How dark a colour's shaded side is, and how bright its lit side, as shares of it. */
  static readonly TONES = { dark: 0.55, light: 1.32 };
  /** The seams between the down's baffles: how wide and how dark. */
  static readonly SEAM = { width: 0.012, alpha: 0.42 };
  private static readonly WAYS: Readonly<Record<Shade, { start: Joint; end: Joint }>> = {
    across: { start: { x: 0.5, y: 0 }, end: { x: 0.5, y: 1 } },
    front: { start: { x: 0, y: 0.35 }, end: { x: 1, y: 0.65 } },
    above: { start: { x: 0.15, y: 0.1 }, end: { x: 0.85, y: 0.95 } },
    side: { start: { x: 0, y: 0.5 }, end: { x: 1, y: 0.5 } },
  };
  /** Each shading made so far, by what it's for. */
  private readonly made = new Map<string, FillGradient>();

  /** `colour` shaded over a part `shade`'s way: its dark side, itself, its lit side, and itself
   * again at the edge. */
  of(colour: number, shade: Shade): FillGradient {
    return this.once(`${shade} ${colour}`, () => {
      const { dark, light } = KitShading.TONES;
      const { start, end } = KitShading.WAYS[shade];
      return new FillGradient({
        type: "linear",
        start,
        end,
        colorStops: [
          { offset: 0, color: Palette.css(KitShading.toned(colour, dark)) },
          { offset: 0.45, color: Palette.css(colour) },
          { offset: 0.8, color: Palette.css(KitShading.toned(colour, light)) },
          { offset: 1, color: Palette.css(colour) },
        ],
        textureSpace: "local",
      });
    });
  }

  /** The shading `key` names, made by `make` the first time it's asked for. */
  once(key: string, make: () => FillGradient): FillGradient {
    const known = this.made.get(key);
    if (known !== undefined) {
      return known;
    }
    const made = make();
    this.made.set(key, made);
    return made;
  }

  /** A colour with each channel times `share`: darker below 1, brighter above. */
  static toned(colour: number, share: number): number {
    const { red, green, blue } = Palette.channels(colour);
    return Palette.colour({ red: red * share, green: green * share, blue: blue * share });
  }
}
