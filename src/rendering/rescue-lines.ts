import { Graphics } from "pixi.js";

import type { Point, RescueLineView, Terrain } from "../physics";
import type { LeastSize } from "./least-size";
import { LineAnchor } from "./line-anchor";
import { Palette } from "./palette";

/** Who is on a rescue line this frame: the rope that bears a casualty hauled up it, from its
 * anchor down to where they're tied in, and where the hands that haul it are, or none. */
export interface LineLoad {
  readonly taut: readonly Point[];
  readonly hands: Point | null;
}

/**
 * The rescue lines on the slope (#241), drawn each frame while there are any: at the lip, two ice
 * screws turned into the ice one after the other as the anchor is built, each with its hanger,
 * then the sling that joins them to one point (`LineAnchor`); and, the anchor done, the yellow
 * cord from there over the lip and down the ice to its foot. A casualty hauled up it hangs on its
 * end, so it runs taut to them and no further, and back from a pulley at the anchor to the hands
 * that haul it. It keeps only whether it has anything drawn.
 */
export class RescueLines extends Graphics {
  /** A screw's tube and its hanger, the sling, the cord and the pulley it's hauled through: how
   * wide each is drawn, in metres, and the cord's dark edge as a share of it. */
  private static readonly SCREW_METRES = 0.028;
  private static readonly HANGER_METRES = 0.04;
  private static readonly SLING_METRES = 0.035;
  private static readonly CORD_METRES = 0.045;
  private static readonly CORD_EDGE = 0.5;
  private static readonly PULLEY_METRES = 0.045;

  private drawn = false;

  /** The lines as they are this frame on `terrain`, each one's load if a casualty is hauled up
   * it, no thinner than `size` allows, the figures `grown` times life size. */
  show(
    lines: readonly RescueLineView[],
    terrain: Terrain,
    loads: ReadonlyMap<string, LineLoad>,
    size: LeastSize,
    grown: number,
  ): void {
    if (lines.length === 0 && !this.drawn) {
      return;
    }
    this.clear();
    this.drawn = lines.length > 0;
    for (const line of lines) {
      const anchor = new LineAnchor(terrain, line, grown);
      this.anchor(anchor, size, grown);
      if (line.built >= 1) {
        this.cord(anchor, line, loads.get(line.id) ?? null, size, grown);
      }
    }
  }

  /** The screws, as far in as the anchor is built, and the sling as far as it's been run. */
  private anchor(anchor: LineAnchor, size: LeastSize, grown: number): void {
    const { master, slung } = anchor;
    const heads = [anchor.head(0), anchor.head(1)];
    if (slung > 0) {
      for (const head of heads) {
        if (head !== null) {
          this.moveTo(head.x, head.y).lineTo(
            head.x + (master.x - head.x) * slung,
            head.y + (master.y - head.y) * slung,
          );
        }
      }
      this.stroke({
        width: size.line(RescueLines.SLING_METRES * grown),
        color: Palette.ANCHOR_SLING,
        cap: "round",
      });
    }
    heads.forEach((head, index) => {
      const at = anchor.screws[index === 0 ? 0 : 1];
      if (head === null) {
        return;
      }
      this.moveTo(at.x, at.y)
        .lineTo(head.x, head.y)
        .stroke({
          width: size.line(RescueLines.SCREW_METRES * grown),
          color: Palette.SCREW,
          cap: "butt",
        });
      this.circle(head.x, head.y, RescueLines.HANGER_METRES * grown).fill(Palette.SCREW_HANGER);
    });
  }

  /** The cord from the anchor over the lip: down the ice to its foot, or taut to a casualty
   * hauled up it and back from a pulley at the anchor to the hands that haul. */
  private cord(
    anchor: LineAnchor,
    line: RescueLineView,
    load: LineLoad | null,
    size: LeastSize,
    grown: number,
  ): void {
    const { master } = anchor;
    const down = load === null ? line.shape : load.taut;
    const hands = load?.hands ?? null;
    const run = (): void => {
      if (hands === null) {
        this.moveTo(master.x, master.y);
      } else {
        this.moveTo(hands.x, hands.y).lineTo(master.x, master.y);
      }
      for (const point of down) {
        this.lineTo(point.x, point.y);
      }
    };
    const width = size.line(RescueLines.CORD_METRES);
    run();
    this.stroke({
      width: width * (1 + 2 * RescueLines.CORD_EDGE),
      color: Palette.RESCUE_LINE_SHADE,
      cap: "round",
      join: "round",
    });
    run();
    this.stroke({ width, color: Palette.RESCUE_LINE, cap: "round", join: "round" });
    if (hands !== null) {
      this.circle(master.x, master.y, RescueLines.PULLEY_METRES * grown)
        .fill(Palette.SCREW)
        .stroke({ width: size.line(0.012 * grown), color: Palette.ANCHOR });
    }
  }
}
