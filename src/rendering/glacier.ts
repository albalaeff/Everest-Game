import type { Point, Terrain } from "../physics";
import { SeededRandom } from "../simulation";

/** A part of the route as the picture needs it: the stretch of the ground it covers. */
export interface PartStretch {
  readonly id: string;
  readonly from: number;
  readonly to: number;
}

/** A stone of the moraine, sitting on the rubble: its outline, and how dark it is against the
 * rubble, from 0, its colour, to 1, black. */
export interface Stone {
  readonly outline: readonly Point[];
  readonly dark: number;
}

/**
 * The glacier where the picture shows more than its snow and ice, in metres: the moraine Base Camp
 * stands on, rubble bare of snow back from the edge of the ice, with stones on it; and the small
 * cracks in the snow around a camp. Each crevasse a ladder crosses is a `Crevasse`.
 * Laid out by seeded generators of its own, the picture's, never the simulation's; its sizes are
 * the drawing's numbers, not the mountain's.
 */
export class Glacier {
  /** A stone every so many metres across the moraine, so wide each side of its middle, so much
   * of that high, so dark against the rubble, and sunk so far into it. */
  static readonly STONE_EVERY = 0.45;
  static readonly STONE_RADIUS = { min: 0.06, max: 0.28 };
  static readonly STONE_HEIGHT = 0.7;
  static readonly STONE_DARK = { min: 0.25, max: 0.6 };
  static readonly STONE_SUNK = 0.03;
  /** The moraine's edge with the ice: a corner every so many metres down, slanting back under the
   * rubble so far for each metre, and wandering so far either side of that. */
  static readonly EDGE_EVERY = 1.5;
  static readonly EDGE_SLANT = 0.3;
  static readonly EDGE_WANDER = 0.4;
  /** A crack every so many metres along a stretch, at this chance, so wide at the surface, and so
   * deep. */
  static readonly CRACK_EVERY = 1.2;
  static readonly CRACK_CHANCE = 0.5;
  static readonly CRACK_WIDTH = { min: 0.04, max: 0.12 };
  static readonly CRACK_DEPTH = { min: 0.3, max: 1.2 };
  /** A stone's outline has so many corners over its top; a crack leans so far for its depth. */
  private static readonly STONE_CORNERS = 5;
  private static readonly CRACK_LEAN = 0.15;

  constructor(
    private readonly terrain: Terrain,
    private readonly seed: number,
  ) {}

  /** The moraine's rubble, as an outline: its surface from `back` metres before the ground's start
   * to `to` along it; its edge with the ice there, slanting back under the rubble as it goes down
   * to `bottom`; and back along `bottom`. */
  moraine(to: number, back: number, bottom: number): readonly Point[] {
    const { terrain } = this;
    const random = SeededRandom.fromSeed(this.seed);
    const start = terrain.point(0);
    const end = terrain.point(to);
    const surface = terrain.points.flatMap(([x, y], index) =>
      (terrain.alongs[index] ?? to) < to ? [{ x, y }] : [],
    );
    const edge: Point[] = [];
    for (let down = Glacier.EDGE_EVERY; end.y - down > bottom; down += Glacier.EDGE_EVERY) {
      const wander = Glacier.within(random, -Glacier.EDGE_WANDER, Glacier.EDGE_WANDER);
      edge.push({ x: end.x - down * Glacier.EDGE_SLANT + wander, y: end.y - down });
    }
    const foot = end.x - (end.y - bottom) * Glacier.EDGE_SLANT;
    return [
      { x: start.x - back, y: start.y },
      ...surface,
      end,
      ...edge,
      { x: foot, y: bottom },
      { x: start.x - back, y: bottom },
    ];
  }

  /** The stones on the moraine, from `back` metres before the ground's start to `to` along it:
   * each sitting on the rubble, a little sunk into it, and none over the edge of the ice. */
  stones(to: number, back: number): readonly Stone[] {
    const { terrain } = this;
    const random = SeededRandom.fromSeed(this.seed + 1);
    const end = terrain.point(to).x;
    const corners = Glacier.STONE_CORNERS;
    const stones: Stone[] = [];
    for (let x = terrain.point(0).x - back; x < end; x += Glacier.STONE_EVERY) {
      const radius = Glacier.within(random, Glacier.STONE_RADIUS.min, Glacier.STONE_RADIUS.max);
      const middle = x + Glacier.within(random, 0, Glacier.STONE_EVERY);
      if (middle + radius > end) {
        break;
      }
      const ground = terrain.height(middle) - Glacier.STONE_SUNK;
      const outline: Point[] = [];
      for (let corner = 0; corner <= corners; corner += 1) {
        const angle = (Math.PI * corner) / corners;
        const reach = corner % corners === 0 ? radius : radius * Glacier.within(random, 0.7, 1);
        outline.push({
          x: middle + Math.cos(angle) * reach,
          y: ground + Math.sin(angle) * reach * Glacier.STONE_HEIGHT,
        });
      }
      const dark = Glacier.within(random, Glacier.STONE_DARK.min, Glacier.STONE_DARK.max);
      stones.push({ outline, dark });
    }
    return stones;
  }

  /** Small cracks in the snow along a stretch of the ground: each a thin wedge down from its
   * surface, as an outline. */
  cracks(from: number, to: number): readonly (readonly Point[])[] {
    const { terrain } = this;
    const random = SeededRandom.fromSeed(this.seed + 2);
    const cracks: (readonly Point[])[] = [];
    for (let along = from; along < to; along += Glacier.CRACK_EVERY) {
      if (!random.chance(Glacier.CRACK_CHANCE)) {
        continue;
      }
      const top = terrain.point(
        Math.min(along + Glacier.within(random, 0, Glacier.CRACK_EVERY), to),
      );
      const half = Glacier.within(random, Glacier.CRACK_WIDTH.min, Glacier.CRACK_WIDTH.max) / 2;
      const depth = Glacier.within(random, Glacier.CRACK_DEPTH.min, Glacier.CRACK_DEPTH.max);
      const lean = Glacier.within(random, -Glacier.CRACK_LEAN, Glacier.CRACK_LEAN) * depth;
      cracks.push([
        { x: top.x - half, y: top.y },
        { x: top.x + half, y: top.y },
        { x: top.x + lean, y: top.y - depth },
      ]);
    }
    return cracks;
  }

  /** A number from `low` up to `high`, drawn from `random`. */
  private static within(random: SeededRandom, low: number, high: number): number {
    return low + random.fraction() * (high - low);
  }
}
