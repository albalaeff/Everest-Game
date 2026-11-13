import { describe, expect, it } from "vitest";

import { Expedition } from "../simulation";
import type { GameAction, PackCounts, PackItem } from "../simulation";
import { KnowledgeBase } from "./knowledge-base";
import { KNOWLEDGE_FILES } from "./knowledge-files";
import { Mountain } from "./mountain";
import type { ExpeditionRules } from "./mountain";

const knowledge = new KnowledgeBase(KNOWLEDGE_FILES);
const PLAYER = "player";

/** A climb of the Icefall with the player's `pack`, or the route's, a step in. */
const climb = (pack?: PackCounts): { expedition: Expedition; rules: ExpeditionRules } => {
  const mountain = new Mountain(knowledge);
  const rules = mountain.rules();
  const scenario = mountain.scenario(7, undefined, undefined, false, pack);
  const expedition = Expedition.start(scenario, rules.all);
  expedition.advance();
  return { expedition, rules };
};

/** The player's body as its save keeps it: what they carry, and the water they're short of. */
const body = (rules: ExpeditionRules): { load: number; water: number } => {
  const save = rules.body.save() as unknown as {
    climbers: { id: string; load: number; water: number }[];
  };
  const mine = save.climbers.find(({ id }) => id === PLAYER);
  if (mine === undefined) {
    throw new RangeError("The player has no body");
  }
  return mine;
};

const take = (item: PackItem): GameAction => ({
  kind: "pack",
  climber: PLAYER,
  item,
  change: "take",
});

/**
 * The pack a climber chooses at Base Camp is what they have on the route: its weight on their
 * shoulders, its jumar and its tools on their harness, its bottles their oxygen.
 */
describe("The pack on the Icefall", () => {
  it("sets the player off with the route's pack: the jumar, water and food, the ice axe alone, no oxygen, 10 kg in all", () => {
    const { rules } = climb();

    expect(rules.packs.pack(PLAYER)).toMatchObject({
      items: { jumar: 1, "ice-tool": 0, water: 2, food: 2, oxygen: 0 },
      camp: "base-camp",
    });
    expect(body(rules).load).toBeCloseTo(10, 6);
    expect(rules.physics.climber(PLAYER).gear).toEqual({ jumar: true, tools: 1 });
    expect(rules.oxygen.climber(PLAYER)).toMatchObject({ bottles: 0, pressure: 0 });
  });

  it("puts the pack they chose on them: a second tool is a second pick, a bottle is 4 kg, and no jumar climbs no rope", () => {
    const { rules } = climb({ jumar: 0, "ice-tool": 1, water: 1, food: 0, oxygen: 1 });

    expect(rules.physics.climber(PLAYER).gear).toEqual({ jumar: false, tools: 2 });
    expect(rules.oxygen.climber(PLAYER)).toMatchObject({ bottles: 1, pressure: 300 });
    expect(body(rules).load).toBeGreaterThan(12);
  });

  it("repacks at Base Camp from stores that don't run out, and a heavier pack shortens the stride", () => {
    const { expedition, rules } = climb();
    const light = rules.physics.climber(PLAYER);
    expedition.advance([take("ice-tool"), take("oxygen"), take("oxygen"), take("water")]);
    expedition.advance();

    expect(light.gear.tools).toBe(1);
    expect(rules.packs.pack(PLAYER).items).toMatchObject({ "ice-tool": 1, oxygen: 2, water: 3 });
    expect(rules.physics.climber(PLAYER).gear.tools).toBe(2);
    expect(body(rules).load).toBeCloseTo(10 + 0.55 + 2 * 3.695 + 1, 6);
  });

  it("slakes a thirst with a drink from the pack", () => {
    const mountain = new Mountain(knowledge);
    const rules = mountain.rules();
    // The water bottles unchecked: a litre short from the start.
    const scenario = mountain.scenario(7, undefined, { crampons: true, lamp: true, water: false });
    const expedition = Expedition.start(scenario, rules.all);
    expedition.advance();
    const short = body(rules).water;
    expedition.advance([{ kind: "use", climber: PLAYER, item: "water" }]);
    expedition.advance();

    expect(short).toBeCloseTo(1, 2);
    expect(body(rules).water).toBeCloseTo(0.5, 2);
    expect(rules.packs.pack(PLAYER).items.water).toBe(1.5);
  });
});
