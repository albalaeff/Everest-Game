import { describe, expect, it } from "vitest";

import type { Point } from "../physics";
import { Terrain } from "../physics";
import { RouteSteering } from "./route-steering";
import type { SteeredSlope } from "./route-steering";
import { IcefallForTests } from "./testing/icefall";

/** A small slope for the steering: flat ground to a wall 4 m high with a ladder up it, a flat
 * top, a crevasse 3 m wide with a ladder across it, and a drop of 3 m with a ladder down it. */
class SmallSlope implements SteeredSlope {
  readonly terrain = new Terrain([
    [0, 0],
    [10, 0],
    [10, 4],
    [20, 4],
    [20, -6],
    [23, -6],
    [23, 4],
    [30, 4],
    [30, 1],
    [40, 1],
  ]);
  readonly ladders = ["wall", "crevasse", "drop"];
  at = 0;
  on: string | null = null;
  falling = false;
  hanging = false;

  climber(): { ladder: string | null; falling: boolean; hanging: boolean } {
    return { ladder: this.on, falling: this.falling, hanging: this.hanging };
  }

  along(): number {
    return this.at;
  }

  ladder(id: string): readonly Point[] {
    const ends: Record<string, readonly Point[]> = {
      wall: [
        { x: 10, y: 0 },
        { x: 10, y: 4 },
      ],
      crevasse: [
        { x: 20, y: 4 },
        { x: 23, y: 4 },
      ],
      drop: [
        { x: 30, y: 4 },
        { x: 30, y: 1 },
      ],
    };
    return ends[id] ?? [];
  }
}

describe("forward and back, as the walk the physics knows", () => {
  it("walks along the route on the ground, the way the climber looks", () => {
    const slope = new SmallSlope();
    const steering = new RouteSteering(slope);
    slope.at = 4;
    expect(steering.direction("player", true, 1)).toBe("right");
    expect(steering.direction("player", false, 1)).toBe("left");
    expect(steering.direction("player", true, -1)).toBe("left");
    expect(steering.direction("player", false, -1)).toBe("right");
  });

  it("goes up a ladder that stands against a wall, from its foot and on it", () => {
    const slope = new SmallSlope();
    const steering = new RouteSteering(slope);
    slope.at = 9.7;
    expect(steering.direction("player", true, 1)).toBe("up-right");
    slope.at = 10;
    slope.on = "wall";
    expect(steering.direction("player", true, 1)).toBe("up-right");
    expect(steering.direction("player", false, 1)).toBe("down-left");
  });

  it("comes back down that ladder from the top, looking down the route", () => {
    const slope = new SmallSlope();
    const steering = new RouteSteering(slope);
    slope.at = 14.2;
    expect(steering.direction("player", true, -1)).toBe("down-left");
  });

  it("walks straight onto a ladder laid across a crevasse, not down the crevasse's wall", () => {
    const slope = new SmallSlope();
    const steering = new RouteSteering(slope);
    slope.at = 23.8;
    expect(steering.direction("player", true, 1)).toBe("right");
    slope.on = "crevasse";
    expect(steering.direction("player", true, 1)).toBe("right");
    expect(steering.direction("player", false, 1)).toBe("left");
  });

  it("goes down a ladder that stands in a drop, going on up the route", () => {
    const slope = new SmallSlope();
    const steering = new RouteSteering(slope);
    slope.at = 53.7;
    expect(steering.direction("player", true, 1)).toBe("down-right");
  });

  it("climbs the rope hanging on it, and lets down", () => {
    const slope = new SmallSlope();
    const steering = new RouteSteering(slope);
    slope.hanging = true;
    expect(steering.direction("player", true, 1)).toBe("up");
    expect(steering.direction("player", false, 1)).toBe("down");
  });

  it("knows every ladder of the Icefall by its ends", () => {
    const { physics } = new IcefallForTests();
    const steering = new RouteSteering(physics);
    // Set off, at Base Camp, on the moraine: the way on is flat.
    expect(steering.direction("player", true, 1)).toBe("right");
    expect(physics.ladders.length).toBeGreaterThan(10);
  });
});
