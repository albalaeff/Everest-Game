import type { Point, RescueLineView, Terrain } from "../physics";

/**
 * A rescue line's anchor as it's drawn (#241): two ice screws turned into the ice a little back
 * from the lip, one after the other, then a sling from each to one point by the lip, which the
 * cord hangs from. Where each part is and how far it has come follow from the line alone, as the
 * physics has it built, so the picture of the anchor and the hands of whoever builds it agree.
 * It keeps nothing.
 */
export class LineAnchor {
  /** How far back from the lip each screw goes in, and where the sling joins them, in metres at
   * the figures' size: within a kneeling climber's reach of the edge they work at. */
  private static readonly SCREWS: readonly [number, number] = [0.16, 0.38];
  private static readonly MASTER = 0.04;
  /** How far back from the first screw whoever builds it kneels, facing the lip. */
  private static readonly KNEELS = 0.5;
  /** How much of a screw's tube stands out of the ice before it's turned in, and once it's
   * home, where its hanger sits; and how far over the ice the sling's point is. */
  private static readonly OUT = 0.2;
  private static readonly HOME = 0.035;
  private static readonly SLUNG = 0.03;
  /** The shares of the anchor's building each part takes: the first screw, the second, and the
   * sling. */
  private static readonly BUILT = {
    first: [0.05, 0.4],
    second: [0.4, 0.75],
    sling: [0.75, 1],
  } as const;

  /** Where each screw goes into the ice. */
  readonly screws: readonly [Point, Point];
  /** The one point the sling joins them at, which the cord hangs from. */
  readonly master: Point;

  /** Of `line` on `terrain`, the figures `grown` times life size. */
  constructor(
    terrain: Terrain,
    private readonly line: RescueLineView,
    private readonly grown = 1,
  ) {
    // Back from the lip: the way along the ground from the line's foot up past its anchor.
    const back = line.foot >= line.top ? -1 : 1;
    const at = (metres: number): Point => terrain.point(line.top + back * metres * grown);
    const [first, second] = LineAnchor.SCREWS;
    this.screws = [at(first), at(second)];
    const by = at(LineAnchor.MASTER);
    this.master = { x: by.x, y: by.y + LineAnchor.SLUNG * grown };
  }

  /** How far the sling has been run from the screws to its point, 0 to 1. */
  get slung(): number {
    return LineAnchor.share(this.line.built, LineAnchor.BUILT.sling);
  }

  /** The head of a screw, where its hanger is, as far out of the ice as it still stands: none
   * before it's started. */
  head(screw: 0 | 1): Point | null {
    const part = screw === 0 ? LineAnchor.BUILT.first : LineAnchor.BUILT.second;
    if (this.line.built < part[0]) {
      return null;
    }
    const share = LineAnchor.share(this.line.built, part);
    const { OUT, HOME } = LineAnchor;
    const at = this.screws[screw];
    return { x: at.x, y: at.y + (OUT + (HOME - OUT) * share) * this.grown };
  }

  /** Where the hands work at it now: at the head of the screw going in, or at the sling. */
  get working(): Point {
    const { BUILT, OUT } = LineAnchor;
    if (this.line.built >= BUILT.sling[0]) {
      return this.master;
    }
    const screw = this.line.built >= BUILT.second[0] ? 1 : 0;
    const at = this.screws[screw];
    return this.head(screw) ?? { x: at.x, y: at.y + OUT * this.grown };
  }

  /** Where across the slope whoever builds it kneels: `KNEELS` back from the first screw, the
   * screws and the sling's point between them and the lip, all within their reach. */
  get kneels(): number {
    const [first, second] = this.screws;
    const back = second.x >= first.x ? 1 : -1;
    return first.x + back * LineAnchor.KNEELS * this.grown;
  }

  /** How far a part has come, 0 to 1, the whole `built` so far, the part taking the shares from
   * `from` to `to` of it. */
  private static share(built: number, [from, to]: readonly [number, number]): number {
    return Math.min(Math.max((built - from) / (to - from), 0), 1);
  }
}
