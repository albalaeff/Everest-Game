import type { Point, Terrain } from "../physics";
import type { HazardKind, HazardZone } from "../simulation";
import type { IceSurface } from "./ice-surface";

/** A piece of what comes down: a block of ice or a puff of snow, its middle and its size, in
 * metres. */
export interface DebrisPiece extends Point {
  readonly size: number;
}

/** A serac over the route, in metres: its outline, closed, from its foot over its broken top; its
 * face away from the light; the snow on its top; and the cracks down its ice; which way it leans
 * out along x; the middle of its foot, the ice about it, and how tall it stands over that; and
 * where its shade ends across it. */
export interface Serac {
  readonly outline: readonly Point[];
  readonly shade: readonly Point[];
  readonly cap: readonly Point[];
  readonly cracks: readonly (readonly Point[])[];
  readonly turned: 1 | -1;
  readonly middle: number;
  readonly base: number;
  readonly height: number;
  readonly shadeAt: number;
}

/**
 * The hazards as the picture shows them, in slope metres, with no words (#24): seracs towering
 * over a serac's stretch, leaning out over the route and cracked, as the Icefall's are (#184), one
 * every so often along it so that one stands over wherever a climber is, and a training collapse's
 * right over its stretch (#229); and loaded snow along an avalanche slope or a cornice, so the
 * player sees where not to linger, and nothing over a hidden crevasse. While an avalanche or a
 * cornice goes, its snow comes down from high above the stretch to its ground as the warning runs
 * out; a serac's fall is `SeracFall`'s.
 */
export class HazardSigns {
  /** How far each side of its middle a serac stands at its foot. */
  static readonly TOWER_HALF_WIDTH = 3;
  /** The seracs' heights over a stretch, from its start, over the highest ice about them: the
   * drawing's numbers, over the 9 m the sources give the Icefall's (route.icefall-hazards). */
  static readonly TOWER_METRES: readonly number[] = [15, 21, 17];
  /** How far apart the seracs stand along a long stretch, about: a stretch has as many as its
   * heights at the fewest (#229). */
  static readonly TOWER_SPACING = 10;
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
  /** How far apart the loaded snow's points are along the ground; and over how much of each end
   * of its stretch it thins to nothing, as a drift does (#243): a third of a short stretch. */
  private static readonly BAND_STEP_METRES = 0.5;
  private static readonly BAND_THINS_METRES = 3;
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
   * crevasse between them closed at its lips: as many as their heights, or one every so often
   * along a long stretch, the one nearest each of `events`, the training collapses staged on it,
   * moved right over that's stretch (#229); none over any other zone. */
  seracs(zone: HazardZone, events: readonly HazardZone[] = []): readonly Serac[] {
    if (zone.kind !== "serac") {
      return [];
    }
    const left = this.terrain.point(zone.from).x;
    const right = this.terrain.point(zone.to).x;
    const count = Math.max(
      HazardSigns.TOWER_METRES.length,
      Math.round((right - left) / HazardSigns.TOWER_SPACING),
    );
    const middles = Array.from(
      { length: count },
      (_, index) => left + ((right - left) * (index + 0.5)) / count,
    );
    for (const event of events) {
      const over = this.terrain.point((event.from + event.to) / 2).x;
      if (event.kind !== "serac" || over < left || over > right) {
        continue;
      }
      const nearest = middles.reduce(
        (best, middle, index) =>
          Math.abs(middle - over) < Math.abs((middles[best] ?? Infinity) - over) ? index : best,
        0,
      );
      middles[nearest] = over;
    }
    return middles.map((middle, index) => this.tower(middle, index));
  }

  /** A serac over the middle of a stretch of its own: a training collapse's staged off the serac
   * zones (#229). */
  seracOver(stretch: HazardZone): Serac {
    return this.tower(this.terrain.point((stretch.from + stretch.to) / 2).x, 0);
  }

  /** The part of `points` in a serac's shade, its side away from the light: each pressed in to
   * where its shade ends. */
  static shaded(serac: Serac, points: readonly Point[]): Point[] {
    const { turned, shadeAt } = serac;
    return points.map(({ x, y }) => ({
      x: turned === 1 ? Math.min(x, shadeAt) : Math.max(x, shadeAt),
      y,
    }));
  }

  /** The serac whose foot's middle is at `middle` along x, the `index`th of its stretch: as tall
   * as the heights say in turn, every other one leaning the other way, so no two neighbours
   * match. */
  private tower(middle: number, index: number): Serac {
    const heights = HazardSigns.TOWER_METRES;
    const height = heights[index % heights.length] ?? 0;
    const half = HazardSigns.TOWER_HALF_WIDTH;
    const base = this.surface.highest(middle - half, middle + half);
    const turned = index % 2 === 0 ? 1 : -1;
    const at = ([across, up]: readonly [number, number]): Point => ({
      x: middle + turned * across * half,
      y: base + up * height,
    });
    const outline = HazardSigns.SERAC_SHAPE.map(at);
    const shadeAt = middle - turned * half * (1 - 2 * HazardSigns.SHADED_SHARE);
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
    const serac = {
      outline,
      shade: [],
      cap,
      cracks,
      turned,
      middle,
      base,
      height,
      shadeAt,
    } as const;
    return { ...serac, shade: HazardSigns.shaded(serac, outline) };
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

  /** The ground along a zone, and back over it the top of the snow loaded on it: a drift, a
   * snow's depth above the ground along its middle and thinning to nothing at each end, so it
   * lies on the slope as blown snow does, with no square edge (#243). */
  private band(zone: HazardZone): readonly Point[] {
    const length = zone.to - zone.from;
    const steps = Math.max(2, Math.ceil(length / HazardSigns.BAND_STEP_METRES));
    const thins = Math.min(HazardSigns.BAND_THINS_METRES, length / 3);
    const ground: Point[] = [];
    const above: Point[] = [];
    for (let step = 0; step <= steps; step += 1) {
      const along = (length * step) / steps;
      const { x, y } = this.terrain.point(zone.from + along);
      const share = Math.min(Math.min(along, length - along) / thins, 1);
      const depth = HazardSigns.LOADED_METRES * share * share * (3 - 2 * share);
      ground.push({ x, y });
      above.push({ x, y: y + depth });
    }
    return [...ground, ...above.reverse()];
  }
}
