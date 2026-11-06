import type { Point } from "../physics";

/**
 * A headlamp's beam, in the metres of the layer its climber stands in: from the lamp, along
 * `direction` (radians from +x, y up), as far as `reach` and `spread` either side of its axis, as
 * bright as the hour has the lamps (#125's scene: the beam lights the snow grains). Pure, so the
 * figure draws its cone and its pool on the snow, and the spindrift glints in it, by the same
 * light.
 */
export class Beam {
  /** How finely `meets` walks the axis, in metres. */
  private static readonly STEP_METRES = 0.1;

  constructor(
    readonly from: Point,
    readonly direction: number,
    readonly reach: number,
    readonly spread: number,
    readonly strength: number,
  ) {}

  /** How brightly it lights a point, 0 to its strength: the most at the lamp on its axis, less
   * towards its reach and its edges, and nothing behind the lamp or outside its cone. */
  lights(point: Point): number {
    const dx = point.x - this.from.x;
    const dy = point.y - this.from.y;
    const along = dx * Math.cos(this.direction) + dy * Math.sin(this.direction);
    if (along <= 0 || along >= this.reach || this.strength <= 0) {
      return 0;
    }
    const across = -dx * Math.sin(this.direction) + dy * Math.cos(this.direction);
    const off = Math.atan2(Math.abs(across), along) / this.spread;
    if (off >= 1) {
      return 0;
    }
    return this.strength * (1 - along / this.reach) * (1 - off * off);
  }

  /** Where its axis comes down to the ground, `ground` giving the ground's height at each x, or
   * null if it doesn't within its reach. */
  meets(ground: (x: number) => number): Point | null {
    const at = (along: number): Point => ({
      x: this.from.x + along * Math.cos(this.direction),
      y: this.from.y + along * Math.sin(this.direction),
    });
    const below = (along: number): boolean => {
      const point = at(along);
      return point.y <= ground(point.x);
    };
    if (below(0)) {
      return null;
    }
    for (let along = Beam.STEP_METRES; along <= this.reach; along += Beam.STEP_METRES) {
      if (below(along)) {
        let above = along - Beam.STEP_METRES;
        let under = along;
        for (let halving = 0; halving < 20; halving += 1) {
          const middle = (above + under) / 2;
          if (below(middle)) {
            under = middle;
          } else {
            above = middle;
          }
        }
        return at(under);
      }
    }
    return null;
  }
}
