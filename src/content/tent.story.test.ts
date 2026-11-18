import { describe, expect, it } from "vitest";

import { Expedition, MountainClock, SimulationClock } from "../simulation";
import type { GameAction } from "../simulation";
import { KnowledgeBase } from "./knowledge-base";
import { KNOWLEDGE_FILES } from "./knowledge-files";
import { Mountain } from "./mountain";
import type { ExpeditionRules } from "./mountain";

const knowledge = new KnowledgeBase(KNOWLEDGE_FILES);
const PLAYER = "player";
const SHERPA = "pemba";

/** A climb of the Icefall alone, the player and Pemba, a step in. */
const climb = (): { expedition: Expedition; rules: ExpeditionRules } => {
  const mountain = new Mountain(knowledge);
  const rules = mountain.rules();
  const scenario = mountain.scenario(7, undefined, undefined, false, undefined, true);
  const expedition = Expedition.start(scenario, rules.all);
  expedition.advance();
  return { expedition, rules };
};

const walk = (direction: "left" | "stop"): GameAction => ({
  kind: "walk",
  climber: PLAYER,
  direction,
});
const tent = (go: "in" | "out"): GameAction => ({ kind: "tent", climber: PLAYER, go });
const chore = (what: Extract<GameAction, { kind: "chore" }>["chore"]): GameAction => ({
  kind: "chore",
  climber: PLAYER,
  chore: what,
});

/** Plays the mountain's `minutes`, and a step over. */
const minutes = (expedition: Expedition, rules: ExpeditionRules, mountain: number): void => {
  const steps = Math.ceil((mountain * 60) / rules.clock.secondsAStep) + 1;
  for (let step = 0; step < steps; step += 1) {
    expedition.advance();
  }
};

/** A body as its save keeps it. */
const body = (
  rules: ExpeditionRules,
  climber: string,
): { awake: number; food: number; water: number } => {
  const save = rules.body.save() as unknown as {
    climbers: { id: string; awake: number; food: number; water: number }[];
  };
  const found = save.climbers.find(({ id }) => id === climber);
  if (found === undefined) {
    throw new RangeError(`${climber} has no body`);
  }
  return found;
};

/** Walks the player back from where they set off to the nearest tent's door, and in. */
const intoTheTent = (expedition: Expedition, rules: ExpeditionRules): void => {
  expedition.advance([walk("left")]);
  for (let step = 0; rules.tents.door(PLAYER) === null; step += 1) {
    if (step > 10 * SimulationClock.STEPS_PER_SECOND) {
      throw new RangeError("No tent's door within ten seconds' walk of the start");
    }
    expedition.advance();
  }
  expedition.advance([walk("stop"), tent("in")]);
};

/**
 * A night in a tent at Base Camp, as a player lives it (#258): in at the door, snow melted into
 * the bottles, a meal cooked and eaten, the night slept through to the alarm, and out again.
 */
describe("A tent on the Icefall", () => {
  it("takes the player in at Base Camp's nearest door, where no key moves them, and lets them out to walk on", () => {
    const { expedition, rules } = climb();

    intoTheTent(expedition, rules);
    const inside = rules.physics.climber(PLAYER);
    expedition.advance([{ kind: "walk", climber: PLAYER, direction: "right" }]);
    minutes(expedition, rules, 1);

    expect(rules.tents.tent(PLAYER)).toMatchObject({ camp: "base-camp", tent: 1, guitar: true });
    expect(inside.sheltered).toBe(true);
    expect(rules.physics.climber(PLAYER).x).toBe(inside.x);

    expedition.advance([tent("out")]);
    expedition.advance([{ kind: "walk", climber: PLAYER, direction: "right" }]);
    minutes(expedition, rules, 1);

    expect(rules.tents.tent(PLAYER)).toBeNull();
    expect(rules.physics.climber(PLAYER).x).toBeGreaterThan(inside.x + 1);
  });

  it("melts a litre into the bottles in twelve minutes, then cooks a meal that fills the body", () => {
    const { expedition, rules } = climb();
    intoTheTent(expedition, rules);
    minutes(expedition, rules, 12 * 60);
    const hungry = body(rules, PLAYER).food;

    expedition.advance([chore("melt")]);
    minutes(expedition, rules, 6);
    expect(rules.tents.tent(PLAYER)?.chore).toBe("melt");
    minutes(expedition, rules, 6);

    expect(rules.tents.tent(PLAYER)?.chore).toBeNull();
    expect(rules.packs.pack(PLAYER).items.water).toBe(3);

    expedition.advance([chore("cook")]);
    minutes(expedition, rules, 15);

    expect(rules.packs.pack(PLAYER).items.water).toBeCloseTo(3 - 0.414, 9);
    expect(hungry).toBeGreaterThan(600);
    expect(body(rules, PLAYER).food).toBeLessThan(hungry - 500);
  });

  it("sleeps the night through to the alarm at once, alone, and wakes rested, Pemba too", () => {
    const { expedition, rules } = climb();
    intoTheTent(expedition, rules);
    // Up since two, it's nine in the evening: five hours to the alarm.
    minutes(expedition, rules, 18 * 60);
    const before = { player: body(rules, PLAYER).awake, pemba: body(rules, SHERPA).awake };
    expect(rules.body.climber(PLAYER).symptoms).toContain("sleepy");

    expedition.advance([chore("sleep")]);
    expedition.advance();

    expect(MountainClock.text(rules.clock.timeOfDay)).toBe("02:00");
    expect(rules.tents.tent(PLAYER)).toMatchObject({ chore: null });
    expect(rules.tents.tent(PLAYER)?.slept).not.toBeNull();
    expect(before.player).toBeGreaterThan(18);
    expect(body(rules, PLAYER).awake).toBeCloseTo(before.player - 5 * 3, 1);
    expect(body(rules, SHERPA).awake).toBeLessThan(before.pemba);
    expect(rules.body.climber(PLAYER).symptoms).not.toContain("sleepy");
  });

  it("has no water for the taking at Camp 1, and melts it on what gas was carried up", () => {
    const { expedition, rules } = climb();
    const mountain = new Mountain(knowledge);
    const [door] = mountain.route.tents.camps[1]?.doors ?? [];
    rules.physics.stand(PLAYER, door ?? 0, false);
    expedition.advance([{ kind: "use", climber: PLAYER, item: "water" }]);
    expedition.advance([{ kind: "pack", climber: PLAYER, item: "water", change: "take" }]);

    expect(rules.packs.pack(PLAYER)).toMatchObject({ camp: "camp-1", stock: { water: 0 } });
    expect(rules.packs.pack(PLAYER).items.water).toBe(1.5);

    expedition.advance([tent("in"), chore("melt")]);
    minutes(expedition, rules, 12);

    expect(rules.packs.pack(PLAYER).items.water).toBe(2.5);
    expect(rules.tents.tent(PLAYER)?.gas).toBeCloseTo(454 - 38, 6);
    expect(rules.tents.tent(PLAYER)).toMatchObject({ camp: "camp-1", meals: 6, guitar: false });
  });
});
