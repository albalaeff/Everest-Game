import { describe, expect, it } from "vitest";

import { Expedition } from "./expedition";
import type { ExpeditionSave } from "./expedition";
import type { Json } from "./json";
import { MountainClock } from "./mountain-clock";
import type { ClockStart } from "./mountain-clock";
import type { Scenario } from "./scenario";
import { SimulationClock } from "./simulation-clock";

/** The test's own ratio, not the game's, which is the knowledge base's `time.compression`. */
const COMPRESSION = 10;
const HOUR = 3600;
const START: ClockStart = { date: "2026-04-20", time: "04:00" };

const aClock = (start: ClockStart = START, compression = COMPRESSION): MountainClock => {
  const clock = new MountainClock(compression);
  clock.load(MountainClock.start(start));
  return clock;
};

const tick = (clock: MountainClock, steps: number): void => {
  for (let step = 0; step < steps; step += 1) {
    clock.advance();
  }
};

/** Steps of play that `seconds` of play take. */
const stepsOfPlay = (seconds: number): number => seconds * SimulationClock.STEPS_PER_SECOND;

const scenario = (seed: number, start: ClockStart = START): Scenario => ({
  seed,
  climbers: [],
  start: { [MountainClock.NAME]: MountainClock.start(start) },
});

describe("MountainClock", () => {
  it("starts at the scenario's date and time, with nothing played and nothing skipped", () => {
    const clock = aClock();

    expect(clock.start).toEqual(START);
    expect(clock.day).toBe(0);
    expect(clock.timeOfDay).toBe(4 * HOUR);
    expect(clock.elapsed).toBe(0);
  });

  it("runs as many times faster than play as it's told: a mountain hour in six minutes at 10", () => {
    const clock = aClock();

    tick(clock, SimulationClock.STEPS_PER_SECOND);
    expect(clock.elapsed).toBe(COMPRESSION);

    tick(clock, stepsOfPlay(6 * 60) - SimulationClock.STEPS_PER_SECOND);
    expect(clock.elapsed).toBe(HOUR);
    expect(clock.timeOfDay).toBe(5 * HOUR);
  });

  it("is real time at a ratio of 1", () => {
    const clock = aClock(START, 1);

    tick(clock, stepsOfPlay(90));

    expect(clock.elapsed).toBe(90);
  });

  it("doesn't drift over a whole expedition: it counts steps and doesn't add up fractions", () => {
    const tenHours = 10 * HOUR;
    const clock = new MountainClock(COMPRESSION);

    clock.load({ ...START, steps: stepsOfPlay(tenHours), skipped: 0 });

    expect(clock.elapsed).toBe(tenHours * COMPRESSION);
  });

  it("goes past midnight into the next day", () => {
    const clock = aClock({ date: "2026-05-19", time: "22:00" });

    tick(clock, stepsOfPlay((3 * HOUR) / COMPRESSION));

    expect(clock.day).toBe(1);
    expect(clock.timeOfDay).toBe(1 * HOUR);
    expect(clock.start.date).toBe("2026-05-19");
  });

  it("skips what camp skips, a night or a rest day, and goes on from there", () => {
    const clock = aClock();

    tick(clock, stepsOfPlay(60));
    clock.skip(20 * HOUR);
    tick(clock, stepsOfPlay(60));

    // Four in the morning, a minute of play at 10, 20 hours skipped and another minute: 00:20.
    expect(clock.elapsed).toBe(20 * HOUR + 2 * 60 * COMPRESSION);
    expect(clock.day).toBe(1);
    expect(clock.timeOfDay).toBe(2 * 60 * COMPRESSION);
  });

  it("never runs back", () => {
    const clock = aClock();

    expect(() => {
      clock.skip(-1);
    }).toThrow(RangeError);
    expect(() => new MountainClock(0)).toThrow(RangeError);
    expect(() => new MountainClock(-12)).toThrow(RangeError);
  });

  it.each([
    ["four", "a time in words"],
    ["4:00", "a time without its leading nought"],
    ["24:00", "an hour past the day"],
    ["04:60", "a minute past the hour"],
  ])("refuses %s, %s", (time) => {
    expect(() => aClock({ date: "2026-04-20", time })).toThrow(RangeError);
  });

  it("refuses a start date that isn't one", () => {
    expect(() => aClock({ date: "20 April 2026", time: "04:00" })).toThrow(RangeError);
  });
});

describe("MountainClock as a rule of the expedition", () => {
  const played = (steps: number, skipAt?: number): ExpeditionSave => {
    const clock = new MountainClock(COMPRESSION);
    const expedition = Expedition.start(scenario(1), [clock]);
    for (let step = 0; step < steps; step += 1) {
      if (step === skipAt) {
        clock.skip(8 * HOUR);
      }
      expedition.advance();
    }
    return expedition.save();
  };

  it("starts from the scenario's start state, which has the form of its save", () => {
    const start = scenario(1).start[MountainClock.NAME] as Json;

    expect(played(0).rules[MountainClock.NAME]).toEqual(start);
    expect(start).toEqual({ ...START, steps: 0, skipped: 0 });
  });

  it("keeps the mountain's time with the expedition's steps", () => {
    const clock = new MountainClock(COMPRESSION);
    const expedition = Expedition.start(scenario(1), [clock]);

    for (let step = 0; step < stepsOfPlay(30); step += 1) {
      expedition.advance();
    }

    expect(expedition.seconds).toBe(30);
    expect(clock.elapsed).toBe(30 * COMPRESSION);
  });

  it("goes on from a save, through JSON, as if it had never stopped, the skips included", () => {
    const whole = played(3000, 1000);

    const halfway = JSON.parse(JSON.stringify(played(1500, 1000))) as ExpeditionSave;
    const clock = new MountainClock(COMPRESSION);
    const resumed = Expedition.resume(halfway, [clock]);
    for (let step = 0; step < 1500; step += 1) {
      resumed.advance();
    }

    expect(resumed.save()).toEqual(whole);
    expect(clock.elapsed).toBe(8 * HOUR + (3000 * COMPRESSION) / SimulationClock.STEPS_PER_SECOND);
  });
});
