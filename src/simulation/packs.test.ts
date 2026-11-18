import { describe, expect, it } from "vitest";

import { Expedition } from "./expedition";
import type { ClimberId, GameAction } from "./game-action";
import type { ExpeditionSave } from "./expedition";
import { MountainClock } from "./mountain-clock";
import { OxygenSystem } from "./oxygen";
import { Packs } from "./packs";
import type { Harness, PackCounts, PackItem, PackNumbers, Shoulders } from "./packs";
import type { Scenario } from "./scenario";

/** A jumar of 200 g, a tool of half a kilogram, a litre of water a kilogram, a bar 100 g and a
 * bottle 4 kg; a drink is half a litre, and a bar 250 kcal. */
const NUMBERS: PackNumbers = {
  weights: {
    jumar: 0.2,
    "ice-tool": 0.5,
    water: 1,
    food: 0.1,
    oxygen: 4,
    "first-aid": 0.4,
    "rescue-kit": 1.2,
  },
  most: {
    jumar: 1,
    "ice-tool": 1,
    water: 3,
    food: 6,
    oxygen: 3,
    "first-aid": 1,
    "rescue-kit": 1,
  },
  sip: 0.5,
  bar: 250,
};
const OXYGEN = { bottleLitres: 120, bottlePressure: 300, bottles: 0, maximumFlow: 8 };
const NO_KITS = { "first-aid": 0, "rescue-kit": 0 };
const PACKED: PackCounts = { jumar: 1, "ice-tool": 0, water: 2, food: 2, oxygen: 0, ...NO_KITS };
const NOTHING: PackCounts = { jumar: 0, "ice-tool": 0, water: 0, food: 0, oxygen: 0, ...NO_KITS };

/** The body and the slope under the packs: what Anna carries, drank and ate, where she is and
 * what's on her harness. */
class World implements Shoulders, Harness {
  along_ = 2;
  falling = false;
  load = 0;
  drunk = 0;
  eaten = 0;
  gear = { jumar: false, tools: 0, firstAid: false, rescueKit: false };
  used = { firstAid: 0, rescueKit: 0 };

  carry(_id: ClimberId, kilograms: number): void {
    this.load = kilograms;
  }

  drink(_id: ClimberId, litres: number): void {
    this.drunk += litres;
  }

  eat(_id: ClimberId, kcal: number): void {
    this.eaten += kcal;
  }

  along(): number {
    return this.along_;
  }

  climber(): { falling: boolean; dead: boolean } {
    return { falling: this.falling, dead: false };
  }

  equip(
    _id: ClimberId,
    gear: { jumar: boolean; tools: number; firstAid: boolean; rescueKit: boolean },
  ): void {
    this.gear = gear;
  }

  kitsSpent(): { firstAid: number; rescueKit: number } {
    return this.used;
  }
}

/** Anna with 8 kg besides her pack, at Base Camp, from 0 to 8 m along, whose stores never run
 * out; Camp 1 is from 100 to 110 m, with its water alone, melted from the snow. */
const climb = (
  items: PackCounts = PACKED,
): { expedition: Expedition; packs: Packs; world: World; oxygen: OxygenSystem } => {
  const clock = new MountainClock(60);
  const oxygen = new OxygenSystem(OXYGEN, clock);
  const world = new World();
  const packs = new Packs(NUMBERS, world, world, oxygen);
  const scenario: Scenario = {
    seed: 1,
    climbers: ["anna"],
    start: {
      [MountainClock.NAME]: MountainClock.start({ date: "2026-05-20", time: "00:00" }),
      [OxygenSystem.NAME]: OxygenSystem.start(["anna"], items.oxygen),
      [Packs.NAME]: Packs.start(
        {
          climbers: [{ id: "anna", base: 8, items }],
          camps: [
            {
              id: "base-camp",
              from: 0,
              to: 8,
              stock: NOTHING,
              endless: ["jumar", "ice-tool", "water", "food", "oxygen", "first-aid", "rescue-kit"],
            },
            { id: "camp-1", from: 100, to: 110, stock: NOTHING, endless: ["water"] },
          ],
        },
        NUMBERS,
      ),
    },
  };
  return { expedition: Expedition.start(scenario, [clock, packs, oxygen]), packs, world, oxygen };
};

const pack = (item: PackItem, change: "take" | "leave"): GameAction => ({
  kind: "pack",
  climber: "anna",
  item,
  change,
});
const use = (item: "water" | "food"): GameAction => ({ kind: "use", climber: "anna", item });

describe("Packs", () => {
  it("puts the pack's weight on the climber's shoulders, with what they carry besides, and its gear on their harness", () => {
    const { expedition, packs, world } = climb();
    expedition.advance();

    expect(packs.pack("anna")).toMatchObject({ items: PACKED, camp: "base-camp" });
    expect(packs.pack("anna").weight).toBeCloseTo(2.4, 9);
    expect(world.load).toBeCloseTo(10.4, 9);
    expect(world.gear).toMatchObject({ jumar: true, tools: 1 });
  });

  it("takes from a camp's store and leaves there, one at a time, up to the most a climber carries", () => {
    const { expedition, packs, world } = climb();
    expedition.advance([
      pack("ice-tool", "take"),
      pack("ice-tool", "take"),
      pack("jumar", "leave"),
    ]);
    expedition.advance([pack("water", "take"), pack("water", "take")]);

    expect(packs.pack("anna").items).toMatchObject({ jumar: 0, "ice-tool": 1, water: 3 });
    expect(world.gear).toMatchObject({ jumar: false, tools: 2 });
    expect(world.load).toBeCloseTo(8 + 0.5 + 3 + 0.2, 9);
  });

  it("packs nothing away from a camp, nor in a fall", () => {
    const { expedition, packs, world } = climb();
    world.along_ = 50;
    expedition.advance([pack("ice-tool", "take"), pack("water", "leave")]);
    const onTheRoute = packs.pack("anna");
    world.along_ = 2;
    world.falling = true;
    expedition.advance([pack("ice-tool", "take")]);

    expect(onTheRoute).toMatchObject({ items: PACKED, camp: null, stock: null });
    expect(packs.pack("anna").items).toEqual(PACKED);
  });

  it("keeps what's left at a camp there, for whoever comes back for it; its endless stores never run out", () => {
    const { expedition, packs, world } = climb({ ...PACKED, "ice-tool": 1 });
    world.along_ = 105;
    expedition.advance([pack("ice-tool", "leave"), pack("food", "leave"), pack("water", "take")]);
    const cached = packs.pack("anna");
    expedition.advance([pack("ice-tool", "take"), pack("ice-tool", "take"), pack("jumar", "take")]);

    expect(cached.items).toMatchObject({ "ice-tool": 0, food: 1, water: 3 });
    expect(cached.stock).toEqual({
      jumar: 0,
      "ice-tool": 1,
      water: null,
      food: 1,
      oxygen: 0,
      ...NO_KITS,
    });
    expect(packs.pack("anna").items).toMatchObject({ "ice-tool": 1, jumar: 1 });
    expect(packs.pack("anna").stock).toMatchObject({ "ice-tool": 0 });
  });

  it("drinks the water half a litre at a time and eats the food a bar at a time, anywhere, and the pack gets lighter", () => {
    const { expedition, packs, world } = climb();
    world.along_ = 50;
    expedition.advance([use("water"), use("food")]);
    const after = packs.pack("anna");
    for (let drink = 0; drink < 5; drink += 1) {
      expedition.advance([use("water"), use("food")]);
    }

    expect(after.items).toMatchObject({ water: 1.5, food: 1 });
    expect(after.weight).toBeCloseTo(0.2 + 1.5 + 0.1, 9);
    expect(packs.pack("anna").items).toMatchObject({ water: 0, food: 0 });
    expect(world.drunk).toBe(2);
    expect(world.eaten).toBe(500);
  });

  it("counts the bottles of oxygen as the oxygen system does, and weighs them", () => {
    const { expedition, packs, world, oxygen } = climb();
    expedition.advance([pack("oxygen", "take"), pack("oxygen", "take")]);
    const taken = oxygen.climber("anna");
    expedition.advance([pack("oxygen", "leave")]);

    expect(taken).toMatchObject({ bottles: 2, pressure: 300 });
    expect(packs.pack("anna").items.oxygen).toBe(1);
    expect(world.load).toBeCloseTo(8 + 2.4 + 4, 9);
    expect(oxygen.climber("anna")).toMatchObject({ bottles: 1, pressure: 300 });
  });

  it("resumes with the packs and the camps' stores as they were", () => {
    const { expedition, packs, world } = climb();
    world.along_ = 105;
    expedition.advance([pack("food", "leave"), use("water")]);
    const saved = JSON.parse(JSON.stringify(expedition.save())) as ExpeditionSave;
    const clock = new MountainClock(60);
    const oxygen = new OxygenSystem(OXYGEN, clock);
    const again = new World();
    again.along_ = 105;
    const resumed = new Packs(NUMBERS, again, again, oxygen);
    Expedition.resume(saved, [clock, resumed, oxygen]).advance();

    expect(resumed.pack("anna")).toEqual(packs.pack("anna"));
    expect(again.load).toBe(world.load);
  });

  it("hands the harness the kits a rescue takes, and weighs them (#241)", () => {
    const { expedition, world } = climb({ ...PACKED, "first-aid": 1, "rescue-kit": 1 });
    expedition.advance();

    expect(world.gear).toMatchObject({ firstAid: true, rescueKit: true });
    expect(world.load).toBeCloseTo(8 + 2.4 + 0.4 + 1.2, 9);
  });

  it("takes a kit a rescue has used up out of the pack, once, and keeps count through a save", () => {
    const { expedition, packs, world } = climb({ ...PACKED, "first-aid": 1, "rescue-kit": 1 });
    expedition.advance();
    world.used = { firstAid: 1, rescueKit: 0 };
    expedition.advance();
    expedition.advance();
    const saved = JSON.parse(JSON.stringify(expedition.save())) as ExpeditionSave;
    const clock = new MountainClock(60);
    const oxygen = new OxygenSystem(OXYGEN, clock);
    const again = new World();
    again.used = { firstAid: 1, rescueKit: 0 };
    const resumed = new Packs(NUMBERS, again, again, oxygen);
    Expedition.resume(saved, [clock, resumed, oxygen]).advance();

    expect(packs.pack("anna").items).toMatchObject({ "first-aid": 0, "rescue-kit": 1 });
    expect(world.gear).toMatchObject({ firstAid: false, rescueKit: true });
    expect(world.load).toBeCloseTo(8 + 2.4 + 1.2, 9);
    expect(resumed.pack("anna").items).toMatchObject({ "first-aid": 0, "rescue-kit": 1 });
    expect(again.gear).toMatchObject({ firstAid: false, rescueKit: true });
  });

  it("gives a pack saved before the kits none of them", () => {
    const { expedition } = climb();
    const saved = JSON.parse(JSON.stringify(expedition.save())) as ExpeditionSave;
    const kept = saved.rules[Packs.NAME] as unknown as {
      climbers: { items: Record<string, number> }[];
    };
    const [anna] = kept.climbers;
    delete anna?.items["first-aid"];
    delete anna?.items["rescue-kit"];
    const before = JSON.parse(JSON.stringify(saved)) as ExpeditionSave;
    const clock = new MountainClock(60);
    const oxygen = new OxygenSystem(OXYGEN, clock);
    const world = new World();
    const resumed = new Packs(NUMBERS, world, world, oxygen);
    Expedition.resume(before, [clock, resumed, oxygen]).advance();

    expect(Object.keys(anna?.items ?? {})).not.toContain("first-aid");
    expect(resumed.pack("anna").items).toMatchObject({ "first-aid": 0, "rescue-kit": 0, water: 2 });
    expect(world.load).toBeCloseTo(8 + 2.4, 9);
  });

  it("refuses a pack of more than a climber carries", () => {
    expect(() =>
      Packs.start(
        { climbers: [{ id: "anna", base: 8, items: { ...PACKED, water: 4 } }], camps: [] },
        NUMBERS,
      ),
    ).toThrow("can't pack 4 of water");
  });

  it("has its bottles filled by the tents' stove, as far as they hold, and poured from for a meal (#258)", () => {
    const { expedition, packs } = climb();

    expect(packs.water("anna")).toBe(2);
    expect(packs.room("anna")).toBe(1);

    packs.pour("anna", 2.5);
    expect(packs.water("anna")).toBe(3);
    expect(packs.room("anna")).toBe(0);

    packs.pour("anna", -0.4);
    expedition.advance();
    expect(packs.pack("anna").items.water).toBeCloseTo(2.6, 9);

    packs.pour("anna", -5);
    expect(packs.water("anna")).toBe(0);
  });
});
