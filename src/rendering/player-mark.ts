import { Graphics } from "pixi.js";

import type { Point } from "../physics";
import { Palette } from "./palette";

/**
 * The mark over the player's own climber, so they find themselves in a second by its shape as well
 * as by the suit's colour, in a crowd as in a room (docs/guidelines/graphics.md → Readable first):
 * a small triangle pointing down at them, white on a dark edge, the same few pixels at every zoom
 * and in every light. It stays upright when they fall, and still: it never bobs with the stride or
 * blinks, kind for six hours. Drawn once in pixels, and placed each frame over their head.
 */
export class PlayerMark extends Graphics {
  /** In pixels: how wide and how tall it is, its dark edge, and the gap over the head. */
  private static readonly WIDTH = 12;
  private static readonly HEIGHT = 8;
  private static readonly EDGE = 1.5;
  private static readonly GAP = 6;

  constructor() {
    super();
    // In pixels, y up as the layer's metres are: its point at the origin, its top above it.
    const half = PlayerMark.WIDTH / 2;
    this.poly([0, 0, half, PlayerMark.HEIGHT, -half, PlayerMark.HEIGHT])
      .fill(Palette.MARK)
      .stroke({ width: PlayerMark.EDGE, color: Palette.MARK_EDGE, join: "round" });
  }

  /** Puts it over a climber whose head is no higher than `top`, in the layer's metres, at the
   * camera's `pixelsPerMetre`. */
  place(top: Point, pixelsPerMetre: number): void {
    this.position.set(top.x, top.y + PlayerMark.GAP / pixelsPerMetre);
    this.scale.set(1 / pixelsPerMetre);
  }
}
