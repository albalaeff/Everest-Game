import type { Point, Terrain } from "../physics";
import type { HazardKind, HazardZone } from "../simulation";
import type { IceSurface } from "./ice-surface";

/** A piece of what comes down: a block of ice or a puff of snow, its middle and its size, in
 * metres. */
export interface DebrisPiece extends Point {
  readonly size: number;
}

/** A serac over the route, in metres: its outline, closed, from its foot over its broken top; its
 * face away from the light; the snow on its top; and the cracks down its ice. */
export interface Serac {
  readonly outline: readonly Point[];
  readonly shade: readonly Point[];
  readonly cap: readonly Point[];
  readonly cracks: readonly (readonly Point[])[];
}

/**
 * The hazards as the picture shows them, in slope metres, with no words (#24): seracs towering
 * over a serac's stretch, leaning out over the route and cracked, as the Icefall's are (#184),
 * and loaded snow along an avalanche slope or a cornice, so the player sees where not to linger,
 * and nothing over a hidden crevasse. While one goes, its ice or snow comes down from high above
 * the stretch to its ground as the warning runs out.
 */
export class HazardSigns {
  /** How far each side of its middle a serac stands at its foot. */
  static readonly TOWER_HALF_WIDTH = 3;
  /** The seracs' heights over a stretch, from its start, over the highest ice about them: the
   * drawing's numbers, over the 9 m the sources give the Icefall's (route.icefall-hazards). */
  static readonly TOWER_METRES: readonly number[] = [15, 21, 17];
  /** How deep the snow on a serac's top lies, how much of its width its face away from the light
   * is, and where its cracks start across it and how far down its height they run. */
  private static readonly CAP_METRES = 0.45;
  private static readonly SHADED_SHARE = 0.38;
  private static readonly CRACKS: readonly (readonly [across: number, down: number])[] = [
    [0.25, 0.65],
    [-0.4, 0.45],
  ];
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

  constructor(
    private readonly terrain: Terrain,
    private readonly surface: IceSurface,
  ) {}

  /** What lies over a zone, as outlines: a band of snow for an avalanche slope or a cornice;
   * nothing for a hidden crevasse, or for a serac's stretch, whose seracs stand behind it. */
  zone(zone: HazardZone): readonly (readonly Point[])[] {
    if (zone.kind === "avalanche" || zone.kind === "cornice") {
      return [this.band(zone)];
    }
    return [];
  }

  /** The seracs towering over a serac's stretch, behind it, each on the highest ice about it, a
   * crevasse between them closed at its lips; none over any other zone. */
  seracs(zone: HazardZone): readonly Serac[] {
    if (zone.kind !== "serac") {
      return [];
    }
    const heights = HazardSigns.TOWER_METRES;
    const half = HazardSigns.TOWER_HALF_WIDTH;
    const left = this.terrain.point(zone.from).x;
    const right = this.terrain.point(zone.to).x;
    return heights.map((height, index) => {
      const middle = left + ((right - left) * (index + 0.5)) / heights.length;
      const base = this.surface.highest(middle - half, middle + half);
      // Every other one leans the other way, so no two neighbours match.
      const turned = index % 2 === 0 ? 1 : -1;
      const at = ([across, up]: readonly [number, number]): Point => ({
        x: middle + turned * across * half,
        y: base + up * height,
      });
      const outline = HazardSigns.SERAC_SHAPE.map(at);
      const cut = middle - turned * half * (1 - 2 * HazardSigns.SHADED_SHARE);
      const shade = outline.map(({ x, y }) => ({
        x: turned === 1 ? Math.min(x, cut) : Math.max(x, cut),
        y,
      }));
      const top = HazardSigns.SERAC_SHAPE.filter(([, up]) => up >= HazardSigns.TOP).map(at);
      const cap = [
        ...top,
        ...top.map(({ x, y }) => ({ x, y: y - HazardSigns.CAP_METRES })).reverse(),
      ];
      const cracks = HazardSigns.CRACKS.map(([across, down]) => {
        const from = at([across, 0.97]);
        const below = [0.3, 0.55, 0.8, 1].map((share) => ({
          x: from.x + turned * half * 0.12 * Math.sin(share * 9 + across * 5),
          y: from.y - height * down * share,
        }));
        return [from, ...below];
      });
      return { outline, shade, cap, cracks };
    });
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

  /** A serac, a tower of ice with a broken top leaning out past its foot, its foot sunk behind the
   * ice in front: across its foot from -1 to 1, up it from 0 to 1 over the ice about it. */
  private static readonly SERAC_SHAPE: readonly (readonly [number, number])[] = [
    [-1, -0.3],
    [0.85, -0.3],
    [0.95, 0.42],
    [1.18, 0.76],
    [1.02, 0.93],
    [0.62, 1],
    [0.38, 0.9],
    [0.05, 0.97],
    [-0.35, 0.87],
    [-0.62, 0.74],
    [-0.86, 0.48],
  ];
  /** How high up a serac its top's corners are, where its snow lies. */
  private static readonly TOP = 0.85;

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
