import { describe, expect, it } from "vitest";

import { Camera } from "./camera";
import { Crowd } from "./crowd";

/** A camera on a climber at (10, 2), 640 by 360: from -1.85 to 33.7 m across, -6 to 14 m up. */
function camera(): Camera {
  return new Camera({ climber: { x: 10, y: 2, first: null, second: null } }, 640, 360);
}

describe("Crowd", () => {
  it("is four climbers on the screen at once, the player's among them", () => {
    const three = [
      { x: 10, y: 2 },
      { x: 12, y: 2.5 },
      { x: 14, y: 3 },
    ];

    expect(new Crowd(camera(), three).onScreen).toBe(3);
    expect(new Crowd(camera(), three).marked).toBe(false);
    expect(new Crowd(camera(), [...three, { x: 30, y: 9 }]).marked).toBe(true);
  });

  it("counts only the climbers on the screen, not those past its edges", () => {
    const crowd = new Crowd(camera(), [
      { x: 10, y: 2 },
      { x: 12, y: 2.5 },
      { x: 14, y: 3 },
      { x: 40, y: 12 },
      { x: -5, y: -1 },
    ]);

    expect(crowd.onScreen).toBe(3);
    expect(crowd.marked).toBe(false);
  });
});
