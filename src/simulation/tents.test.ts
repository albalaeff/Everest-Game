import { describe, expect, it } from "vitest";

import { Expedition } from "./expedition";
import type { ExpeditionSave } from "./expedition";
import type { ClimberId, GameAction } from "./game-action";
import { MountainClock } from "./mountain-clock";
import type { Scenario } from "./scenario";
import { SimulationClock } from "./simulation-clock";
import { Tents } from "./tents";
import type { Campground, Flasks, Sleeper, TentNumbers, TentStart } from "./tents";

/** A step from a door is near enough to go in. A litre of snow melts in 12 minutes on 40 g of
 * gas; a meal of 600 kcal takes 15 minutes, 10 g and 0.4 L; a nap is an hour, and the alarm
 * rings at 02:00. */
const NUMBERS: TentNumbers = {
  reach: 1,
  melt: { seconds: 12 * 60, gas: 40, litres: 1 },
  meal: { seconds: 15 * 60, gas: 10, water: 0.4, kcal: 600 },
  nap: 3600,
  wake: 2 * 3600,
};

/** Base Camp, its tents' doors at 3 and 7 m along, never short of gas or meals, with a guitar;
 * Camp 1, a door at 103 m, with 100 g of gas and two meals. Pemba is the Sherpa. */
const PITCHED: TentStart = {
  camps: [
    { id: "base-camp", doors: [3, 7], gas: null, meals: null, guitar: true },
    { id: "camp-1", doors: [103], gas: 100, meals: 2, guitar: false },
  ],
  npcs: ["pemba"],
};

/** The slope, the bottles and the bodies under the tents: where everyone stands, who's under
 * cover, the water each carries of the three litres their bottles hold, what they ate, and the
 * steps each slept through. */
class World implements Campground, Flasks, Sleeper {
  readonly places = new Map<ClimberId, number>([
    ["anna", 3],
    ["boris", 7.5],
    ["pemba", 12],
  ]);
  readonly sheltered = new Set<ClimberId>();
  readonly fallen = new Set<ClimberId>();
  readonly bottles = new Map<ClimberId, number>([
    ["anna", 1],
    ["boris", 1],
    ["pemba", 1],
  ]);
  readonly eaten = new Map<ClimberId, number>();
  readonly slept = new Map<ClimberId, number>();

  get climbers(): readonly ClimberId[] {
    return [...this.places.keys()];
  }

  along(id: ClimberId): number {
    return this.places.get(id) ?? 0;
  }

  climber(id: ClimberId): { falling: boolean; dead: boolean } {
    return { falling: this.fallen.has(id), dead: false };
  }

  shelter(id: ClimberId, inside: boolean): void {
    if (inside) {
      this.sheltered.add(id);
    } else {
      this.sheltered.delete(id);
    }
  }

  water(id: ClimberId): number {
    return this.bottles.get(id) ?? 0;
  }

  room(id: ClimberId): number {
    return 3 - this.water(id);
  }

  pour(id: ClimberId, litres: number): void {
    this.bottles.set(id, Math.min(3, Math.max(0, this.water(id) + litres)));
  }

  eat(id: ClimberId, kcal: number): void {
    this.eaten.set(id, (this.eaten.get(id) ?? 0) + kcal);
  }

  sleep(id: ClimberId): void {
    this.slept.set(id, (this.slept.get(id) ?? 0) + 1);
  }
}

/** A minute of the mountain's time in a second of play, from 22:00. */
const camp = (
  time = "22:00",
  resumed?: ExpeditionSave,
): { expedition: Expedition; tents: Tents; world: World; clock: MountainClock } => {
  const clock = new MountainClock(60);
  const world = new World();
  const tents = new Tents(NUMBERS, clock, world, world, world, PITCHED);
  const scenario: Scenario = {
    seed: 1,
    climbers: ["anna", "boris", "pemba"],
    npcs: ["pemba"],
    start: {
      [MountainClock.NAME]: MountainClock.start({ date: "2026-05-01", time }),
      [Tents.NAME]: Tents.start(PITCHED),
    },
  };
  const rules = [clock, tents];
  const expedition =
    resumed === undefined ? Expedition.start(scenario, rules) : Expedition.resume(resumed, rules);
  return { expedition, tents, world, clock };
};

/** Takes a step with `actions`, then plays `minutes` of the mountain's time. */
const play = (expedition: Expedition, minutes: number, actions: readonly GameAction[] = []) => {
  expedition.advance(actions);
  for (let step = 0; step < minutes * SimulationClock.STEPS_PER_SECOND; step += 1) {
    expedition.advance();
  }
};

const goIn = (climber: ClimberId): GameAction => ({ kind: "tent", climber, go: "in" });
const goOut = (climber: ClimberId): GameAction => ({ kind: "tent", climber, go: "out" });
const chore = (
  climber: ClimberId,
  what: Extract<GameAction, { kind: "chore" }>["chore"],
): GameAction => ({ kind: "chore", climber, chore: what });

describe("Tents: going in and out", () => {
  it("takes a climber in at the door they stand at, and lets them out again", () => {
    const { expedition, tents, world } = camp();

    expect(tents.door("anna")).toEqual({ camp: "base-camp", tent: 0, along: 3 });
    expect(tents.tent("anna")).toBeNull();

    expedition.advance([goIn("anna")]);

    expect(tents.tent("anna")).toMatchObject({ camp: "base-camp", tent: 0, chore: null });
    expect(tents.door("anna")).toBeNull();
    expect(world.sheltered.has("anna")).toBe(true);

    expedition.advance([goOut("anna")]);

    expect(tents.tent("anna")).toBeNull();
    expect(world.sheltered.has("anna")).toBe(false);
  });

  it("goes into the nearer of two doors, within a step of it", () => {
    const { expedition, tents } = camp();

    expedition.advance([goIn("boris")]);

    expect(tents.tent("boris")).toMatchObject({ camp: "base-camp", tent: 1 });
  });

  it("takes nobody in who stands away from every door, or who's off their feet", () => {
    const { expedition, tents, world } = camp();
    world.places.set("anna", 5);
    world.fallen.add("boris");

    expect(tents.door("anna")).toBeNull();
    expedition.advance([goIn("anna"), goIn("boris")]);

    expect(tents.tent("anna")).toBeNull();
    expect(tents.tent("boris")).toBeNull();
  });

  it("puts out whoever is knocked off their feet, or stood somewhere else", () => {
    const { expedition, tents, world } = camp();
    expedition.advance([goIn("anna"), goIn("boris")]);

    world.fallen.add("anna");
    world.places.set("boris", 60);
    expedition.advance();

    expect(tents.tent("anna")).toBeNull();
    expect(tents.tent("boris")).toBeNull();
    expect(world.sheltered.size).toBe(0);
  });
});

describe("Tents: the stove", () => {
  it("melts a litre of snow into the bottles in its minutes, and Base Camp's gas never runs out", () => {
    const { expedition, tents, world } = camp();
    expedition.advance([goIn("anna")]);

    play(expedition, 6, [chore("anna", "melt")]);
    expect(tents.tent("anna")).toMatchObject({ chore: "melt", gas: null });
    expect(tents.tent("anna")?.progress).toBeCloseTo(0.5, 2);
    expect(world.water("anna")).toBe(1);

    play(expedition, 6);
    expect(tents.tent("anna")?.chore).toBeNull();
    expect(world.water("anna")).toBe(2);
  });

  it("burns Camp 1's gas as it melts, and goes out when the gas does", () => {
    const { expedition, tents, world } = camp();
    world.places.set("anna", 103);
    world.bottles.set("anna", 0);
    expedition.advance([goIn("anna")]);

    play(expedition, 12, [chore("anna", "melt")]);
    expect(tents.tent("anna")?.gas).toBeCloseTo(60, 6);
    expect(world.water("anna")).toBe(1);

    play(expedition, 12, [chore("anna", "melt")]);
    play(expedition, 12, [chore("anna", "melt")]);
    // 20 g were left: half a litre's worth, and the pot isn't melted through.
    expect(tents.tent("anna")).toMatchObject({ chore: null, gas: 0 });
    expect(world.water("anna")).toBe(2);
    expect(tents.tent("anna")?.lacks.melt).toBe("gas");
  });

  it("melts nothing into full bottles", () => {
    const { expedition, tents, world } = camp();
    world.bottles.set("anna", 3);
    expedition.advance([goIn("anna")]);

    expedition.advance([chore("anna", "melt")]);

    expect(tents.tent("anna")).toMatchObject({ chore: null });
    expect(tents.tent("anna")?.lacks.melt).toBe("room");
  });

  it("cooks a meal with the bottles' water and the camp's gas, and it's eaten when it's done", () => {
    const { expedition, tents, world } = camp();
    world.places.set("anna", 103);
    expedition.advance([goIn("anna")]);

    play(expedition, 15, [chore("anna", "cook")]);

    expect(world.eaten.get("anna")).toBe(600);
    expect(world.water("anna")).toBeCloseTo(0.6, 6);
    expect(tents.tent("anna")).toMatchObject({ chore: null, meals: 1 });
    expect(tents.tent("anna")?.gas).toBeCloseTo(90, 6);
  });

  it("cooks nothing without a meal, the water for it, or gas", () => {
    const { expedition, tents, world } = camp();
    world.places.set("anna", 103);
    world.bottles.set("anna", 0.2);
    expedition.advance([goIn("anna")]);

    expect(tents.tent("anna")?.lacks.cook).toBe("water");
    expedition.advance([chore("anna", "cook")]);
    expect(tents.tent("anna")).toMatchObject({ chore: null, meals: 2 });
  });

  it("stops a chore when asked, and one begun takes the place of the one in hand", () => {
    const { expedition, tents, world } = camp();
    expedition.advance([goIn("anna")]);

    play(expedition, 3, [chore("anna", "melt")]);
    expedition.advance([chore("anna", "guitar")]);
    expect(tents.tent("anna")).toMatchObject({ chore: "guitar", progress: 0 });

    expedition.advance([chore("anna", "stop")]);
    expect(tents.tent("anna")?.chore).toBeNull();
    expect(world.water("anna")).toBe(1);
  });

  it("has a guitar at Base Camp alone", () => {
    const { expedition, tents, world } = camp();
    world.places.set("anna", 103);
    expedition.advance([goIn("anna"), goIn("boris")]);

    expect(tents.tent("anna")).toMatchObject({ guitar: false });
    expect(tents.tent("anna")?.lacks.guitar).toBe("guitar");
    expect(tents.tent("boris")).toMatchObject({ guitar: true });
    expect(tents.tent("boris")?.lacks.guitar).toBeNull();
  });
});

describe("Tents: sleep", () => {
  it("skips the night once every player sleeps, to the alarm, and the Sherpa sleeps it too", () => {
    const { expedition, tents, world, clock } = camp();
    expedition.advance([goIn("anna"), goIn("boris")]);

    expedition.advance([chore("anna", "sleep")]);
    expect(tents.tent("anna")?.chore).toBe("sleep");
    expect(MountainClock.text(clock.timeOfDay)).toBe("22:00");

    expedition.advance([chore("boris", "sleep")]);

    expect(MountainClock.text(clock.timeOfDay)).toBe("02:00");
    expect(tents.tent("anna")?.chore).toBeNull();
    expect(tents.tent("boris")?.chore).toBeNull();
    expect(tents.tent("anna")?.slept).toMatchObject({ to: clock.elapsed });
    expect(world.slept.get("anna")).toBeGreaterThan(0);
    expect(world.slept.get("pemba")).toBe(1);
  });

  it("skips a nap's hour, and wakes the one whose sleep is shorter first", () => {
    const { expedition, tents, clock } = camp();
    expedition.advance([goIn("anna"), goIn("boris")]);

    expedition.advance([chore("anna", "sleep"), chore("boris", "nap")]);

    expect(MountainClock.text(clock.timeOfDay)).toBe("23:00");
    expect(tents.tent("boris")?.chore).toBeNull();
    expect(tents.tent("anna")?.chore).toBe("sleep");
  });

  it("sleeps through the mountain's own time while another player is awake", () => {
    const { expedition, tents, world, clock } = camp();
    expedition.advance([goIn("anna")]);

    play(expedition, 30, [chore("anna", "nap")]);

    expect(MountainClock.text(clock.timeOfDay)).toBe("22:30");
    expect(tents.tent("anna")?.progress).toBeCloseTo(0.5, 2);
    expect(world.slept.get("anna")).toBe(30 * SimulationClock.STEPS_PER_SECOND);
    expect(world.slept.has("pemba")).toBe(false);
  });

  it("wakes a sleeper who's asked to stop", () => {
    const { expedition, tents, clock } = camp();
    expedition.advance([goIn("anna")]);
    play(expedition, 10, [chore("anna", "sleep")]);

    expedition.advance([chore("anna", "stop")]);

    expect(tents.tent("anna")?.chore).toBeNull();
    expect(tents.tent("anna")?.slept?.to).toBeCloseTo(clock.elapsed, 6);
  });
});

describe("Tents: saves", () => {
  it("goes on from a save as it was: who's inside, the chore half done, the gas left", () => {
    const first = camp();
    first.world.places.set("anna", 103);
    first.expedition.advance([goIn("anna")]);
    play(first.expedition, 6, [chore("anna", "melt")]);

    const second = camp("22:00", first.expedition.save());
    second.world.places.set("anna", 103);
    play(second.expedition, 6);

    expect(second.tents.tent("anna")).toMatchObject({ chore: null });
    expect(second.tents.tent("anna")?.gas).toBeCloseTo(60, 6);
    expect(second.world.water("anna")).toBe(2);
    expect(second.world.sheltered.has("anna")).toBe(true);
  });

  it("pitches the camps afresh under a save from before there were tents to go into", () => {
    const { expedition } = camp();
    const save = expedition.save();
    const before: ExpeditionSave = {
      ...save,
      rules: { [MountainClock.NAME]: save.rules[MountainClock.NAME] ?? null },
    };

    const { expedition: resumed, tents } = camp("22:00", before);
    resumed.advance([goIn("anna")]);

    expect(tents.tent("anna")).toMatchObject({ camp: "base-camp", gas: null });
  });

  it("refuses a camp whose tents' doors or stock make no sense", () => {
    const gas = { ...PITCHED, camps: [{ id: "c", doors: [1], gas: -5, meals: 1, guitar: false }] };

    expect(() => Tents.start(gas)).toThrow(RangeError);
  });
});
