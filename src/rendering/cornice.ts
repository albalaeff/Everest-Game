import type { Point } from "../physics";
import type { SeededRandom } from "../simulation";

/**
 * A lip of snow over a drop (#184): the snow on the edge of a crevasse or on top of an ice wall,
 * standing out over the void, rounded at its nose and undercut, with icicles hanging from its
 * underside as on the walls in the Icefall's photos. Its sizes are the drawing's numbers.
 */
export class Cornice {
  /** How far past the lip it stands out, how thick it is there, and how far back it lies on the
   * snow behind. */
  static readonly REACH = { min: 0.15, max: 0.55 };
  static readonly THICK = { min: 0.25, max: 0.5 };
  static readonly BACK = 0.6;
  /** How far past the wall under it its nose stands out at the least. */
  private static readonly CLEAR = 0.12;
  /** How many icicles hang under it, how long, and how wide at the top for each metre long. */
  static readonly ICICLES = { min: 2, max: 7 };
  static readonly ICICLE_LENGTH = { min: 0.12, max: 1.4 };
  static readonly ICICLE_WIDTH = { least: 0.035, perMetre: 0.07 };

  /** The snow, closed: from behind the lip, over its top and nose, under it back to the wall. */
  readonly outline: readonly Point[];
  /** Each icicle a thin triangle: its top's two corners, then its tip. */
  readonly icicles: readonly (readonly Point[])[];

  /**
   * A cornice on `lip`, standing out `way` (1 to the right, -1 to the left) over a drop whose
   * wall is at `wall(y)` across at each height `y` under the lip.
   */
  constructor(lip: Point, way: 1 | -1, wall: (y: number) => number, random: SeededRandom) {
    const between = (low: number, high: number): number => low + random.fraction() * (high - low);
    const thick = between(Cornice.THICK.min, Cornice.THICK.max);
    const out = (across: number, up: number): Point => ({
      x: lip.x + way * across,
      y: lip.y + up,
    });
    const under = lip.y - thick;
    // Where its underside meets the wall, as far out as the lip: a wall leaning in under it
    // takes the nose out with it, so the icicles hang in the air.
    const root = way * (wall(under) - lip.x);
    const reach = Math.max(between(Cornice.REACH.min, Cornice.REACH.max), root + Cornice.CLEAR);
    this.outline = [
      out(-Cornice.BACK, 0),
      out(reach * 0.35, thick * 0.08),
      out(reach * 0.8, thick * 0.05),
      out(reach, -thick * 0.25),
      out(reach * 0.92, -thick * 0.6),
      out(Math.max(reach * 0.6, root + Cornice.CLEAR / 2), -thick * 0.85),
      out(root, -thick),
      out(-Cornice.BACK, -thick * 0.6),
    ];
    const count = Math.round(between(Cornice.ICICLES.min, Cornice.ICICLES.max + 0.99) - 0.5);
    const from = lip.x + way * root;
    const to = lip.x + way * reach * 0.85;
    const icicles: Point[][] = [];
    for (let icicle = 0; icicle < count; icicle += 1) {
      const x = from + (to - from) * between(0.08, 1);
      // Most are short; a few hang far down.
      const length =
        Cornice.ICICLE_LENGTH.min +
        (Cornice.ICICLE_LENGTH.max - Cornice.ICICLE_LENGTH.min) * random.fraction() ** 3;
      const half =
        (Cornice.ICICLE_WIDTH.least + Cornice.ICICLE_WIDTH.perMetre * length) * between(0.35, 0.55);
      const top = under + thick * 0.12;
      icicles.push([
        { x: x - half, y: top },
        { x: x + half, y: top },
        { x: x + between(-0.3, 0.3) * half, y: top - length },
      ]);
    }
    this.icicles = icicles;
  }
}
