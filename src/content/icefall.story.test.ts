import { describe, expect, it } from "vitest";

import icefall from "../../content/route/icefall.json";
import { Expedition, HazardChance, MountainClock } from "../simulation";
import type { ClockStart, Scenario } from "../simulation";
import { KnowledgeBase } from "./knowledge-base";
import { KNOWLEDGE_FILES } from "./knowledge-files";
import { Mountain } from "./mountain";
import { Section } from "./section";
import { Crossing } from "./testing/crossing";

const knowledge = new KnowledgeBase(KNOWLEDGE_FILES);
const HOUR = 3600;
/** Longer than any crossing the sources give: a walker still short of Camp 1 after it is lost. */
const LONGEST_HOURS = 8;
/** The crossings' seed: one on which no ladder slips, with the hazards' draws and without them.
 * A slip off a ladder over a crevasse leaves the climber hanging, and the crossing lost. */
const SEED = 1;

/** The Icefall from `time`, on the knowledge base's rules, the hazards left out so that the
 * climber walks the same steps whatever the hour. */
function scenarioAt(mountain: Mountain, seed: number, time: string): Scenario {
  const scenario = mountain.scenario(seed);
  const start: ClockStart = { date: icefall.date, time };
  return {
    ...scenario,
    start: { ...scenario.start, [MountainClock.NAME]: MountainClock.start(start) },
  };
}

/**
 * The Khumbu Icefall (#26): a careful climber at a steady pace, clipped in all the way, takes
 * about the hours the sources give, and the one who sets off in the night runs a fraction of the
 * risk of one who sets off in the morning (route.icefall-lessons).
 */
describe("Base Camp to Camp 1 at a steady pace, clipped in all the way", () => {
  const mountain = new Mountain(knowledge);
  const rules = mountain.rules();
  const expedition = Expedition.start(mountain.scenario(SEED), rules.all);
  const crossing = new Crossing(expedition, rules.physics, Section.PLAYER);
  const arrived = crossing.until(
    mountain.route.destination.from,
    LONGEST_HOURS * HOUR * (1 / rules.clock.secondsAStep),
  );
  const hours = rules.clock.elapsed / HOUR;

  it("reaches Camp 1 within the hours the sources give a first crossing, about the middle", () => {
    const sources = mountain.route.hours;
    const middle = knowledge.number("time.base-camp-to-camp-1");

    expect(arrived).toBe(true);
    expect(hours).toBeGreaterThanOrEqual(sources.min);
    expect(hours).toBeLessThanOrEqual(sources.max);
    expect(Math.abs(hours - middle)).toBeLessThan(1);
  });

  it("climbs every ladder on the way, and never falls", () => {
    const player = rules.physics.climber(Section.PLAYER);

    expect(crossing.laddersClimbed).toEqual(mountain.route.layout.ladders.map(({ id }) => id));
    expect(player.falls).toEqual([]);
    expect(player.dead).toBe(false);
  });

  it("arrives in the morning, before the sun is on the ice", () => {
    expect(rules.clock.timeOfDay / HOUR).toBeLessThan(10);
  });
});

describe("Experience on the ladders and ropes: a novice and a veteran, as fit as the typical client", () => {
  /** The shortest a first crossing takes in Alan Arnette's table of the routes, 4–6 hours
   * (time.base-camp-to-camp-1), which a veteran's share of the speed is fitted to. */
  const ARNETTE_SHORTEST = 4;

  /** The hours a careful climber at a steady pace, with this experience, takes to Camp 1. */
  const hours = (experience: string): number => {
    const mountain = new Mountain(knowledge);
    const rules = mountain.rules();
    const answers = { ...mountain.questionnaire.typical, experience };
    const expedition = Expedition.start(mountain.scenario(SEED, answers), rules.all);
    const crossing = new Crossing(expedition, rules.physics, Section.PLAYER);
    const steps = LONGEST_HOURS * HOUR * (1 / rules.clock.secondsAStep);
    if (!crossing.until(mountain.route.destination.from, steps)) {
      throw new Error(`Still in the Icefall after ${LONGEST_HOURS} hours, with ${experience}`);
    }
    return rules.clock.elapsed / HOUR;
  };

  it("takes one who has never used crampons, a jumar or a ladder about the longest hours the sources give", () => {
    const { max } = new Mountain(knowledge).route.hours;
    const novice = hours("none");

    expect(novice).toBeLessThanOrEqual(max);
    expect(max - novice).toBeLessThan(0.25);
  });

  it("takes one who has climbed an 8,000 m peak about the shortest of Arnette's", () => {
    expect(Math.abs(hours("8000") - ARNETTE_SHORTEST)).toBeLessThan(0.25);
  });
});

describe("Leaving early is safer: the night's crossing against the morning's", () => {
  /** The chance a hazard goes on the climber, summed over every step they're under one, on a
   * crossing that sets off at `time`. */
  const risk = (time: string): number => {
    const mountain = new Mountain(knowledge);
    const rules = mountain.rules();
    const chance = new HazardChance(mountain.hazardSettings());
    const { zones, weather } = mountain.route.hazards;
    const expedition = Expedition.start(scenarioAt(mountain, SEED, time), [
      rules.clock,
      rules.oxygen,
      rules.body,
      rules.physics,
    ]);
    const crossing = new Crossing(expedition, rules.physics, Section.PLAYER);
    let risk = 0;
    const steps = LONGEST_HOURS * HOUR * (1 / rules.clock.secondsAStep);
    for (let step = 0; step < steps; step += 1) {
      crossing.step();
      const along = rules.physics.along(Section.PLAYER);
      if (along >= mountain.route.destination.from) {
        return risk;
      }
      for (const zone of zones) {
        if (along >= zone.from && along <= zone.to) {
          const { secondsAStep, timeOfDay } = rules.clock;
          risk += chance.within(secondsAStep, zone.kind, timeOfDay, weather);
        }
      }
    }
    throw new Error(`Still in the Icefall after ${LONGEST_HOURS} hours from ${time}`);
  };

  it("runs less than half the risk from 03:00 as from 10:00, on the same steps", () => {
    const night = risk("03:00");
    const morning = risk("10:00");

    expect(night).toBeGreaterThan(0);
    expect(night).toBeLessThan(morning / 2);
  });
});
