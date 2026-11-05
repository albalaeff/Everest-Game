import type { Point, Terrain } from "../physics";
import { SeededRandom } from "../simulation";

/** A short stroke on the snow, in metres. */
export interface Stroke {
  readonly from: Point;
  readonly to: Point;
}

/**
 * What the snow of the slope is marked with, in metres along the section: sastrugi, the ridges
 * the wind carves, lying along the ground here and there; the boot track of the climbers before,
 * a print every stride along the whole way; and the walls, the ground's vertical faces, which are
 * ice. Laid out once by a seeded generator of its own, the picture's, never the simulation's.
 */
export class SlopeDetails {
  static readonly SASTRUGI_EVERY = 0.7;
  static readonly SASTRUGI_CHANCE = 0.6;
  static readonly SASTRUGI_LENGTH = { min: 0.25, max: 0.8 };
  /** How far under the surface a sastruga's stroke lies. */
  static readonly SASTRUGI_UNDER = { min: 0.04, max: 0.16 };
  static readonly TRACK_EVERY = 0.41;

  readonly sastrugi: readonly Stroke[];
  readonly track: readonly Point[];
  /** Each wall, from its top down to its foot. */
  readonly walls: readonly Stroke[];

  constructor(terrain: Terrain, seed: number) {
    const random = SeededRandom.fromSeed(seed);
    const between = (low: number, high: number): number => low + random.fraction() * (high - low);
    const sastrugi: Stroke[] = [];
    for (let along = 0; along < terrain.length; along += SlopeDetails.SASTRUGI_EVERY) {
      if (!random.chance(SlopeDetails.SASTRUGI_CHANCE)) {
        continue;
      }
      const length = between(SlopeDetails.SASTRUGI_LENGTH.min, SlopeDetails.SASTRUGI_LENGTH.max);
      const under = between(SlopeDetails.SASTRUGI_UNDER.min, SlopeDetails.SASTRUGI_UNDER.max);
      const start = terrain.point(along);
      const end = terrain.point(Math.min(along + length, terrain.length));
      if (end.x <= start.x) {
        continue;
      }
      sastrugi.push({
        from: { x: start.x, y: start.y - under },
        to: { x: end.x, y: end.y - under },
      });
    }
    this.sastrugi = sastrugi;
    const track: Point[] = [];
    for (let along = 0; along < terrain.length; along += SlopeDetails.TRACK_EVERY) {
      track.push(terrain.point(along));
    }
    this.track = track;
    const walls: Stroke[] = [];
    for (const [index, [x, y]] of terrain.points.entries()) {
      const before = terrain.points[index - 1];
      if (before !== undefined && before[0] === x) {
        const [, lastY] = before;
        walls.push({
          from: { x, y: Math.max(lastY, y) },
          to: { x, y: Math.min(lastY, y) },
        });
      }
    }
    this.walls = walls;
  }
}
