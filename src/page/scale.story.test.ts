import { describe, expect, it } from "vitest";

import { SectionScale, SlopePhysics } from "../physics";
import { Expedition, MountainClock, SimulationClock } from "../simulation";
import { KnowledgeBase } from "../content/knowledge-base";
import { KNOWLEDGE_FILES } from "../content/knowledge-files";
import { Mountain } from "../content/mountain";
import { Section } from "../content/section";

const HOUR = 3600;
const base = new KnowledgeBase(KNOWLEDGE_FILES);
const compression = base.number("time.compression");
const drawnScale = base.number("route.drawn-scale");

/**
 * The game's scale (#116, #167): the mountain's clock runs `time.compression` times faster than
 * play, and every section is drawn at 1/`route.drawn-scale` of life, so a climber goes the one
 * over the other times faster than in life over the drawn ground, three times, and still takes
 * real mountain hours. An hour on the mountain passes in under two minutes of play, and the whole
 * climb fits the spec's two hours once camp skips the waits.
 */
describe("The game's scale: a mountain hour in under two minutes of play", () => {
  it("plays the slowest summit day on record within the 20–30 minutes the spec asks of the push", () => {
    const hours = base.number("crowds.south-col-to-summit-2026");

    const minutesOfPlay = (hours * 60) / compression;

    expect(minutesOfPlay).toBeGreaterThanOrEqual(20);
    expect(minutesOfPlay).toBeLessThanOrEqual(30);
  });

  it("fits six to eight weeks into the spec's two hours of play, once camp skips the waits", () => {
    const clock = new MountainClock(compression);
    clock.load(MountainClock.start({ date: "2026-04-10", time: "06:00" }));
    const twoHoursOfPlay = 2 * HOUR * SimulationClock.STEPS_PER_SECOND;

    for (let step = 0; step < twoHoursOfPlay; step += 1) {
      clock.advance();
    }
    const onTheMove = clock.elapsed;
    clock.skip(7 * 7 * 24 * HOUR - onTheMove);

    expect(onTheMove / HOUR).toBeGreaterThan(48);
    expect(onTheMove / HOUR).toBeLessThan(7 * 24);
    expect(clock.day).toBe(49);
    expect(clock.timeOfDay).toBe(6 * HOUR);
  });

  it("draws the Icefall at its scale, and the altimeter and the clock read from it", () => {
    const route = new Section(base);
    const physics = new SlopePhysics(route.settings);
    const clock = new MountainClock(compression);
    const expedition = Expedition.start(route.scenario(2026), [clock, physics]);
    const scale = new SectionScale(physics.terrain, route.layout.altitude);
    const player = Section.PLAYER;
    const start = physics.climber(player);

    expedition.advance([{ kind: "walk", climber: player, direction: "right" }]);
    for (let step = 1; step < 60 * SimulationClock.STEPS_PER_SECOND; step += 1) {
      expedition.advance();
    }
    const later = physics.climber(player);

    expect(Math.abs(scale.ratio / drawnScale - 1)).toBeLessThan(0.01);
    expect(start.altitude).toBeGreaterThanOrEqual(route.layout.altitude.start);
    expect(later.altitude).toBeLessThan(route.layout.altitude.end);
    // The altimeter climbs faster than the picture: a drawn metre stands for twelve.
    expect(later.altitude - start.altitude).toBeGreaterThan(later.y - start.y);
    expect(expedition.seconds).toBe(60);
    expect(clock.elapsed).toBe(60 * compression);
    expect(clock.start).toEqual(route.clock);
  });

  it("walks the climber faster than in life by the clock's ratio over the drawing's, and slower up the first slope than on Base Camp's flat", () => {
    const mountain = new Mountain(base);
    const rules = mountain.rules();
    const expedition = Expedition.start(mountain.scenario(2026), rules.all);
    const player = Section.PLAYER;
    const along = (): number => rules.physics.along(player);
    /** The metres along the ground the climber walks in the next second of play. */
    const aSecond = (): number => {
      const from = along();
      for (let step = 0; step < SimulationClock.STEPS_PER_SECOND; step += 1) {
        expedition.advance();
      }
      return along() - from;
    };

    expedition.advance([{ kind: "walk", climber: player, direction: "right" }]);
    const flat = aSecond();
    for (let step = 0; along() < 21 && step < 60 * SimulationClock.STEPS_PER_SECOND; step += 1) {
      expedition.advance();
    }
    const up = aSecond();

    // The typical client's footing holds them to the fastest walk on the flat, sped up.
    expect(flat).toBeCloseTo((compression / drawnScale) * base.number("technique.fastest-walk"), 9);
    expect(along()).toBeLessThan(mountain.route.layout.ladders[0]?.from ?? 0);
    expect(up).toBeGreaterThan(0);
    expect(up).toBeLessThan(flat);
  });
});
