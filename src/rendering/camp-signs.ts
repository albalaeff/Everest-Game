import type { Point, Terrain } from "../physics";

/** A camp as the picture needs it: the stretch of the ground its tents stand on. */
export interface CampStretch {
  readonly id: string;
  readonly from: number;
  readonly to: number;
}

/**
 * The camps as the picture shows them, in slope metres, with no words: a row of tents along each
 * camp's stretch of the ground, so the player sees where they set off from and where the section
 * ends. The tents' sizes are the drawing's numbers, not the mountain's.
 */
export class CampSigns {
  /** How far each side of its middle a tent stands, and how high its ridge is. */
  static readonly TENT_HALF_WIDTH = 1;
  static readonly TENT_METRES = 1.5;
  /** How far apart the tents stand along the ground. */
  private static readonly SPACING_METRES = 3;

  constructor(private readonly terrain: Terrain) {}

  /** The tents along a camp's stretch, as outlines on the ground: one every few metres, each a
   * metre in from the stretch's ends. */
  tents(camp: CampStretch): readonly (readonly Point[])[] {
    const half = CampSigns.TENT_HALF_WIDTH;
    const tents: (readonly Point[])[] = [];
    for (let along = camp.from + half; along + half <= camp.to; along += CampSigns.SPACING_METRES) {
      const foot = this.terrain.point(along);
      tents.push([
        { x: foot.x - half, y: foot.y },
        { x: foot.x + half, y: foot.y },
        { x: foot.x, y: foot.y + CampSigns.TENT_METRES },
      ]);
    }
    return tents;
  }
}
