import { describe, expect, it } from "vitest";

import { Expedition } from "./expedition";
import type { GameAction } from "./game-action";
import { MountainClock } from "./mountain-clock";
import { OxygenSystem } from "./oxygen";
import type { Scenario } from "./scenario";

const NUMBERS = {
  bottleLitres: 120,
  bottlePressure: 300,
  bottles: 2,
  maximumFlow: 8,
};

function climb(): { expedition: Expedition; oxygen: OxygenSystem } {
  const clock = new MountainClock(60);
  const oxygen = new OxygenSystem(NUMBERS, clock);
  const scenario: Scenario = {
    seed: 1,
    climbers: ["anna"],
    start: {
      [MountainClock.NAME]: MountainClock.start({ date: "2026-05-20", time: "00:00" }),
      [OxygenSystem.NAME]: OxygenSystem.start(["anna"], NUMBERS.bottles),
    },
  };
  return { expedition: Expedition.start(scenario, [clock, oxygen]), oxygen };
}

const flowUp: GameAction = { kind: "oxygen", climber: "anna", change: "up" };

describe("OxygenSystem", () => {
  it("raises and lowers the regulator in one litre steps", () => {
    const { expedition, oxygen } = climb();

    expedition.advance([flowUp, flowUp]);
    expect(oxygen.climber("anna")).toMatchObject({ flow: 2, pressure: 300, bottles: 2 });
    expedition.advance([{ ...flowUp, change: "down" }]);
    expect(oxygen.climber("anna").flow).toBe(1);
  });

  it("empties a bottle at its chosen flow and swaps to the next one", () => {
    const { expedition, oxygen } = climb();

    for (let step = 0; step < 1800; step += 1) {
      expedition.advance([flowUp, flowUp, flowUp, flowUp]);
    }

    expect(oxygen.climber("anna")).toEqual({ flow: 0, pressure: 0, bottles: 0 });
  });

  it("keeps bottle state when an expedition is saved and resumed", () => {
    const first = climb();
    first.expedition.advance([flowUp, flowUp]);
    const save = first.expedition.save();
    const restored = Expedition.resume(save, [
      new MountainClock(60),
      new OxygenSystem(NUMBERS, new MountainClock(60)),
    ]);

    expect(restored.save()).toEqual(save);
  });
});
