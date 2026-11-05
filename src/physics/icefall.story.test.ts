import { describe, expect, it } from "vitest";

import { Climb } from "./testing/climb";
import { TestMountain } from "./testing/test-mountain";

const { walk, clip } = Climb;

/**
 * The Icefall's ladders (#26, route.icefall-lessons): a slip off a ladder over a crevasse is a
 * fall into it, as the Sherpa fell in 2012, unless a rope holds the climber. The ground is the
 * test mountain's crevasse, and its ladder is icy: a slip about once a second on it, and nowhere
 * else.
 */
describe("A slip off a ladder over a crevasse", () => {
  /** Across the crevasse's top: its near edge is 20 m along the ground, its far edge 83, past the
   * walls and the bottom between. */
  const ladder = { id: "crevasse", from: 20, to: 83 };
  /** A rope fixed along the ladder, from 4 m before it to 4 m past it, a metre slack. */
  const rope = { id: "fixed", from: 16, to: 87, length: 12 };

  it("drops the climber who isn't clipped to the bottom", () => {
    const layout = TestMountain.CREVASSE.layout([{ id: "anna", along: 20 }], [rope], [ladder]);
    const climb = new Climb(TestMountain.ICY_LADDERS, layout);

    climb.play(400, [walk("anna", "right")]);
    const anna = climb.physics.climber("anna");

    expect(anna.falls).toHaveLength(1);
    expect(anna.y).toBeCloseTo(-30, 6);
    expect(anna.x).toBeGreaterThanOrEqual(20);
    expect(anna.x).toBeLessThanOrEqual(23);
  });

  it("holds the climber clipped to the rope in the crevasse, well above its bottom", () => {
    const layout = TestMountain.CREVASSE.layout([{ id: "boris", along: 20 }], [rope], [ladder]);
    const climb = new Climb(TestMountain.ICY_LADDERS, layout);

    climb.play(400, [clip("boris", "second"), walk("boris", "right")]);
    const boris = climb.physics.climber("boris");

    expect(boris.second).toBe("fixed");
    expect(boris.y).toBeGreaterThan(-10);
    expect(boris.y).toBeLessThan(0);
    expect(boris.x).toBeGreaterThanOrEqual(20);
    expect(boris.x).toBeLessThanOrEqual(23);
  });
});
