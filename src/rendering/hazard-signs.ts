import type { Point, Terrain } from "../physics";
import type { HazardKind, HazardZone } from "../simulation";

/** A piece of what comes down: a block of ice or a puff of snow, its middle and its size, in
 * metres. */
export interface DebrisPiece extends Point {
  readonly size: number;
}

/**
 * The hazards as the picture shows them, in slope metres, with no words (#24): ice towers over a
 * serac's stretch and loaded snow along an avalanche slope or a cornice, so the player sees where
 * not to linger, and nothing over a hidden crevasse. While one goes, its ice or snow comes down
 * from high above the stretch to its ground as the warning runs out.
 */
export class HazardSigns {
  /** How far each side of its middle a tower stands. */
  static readonly TOWER_HALF_WIDTH = 2;
  /** The towers' heights over a stretch, from its start: the drawing's numbers, not the
   * mountain's. */
  static readonly TOWER_METRES: readonly number[] = [8, 12, 9];
  /** How deep the loaded snow lies on the ground. */
  static readonly LOADED_METRES = 0.8;
  /** How far apart the loaded snow's points are along the ground. */
  private static readonly BAND_STEP_METRES = 2;
  /** How high above the ground what comes down starts, and how many pieces of it there are. */
  static readonly FALL_METRES = 14;
  static readonly PIECES = 9;
  /** The pieces start at a few heights, so they don't come down in a line. */
  private static readonly STAGGER_METRES = 2;
  private static readonly PIECE_METRES: Readonly<Record<HazardKind, number>> = {
    serac: 0.9,
    avalanche: 1.4,
    crevasse: 0.6,
    cornice: 1.2,
  };

  constructor(private readonly terrain: Terrain) {}

  /** What stands over a zone, as outlines: towers for a serac, a band of snow for an avalanche
   * slope or a cornice, and nothing for a hidden crevasse. */
  zone(zone: HazardZone): readonly (readonly Point[])[] {
    if (zone.kind === "serac") {
      return this.towers(zone);
    }
    if (zone.kind === "crevasse") {
      return [];
    }
    return [this.band(zone)];
  }

  /** What comes down over a zone, `share` of the way through its warning: 0 as it begins, 1 as
   * it lands, and on the ground after. */
  debris(zone: HazardZone, share: number): readonly DebrisPiece[] {
    const left = 1 - Math.min(Math.max(share, 0), 1);
    const size = HazardSigns.PIECE_METRES[zone.kind];
    const pieces: DebrisPiece[] = [];
    for (let piece = 0; piece < HazardSigns.PIECES; piece += 1) {
      const ground = this.terrain.point(
        HazardSigns.across(zone, (piece + 0.5) / HazardSigns.PIECES),
      );
      const high = HazardSigns.FALL_METRES + (piece % 3) * HazardSigns.STAGGER_METRES;
      pieces.push({ x: ground.x, y: ground.y + high * left, size });
    }
    return pieces;
  }

  /** A point `share` of the way along a zone, in metres along the ground. */
  private static across(zone: HazardZone, share: number): number {
    return zone.from + (zone.to - zone.from) * share;
  }

  /** Each tower a block of ice with a broken top, every other one turned the other way so no two
   * neighbours match: across its foot from -1 to 1, and up it from 0 to 1. */
  private static readonly SERAC_SHAPE: readonly (readonly [number, number])[] = [
    [-1, 0],
    [1, 0],
    [0.85, 0.7],
    [0.7, 0.93],
    [0.25, 1],
    [-0.15, 0.86],
    [-0.55, 0.9],
    [-0.9, 0.72],
  ];

  private towers(zone: HazardZone): readonly (readonly Point[])[] {
    const heights = HazardSigns.TOWER_METRES;
    const half = HazardSigns.TOWER_HALF_WIDTH;
    return heights.map((height, tower) => {
      const foot = this.terrain.point(HazardSigns.across(zone, (tower + 0.5) / heights.length));
      const turned = tower % 2 === 0 ? 1 : -1;
      return HazardSigns.SERAC_SHAPE.map(([across, up]) => ({
        x: foot.x + turned * across * half,
        y: foot.y + up * height,
      }));
    });
  }

  /** The ground along a zone, and the same a snow's depth above it, back. */
  private band(zone: HazardZone): readonly Point[] {
    const ground: Point[] = [];
    for (let along = zone.from; along < zone.to; along += HazardSigns.BAND_STEP_METRES) {
      ground.push(this.terrain.point(along));
    }
    ground.push(this.terrain.point(zone.to));
    const above = ground.map(({ x, y }) => ({ x, y: y + HazardSigns.LOADED_METRES })).reverse();
    return [...ground, ...above];
  }
}
