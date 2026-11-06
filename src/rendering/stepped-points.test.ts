import { describe, expect, it } from "vitest";

import { SteppedPoints } from "./stepped-points";

/** The points as they're drawn this frame. */
function drawn(points: SteppedPoints): number[][] {
  return Array.from({ length: points.length }, (_, index) => [points.x(index), points.y(index)]);
}

describe("SteppedPoints", () => {
  it("draws the points where the last step left them at first", () => {
    const points = new SteppedPoints();

    points.follow([{ x: 1, y: 2 }], { taken: 0, progress: 0.4 });

    expect(drawn(points)).toEqual([[1, 2]]);
  });

  it("draws them between their last two steps, by how far the next one has come", () => {
    const points = new SteppedPoints();
    points.follow(
      [
        { x: 0, y: 0 },
        { x: 4, y: 4 },
      ],
      { taken: 1, progress: 0 },
    );
    const moved = [
      { x: 1, y: 2 },
      { x: 4, y: 4 },
    ];

    points.follow(moved, { taken: 1, progress: 0 });
    const atTheStep = drawn(points);
    points.follow(moved, { taken: 0, progress: 0.25 });
    const aQuarterOn = drawn(points);
    points.follow(moved, { taken: 0, progress: 0.75 });

    expect(atTheStep).toEqual([
      [0, 0],
      [4, 4],
    ]);
    expect(aQuarterOn).toEqual([
      [0.25, 0.5],
      [4, 4],
    ]);
    expect(drawn(points)).toEqual([
      [0.75, 1.5],
      [4, 4],
    ]);
  });

  it("moves a walking climber every frame at sixty a second, where their steps move them one frame in three", () => {
    const points = new SteppedPoints();
    const xs: number[] = [];
    let steps = 0;

    for (let frame = 0; frame < 60; frame += 1) {
      const taken = frame % 3 === 0 ? 1 : 0;
      steps += taken;
      points.follow([{ x: steps * 0.01, y: 0 }], { taken, progress: (frame % 3) / 3 });
      xs.push(points.x(0));
    }

    const moves = xs.slice(1).map((x, frame) => x - (xs[frame] ?? 0));
    for (const move of moves.slice(3)) {
      expect(move).toBeCloseTo(0.01 / 3, 9);
    }
  });

  it("puts the step before on the way between, when a frame takes several", () => {
    const points = new SteppedPoints();
    points.follow([{ x: 0, y: 0 }], { taken: 1, progress: 0 });

    points.follow([{ x: 3, y: 0 }], { taken: 3, progress: 0 });
    const atTheSteps = points.x(0);
    points.follow([{ x: 3, y: 0 }], { taken: 0, progress: 0.5 });

    expect(atTheSteps).toBeCloseTo(2, 9);
    expect(points.x(0)).toBeCloseTo(2.5, 9);
  });

  it("draws a jump at once: a climb resumed, or a room's fresh save", () => {
    const points = new SteppedPoints();
    points.follow([{ x: 0, y: 0 }], { taken: 1, progress: 0.5 });

    points.follow([{ x: SteppedPoints.JUMP_METRES + 1, y: 0 }], { taken: 1, progress: 0.5 });
    const jumped = points.x(0);
    points.follow([{ x: 7, y: 1 }], { taken: 0, progress: 0.5 });

    expect(jumped).toBe(SteppedPoints.JUMP_METRES + 1);
    expect(drawn(points)).toEqual([[7, 1]]);
  });

  it("starts again from where they are when there are more points or fewer", () => {
    const points = new SteppedPoints();
    points.follow([{ x: 0, y: 0 }], { taken: 1, progress: 0 });

    points.follow(
      [
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ],
      { taken: 1, progress: 0.5 },
    );

    expect(drawn(points)).toEqual([
      [1, 0],
      [2, 0],
    ]);
  });

  it("says whether a point is drawn anywhere else than the frame before", () => {
    const points = new SteppedPoints();
    const still = [{ x: 1, y: 1 }];
    points.follow(still, { taken: 1, progress: 0 });
    const first = points.moved;
    points.follow(still, { taken: 0, progress: 0.5 });
    const lyingStill = points.moved;
    points.follow([{ x: 2, y: 1 }], { taken: 1, progress: 0.5 });

    expect(first).toBe(true);
    expect(lyingStill).toBe(false);
    expect(points.moved).toBe(true);
  });
});
