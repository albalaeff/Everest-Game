import { describe, expect, it } from "vitest";

import crowds from "../../content/facts/crowds.json";
import time from "../../content/facts/time.json";
import { SectionScale, SlopePhysics } from "../physics";
import { Expedition, MountainClock, SimulationClock } from "../simulation";
import { KnowledgeBase } from "./knowledge-base";
import { StandInRoute } from "./stand-in-route";

const HOUR = 3600;
const base = new KnowledgeBase([time, crowds]);
const compression = base.number("time.compression");

/**
 * The game's scale (#116): one ratio, `time.compression`, for the clock and the route. An hour on
 * the mountain passes in minutes of play, every section is drawn at the same share of life, and a
 * climber walking at real speed over it takes real mountain hours. The whole climb fits the spec's
 * 5–7 hours once camp skips the waits.
 */
describe("The game's scale: a mountain hour in minutes of play", () => {
  it("plays the slowest summit day on record within the 60–90 minutes the spec asks of the push", () => {
    const hours = base.number("crowds.south-col-to-summit-2026");

    const minutesOfPlay = (hours * 60) / compression;

    expect(minutesOfPlay).toBeGreaterThanOrEqual(60);
    expect(minutesOfPlay).toBeLessThanOrEqual(90);
  });

  it("fits six to eight weeks into the spec's six hours of play, once camp skips the waits", () => {
    const clock = new MountainClock(compression);
    clock.load(MountainClock.start({ date: "2026-04-10", time: "06:00" }));
    const sixHoursOfPlay = 6 * HOUR * SimulationClock.STEPS_PER_SECOND;

    for (let step = 0; step < sixHoursOfPlay; step += 1) {
      clock.advance();
    }
    const onTheMove = clock.elapsed;
    clock.skip(7 * 7 * 24 * HOUR - onTheMove);

    expect(onTheMove / HOUR).toBeGreaterThan(48);
    expect(onTheMove / HOUR).toBeLessThan(7 * 24);
    expect(clock.day).toBe(49);
    expect(clock.timeOfDay).toBe(6 * HOUR);
  });

  it("draws the stand-in section at that ratio, and the altimeter and the clock read from it", () => {
    const route = new StandInRoute();
    const physics = new SlopePhysics(route.settings);
    const clock = new MountainClock(compression);
    const expedition = Expedition.start(route.scenario(2026), [clock, physics]);
    const scale = new SectionScale(physics.terrain, route.layout.altitude);
    const player = StandInRoute.PLAYER;
    const start = physics.climber(player);

    expedition.advance([{ kind: "walk", climber: player, direction: "right" }]);
    for (let step = 1; step < 60 * SimulationClock.STEPS_PER_SECOND; step += 1) {
      expedition.advance();
    }
    const later = physics.climber(player);

    expect(scale.compression).toBeCloseTo(compression, 6);
    expect(start.altitude).toBeGreaterThanOrEqual(route.layout.altitude.start);
    expect(later.altitude).toBeLessThan(route.layout.altitude.end);
    // The altimeter climbs faster than the picture: a drawn metre stands for twelve.
    expect(later.altitude - start.altitude).toBeGreaterThan(later.y - start.y);
    expect(expedition.seconds).toBe(60);
    expect(clock.elapsed).toBe(60 * compression);
    expect(clock.start).toEqual(route.clock);
  });
});
