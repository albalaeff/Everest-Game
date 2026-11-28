import type { Point } from "../physics";

/** A point of the 3D world, in metres: `x` to the right of the route as it goes up, `y` up, and
 * `z` back down the route, so the climb goes towards −z. */
export interface Spot {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Where the route's line lies in the 3D world. The slope physics knows the route as a line in a
 * plane, metres across and metres up (`Terrain`); here that plane is bent into a trail that winds
 * from side to side between the towers as the Icefall's does: a point `x` across the physics'
 * plane is `x` metres up the valley, and the trail's centre there is `aside(x)` to the right.
 * Everything the physics places, the climbers, the ropes and the ladders, goes into the picture
 * through `place`. Pure: the same route winds the same way on every device.
 */
export class Trail {
  /** The bends: how long each is in metres along the valley, how far it swings the trail, and
   * where in its swing it starts. A long lazy one and a shorter one on it, so the trail never
   * turns more than 25° off the valley's line, as a fixed line doesn't. */
  private static readonly BENDS = [
    { length: 96, swing: 3.8, start: 0.7 },
    { length: 41, swing: 1.2, start: 2.3 },
  ];
  /** How far from a camp's end the bends are at their full swing: the camps lie straight. */
  private static readonly EASE_IN = 30;

  constructor(
    /** How far across the physics' plane the route runs, in metres. */
    readonly span: number,
  ) {}

  /** How far to the right of the valley's axis the trail's centre is, `x` metres up it. */
  aside(x: number): number {
    let aside = 0;
    for (const { length, swing, start } of Trail.BENDS) {
      aside += swing * Math.sin((2 * Math.PI * x) / length + start);
    }
    return aside * this.eased(x);
  }

  /** How much the trail goes to the right for each metre up the valley. */
  drift(x: number): number {
    const step = 0.25;
    return (this.aside(x + step) - this.aside(x - step)) / (2 * step);
  }

  /** Where a point of the physics' plane is in the world, `side` metres to the right of the
   * trail's centre. */
  place(point: Point, side = 0): Spot {
    return { x: this.aside(point.x) + side, y: point.y, z: -point.x };
  }

  /** The way the trail heads at `x` going up the route, as an angle about the vertical: 0 looks
   * up the valley, towards −z, and it grows to the left, as a camera's yaw does. */
  heading(x: number): number {
    return Math.atan2(-this.drift(x), 1);
  }

  /** The bends' share of their swing: none at the route's ends, all of it past the camps. */
  private eased(x: number): number {
    const fromEnd = Math.min(x, this.span - x);
    const share = Math.min(Math.max(fromEnd / Trail.EASE_IN, 0), 1);
    return share * share * (3 - 2 * share);
  }
}
