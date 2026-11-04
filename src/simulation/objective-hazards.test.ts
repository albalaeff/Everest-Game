import { describe, expect, it } from "vitest";

import { Expedition } from "./expedition";
import { MountainClock } from "./mountain-clock";
import { HazardChance, ObjectiveHazards } from "./objective-hazards";
import type { HazardSettings, HazardStart, HazardWeather, HazardZone } from "./objective-hazards";
import type { Scenario } from "./scenario";
import { TestGround } from "./testing/test-ground";

/** The test's own numbers, not the game's, which are the knowledge base's `hazards.*`. At a ratio
 * of 10 a step is half a mountain second, so 72 strikes an hour is a chance of 1 in 100 a step. */
const COMPRESSION = 10;
const HOUR = 3600;
const SETTINGS: HazardSettings = {
  kinds: {
    serac: { rate: 72, warmth: 5, snow: 1, wind: 1 },
    avalanche: { rate: 72, warmth: 2, snow: 4, wind: 2 },
    crevasse: { rate: 72, warmth: 3, snow: 2, wind: 1 },
    cornice: { rate: 72, warmth: 2, snow: 3, wind: 4 },
  },
  warmth: { from: 6, peak: 14, until: 20 },
  sun: { cloud: 0.5, snow: 0 },
};
/** Every step a climber spends under a serac, it falls. */
const CERTAIN: HazardSettings = {
  ...SETTINGS,
  kinds: { ...SETTINGS.kinds, serac: { rate: 100_000, warmth: 1, snow: 1, wind: 1 } },
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
      },
    ]);
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
