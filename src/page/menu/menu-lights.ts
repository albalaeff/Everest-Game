import type { Point } from "../../physics";
import { PictureRandom } from "./picture-random";
import type { Polyline } from "./polyline";
import type { RouteMap } from "./route-map";

/** A tent lit from inside: where, how big, and where in its flicker it starts, in seconds. */
export interface TentLight {
  readonly at: Point;
  readonly size: number;
  readonly delay: number;
}

/** Headlamps going up a stretch of the rope: the stretch, the seconds a climber takes over it on
 * the picture, and how far up it each one is to begin with, in seconds. */
export interface LampChain {
  readonly id: string;
  readonly way: Polyline;
  readonly seconds: number;
  readonly ahead: readonly number[];
}

/**
 * The lights on the mountain before dawn: the tents of each camp, more of them the bigger the
 * camp is, and the headlamps on the rope, in the two places climbers are at that hour: the
 * summit ridge above the South Col, which they left before midnight, and the Icefall, crossed
 * before the sun warms it (`route.icefall-lessons`). The climbers go in ropes of two and three
 * with gaps between, as they do.
 */
export class MenuLights {
  /** Each camp's tents: how many, and how far they spread across and down, in pixels. */
  private static readonly TENTS: readonly (readonly [string, number, number, number])[] = [
    ["base-camp", 16, 30, 6],
    ["camp-1", 4, 10, 3],
    ["camp-2", 6, 13, 3.5],
    ["camp-3", 3, 6, 5],
    ["south-col", 5, 11, 2.5],
  ];
  private static readonly CHAINS: readonly (readonly [string, string, string, number, number[]])[] =
    [
      ["ridge", "south-col", "summit", 96, [2, 9, 12, 27, 30, 34.5, 49, 53, 71, 74, 88]],
      ["icefall", "base-camp", "camp-1", 82, [4, 7, 10.5, 31, 34, 52, 70, 73]],
    ];

  readonly tents: readonly TentLight[];
  readonly chains: readonly LampChain[];

  constructor(route: RouteMap) {
    const random = new PictureRandom(1953);
    this.tents = MenuLights.TENTS.flatMap(([camp, count, across, down]) => {
      const { at } = route.place(camp);
      return Array.from({ length: count }, (): TentLight => ({
        at: { x: at.x + random.swing(across), y: at.y + 3 + random.within(-down * 0.4, down) },
        size: random.within(0.8, 1.5),
        delay: random.within(0, 6),
      }));
    });
    this.chains = MenuLights.CHAINS.map(([id, from, to, seconds, ahead]) => ({
      id,
      way: route.stretch(from, to),
      seconds,
      ahead,
    }));
  }
}
