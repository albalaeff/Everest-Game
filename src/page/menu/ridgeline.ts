import type { Point } from "../../physics";
import { PictureRandom } from "./picture-random";
import { Polyline } from "./polyline";

/** How broken a ridge is: how far its line strays between the points it's drawn through, as a
 * share of the stretch; the shortest stretch that's broken again, in pixels; and its seed. */
export interface Roughness {
  readonly rough: number;
  readonly least: number;
  readonly seed: number;
}

/**
 * A ridge of the start's picture: a line through the points it's given, its summits and saddles,
 * broken up between them into the teeth a ridge has, each stretch's middle moved a little and
 * the halves broken again. The points it was given stay where they are, so a summit keeps its
 * altitude; its seed is its own, so the same ridge is drawn every time.
 */
export class Ridgeline extends Polyline {
  /** How much less a middle moves along the ridge than up and down. */
  private static readonly SIDEWAYS = 0.22;
  /** How many times a stretch is halved at most. */
  private static readonly DEEPEST = 6;

  constructor(through: readonly Point[], roughness: Roughness) {
    super(Ridgeline.broken(through, roughness));
  }

  private static broken(through: readonly Point[], roughness: Roughness): readonly Point[] {
    const random = new PictureRandom(roughness.seed);
    const [first] = through;
    if (first === undefined) {
      return [];
    }
    const points = [first];
    for (const [index, to] of through.slice(1).entries()) {
      points.push(...Ridgeline.between(through[index] ?? to, to, 0, roughness, random));
    }
    return points;
  }

  /** The points from just after `from` to `to`, the stretch between them broken up. */
  private static between(
    from: Point,
    to: Point,
    depth: number,
    roughness: Roughness,
    random: PictureRandom,
  ): readonly Point[] {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length < roughness.least || depth > Ridgeline.DEEPEST) {
      return [to];
    }
    const middle = {
      x: (from.x + to.x) / 2 + random.swing(length * roughness.rough * Ridgeline.SIDEWAYS),
      y: (from.y + to.y) / 2 + random.swing(length * roughness.rough),
    };
    return [
      ...Ridgeline.between(from, middle, depth + 1, roughness, random),
      ...Ridgeline.between(middle, to, depth + 1, roughness, random),
    ];
  }
}
