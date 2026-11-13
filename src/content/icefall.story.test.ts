import { describe, expect, it } from "vitest";

import icefall from "../../content/route/icefall.json";
import { SlopePhysics } from "../physics";
import type { ClimberView, Fall } from "../physics";
import { Body, Expedition, HazardChance, MountainClock } from "../simulation";
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
/** The crossings' seed. A careful crossing slips now and then (#208), and the rope holds it. The
 * crossings here are the route's, without the training events a seed stages (#209), which have
 * stories of their own. */
const SEED = 1;

/** The Icefall from `time`, on the knowledge base's rules, the hazards left out so that the
 * climber walks the same steps whatever the hour. */
function scenarioAt(mountain: Mountain, seed: number, time: string): Scenario {
  const scenario = mountain.scenario(seed, undefined, undefined, false);
  const start: ClockStart = { date: icefall.date, time };
  return {
    ...scenario,
    start: { ...scenario.start, [MountainClock.NAME]: MountainClock.start(start) },
  };
}

/** The Icefall with its climbers at Camp 1, the player where the way up arrives, to go down. */
function atCampOne(mountain: Mountain, seed: number): Scenario {
  const scenario = mountain.scenario(seed, undefined, undefined, false);
  const { layout, destination } = mountain.route;
  const climbers = layout.climbers.map((climber, index) => ({
    ...climber,
    along: destination.from + index,
  }));
  const physics = SlopePhysics.start({ ...layout, climbers });
  return { ...scenario, start: { ...scenario.start, [SlopePhysics.NAME]: physics } };
}

/** The Icefall with `more` kilograms in the player's pack than the route gives them. */
function carrying(mountain: Mountain, seed: number, more: number): Scenario {
  const scenario = mountain.scenario(seed, undefined, undefined, false);
  const bodies = mountain.route.bodies.map((body) =>
    body.id === Section.PLAYER ? { ...body, load: body.load + more } : body,
  );
  return { ...scenario, start: { ...scenario.start, [Body.NAME]: Body.start(bodies) } };
}

/** What a careful crossing from `scenario` up to Camp 1, or down to where the way up sets off,
 * took of the player, the hazards left out: the hours, and the share of their endurance. */
function crossed(
  mountain: Mountain,
  scenario: Scenario,
  way: "up" | "down",
): { readonly hours: number; readonly fatigue: number } {
  const rules = mountain.rules();
  const expedition = Expedition.start(scenario, [
    rules.clock,
    rules.oxygen,
    rules.body,
    rules.physics,
  ]);
  const crossing = new Crossing(expedition, rules.physics, Section.PLAYER, way);
  const setOff = mountain.route.layout.climbers.find(({ id }) => id === Section.PLAYER)?.along;
  const end = way === "up" ? mountain.route.destination.from : (setOff ?? 0);
  if (!crossing.until(end, LONGEST_HOURS * HOUR * (1 / rules.clock.secondsAStep))) {
    throw new Error(`Still in the Icefall after ${LONGEST_HOURS} hours, going ${way}`);
  }
  const body = rules.body.save() as unknown as {
    readonly climbers: readonly { readonly id: string; readonly fatigue: number }[];
  };
  const fatigue = body.climbers.find(({ id }) => id === Section.PLAYER)?.fatigue ?? 0;
  return { hours: rules.clock.elapsed / HOUR, fatigue };
}

/**
 * The Khumbu Icefall (#26): a careful climber at a steady pace, clipped in all the way, takes
 * the hours the sources give, in their faster half, since they never stop at an anchor as a
 * player does and the game eases the climb up its slopes (technique.uphill-cost-share, #186);
 * and the one who sets off in the night runs a fraction of the risk of one who sets off in the
 * morning (route.icefall-lessons).
 */
describe("Base Camp to Camp 1 at a steady pace, clipped in all the way", () => {
  const mountain = new Mountain(knowledge);
  const rules = mountain.rules();
  const expedition = Expedition.start(
    mountain.scenario(SEED, undefined, undefined, false),
    rules.all,
  );
  const crossing = new Crossing(expedition, rules.physics, Section.PLAYER);
  const arrived = crossing.until(
    mountain.route.destination.from,
    LONGEST_HOURS * HOUR * (1 / rules.clock.secondsAStep),
  );
  const hours = rules.clock.elapsed / HOUR;

  it("reaches Camp 1 within the hours the sources give a first crossing, in their faster half", () => {
    const sources = mountain.route.hours;
    const middle = knowledge.number("time.base-camp-to-camp-1");

    expect(arrived).toBe(true);
    expect(hours).toBeGreaterThan(sources.min + 0.25);
    expect(hours).toBeLessThan(middle - 1);
  });

  it("climbs every ladder on the way, and the steps of ice with none on the tools, and the rope holds any fall of more than a slide (#208)", () => {
    const player = rules.physics.climber(Section.PLAYER);

    expect(crossing.laddersClimbed).toEqual(mountain.route.layout.ladders.map(({ id }) => id));
    expect(crossing.facesClimbed).toEqual(rules.physics.bareFaces.map(({ foot }) => foot));
    expect(player.falls.length).toBeLessThanOrEqual(3);
    expect(player.falls.filter(({ drop }) => drop > 2).every(({ held }) => held === true)).toBe(
      true,
    );
    expect(player.dead).toBe(false);
  });

  it("arrives in the morning, before the sun is on the ice", () => {
    expect(rules.clock.timeOfDay / HOUR).toBeLessThan(10);
  });
});

describe("Experience on the ladders and ropes: a novice and a veteran, as fit as the typical client", () => {
  const sources = new Mountain(knowledge).route.hours;

  /** The hours a careful climber at a steady pace, with this experience, takes to Camp 1. */
  const hours = (experience: string): number => {
    const mountain = new Mountain(knowledge);
    const rules = mountain.rules();
    const answers = { ...mountain.questionnaire.typical, experience };
    const expedition = Expedition.start(
      mountain.scenario(SEED, answers, undefined, false),
      rules.all,
    );
    const crossing = new Crossing(expedition, rules.physics, Section.PLAYER);
    const steps = LONGEST_HOURS * HOUR * (1 / rules.clock.secondsAStep);
    if (!crossing.until(mountain.route.destination.from, steps)) {
      throw new Error(`Still in the Icefall after ${LONGEST_HOURS} hours, with ${experience}`);
    }
    return rules.clock.elapsed / HOUR;
  };

  it("takes one who has never used crampons, a jumar or a ladder about the middle of the hours the sources give", () => {
    const middle = knowledge.number("time.base-camp-to-camp-1");

    expect(Math.abs(hours("none") - middle)).toBeLessThan(0.5);
  });

  it("takes one who has climbed an 8,000 m peak about the shortest the sources give", () => {
    expect(Math.abs(hours("8000") - sources.min)).toBeLessThan(0.25);
  });

  it("takes the veteran less than the typical client, and the typical client less than the novice", () => {
    const [veteran, typical, novice] = ["8000", "alpine", "none"].map(hours);

    expect(veteran).toBeLessThan((typical ?? 0) - 0.25);
    expect(typical).toBeLessThan((novice ?? 0) - 1);
  });
});

/**
 * What the walking costs (Minetti et al. 2002, technique.walking-cost-*): up the Icefall a
 * climber is held back by their power, down it by their footing, so the way down is quicker and
 * tires them less; a heavier pack takes more of the same power.
 */
describe("The steps of ice on the tools: a second tool against the ice axe alone", () => {
  /** The hours a careful climber at a steady pace takes to Camp 1 with `tools` ice tools. */
  const hours = (tools: number): number => {
    const mountain = new Mountain(knowledge);
    const rules = mountain.rules();
    const pack = { jumar: 1, "ice-tool": tools - 1, water: 2, food: 2, oxygen: 0 };
    const expedition = Expedition.start(
      mountain.scenario(SEED, undefined, undefined, false, pack),
      rules.all,
    );
    const crossing = new Crossing(expedition, rules.physics, Section.PLAYER);
    const steps = LONGEST_HOURS * HOUR * (1 / rules.clock.secondsAStep);
    if (!crossing.until(mountain.route.destination.from, steps)) {
      throw new Error(`Still in the Icefall after ${LONGEST_HOURS} hours on ${tools} tools`);
    }
    return rules.clock.elapsed / HOUR;
  };

  it("takes a climber up the steps quicker on two tools, its weight and all, than on the axe alone", () => {
    expect(hours(2)).toBeLessThan(hours(1) - 0.1);
  });
});

describe("The cost of the steps: down from Camp 1, and up with a heavier pack", () => {
  const mountain = new Mountain(knowledge);
  const up = crossed(mountain, mountain.scenario(SEED, undefined, undefined, false), "up");

  it("comes down in about the hours of the way down from Camp 2, shared as the way up's are", () => {
    const { hours } = crossed(mountain, atCampOne(mountain, SEED), "down");
    const icefall = knowledge.number("time.base-camp-to-camp-1");
    const cwm = knowledge.number("time.camp-1-to-camp-2");
    const down = (knowledge.number("time.camp-2-to-base-camp") * icefall) / (icefall + cwm);

    expect(hours).toBeLessThan(up.hours);
    expect(Math.abs(hours - down)).toBeLessThan(0.5);
  });

  it("tires a climber less for each hour of the way down than of the way up", () => {
    const down = crossed(mountain, atCampOne(mountain, SEED), "down");

    expect(down.fatigue).toBeGreaterThan(0);
    expect(down.fatigue / down.hours).toBeLessThan(up.fatigue / up.hours);
  });

  it("takes one with 20 kg more on their back longer up, and tires them more", () => {
    const heavier = crossed(mountain, carrying(mountain, SEED, 20), "up");

    expect(heavier.hours).toBeGreaterThan(up.hours + 0.5);
    expect(heavier.fatigue).toBeGreaterThan(up.fatigue);
  });
});

describe("Slips by chance (#208): the rest step's care on the ice and the crossings, against the steady pace", () => {
  const SEEDS = [1, 2, 3, 4, 5, 6];
  /** The player at the end of a crossing to Camp 1 on `seed`, the hazards left out, careful or
   * not. */
  const crossedOn = (seed: number, careful: boolean): ClimberView => {
    const mountain = new Mountain(knowledge);
    const rules = mountain.rules();
    const expedition = Expedition.start(mountain.scenario(seed, undefined, undefined, false), [
      rules.clock,
      rules.oxygen,
      rules.body,
      rules.physics,
    ]);
    const crossing = new Crossing(expedition, rules.physics, Section.PLAYER, "up", careful);
    const steps = LONGEST_HOURS * HOUR * (1 / rules.clock.secondsAStep);
    crossing.until(mountain.route.destination.from, steps);
    return rules.physics.climber(Section.PLAYER);
  };

  it("slips a careful climber about once in two crossings, the rope holding any real fall, and a steady one more often", () => {
    const careful = SEEDS.map((seed) => crossedOn(seed, true));
    const steady = SEEDS.map((seed) => crossedOn(seed, false));
    const slips = (crossed: readonly ClimberView[]): readonly Fall[] =>
      crossed.flatMap(({ falls }) => falls);

    expect(slips(careful).length).toBeLessThanOrEqual(SEEDS.length);
    // Off the ropes, only a slide on the flat: no drop the rope didn't hold.
    expect(
      slips(careful)
        .filter(({ drop }) => drop > 2)
        .every(({ held }) => held === true),
    ).toBe(true);
    expect(careful.every(({ dead }) => !dead)).toBe(true);
    expect(slips(steady).length).toBeGreaterThan(slips(careful).length);
  });
});

describe("The training events on a careful crossing (#209)", () => {
  /** A crossing to Camp 1 on `seed` with every rule, the hazards and the training events too. */
  const trained = (seed: number) => {
    const mountain = new Mountain(knowledge);
    const rules = mountain.rules();
    const expedition = Expedition.start(mountain.scenario(seed), rules.all);
    const crossing = new Crossing(expedition, rules.physics, Section.PLAYER);
    const steps = LONGEST_HOURS * HOUR * (1 / rules.clock.secondsAStep);
    const arrived = crossing.until(mountain.route.destination.from, steps);
    return { arrived, rules, staged: mountain.route.staged(seed) };
  };

  it("brings down the serac collapse it stages, and breaks its ladder under the climber, whom the rope holds", () => {
    const { arrived, rules, staged } = trained(SEED);
    const player = rules.physics.climber(Section.PLAYER);
    const collapse = rules.hazards.strikes.filter(({ training }) => training === true);

    expect(arrived).toBe(true);
    expect(collapse).toMatchObject([{ zone: staged.collapse?.id, kind: "serac" }]);
    expect(player.falls.filter(({ broke }) => broke === true)).toMatchObject([{ held: true }]);
    expect(rules.physics.ladderCondition(staged.ladder?.id ?? "")).toBe("whole");
    expect(player.dead).toBe(false);
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
