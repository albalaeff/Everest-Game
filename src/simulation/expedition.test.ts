import { describe, expect, it } from "vitest";

import { ActionLog } from "./action-log";
import { Expedition } from "./expedition";
import type { ExpeditionSave } from "./expedition";
import type { ClimberId, GameAction } from "./game-action";
import type { Json } from "./json";
import type { Moment, Rule } from "./rule";
import { TestSlope } from "./testing/test-slope";
import type { TestConditions } from "./testing/test-slope";

const walk = (climber: ClimberId, direction: "up" | "down" | "stop"): GameAction => ({
  kind: "walk",
  climber,
  direction,
});
const clip = (climber: ClimberId): GameAction => ({ kind: "clip", climber, cowstail: "first" });

const advance = (expedition: Expedition, steps: number): void => {
  for (let step = 0; step < steps; step += 1) {
    expedition.advance();
  }
};

/** Anna clips on, Boris doesn't, both walk up; Anna rests a while on the way. */
const SCRIPT = new ActionLog([
  { step: 0, actions: [clip("anna"), walk("anna", "up"), walk("boris", "up")] },
  { step: 300, actions: [walk("anna", "stop")] },
  { step: 340, actions: [walk("anna", "up")] },
]);

const playTo = (expedition: Expedition, step: number): void => {
  while (expedition.step < step) {
    expedition.advance(SCRIPT.actionsAt(expedition.step));
  }
};

const played = (seed: number, conditions?: TestConditions): ExpeditionSave => {
  const scenario = TestSlope.scenario(seed, ["anna", "boris"], conditions);
  const expedition = Expedition.start(scenario, [new TestSlope()]);
  playTo(expedition, 2500);
  return expedition.save();
};

/** Writes down what it's told, to see what the expedition does with its rules. */
class Listening implements Rule {
  readonly heard: string[] = [];

  constructor(
    readonly name: string,
    private readonly diary: string[],
  ) {}

  load(): void {}

  save(): Json {
    return null;
  }

  advance(moment: Moment): void {
    this.diary.push(`${this.name} ${moment.step}`);
    this.heard.push(...moment.actions.map((action) => action.climber));
  }
}

describe("Expedition in real time", () => {
  it("goes on while nobody does anything", () => {
    const expedition = Expedition.start(TestSlope.scenario(1, ["anna"]), [new TestSlope()]);

    advance(expedition, 40);

    expect(expedition.step).toBe(40);
    expect(expedition.seconds).toBe(2);
  });

  it("keeps a climber walking with no further action, until told to stop", () => {
    const slope = new TestSlope();
    const scenario = TestSlope.scenario(1, ["anna"], TestSlope.CALM);
    const expedition = Expedition.start(scenario, [slope]);

    expedition.advance([walk("anna", "up")]);
    advance(expedition, 19);
    const afterOneSecond = slope.climber("anna").metres;
    expedition.advance([walk("anna", "stop")]);
    advance(expedition, 100);

    expect(afterOneSecond).toBeCloseTo(1);
    expect(slope.climber("anna").metres).toBe(afterOneSecond);
  });

  it("moves every climber in the same steps, without one waiting for another", () => {
    const slope = new TestSlope();
    const scenario = TestSlope.scenario(1, ["anna", "boris", "chen"], TestSlope.CALM);
    const expedition = Expedition.start(scenario, [slope]);

    expedition.advance([walk("anna", "up"), walk("boris", "up")]);
    advance(expedition, 9);
    expedition.advance([walk("chen", "up")]);
    advance(expedition, 9);

    expect(slope.climber("anna").metres).toBeCloseTo(1);
    expect(slope.climber("boris").metres).toBe(slope.climber("anna").metres);
    expect(slope.climber("chen").metres).toBeCloseTo(0.5);
  });

  it("gives the same result whichever player's action reached it first", () => {
    const scenario = TestSlope.scenario(1, ["anna", "boris"]);
    const arrivingAs = (actions: readonly GameAction[]): ExpeditionSave => {
      const expedition = Expedition.start(scenario, [new TestSlope()]);
      expedition.advance(actions);
      advance(expedition, 100);
      return expedition.save();
    };

    expect(arrivingAs([walk("boris", "up"), clip("anna")])).toEqual(
      arrivingAs([clip("anna"), walk("boris", "up")]),
    );
  });

  it("keeps one climber's own actions of a step in the order they came", () => {
    const slope = new TestSlope();
    const expedition = Expedition.start(TestSlope.scenario(1, ["anna"]), [slope]);

    expedition.advance([walk("anna", "up"), walk("anna", "stop")]);
    expect(slope.climber("anna").walking).toBe("stop");

    expedition.advance([walk("anna", "stop"), walk("anna", "up")]);
    expect(slope.climber("anna").walking).toBe("up");
  });

  it("refuses an action for a climber who isn't on the expedition", () => {
    const expedition = Expedition.start(TestSlope.scenario(1, ["anna"]), [new TestSlope()]);

    expect(() => expedition.advance([walk("nobody", "up")])).toThrow("nobody");
  });

  it("runs the rules in the order it was given, each once a step", () => {
    const diary: string[] = [];
    const rules = [new Listening("body", diary), new Listening("weather", diary)];
    const scenario = { seed: 1, climbers: [], start: { body: null, weather: null } };

    advance(Expedition.start(scenario, rules), 2);

    expect(diary).toEqual(["body 0", "weather 0", "body 1", "weather 1"]);
  });

  it("tells every rule each step's actions, in the scenario's order of climbers", () => {
    const rule = new Listening("body", []);
    const scenario = { seed: 1, climbers: ["anna", "boris"], start: { body: null } };
    const expedition = Expedition.start(scenario, [rule]);

    expedition.advance([walk("boris", "up"), walk("anna", "up"), walk("boris", "stop")]);

    expect(rule.heard).toEqual(["anna", "boris", "boris"]);
  });
});

describe("Expedition and chance", () => {
  it("gives the same expedition for the same seed and the same actions", () => {
    expect(played(2026)).toEqual(played(2026));
  });

  it("gives a different expedition for each seed, with the same actions", () => {
    const seeds = Array.from({ length: 100 }, (_, seed) => seed);
    const expeditions = seeds.map((seed) => JSON.stringify(played(seed).rules));

    expect(new Set(expeditions).size).toBe(seeds.length);
  });

  it("gives another ending for another action, on the same seed", () => {
    const ending = (actions: readonly GameAction[]): boolean => {
      const slope = new TestSlope();
      const expedition = Expedition.start(TestSlope.scenario(7, ["boris"]), [slope]);
      expedition.advance(actions);
      while (!slope.everyoneDone) {
        expedition.advance();
      }
      return slope.climber("boris").fallen;
    };

    expect(ending([walk("boris", "up")])).toBe(true);
    expect(ending([clip("boris"), walk("boris", "up")])).toBe(false);
  });

  it("brings a mistake's price later, at a moment the seed decides", () => {
    const fallingStep = (seed: number): number | undefined => {
      const slope = new TestSlope();
      const scenario = TestSlope.scenario(seed, ["anna", "boris"]);
      const expedition = Expedition.start(scenario, [slope]);
      playTo(expedition, 2500);
      return slope.climber("boris").slips[0];
    };

    const moments = Array.from({ length: 50 }, (_, seed) => fallingStep(seed));

    expect(moments.every((moment) => moment !== undefined)).toBe(true);
    expect(new Set(moments).size).toBeGreaterThan(1);
  });

  it("keeps conditions set in advance on every seed", () => {
    const fallen = (seed: number, conditions: TestConditions): boolean => {
      const slope = new TestSlope();
      slope.load(played(seed, conditions).rules["test-slope"] as Json);
      return slope.climber("boris").fallen;
    };

    for (let seed = 0; seed < 50; seed += 1) {
      expect(fallen(seed, TestSlope.CALM)).toBe(false);
      expect(fallen(seed, TestSlope.HARSH)).toBe(true);
    }
  });
});

describe("Expedition saves", () => {
  it("starts from a scenario's start state, which has the form of a save", () => {
    const scenario = TestSlope.scenario(1, ["anna", "boris"]);

    expect(Expedition.start(scenario, [new TestSlope()]).save().rules).toEqual(scenario.start);
  });

  it("goes on from a save, through JSON, as if it had never stopped", () => {
    const scenario = TestSlope.scenario(11, ["anna", "boris"]);
    const whole = Expedition.start(scenario, [new TestSlope()]);
    playTo(whole, 1500);

    const interrupted = Expedition.start(scenario, [new TestSlope()]);
    playTo(interrupted, 700);
    const save = JSON.parse(JSON.stringify(interrupted.save())) as ExpeditionSave;
    const resumed = Expedition.resume(save, [new TestSlope()]);
    playTo(resumed, 1500);

    expect(resumed.save()).toEqual(whole.save());
  });

  it("keeps a save as it was while the expedition goes on", () => {
    const scenario = TestSlope.scenario(13, ["anna", "boris"]);
    const expedition = Expedition.start(scenario, [new TestSlope()]);
    playTo(expedition, 500);
    const save = expedition.save();
    const whenSaved = JSON.stringify(save);

    playTo(expedition, 1000);

    expect(JSON.stringify(save)).toBe(whenSaved);
  });

  it("replays from its scenario and its log, step for step", () => {
    const save = played(12);

    const replayed = Expedition.start(save.scenario, [new TestSlope()]);
    const log = new ActionLog(save.actions);
    while (replayed.step < save.step) {
      replayed.advance(log.actionsAt(replayed.step));
    }

    expect(replayed.save()).toEqual(save);
  });

  it("refuses a rule the scenario gives no start state", () => {
    const scenario = TestSlope.scenario(1, ["anna"]);
    const rules = [new TestSlope(), new Listening("weather", [])];

    expect(() => Expedition.start(scenario, rules)).toThrow("weather");
  });

  it("refuses two rules of one name: a save couldn't tell them apart", () => {
    const scenario = TestSlope.scenario(1, ["anna"]);

    expect(() => Expedition.start(scenario, [new TestSlope(), new TestSlope()])).toThrow(
      "test-slope",
    );
  });
});
