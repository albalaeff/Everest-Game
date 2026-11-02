import { describe, expect, it } from "vitest";

import { ActionLog } from "./action-log";
import { Expedition } from "./expedition";
import type { GameAction } from "./game-action";
import { HeadlessRunner } from "./headless-runner";
import type { ActionSource } from "./headless-runner";
import { SimulationClock } from "./simulation-clock";
import { TestSlope } from "./testing/test-slope";

const WALK_UP: GameAction = { kind: "walk", climber: "anna", direction: "up" };

const walkingUp = new ActionLog([{ step: 0, actions: [WALK_UP] }]);

/** A scripted strategy, as the balance runner's (#47) will be: it reads the state and acts. */
class TurnsBackHalfway implements ActionSource {
  constructor(private readonly slope: TestSlope) {}

  actionsAt(step: number): readonly GameAction[] {
    if (step === 0) {
      return [WALK_UP];
    }
    const climber = this.slope.climber("anna");
    return climber.walking === "up" && climber.metres >= 50
      ? [{ kind: "walk", climber: "anna", direction: "down" }]
      : [];
  }
}

describe("HeadlessRunner", () => {
  it("plays until the expedition is over", () => {
    const slope = new TestSlope();
    const scenario = TestSlope.scenario(1, ["anna"], TestSlope.CALM);
    const expedition = Expedition.start(scenario, [slope]);

    const runner = new HeadlessRunner(expedition, walkingUp);

    const played = runner.play(1_000_000, () => slope.everyoneDone);

    expect(slope.climber("anna").metres).toBe(100);
    expect(played).toBe(expedition.step);
    expect(played).toBeLessThan(1_000_000);
  });

  it("stops at its limit when the expedition goes on", () => {
    const scenario = TestSlope.scenario(1, ["anna"], TestSlope.CALM);
    const expedition = Expedition.start(scenario, [new TestSlope()]);

    expect(new HeadlessRunner(expedition, walkingUp).play(10)).toBe(10);
    expect(expedition.step).toBe(10);
  });

  it("plays a strategy that reads the state as it goes", () => {
    const slope = new TestSlope();
    const scenario = TestSlope.scenario(1, ["anna"], TestSlope.CALM);
    const expedition = Expedition.start(scenario, [slope]);

    new HeadlessRunner(expedition, new TurnsBackHalfway(slope)).play(10_000, () => {
      return expedition.step > 0 && slope.climber("anna").walking === "stop";
    });

    expect(slope.climber("anna").metres).toBe(0);
    expect(expedition.seconds).toBeGreaterThan(90);
  });

  it("plays six hours of the mountain over a hundred times faster than real time", () => {
    const sixHours = 6 * 3600;
    const conditions = { ...TestSlope.CALM, top: sixHours * 2 };
    const expedition = Expedition.start(TestSlope.scenario(1, ["anna"], conditions), [
      new TestSlope(),
    ]);
    const before = Date.now();

    new HeadlessRunner(expedition, walkingUp).play(sixHours * SimulationClock.STEPS_PER_SECOND);

    const realSeconds = (Date.now() - before) / 1000;
    expect(expedition.seconds).toBe(sixHours);
    expect(realSeconds).toBeLessThan(sixHours / 100);
  });

  it("plays a thousand expeditions, each its own", () => {
    const endings = new Set<string>();

    for (let seed = 0; seed < 1000; seed += 1) {
      const slope = new TestSlope();
      const expedition = Expedition.start(TestSlope.scenario(seed, ["anna"]), [slope]);
      const clippedOn = new ActionLog([
        {
          step: 0,
          actions: [{ kind: "clip", climber: "anna", cowstail: "first" }, WALK_UP],
        },
      ]);

      new HeadlessRunner(expedition, clippedOn).play(10_000, () => slope.everyoneDone);

      endings.add(slope.climber("anna").slips.join());
    }

    expect(endings.size).toBe(1000);
  });
});
