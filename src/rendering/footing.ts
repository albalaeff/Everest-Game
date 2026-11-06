import type { Terrain } from "../physics";

/** The snow round a climber's feet, as their figure stands on it: how high it is `x` metres to
 * the right of them, above their feet. */
export type Underfoot = (x: number) => number;

/** A wall of the ground: where it stands across, and how far along the ground its ends are. */
interface Wall {
  readonly x: number;
  readonly from: number;
  readonly to: number;
}

/**
 * The snow under the climbers' boots (#168): the physics' ground round each of them, above their
 * feet. A wall is the ladders' and the ropes', not the boots': past the nearest wall each side of
 * a climber the snow goes on level from its edge on their side, so a boot never steps up a wall's
 * face or down into a crevasse; and on a wall the snow is level with the feet, as a ladder's
 * rungs are.
 */
export class Footing {
  /** How far short of a wall its edge is read, so that it's the edge on the climber's side. */
  private static readonly EDGE = 1e-6;
  private static readonly LEVEL: Underfoot = () => 0;

  private readonly walls: readonly Wall[];

  constructor(private readonly terrain: Terrain) {
    const { points, alongs } = terrain;
    this.walls = points.flatMap(([x], index) => {
      const from = alongs[index];
      const to = alongs[index + 1];
      const upright = points[index + 1]?.[0] === x;
      return upright && from !== undefined && to !== undefined ? [{ x, from, to }] : [];
    });
  }

  /** The snow round a climber whose feet are `along` the ground. */
  under(along: number): Underfoot {
    let left = -Infinity;
    let right = Infinity;
    for (const wall of this.walls) {
      if (wall.to <= along) {
        left = Math.max(left, wall.x + Footing.EDGE);
      } else if (wall.from >= along) {
        right = Math.min(right, wall.x - Footing.EDGE);
      } else {
        return Footing.LEVEL;
      }
    }
    const { terrain } = this;
    const feet = terrain.point(along);
    return (x) => terrain.height(Math.min(Math.max(feet.x + x, left), right)) - feet.y;
  }
}
