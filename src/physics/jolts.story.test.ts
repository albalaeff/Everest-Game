import { describe, expect, it } from "vitest";

import { Expedition, Jolts, MountainClock, SimulationClock } from "../simulation";
import type { JoltSettings, JoltZone, Scenario } from "../simulation";
import { SlopePhysics } from "./slope-physics";
import type { RopeLayout, SlopeLayout } from "./slope-physics";
import { TestMountain } from "./testing/test-mountain";

/** Every step someone is on a jolt's stretch one is on its way, a mountain second off, two steps,
 * and it slips whoever a slip can happen to. */
const CERTAIN: JoltSettings = {
  kinds: {
    gust: { rate: 1e9, warmth: 1, snow: 1, wind: 1, warning: 1, slip: TestMountain.SURE },
    twist: { rate: 1e9, warmth: 1, snow: 1, wind: 1, warning: 1, slip: TestMountain.SURE },
  },
  warmth: { from: 6, peak: 14, until: 20 },
  sun: { cloud: 1, snow: 1 },
};

/** The physics and the jolts on the mountain's clock, the jolts before the physics, as the game
 * runs them: a gust or a twist slips a climber in the step it comes. */
class Jolted {
  readonly clock = new MountainClock(10);
  readonly physics = new SlopePhysics(TestMountain.CALM);
  readonly jolts = new Jolts(CERTAIN, this.clock, this.physics);
  readonly expedition: Expedition;

  constructor(layout: SlopeLayout, zones: readonly JoltZone[]) {
    const scenario: Scenario = {
      seed: 1,
      climbers: layout.climbers.map(({ id }) => id),
      start: {
        [MountainClock.NAME]: MountainClock.start({ date: "2026-04-20", time: "03:00" }),
        [Jolts.NAME]: Jolts.start({ weather: "clear", zones }),
        [SlopePhysics.NAME]: SlopePhysics.start(layout),
      },
    };
    this.expedition = Expedition.start(scenario, [this.clock, this.jolts, this.physics]);
  }

  play(steps: number, actions: Parameters<Expedition["advance"]>[0] = []): void {
    this.expedition.advance(actions);
    for (let step = 1; step < steps; step += 1) {
      this.expedition.advance();
    }
  }
}

/**
 * Jolts on the ground (#197): a gust across the slope slips whoever stands where a slip can
 * happen, on blue ice here, and their rope holds them; one on the snow of the flat keeps their
 * feet. A lashed ladder's twist slips whoever is on it, and spares one beside it.
 */
describe("A gust across the slope, and a lashed ladder twisting", () => {
  it("slips the climbers on the ice, the clipped one onto the rope and the other down the slope, and spares one on the snow", () => {
    const rope: RopeLayout = { id: "fixed", from: 50, to: 70, length: 21 };
    const layout = TestMountain.SLOPE.layout(
      [
        { id: "anna", along: 60 },
        { id: "ben", along: 62 },
        { id: "cleo", along: 20 },
      ],
      [rope],
      [],
      undefined,
      [{ from: 40, to: 105 }],
    );
    const jolted = new Jolted(layout, [{ id: "wind", kind: "gust", from: 0, to: 200 }]);
    jolted.play(1, [{ kind: "clip", climber: "anna", cowstail: "second" }]);
    jolted.play(5 * SimulationClock.STEPS_PER_SECOND);
    const { physics } = jolted;

    expect(physics.climber("anna").hanging || physics.climber("anna").falls[0]?.held).toBe(true);
    expect(physics.along("ben")).toBeLessThan(55);
    expect(physics.climber("ben").falls[0]?.held ?? false).toBe(false);
    expect(physics.climber("cleo")).toMatchObject({ falling: false, falls: [] });
    expect(jolted.jolts.jolts[0]?.slipped).toEqual(["anna", "ben"]);
  });

  it("slips whoever is on a lashed ladder as it twists, and spares one at its end", () => {
    const layout: SlopeLayout = {
      terrain: [
        [0, 0],
        [20, 0],
        [20, -30],
        [28, -30],
        [28, 0],
        [60, 0],
      ],
      altitude: { start: TestMountain.FOOT, end: TestMountain.FOOT },
      ropes: [{ id: "fixed", from: 16, to: 92, length: 17 }],
      ladders: [{ id: "long", from: 20, to: 88 }],
      climbers: [
        { id: "anna", along: 20 },
        { id: "ben", along: 17 },
      ],
    };
    const jolted = new Jolted(layout, [{ id: "lashed", kind: "twist", from: 20, to: 88 }]);
    jolted.play(1, [
      { kind: "clip", climber: "anna", cowstail: "second" },
      { kind: "walk", climber: "anna", direction: "right" },
    ]);
    jolted.play(3 * SimulationClock.STEPS_PER_SECOND);
    const { physics } = jolted;

    expect(physics.climber("anna").falling || physics.climber("anna").falls.length > 0).toBe(true);
    expect(physics.climber("anna").dead).toBe(false);
    expect(physics.climber("ben")).toMatchObject({ falling: false, falls: [] });
  });
});
