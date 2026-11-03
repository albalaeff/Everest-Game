import { describe, expect, it } from "vitest";

import { ActionLog, Expedition, HeadlessRunner, SimulationClock, StepPacer } from "./index";
import type { GameAction } from "./index";
import { TestSlope } from "./testing/test-slope";

const FRAME_SECONDS = 1 / 60;

describe("Two friends on the slope, one of them careless", () => {
  it("moves in real time, punishes the missed clip and replays the same in the debrief", () => {
    // The page's loop: each frame turns real time into steps, and sends what was pressed.
    const scenario = TestSlope.scenario(2026, ["anna", "boris"]);
    const slope = new TestSlope();
    const expedition = Expedition.start(scenario, [slope]);
    const pacer = new StepPacer(100);
    let pressed: GameAction[] = [
      { kind: "clip", climber: "anna", cowstail: "first" },
      { kind: "walk", climber: "anna", direction: "up" },
      { kind: "walk", climber: "boris", direction: "up" },
    ];

    while (!slope.everyoneDone) {
      const due = pacer.due(FRAME_SECONDS);
      for (let done = 0; done < due; done += 1) {
        expedition.advance(pressed);
        pressed = [];
      }
    }

    // Anna stayed on the rope: her slips cost nothing, and she reached the top.
    expect(slope.climber("anna").slips.length).toBeGreaterThan(0);
    expect(slope.climber("anna").fallen).toBe(false);
    expect(slope.climber("anna").metres).toBe(100);

    // Boris skipped the clip, and his first slip was his last.
    expect(slope.climber("boris").fallen).toBe(true);
    expect(slope.climber("boris").slips).toHaveLength(1);

    // It took as long as the walk: 100 metres at a metre a second, in real time.
    expect(expedition.seconds).toBeGreaterThanOrEqual(100);
    expect(expedition.step).toBeGreaterThanOrEqual(100 * SimulationClock.STEPS_PER_SECOND);

    // The debrief plays it again from the save, with no screen, and sees the same climb.
    const save = expedition.save();
    const again = new TestSlope();
    const debrief = Expedition.start(save.scenario, [again]);
    new HeadlessRunner(debrief, new ActionLog(save.actions)).play(save.step);
    expect(again.climber("boris")).toEqual(slope.climber("boris"));
    expect(debrief.save()).toEqual(save);

    // The next expedition has a new seed: the same keys pressed, and another climb.
    const next = new TestSlope();
    const nextScenario = TestSlope.scenario(2027, ["anna", "boris"]);
    const nextExpedition = Expedition.start(nextScenario, [next]);
    new HeadlessRunner(nextExpedition, new ActionLog(save.actions)).play(save.step);
    expect(next.climber("anna").slips).not.toEqual(slope.climber("anna").slips);
  });
});
