import type { Point } from "../physics";
import type { ClimberId, Walk } from "../simulation";

/** What the steering reads of the slope: the climber, how far along the ground they are, the
 * ladders, and the ground's line. `SlopePhysics` is one. */
export interface SteeredSlope {
  climber(id: ClimberId): {
    readonly ladder: string | null;
    readonly falling: boolean;
    readonly hanging: boolean;
  };
  along(id: ClimberId): number;
  ladder(id: string): readonly Point[];
  readonly ladders: readonly string[];
  readonly terrain: {
    point(along: number): Point;
    nearest(point: Point): { readonly along: number };
  };
}

/** A ladder as the steering knows it: how far along the ground each end is, and the way it
 * heads from its first end to its second, across and up. */
interface LaidLadder {
  readonly id: string;
  readonly from: number;
  readonly to: number;
  readonly across: number;
  readonly up: number;
}

/**
 * Forward and back, in first person, as the walk the physics knows. The 2D game is steered by
 * eight directions on a slope seen from the side: right is up the route, and a ladder up a wall
 * or a step of ice wants the key that points up it. Through the climber's own eyes there's only
 * forward, the way they look along the route, and back; this works out which of the eight that
 * is where they stand: along the route on the ground, up or down with it on a ladder that stands
 * or a face of ice, and up the rope when they hang on it. So one key crosses the whole Icefall,
 * and the simulation hears the same walks it always has. Pure: the page asks it each frame.
 */
export class RouteSteering {
  /** How near a ladder's end, in metres along the ground, a climber heads the ladder's way. */
  private static readonly AT_A_LADDER = 0.6;
  /** How far ahead the ground is looked at, and how steep it must be to be climbed, not walked:
   * the sine of its angle. */
  private static readonly AHEAD = 0.45;
  private static readonly STEEP = 0.5;

  private readonly laid: readonly LaidLadder[];

  constructor(private readonly slope: SteeredSlope) {
    this.laid = slope.ladders.flatMap((id) => {
      const [first, last] = slope.ladder(id);
      if (first === undefined || last === undefined) {
        return [];
      }
      const length = Math.hypot(last.x - first.x, last.y - first.y) || 1;
      return [
        {
          id,
          from: slope.terrain.nearest(first).along,
          to: slope.terrain.nearest(last).along,
          across: (last.x - first.x) / length,
          up: (last.y - first.y) / length,
        },
      ];
    });
  }

  /** The walk for a push `forward` or back, by a climber who looks `lookWay` along the route:
   * 1 up it, −1 down. */
  direction(id: ClimberId, forward: boolean, lookWay: 1 | -1): Walk["direction"] {
    const climber = this.slope.climber(id);
    if (climber.falling || climber.hanging) {
      return forward ? "up" : "down";
    }
    const way = forward ? lookWay : lookWay === 1 ? -1 : 1;
    const side = way > 0 ? "right" : "left";
    const rise = this.rise(id, climber.ladder, way);
    if (rise > RouteSteering.STEEP) {
      return `up-${side}`;
    }
    return rise < -RouteSteering.STEEP ? `down-${side}` : side;
  }

  /** How steeply the way on rises, as the sine of its angle: the ladder's they're on, or about
   * to step onto; otherwise the ground's just ahead. */
  private rise(id: ClimberId, on: string | null, way: 1 | -1): number {
    const along = this.slope.along(id);
    const ladder =
      this.laid.find((laid) => laid.id === on) ??
      this.laid.find((laid) => {
        const ahead = ((way > 0 ? laid.from : laid.to) - along) * way;
        return ahead >= -1e-6 && ahead <= RouteSteering.AT_A_LADDER;
      });
    if (ladder !== undefined) {
      return ladder.up * way;
    }
    const here = this.slope.terrain.point(along);
    const ahead = this.slope.terrain.point(along + way * RouteSteering.AHEAD);
    const far = Math.hypot(ahead.x - here.x, ahead.y - here.y);
    return far > 0 ? (ahead.y - here.y) / far : 0;
  }
}
