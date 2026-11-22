import type { Point } from "../physics";
import { SeededRandom } from "../simulation";
import type { IceSurface } from "./ice-surface";
import { Wander } from "./wander";

/** A layer of the ice under the surface: its outline, closed, and how deep it lies in its middle,
 * which the picture darkens it by. */
export interface IceBand {
  readonly outline: readonly Point[];
  readonly depth: number;
}

/**
 * The glacier under the route, seen from the side (#184): a snow cap a few decimetres deep, and
 * under it blue ice in layers that run along the surface and darken as they go down, as the light
 * through the ice fades, their edges wandering as the layers of a glacier do. The layers run on
 * under each crevasse, which the picture opens over them. Laid out once by a seeded generator of
 * the picture's own; its depths are the drawing's numbers, not the mountain's.
 */
export class IceBody {
  /** How deep the snow cap lies under the surface, from its thinnest to its thickest, and how
   * long its foot's waves are. */
  static readonly CAP = { min: 0.25, max: 0.7 };
  private static readonly CAP_EVERY = 3.5;
  /** Where the ice's layers part, in metres under the surface: each one deeper is darker. */
  static readonly LAYERS: readonly number[] = [1.8, 3, 4.5, 6.5, 9, 12.5, 17];
  /** How far a layer's edge wanders up and down, as a share of the gap to its nearer neighbour,
   * and how long its waves are. */
  private static readonly WANDER = 0.4;
  private static readonly WANDER_EVERY = 7;
  /** How far apart across the layers' edges have corners, and how sharp a turn of the surface
   * keeps its corner in them however near: a wall's, a lip's. */
  private static readonly STEP = 1;
  private static readonly TURN = 0.35;

  /** The snow cap: the surface left to right, then its foot right to left. */
  readonly cap: readonly Point[];
  /** The ice's layers, from under the cap down, each closed. */
  readonly bands: readonly IceBand[];
  /** Each layer's foot, left to right: the edges between the bands. */
  readonly edges: readonly (readonly Point[])[];
  /** How the snow cap's foot wanders across. */
  private readonly capWander: Wander;

  constructor(surface: IceSurface, seed: number) {
    const random = SeededRandom.fromSeed(seed);
    const { CAP, LAYERS, WANDER } = IceBody;
    this.capWander = new Wander(random, IceBody.CAP_EVERY);
    const top = surface.points;
    const capFoot = top.map(({ x, y }) => ({ x, y: y - this.capAt(x) }));
    this.cap = [...top, ...[...capFoot].reverse()];
    const outline = IceBody.thinned(top);
    const edges = LAYERS.map((depth, index) => {
      const gap = Math.min(
        depth - (LAYERS[index - 1] ?? CAP.max),
        (LAYERS[index + 1] ?? Infinity) - depth,
      );
      const wander = new Wander(random, IceBody.WANDER_EVERY);
      return outline.map(({ x, y }) => ({ x, y: y - depth - WANDER * gap * wander.at(x) }));
    });
    this.edges = edges;
    this.bands = edges.map((foot, index) => {
      const above = edges[index - 1] ?? capFoot;
      const depth = ((LAYERS[index - 1] ?? (CAP.min + CAP.max) / 2) + (LAYERS[index] ?? 0)) / 2;
      return { outline: [...above, ...[...foot].reverse()], depth };
    });
  }

  /** How deep the snow cap lies at `x`. */
  capAt(x: number): number {
    const { CAP } = IceBody;
    return CAP.min + ((CAP.max - CAP.min) * (this.capWander.at(x) + 1)) / 2;
  }

  /** The surface with fewer corners: one every `STEP` across, and every sharp turn's. */
  private static thinned(points: readonly Point[]): readonly Point[] {
    const kept: Point[] = [];
    for (const [index, point] of points.entries()) {
      const before = points[index - 1];
      const after = points[index + 1];
      const last = kept.at(-1);
      if (
        before === undefined ||
        after === undefined ||
        last === undefined ||
        point.x - last.x >= IceBody.STEP ||
        IceBody.turn(before, point, after) > IceBody.TURN
      ) {
        kept.push(point);
      }
    }
    return kept;
  }

  /** How far the line turns at `point`, in radians. */
  private static turn(before: Point, point: Point, after: Point): number {
    const into = Math.atan2(point.y - before.y, point.x - before.x);
    const out = Math.atan2(after.y - point.y, after.x - point.x);
    const turn = Math.abs(out - into);
    return Math.min(turn, 2 * Math.PI - turn);
  }
}
