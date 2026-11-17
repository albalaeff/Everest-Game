import { describe, expect, it } from "vitest";

import { Expedition } from "./expedition";
import { Jolts } from "./jolts";
import type { JoltSettings, JoltStart, JoltZone } from "./jolts";
import { MountainClock } from "./mountain-clock";
import type { Scenario } from "./scenario";
import { TestGround } from "./testing/test-ground";

/** The test's own numbers, not the game's, which are the knowledge base's `hazards.gust-*` and
 * `hazards.twist-*`. At a ratio of 10 a step is half a mountain second, so 72 jolts an hour is a
 * chance of 1 in 100 a step. */
const COMPRESSION = 10;
const SETTINGS: JoltSettings = {
  kinds: {
    gust: { rate: 72, warmth: 5, snow: 2, wind: 10, warning: 5, slip: 1 },
    twist: { rate: 72, warmth: 3, snow: 1, wind: 2, warning: 0, slip: 1 },
  },
  warmth: { from: 6, peak: 14, until: 20 },
  sun: { cloud: 0.5, snow: 0 },
};
/** Every step a climber spends on a gust's stretch, one comes, five mountain seconds later. */
const CERTAIN: JoltSettings = {
  ...SETTINGS,
  kinds: {
    ...SETTINGS.kinds,
    gust: { ...SETTINGS.kinds.gust, rate: 100_000 },
    twist: { ...SETTINGS.kinds.twist, rate: 100_000 },
  },
};
const OPEN: JoltZone = { id: "open", kind: "gust", from: 20, to: 40 };
const LASHED: JoltZone = { id: "lashed", kind: "twist", from: 50, to: 60 };

const scenario = (seed: number, time: string, start: JoltStart): Scenario => ({
  seed,
  climbers: ["first", "second"],
  start: {
    [MountainClock.NAME]: MountainClock.start({ date: "2026-04-20", time }),
    [Jolts.NAME]: Jolts.start(start),
  },
});

/** An expedition of the clock and the jolts alone, on ground a test moves its climbers on. */
class Jolted {
  readonly clock = new MountainClock(COMPRESSION);
  readonly jolts: Jolts;
  readonly expedition: Expedition;

  constructor(
    readonly ground: TestGround,
    start: JoltStart,
    settings = SETTINGS,
    time = "03:00",
    seed = 1,
  ) {
    this.jolts = new Jolts(settings, this.clock, ground);
    this.expedition = Expedition.start(scenario(seed, time, start), [this.clock, this.jolts]);
  }

  play(steps: number): this {
    for (let step = 0; step < steps; step += 1) {
      this.expedition.advance();
    }
    return this;
  }
}

/**
 * The jolts (#197): a gust across the open slope and a lashed ladder twisting under whoever is on
 * it come from time to time, more often in the morning's warmth and in wind, and only on a
 * stretch someone is on; each shows coming first, and then slips those it catches at its chance,
 * as unsteady as they are where they stand.
 */
describe("Jolts", () => {
  it("brings a gust onto the open slope with someone on it, warned of first, and slips whom it catches", () => {
    const ground = new TestGround({ first: 30, second: 10 });
    const jolted = new Jolted(ground, { weather: "clear", zones: [OPEN] }, CERTAIN);
    jolted.play(1);
    const coming = jolted.jolts.comingTo("first");
    const below = jolted.jolts.comingTo("second");
    jolted.play(10);

    expect(coming).toBe("gust");
    expect(below).toBeNull();
    expect(jolted.jolts.jolts[0]).toMatchObject({
      zone: "open",
      kind: "gust",
      caught: ["first"],
      slipped: ["first"],
    });
    expect(ground.upsets).toEqual([{ climber: "first", step: 10 }]);
  });

  it("draws nothing on a stretch nobody is on", () => {
    const ground = new TestGround({ first: 10, second: 12 });
    const jolted = new Jolted(ground, { weather: "wind", zones: [OPEN, LASHED] }, CERTAIN);
    jolted.play(200);

    expect(jolted.jolts.jolts).toEqual([]);
    expect(jolted.jolts.warnings).toEqual([]);
  });

  it("twists a lashed ladder under whoever is on it, and spares one beside it on the ground", () => {
    const ground = new TestGround({ first: 55, second: 51 });
    ground.onto("first");
    const jolted = new Jolted(ground, { weather: "clear", zones: [LASHED] }, CERTAIN);
    jolted.play(1);

    expect(jolted.jolts.jolts[0]).toMatchObject({ kind: "twist", caught: ["first"] });
    expect(ground.upsets.map(({ climber }) => climber)).toEqual(["first"]);
  });

  it("slips nobody where nothing slips, and one braced at the share of the chance they keep", () => {
    const seeds = Array.from({ length: 40 }, (_, index) => index + 1);
    const slipped = seeds.map((seed) => {
      const each = new TestGround({ first: 25, second: 35 });
      each.steady("first", 0);
      each.steady("second", 0.5);
      new Jolted(each, { weather: "clear", zones: [OPEN] }, CERTAIN, "03:00", seed).play(11);
      return each.upsets.map(({ climber }) => climber);
    });

    expect(slipped.every((upset) => !upset.includes("first"))).toBe(true);
    const halves = slipped.filter((upset) => upset.includes("second")).length;
    expect(halves).toBeGreaterThan(10);
    expect(halves).toBeLessThan(30);
  });

  it("comes more often in the morning's warmth and in wind than in the cold of the night", () => {
    const jolts = new Jolts(SETTINGS, new MountainClock(COMPRESSION), new TestGround({}));
    const night = jolts.perHour("gust", 3 * 3600, "clear");
    const warmest = jolts.perHour("gust", 14 * 3600, "clear");
    const windy = jolts.perHour("gust", 3 * 3600, "wind");

    expect(night).toBe(72);
    expect(warmest).toBe(72 * 5);
    expect(windy).toBe(72 * 10);
  });

  it("goes on the same from a save made while a gust is on its way", () => {
    const run = (saveAt: number | null): readonly unknown[] => {
      const ground = new TestGround({ first: 30, second: 35 });
      const jolted = new Jolted(ground, { weather: "clear", zones: [OPEN] }, SETTINGS, "09:00");
      if (saveAt === null) {
        jolted.play(400);
        return jolted.jolts.jolts;
      }
      jolted.play(saveAt);
      const saved = JSON.parse(JSON.stringify(jolted.expedition.save())) as ReturnType<
        Expedition["save"]
      >;
      const clock = new MountainClock(COMPRESSION);
      const again = new Jolts(SETTINGS, clock, ground);
      const resumed = Expedition.resume(saved, [clock, again]);
      for (let step = saveAt; step < 400; step += 1) {
        resumed.advance();
      }
      return again.jolts;
    };

    expect(run(null).length).toBeGreaterThan(0);
    expect(run(137)).toEqual(run(null));
  });

  it("knows only gusts and twists, on stretches that run forward", () => {
    const start = (zone: JoltZone): unknown => Jolts.start({ weather: "clear", zones: [zone] });

    expect(() => start({ ...OPEN, kind: "serac" as never })).toThrow(RangeError);
    expect(() => start({ ...OPEN, from: 40, to: 20 })).toThrow(RangeError);
    expect(() => Jolts.start({ weather: "fog" as never, zones: [] })).toThrow(RangeError);
  });
});

describe("Jolts: brought between steps, by the god mode (#245)", () => {
  it("brings a gust on its way to a climber on its stretch now, warned of first as the chance brings one", () => {
    const ground = new TestGround({ first: 30, second: 10 });
    const jolted = new Jolted(ground, { weather: "clear", zones: [OPEN, LASHED] });

    const brought = jolted.jolts.bring("gust", "first", 0);
    const coming = jolted.jolts.warnings;
    jolted.play(11);

    expect(brought).toBe(true);
    expect(coming).toEqual([{ zone: "open", kind: "gust", began: 0, comes: 10 }]);
    expect(jolted.jolts.jolts[0]).toMatchObject({ zone: "open", kind: "gust", caught: ["first"] });
    expect(ground.upsets[0]).toEqual({ climber: "first", step: 10 });
  });

  it("brings a twist onto the lashed ladder a climber is at, and catches them on it", () => {
    const ground = new TestGround({ first: 55, second: 10 });
    ground.onto("first");
    const jolted = new Jolted(ground, { weather: "clear", zones: [OPEN, LASHED] });

    const brought = jolted.jolts.bring("twist", "first", 4);
    jolted.play(5);

    expect(brought).toBe(true);
    expect(jolted.jolts.jolts[0]).toMatchObject({ zone: "lashed", kind: "twist", step: 4 });
  });

  it("brings none where no stretch of its kind is under the climber, or one is on its way there already", () => {
    const ground = new TestGround({ first: 30, second: 10 });
    const jolted = new Jolted(ground, { weather: "clear", zones: [OPEN, LASHED] });

    const twist = jolted.jolts.bring("twist", "first", 0);
    const below = jolted.jolts.bring("gust", "second", 0);
    jolted.jolts.bring("gust", "first", 0);
    const again = jolted.jolts.bring("gust", "first", 0);

    expect([twist, below, again]).toEqual([false, false, false]);
    expect(jolted.jolts.warnings).toHaveLength(1);
  });

  it("changes the weather between steps, and a save keeps it", () => {
    const jolted = new Jolted(new TestGround({ first: 0 }), { weather: "clear", zones: [OPEN] });

    jolted.jolts.changeWeather("wind");

    expect(jolted.expedition.save().rules[Jolts.NAME]).toMatchObject({ weather: "wind" });
    expect(() => {
      jolted.jolts.changeWeather("fog" as JoltStart["weather"]);
    }).toThrow(RangeError);
  });
});
