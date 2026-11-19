import type { Point, Terrain } from "../physics";
import { LineHold } from "./line-hold";

/** A corner the rope bears on: where it is, and how far down the line's own ground from its
 * anchor. */
interface Bearing {
  readonly at: Point;
  readonly down: number;
}

/**
 * The way a casualty comes up a rescue line as they're hauled (#279): the rope, taut from its
 * anchor, runs straight over the steps of a crevasse's wall, bearing only on the corners that
 * stand out into the air, the lip among them, never on those cut back into the ice. Where it runs
 * steeply down from one such corner to the next they come up along it, steadily, as the rope
 * brings them, clear of the steps between; where it runs gently, over the top or along a
 * crevasse's floor, they come along the ground itself, dragged on it. The physics has them on
 * the ground's own line (`RescueLine`); this is where they're drawn, and the rope with them.
 */
export class HaulPath {
  /** How steep a stretch of the taut rope is for a casualty to hang on it, not be dragged: a
   * rise of 1 for each 1 across, 45°. */
  static readonly STEEP = 1;
  /** How far into the ice a straight run of rope may be and still be clear of it, in metres: the
   * ground's own corners, met by rounding. */
  private static readonly CLEAR = 0.01;
  /** How far inside a run's ends the ground is looked at, as a share of the run: just past a
   * corner at an end, the way the run leaves it. */
  private static readonly INSIDE = 1e-6;

  private readonly bearings: readonly Bearing[];

  /** The line's own ground, its anchor first (`RescueLineView.shape`), on `terrain`. */
  constructor(
    private readonly shape: readonly Point[],
    private readonly terrain: Terrain,
  ) {
    this.bearings = this.taut();
  }

  /** The corners the taut rope bears on, its anchor and its foot among them. */
  get corners(): readonly Point[] {
    return this.bearings.map(({ at }) => at);
  }

  /** The lip: the corner the rope first runs steeply down from, below its anchor; the anchor
   * where it never does. */
  get lip(): Point {
    const { bearings } = this;
    for (let index = 0; index + 1 < bearings.length; index += 1) {
      const from = bearings[index];
      const to = bearings[index + 1];
      if (from !== undefined && to !== undefined && HaulPath.steep(from.at, to.at)) {
        return from.at;
      }
    }
    return bearings[0]?.at ?? { x: 0, y: 0 };
  }

  /** Where a casualty `down` metres down the line's ground from its anchor is drawn: on the rope
   * where it runs steeply, by how far between the corners at its ends they've come; on the ground
   * elsewhere. */
  at(down: number): Point {
    const run = this.runOf(down);
    if (run === null) {
      return LineHold.along(this.shape, down);
    }
    const [from, to] = run;
    const span = to.down - from.down;
    const share = span > 0 ? Math.min(Math.max((down - from.down) / span, 0), 1) : 0;
    return {
      x: from.at.x + (to.at.x - from.at.x) * share,
      y: from.at.y + (to.at.y - from.at.y) * share,
    };
  }

  /** The rope from the anchor to a casualty `down` metres down the line's ground, as it runs taut:
   * the corners it bears on above them, and where they're drawn. A `LineHold` ties them into it. */
  rope(down: number): readonly Point[] {
    const above = this.bearings.filter((bearing) => bearing.down < down).map(({ at }) => at);
    return [...above, this.at(down)];
  }

  /** The steep run of the rope `down` metres from the anchor lies on: its two corners, or none
   * where it runs gently, or past the line's ends. */
  private runOf(down: number): readonly [Bearing, Bearing] | null {
    const { bearings } = this;
    for (let index = 0; index + 1 < bearings.length; index += 1) {
      const from = bearings[index];
      const to = bearings[index + 1];
      if (from === undefined || to === undefined || down < from.down || down > to.down) {
        continue;
      }
      return HaulPath.steep(from.at, to.at) ? [from, to] : null;
    }
    return null;
  }

  /** The corners a rope pulled taut from the anchor bears on down the line's ground: each one a
   * straight run past would cut through the ice. */
  private taut(): Bearing[] {
    const kept: Bearing[] = [];
    let down = 0;
    this.shape.forEach((at, index) => {
      const before = this.shape[index - 1];
      down += before === undefined ? 0 : Math.hypot(at.x - before.x, at.y - before.y);
      while (kept.length >= 2) {
        const from = kept[kept.length - 2];
        if (from === undefined || !this.clear(from.at, at)) {
          break;
        }
        kept.pop();
      }
      kept.push({ at, down });
    });
    return kept;
  }

  /** Whether a straight run of rope from `from` to `to` keeps out of the ice: over each of the
   * ground's corners between them, and just inside each end, the ground being straight from one
   * corner to the next. Straight up or down, it runs along a wall's face. */
  private clear(from: Point, to: Point): boolean {
    const [left, right] = from.x <= to.x ? [from, to] : [to, from];
    const across = right.x - left.x;
    if (across < 1e-9) {
      return true;
    }
    const { terrain } = this;
    const inside = HaulPath.INSIDE * across;
    const below = (x: number): boolean => {
      const run = left.y + ((right.y - left.y) * (x - left.x)) / across;
      return run < terrain.height(x) - HaulPath.CLEAR;
    };
    if (below(left.x + inside) || below(right.x - inside)) {
      return false;
    }
    for (const [x] of terrain.points) {
      if (x >= right.x) {
        break;
      }
      if (x > left.x && below(x)) {
        return false;
      }
    }
    return true;
  }

  /** Whether a run of rope from one point to another is steep enough to hang on. */
  private static steep(from: Point, to: Point): boolean {
    return Math.abs(to.y - from.y) >= HaulPath.STEEP * Math.abs(to.x - from.x);
  }
}
