import type { Point } from "../physics";

/** A climber as the picture places them this frame: where the physics has them, drawn between
 * the steps; whether they're on their feet, free to step aside where the ground is under them;
 * whether they're there to step aside from, alive on the slope; and how many times life size
 * they're drawn. */
export interface Standing {
  readonly at: Point;
  readonly free: boolean;
  readonly there: boolean;
  readonly grown: number;
  /** Where across the slope they kneel at their work for a casualty, by the hurt limb (#241):
   * they're drawn there, as far as the ground runs on to it. None at no such work. */
  readonly beside?: number | null;
}

/**
 * Climbers who stand at one spot of the slope, drawn abreast (#243). The physics has the route as
 * a line, so two climbers at one place on it are at one point: a Sherpa holding a ladder's line
 * where his client steps off it, one passing another on the rope, two who stopped together. Drawn
 * there, one figure went through the other. Real climbers stand beside each other, so the picture
 * stands them a step apart along the ground: the first of them, the player's own, keeps their
 * place, and each one after steps aside from those before, on the side they already are, ahead
 * if they're level, and never over a lip or into a wall, where they step back the other way
 * instead. Only a climber on their feet on the ground steps aside, at a ladder's end on a lip
 * too, onto the ground by it; one out on a ladder, up a wall, on the ice or hanging on the rope
 * is where they are. A rescuer at a casualty's side (#241) is within reach of them on the route's
 * line, and kneels at the hurt limb in the picture: a step that way. The step takes a moment,
 * there and back. It's the picture's alone: nobody's place on the slope changes, and it keeps
 * only each one's step now.
 */
export class Abreast {
  /** How far apart two climbers are drawn at the least, a figure's width or so, and how fast one
   * steps aside, in metres and metres a second at life size. */
  static readonly APART = 0.55;
  static readonly SPEED = 1.4;
  /** How much higher or lower another stands and is no longer beside them, in metres. */
  private static readonly LEVEL = 1;
  /** How finely the ground aside is read, and the most it rises or drops over that for a climber
   * to stand on it, in metres: steeper is a lip or a wall. */
  private static readonly STEP = 0.05;
  private static readonly RISE = 0.09;
  /** How near the ground a climber's point is to be on it, in metres: out on a ladder across a
   * crevasse, or up one on a wall, it isn't. */
  private static readonly ON_IT = 0.15;

  private readonly stepped: number[] = [];

  /** On `ground`, its height at each place across the slope. */
  constructor(private readonly ground: (x: number) => number) {}

  /** Each climber's step aside this frame, `seconds` after the last, in metres across the slope
   * and as much higher as the ground is there: `standing` in the order they keep their places,
   * the first of all. */
  advance(seconds: number, standing: readonly Standing[]): readonly Point[] {
    const drawn: { x: number; y: number }[] = [];
    return standing.map((climber, index) => {
      const { at, grown } = climber;
      const onTheGround = Math.abs(at.y - this.ground(at.x)) < Abreast.ON_IT * grown;
      const want = climber.free && onTheGround ? this.wantedBy(climber, drawn) : 0;
      const last = this.stepped[index] ?? 0;
      const most = Abreast.SPEED * grown * Math.max(seconds, 0);
      const aside = last + Math.min(Math.max(want - last, -most), most);
      this.stepped[index] = aside;
      if (climber.there) {
        drawn.push({ x: at.x + want, y: at.y });
      }
      return { x: aside, y: aside === 0 ? 0 : this.ground(at.x + aside) - this.ground(at.x) };
    });
  }

  /** How far aside a climber on their feet wants to be drawn: at the limb they work on, where
   * the ground runs on to it (#241); or a step from whoever stands at their spot. */
  private wantedBy(climber: Standing, before: readonly Point[]): number {
    const { at, beside } = climber;
    if (beside != null && this.standable(at.x, beside - at.x)) {
      return beside - at.x;
    }
    return this.wanted(climber, before);
  }

  /** How far aside a climber wants to stand, to be `APART` from the nearest of those `before`
   * them who stand at their level: on the side they are, or the other where the ground ends. */
  private wanted({ at, grown }: Standing, before: readonly Point[]): number {
    const apart = Abreast.APART * grown;
    let nearest: Point | null = null;
    for (const other of before) {
      const level = Math.abs(other.y - at.y) < Abreast.LEVEL * grown;
      if (level && (nearest === null || Math.abs(other.x - at.x) < Math.abs(nearest.x - at.x))) {
        nearest = other;
      }
    }
    if (nearest === null || Math.abs(nearest.x - at.x) >= apart) {
      return 0;
    }
    const side = at.x < nearest.x ? -1 : 1;
    const there = nearest.x + side * apart - at.x;
    const clear = (aside: number): boolean =>
      this.standable(at.x, aside) &&
      before.every(
        (other) =>
          Math.abs(other.y - at.y) >= Abreast.LEVEL * grown ||
          Math.abs(other.x - (at.x + aside)) >= apart - 1e-9,
      );
    if (clear(there)) {
      return there;
    }
    const other = nearest.x - side * apart - at.x;
    if (clear(other)) {
      return other;
    }
    // Clear of nobody on either side: a step further out, past whoever stands there.
    for (let further = 2; further <= 4; further += 1) {
      for (const way of [side, -side]) {
        const out = nearest.x + way * further * apart - at.x;
        if (clear(out)) {
          return out;
        }
      }
    }
    return this.standable(at.x, there) ? there : this.standable(at.x, other) ? other : 0;
  }

  /** Whether the ground runs on from `x` to `aside` of it with no lip or wall on the way. */
  private standable(x: number, aside: number): boolean {
    const steps = Math.ceil(Math.abs(aside) / Abreast.STEP);
    let last = this.ground(x);
    for (let step = 1; step <= steps; step += 1) {
      const height = this.ground(x + (aside * step) / steps);
      if (Math.abs(height - last) > Abreast.RISE) {
        return false;
      }
      last = height;
    }
    return true;
  }
}
