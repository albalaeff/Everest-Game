import { describe, expect, it } from "vitest";

import { LadderBow } from "./ladder-bow";

describe("LadderBow", () => {
  it("gives most under a climber in its middle, and not at all at its ends", () => {
    const ladder = new LadderBow(4);

    expect(ladder.sag([2], 2)).toBeCloseTo(LadderBow.BOW_METRES, 9);
    expect(ladder.sag([2], 0)).toBe(0);
    expect(ladder.sag([2], 4)).toBe(0);
    expect(ladder.sag([2], 1)).toBeCloseTo(ladder.sag([2], 3), 9);
    expect(ladder.sag([2], 1)).toBeLessThan(LadderBow.BOW_METRES);
  });

  it("gives less under a climber near an end, deepest between them and the middle", () => {
    const ladder = new LadderBow(4);
    const under = ladder.sag([1], 1);

    expect(under).toBeGreaterThan(0);
    expect(under).toBeLessThan(LadderBow.BOW_METRES);
    expect(ladder.sag([1], 0.5)).toBeLessThan(under);
    expect(ladder.sag([1], 3)).toBeLessThan(under);
    expect(ladder.sag([1], 1.5)).toBeGreaterThan(under);
  });

  it("gives under two climbers as much as under each of them together", () => {
    const ladder = new LadderBow(4);

    expect(ladder.sag([1, 3], 2)).toBeCloseTo(ladder.sag([1], 2) + ladder.sag([3], 2), 9);
    expect(ladder.sag([], 2)).toBe(0);
  });
});
