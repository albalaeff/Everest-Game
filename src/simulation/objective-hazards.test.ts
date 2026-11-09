import { describe, expect, it } from "vitest";

import { Expedition } from "./expedition";
import { MountainClock } from "./mountain-clock";
import { HazardChance, ObjectiveHazards } from "./objective-hazards";
import type {
  HazardEvent,
  HazardSettings,
  HazardStart,
  HazardWeather,
  HazardZone,
} from "./objective-hazards";
import type { Scenario } from "./scenario";
import { TestGround } from "./testing/test-ground";

/** The test's own numbers, not the game's, which are the knowledge base's `hazards.*`. At a ratio
 * of 10 a step is half a mountain second, so 72 strikes an hour is a chance of 1 in 100 a step. */
const COMPRESSION = 10;
const HOUR = 3600;
/** Nobody it catches dies: the tests of who's caught leave death to the tests of death. */
const HARMLESS = { deadly: 0, deadlyClipped: 0 };
const SETTINGS: HazardSettings = {
  kinds: {
    serac: { rate: 72, warmth: 5, snow: 1, wind: 1, warning: 5, ...HARMLESS },
    avalanche: { rate: 72, warmth: 2, snow: 4, wind: 2, warning: 10, ...HARMLESS },
    crevasse: { rate: 72, warmth: 3, snow: 2, wind: 1, warning: 0, ...HARMLESS },
    cornice: { rate: 72, warmth: 2, snow: 3, wind: 4, warning: 0, ...HARMLESS },
  },
  warmth: { from: 6, peak: 14, until: 20 },
  sun: { cloud: 0.5, snow: 0 },
  training: { crack: 5 },
};
/** Every step a climber spends under a serac, it goes, and comes down at once. */
const CERTAIN: HazardSettings = {
  ...SETTINGS,
  kinds: {
    ...SETTINGS.kinds,
    serac: { rate: 100_000, warmth: 1, snow: 1, wind: 1, warning: 0, ...HARMLESS },
  },
};
/** The same serac, and it kills whoever it catches unclipped, and nobody on the rope. */
const DEADLY: HazardSettings = {
  ...CERTAIN,
  kinds: { ...CERTAIN.kinds, serac: { ...CERTAIN.kinds.serac, deadly: 1, deadlyClipped: 0 } },
};
/** The same, with a crack five mountain seconds before it comes down: ten steps at 10. */
const WARNED: HazardSettings = {
  ...SETTINGS,
  kinds: { ...SETTINGS.kinds, serac: { ...CERTAIN.kinds.serac, warning: 5 } },
};
const SERAC: HazardZone = { id: "serac", kind: "serac", from: 20, to: 30 };
const SLOPE: HazardZone = { id: "slope", kind: "avalanche", from: 50, to: 70 };

const scenario = (seed: number, time: string, start: HazardStart): Scenario => ({
  seed,
  climbers: ["first", "second"],
  start: {
    [MountainClock.NAME]: MountainClock.start({ date: "2026-04-20", time }),
    [ObjectiveHazards.NAME]: ObjectiveHazards.start(start),
  },
});

/** An expedition of the clock and the hazards alone, on ground a test moves its climbers on. */
class Exposure {
  readonly clock = new MountainClock(COMPRESSION);
  readonly hazards: ObjectiveHazards;
  readonly expedition: Expedition;

  constructor(
    readonly ground: TestGround,
    time: string,
    start: HazardStart,
    settings = SETTINGS,
    seed = 1,
  ) {
    this.hazards = new ObjectiveHazards(settings, this.clock, ground);
    this.expedition = Expedition.start(scenario(seed, time, start), [this.clock, this.hazards]);
  }

  play(steps: number): this {
    for (let step = 0; step < steps; step += 1) {
      this.expedition.advance();
    }
    return this;
  }
}

const under = (zone: HazardZone, weather: HazardWeather = "clear"): HazardStart => ({
  weather,
  zones: [zone],
});

describe("HazardChance", () => {
  const chance = new HazardChance(SETTINGS);

  it("is the kind's rate in the cold of the night, before the sun warms the ice and after", () => {
    expect(chance.perHour("serac", 4 * HOUR, "clear")).toBe(72);
    expect(chance.perHour("serac", 6 * HOUR, "clear")).toBe(72);
    expect(chance.perHour("serac", 21 * HOUR, "clear")).toBe(72);
  });

  it("rises with the day's warmth to the kind's warmth at the warmest hour, and falls back", () => {
    expect(chance.perHour("serac", 14 * HOUR, "clear")).toBe(72 * 5);
    expect(chance.perHour("serac", 10 * HOUR, "clear")).toBe(72 * 3);
    expect(chance.perHour("serac", 17 * HOUR, "clear")).toBe(72 * 3);
    expect(chance.perHour("avalanche", 14 * HOUR, "clear")).toBe(72 * 2);
  });

  it("warms the ice less under cloud, and not at all in falling snow", () => {
    expect(chance.perHour("serac", 14 * HOUR, "cloud")).toBe(72 * 3);
    expect(chance.perHour("serac", 14 * HOUR, "snow")).toBe(72);
  });

  it("is raised by snow and by wind, each kind by its own", () => {
    expect(chance.perHour("avalanche", 4 * HOUR, "snow")).toBe(72 * 4);
    expect(chance.perHour("serac", 4 * HOUR, "snow")).toBe(72);
    expect(chance.perHour("cornice", 4 * HOUR, "wind")).toBe(72 * 4);
    expect(chance.perHour("cornice", 14 * HOUR, "wind")).toBe(72 * 2 * 4);
  });

  it("refuses a day whose warmth doesn't rise to its peak and fall after it", () => {
    const warmth = { from: 14, peak: 10, until: 20 };
    expect(() => new HazardChance({ ...SETTINGS, warmth })).toThrow(RangeError);
  });
});

describe("ObjectiveHazards", () => {
  it("draws nothing while nobody is under a hazard, so the rest of the game draws as before", () => {
    const away = new Exposure(new TestGround({ first: 10, second: 40 }), "14:00", under(SERAC));
    const clockOnly = new MountainClock(COMPRESSION);
    const without = Expedition.start(scenario(1, "14:00", under(SERAC)), [clockOnly]);

    away.play(500);
    for (let step = 0; step < 500; step += 1) {
      without.advance();
    }

    expect(away.hazards.strikes).toEqual([]);
    expect(away.expedition.save().random).toEqual(without.save().random);
  });

  it("strikes a climber under a serac in the afternoon sun far more often than before dawn", () => {
    const ground = () => new TestGround({ first: 25, second: 0 });
    const dawn = new Exposure(ground(), "04:00", under(SERAC)).play(2000);
    const afternoon = new Exposure(ground(), "14:00", under(SERAC)).play(2000);

    expect(dawn.hazards.strikes.length).toBeGreaterThan(5);
    expect(afternoon.hazards.strikes.length).toBeGreaterThan(3 * dawn.hazards.strikes.length);
  });

  it("brings down more avalanches in snow than on a clear night", () => {
    const ground = () => new TestGround({ first: 60, second: 0 });
    const clear = new Exposure(ground(), "02:00", under(SLOPE)).play(2000);
    const snow = new Exposure(ground(), "02:00", under(SLOPE, "snow")).play(2000);

    expect(clear.hazards.strikes.length).toBeGreaterThan(5);
    expect(snow.hazards.strikes.length).toBeGreaterThan(2 * clear.hazards.strikes.length);
  });

  it("knocks everyone under the zone that went, and nobody else, and records the strike", () => {
    const ground = new TestGround({ first: 22, second: 30 });
    const start = { weather: "clear", zones: [SERAC, SLOPE] } as const;
    const exposure = new Exposure(ground, "14:00", start, CERTAIN);

    exposure.play(1);

    expect(ground.knocks).toEqual([
      { climber: "first", step: 0 },
      { climber: "second", step: 0 },
    ]);
    expect(exposure.hazards.strikes).toEqual([
      {
        zone: "serac",
        kind: "serac",
        step: 0,
        timeOfDay: 14 * HOUR + COMPRESSION / 20,
        climbers: ["first", "second"],
        killed: [],
      },
    ]);
  });

  it("kills a climber it catches at its kind's odds: the rope saves from the fall, not the ice", () => {
    const ground = new TestGround({ first: 22, second: 25 });
    ground.clip("second");
    const exposure = new Exposure(ground, "14:00", under(SERAC), DEADLY);

    exposure.play(1);

    expect(ground.kills).toEqual([{ climber: "first", step: 0 }]);
    expect(ground.knocks).toEqual([{ climber: "second", step: 0 }]);
    expect(exposure.hazards.strikes).toMatchObject([
      { climbers: ["first", "second"], killed: ["first"] },
    ]);
  });

  it("kills about the share of those caught its odds say", () => {
    const halfDeadly: HazardSettings = {
      ...CERTAIN,
      kinds: { ...CERTAIN.kinds, serac: { ...CERTAIN.kinds.serac, deadly: 0.5 } },
    };
    const ground = new TestGround({ first: 25, second: 0 });
    new Exposure(ground, "04:00", under(SERAC), halfDeadly).play(400);

    expect(ground.kills.length + ground.knocks.length).toBe(400);
    expect(ground.kills.length).toBeGreaterThan(150);
    expect(ground.kills.length).toBeLessThan(250);
  });

  it("warns before a serac comes down, and spares whoever gets clear in time", () => {
    const ground = new TestGround({ first: 22, second: 28 });
    const exposure = new Exposure(ground, "14:00", under(SERAC), WARNED);

    exposure.play(1);
    const warned = { warnings: exposure.hazards.warnings, at: exposure.hazards.warningAt(25) };
    ground.put("first", 35);
    exposure.play(9);
    const before = exposure.hazards.strikes.length;
    exposure.play(1);

    expect(warned.warnings).toEqual([{ zone: "serac", kind: "serac", began: 0, comes: 10 }]);
    expect(warned.at).toBe("serac");
    expect(exposure.hazards.warningAt(40)).toBeNull();
    expect(before).toBe(0);
    expect(ground.knocks).toEqual([{ climber: "second", step: 10 }]);
    expect(exposure.hazards.strikes).toMatchObject([{ step: 10, climbers: ["second"] }]);
    expect(exposure.hazards.warnings).toEqual([]);
    expect(exposure.hazards.warningAt(25)).toBeNull();
  });

  it("comes down after its warning even once everyone is clear: a near miss, kept", () => {
    const ground = new TestGround({ first: 22, second: 0 });
    const exposure = new Exposure(ground, "14:00", under(SERAC), WARNED);

    exposure.play(1);
    ground.put("first", 10);
    exposure.play(10);

    expect(ground.knocks).toEqual([]);
    expect(exposure.hazards.strikes).toMatchObject([{ zone: "serac", step: 10, climbers: [] }]);
  });

  it("gives no warning where its kind has none: a snow bridge gives way at once", () => {
    const bridge: HazardZone = { id: "bridge", kind: "crevasse", from: 20, to: 30 };
    const settings: HazardSettings = {
      ...SETTINGS,
      kinds: { ...SETTINGS.kinds, crevasse: CERTAIN.kinds.serac },
    };
    const ground = new TestGround({ first: 25, second: 0 });
    const exposure = new Exposure(ground, "04:00", under(bridge), settings);

    exposure.play(1);

    expect(exposure.hazards.warnings).toEqual([]);
    expect(ground.knocks).toEqual([{ climber: "first", step: 0 }]);
  });

  it("goes on from a save as it would have, its strikes kept", () => {
    const ground = () => new TestGround({ first: 25, second: 60 });
    const start = { weather: "snow", zones: [SERAC, SLOPE] } as const;
    const unbroken = new Exposure(ground(), "13:00", start).play(1200);
    const broken = new Exposure(ground(), "13:00", start).play(600);
    const clock = new MountainClock(COMPRESSION);
    const resumedGround = ground();
    const hazards = new ObjectiveHazards(SETTINGS, clock, resumedGround);
    const resumed = Expedition.resume(broken.expedition.save(), [clock, hazards]);

    for (let step = 600; step < 1200; step += 1) {
      resumed.advance();
    }

    expect(unbroken.hazards.strikes.length).toBeGreaterThan(0);
    expect(hazards.strikes).toEqual(unbroken.hazards.strikes);
    expect(resumed.save()).toEqual(unbroken.expedition.save());
  });

  it("keeps the weather the scenario sets, and its zones", () => {
    const exposure = new Exposure(new TestGround({}), "04:00", under(SLOPE, "wind"));

    expect(exposure.hazards.weather).toBe("wind");
    expect(exposure.hazards.zones).toEqual([SLOPE]);
  });

  it("refuses a zone that ends where it begins, or a weather it doesn't know", () => {
    const backwards = { ...SERAC, from: 30, to: 20 };
    expect(() => ObjectiveHazards.start(under(backwards))).toThrow(RangeError);
    const fog = { weather: "fog", zones: [] } as unknown as HazardStart;
    expect(() => ObjectiveHazards.start(fog)).toThrow(RangeError);
  });
});

describe("ObjectiveHazards: a collapse staged for training (#209)", () => {
  /** A serac staged to come down on 40 to 48 m along, cracking once a climber comes within 3 m. */
  const STAGED: HazardEvent = { id: "collapse", kind: "serac", from: 40, to: 48, lead: 3 };
  /** Its crack runs five mountain seconds: ten steps at 10. */
  const staged = (zones: readonly HazardZone[] = []): HazardStart => ({
    weather: "clear",
    zones,
    events: [STAGED],
  });

  it("cracks as the first climber comes within its lead, and comes down on its stretch when the crack runs out", () => {
    const ground = new TestGround({ first: 30, second: 0 });
    const exposure = new Exposure(ground, "04:00", staged());

    exposure.play(5);
    const quiet = exposure.hazards.warnings;
    ground.put("first", 37.5);
    exposure.play(1);
    const cracking = { warnings: exposure.hazards.warnings, at: exposure.hazards.warningAt(38) };
    ground.put("first", 42);
    exposure.play(10);

    expect(quiet).toEqual([]);
    expect(cracking.warnings).toEqual([{ zone: "collapse", kind: "serac", began: 5, comes: 15 }]);
    expect(cracking.at).toBe("serac");
    expect(ground.knocks).toEqual([{ climber: "first", step: 15 }]);
    expect(exposure.hazards.strikes).toEqual([
      {
        zone: "collapse",
        kind: "serac",
        step: 15,
        timeOfDay: 4 * HOUR + 8,
        climbers: ["first"],
        killed: [],
        training: true,
      },
    ]);
  });

  it("spares a climber who stops short of it, or backs off, and comes down all the same", () => {
    const ground = new TestGround({ first: 38, second: 0 });
    const exposure = new Exposure(ground, "04:00", staged());

    exposure.play(1);
    ground.put("first", 35);
    exposure.play(10);

    expect(ground.knocks).toEqual([]);
    expect(exposure.hazards.strikes).toMatchObject([{ zone: "collapse", climbers: [] }]);
  });

  it("goes once: a climber coming back past it later sets nothing off", () => {
    const ground = new TestGround({ first: 38, second: 0 });
    const exposure = new Exposure(ground, "04:00", staged());

    exposure.play(20);
    ground.put("first", 44);
    exposure.play(40);

    expect(exposure.hazards.strikes).toHaveLength(1);
    expect(exposure.hazards.warnings).toEqual([]);
  });

  it("draws nothing to go: the zones' chances come out as they would without it", () => {
    const ground = () => new TestGround({ first: 25, second: 39 });
    const without = new Exposure(ground(), "13:00", under(SERAC)).play(400);
    const withIt = new Exposure(ground(), "13:00", staged([SERAC])).play(400);

    const zones = (exposure: Exposure) =>
      exposure.hazards.strikes.filter(({ zone }) => zone === "serac");
    expect(zones(withIt)).toEqual(zones(without));
    expect(withIt.hazards.strikes.some(({ zone }) => zone === "collapse")).toBe(true);
  });

  it("goes on from a save as it would have, its crack and its strike kept", () => {
    const ground = () => new TestGround({ first: 38, second: 0 });
    const unbroken = new Exposure(ground(), "04:00", staged()).play(30);
    const broken = new Exposure(ground(), "04:00", staged()).play(5);
    const clock = new MountainClock(COMPRESSION);
    const hazards = new ObjectiveHazards(SETTINGS, clock, ground());
    const resumed = Expedition.resume(broken.expedition.save(), [clock, hazards]);
    for (let step = 5; step < 30; step += 1) {
      resumed.advance();
    }

    expect(hazards.events).toEqual([STAGED]);
    expect(resumed.save()).toEqual(unbroken.expedition.save());
  });

  it("goes on from a save of a build before training events, with none", () => {
    const exposure = new Exposure(new TestGround({ first: 38 }), "04:00", under(SERAC));
    const save = exposure.expedition.save();

    expect(save.rules[ObjectiveHazards.NAME]).not.toHaveProperty("events");
    expect(exposure.hazards.events).toEqual([]);
  });

  it("refuses an event that isn't a stretch, or a hazard it doesn't know", () => {
    const backwards = { ...STAGED, from: 48, to: 40 };
    expect(() => ObjectiveHazards.start({ ...staged(), events: [backwards] })).toThrow(RangeError);
    const flood = { ...STAGED, kind: "flood" } as unknown as HazardEvent;
    expect(() => ObjectiveHazards.start({ ...staged(), events: [flood] })).toThrow(RangeError);
  });
});
