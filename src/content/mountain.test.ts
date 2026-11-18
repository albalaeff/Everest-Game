import { describe, expect, it } from "vitest";

import { Sherpa } from "../agents";
import { Climber, SlopePhysics } from "../physics";
import type { LadderLayout } from "../physics";
import { Body, Expedition, HazardChance, ObjectiveHazards, SimulationClock } from "../simulation";
import type { HazardStart, Scenario } from "../simulation";
import { KnowledgeBase } from "./knowledge-base";
import { KNOWLEDGE_FILES } from "./knowledge-files";
import { Mountain } from "./mountain";
import type { ClimberAnswers } from "./questionnaire";
import { Section } from "./section";

const knowledge = new KnowledgeBase(KNOWLEDGE_FILES);
const HOUR = 3600;

describe("Mountain", () => {
  it("builds the same expedition on the page and on the room server: one seed, one climb", () => {
    const page = new Mountain(knowledge);
    const server = new Mountain(knowledge);
    const pageRules = page.rules();
    const serverRules = server.rules();
    const onThePage = Expedition.start(page.scenario(7), pageRules.all);
    const onTheServer = Expedition.start(server.scenario(7), serverRules.all);
    const walk = { kind: "walk", climber: Section.PLAYER, direction: "right" } as const;

    onThePage.advance([walk]);
    onTheServer.advance([walk]);
    for (let step = 1; step < 200; step += 1) {
      onThePage.advance();
      onTheServer.advance();
    }

    expect(pageRules.physics.climber(Section.PLAYER).x).toBeGreaterThan(10.5);
    expect(serverRules.physics.climber(Section.PLAYER)).toEqual(
      pageRules.physics.climber(Section.PLAYER),
    );
    expect(onTheServer.save()).toEqual(onThePage.save());
  });

  it("sets the player off as their answers make them: the typical client as the route has them, a heavy novice slower", () => {
    const mountain = new Mountain(knowledge);
    const { typical } = mountain.questionnaire;
    const walked = (answers: ClimberAnswers): number => {
      const rules = mountain.rules();
      const expedition = Expedition.start(mountain.scenario(7, answers), rules.all);
      expedition.advance([{ kind: "walk", climber: Section.PLAYER, direction: "right" }]);
      for (let step = 1; step < 200; step += 1) {
        expedition.advance();
      }
      return rules.physics.climber(Section.PLAYER).x;
    };

    expect(mountain.scenario(7, typical)).toEqual(mountain.scenario(7));
    expect(walked({ ...typical, weight: 110, training: "none" })).toBeLessThan(
      walked(typical) - 0.5,
    );
  });

  it("sets the player off with what they checked of their kit, a litre short if not their water (#196)", () => {
    const mountain = new Mountain(knowledge);
    const { typical } = mountain.questionnaire;
    const skipped = { crampons: false, lamp: false, water: false };
    const shortOf = (scenario: Scenario): Readonly<Record<string, number>> => {
      const { climbers } = scenario.start[Body.NAME] as unknown as {
        readonly climbers: readonly { readonly id: string; readonly water: number }[];
      };
      return Object.fromEntries(climbers.map(({ id, water }) => [id, water]));
    };
    const rules = mountain.rules();
    const unchecked = mountain.scenario(7, typical, skipped);
    Expedition.start(unchecked, rules.all);
    const checked = shortOf(mountain.scenario(7, typical, Climber.CHECKED));

    expect(rules.physics.climber(Section.PLAYER).kit).toEqual(skipped);
    for (const id of unchecked.climbers.filter((climber) => climber !== Section.PLAYER)) {
      expect(rules.physics.climber(id).kit).toEqual(Climber.CHECKED);
      expect(shortOf(unchecked)[id]).toBe(checked[id]);
    }
    expect(shortOf(unchecked)[Section.PLAYER]).toBe(
      (checked[Section.PLAYER] ?? 0) + knowledge.number("body.unchecked-water"),
    );
    expect(shortOf(mountain.scenario(7, typical))).toEqual(checked);
  });

  it("puts out the lamp of a player who didn't check it an hour out, and lights the rest (#196)", () => {
    const mountain = new Mountain(knowledge);
    const { typical } = mountain.questionnaire;
    const rules = mountain.rules();
    const scenario = mountain.scenario(7, typical, { ...Climber.CHECKED, lamp: false });
    const expedition = Expedition.start(scenario, rules.all);
    const hour = HOUR / knowledge.number(Mountain.COMPRESSION);
    for (let step = 0; step < 1.1 * hour * SimulationClock.STEPS_PER_SECOND; step += 1) {
      expedition.advance();
    }

    expect(rules.lamps.lit(Section.PLAYER)).toBe(false);
    expect(rules.lamps.inTheDark(Section.PLAYER)).toBe(true);
    for (const id of scenario.climbers.filter((climber) => climber !== Section.PLAYER)) {
      expect(rules.lamps.lit(id)).toBe(true);
    }
  });

  it("stages the training events from the seed: a serac collapse in a serac zone, and a long crossing's ladder to break (#209)", () => {
    const mountain = new Mountain(knowledge);
    type Staged = ReturnType<Section["staged"]>;
    const plans: Staged[] = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => mountain.route.staged(seed));
    const seracs = mountain.route.hazards.zones.filter(({ kind }) => kind === "serac");
    const { ladders } = mountain.route.layout;
    const scenario = mountain.scenario(7);
    const hazards = scenario.start[ObjectiveHazards.NAME] as unknown as HazardStart;
    const physics = scenario.start[SlopePhysics.NAME] as unknown as {
      readonly ladders: readonly LadderLayout[];
    };

    expect(mountain.route.staged(7)).toEqual(mountain.route.staged(7));
    expect(new Set(plans.map((plan) => JSON.stringify(plan))).size).toBeGreaterThan(4);
    for (const { collapse, ladder } of plans) {
      expect(collapse).not.toBeNull();
      expect(
        seracs.some(
          (zone) => (collapse?.from ?? -1) >= zone.from && (collapse?.to ?? -1) <= zone.to,
        ),
      ).toBe(true);
      expect(collapse?.lead).toBe(knowledge.number("hazards.training-serac-lead"));
      const id = ladder?.id ?? "";
      expect([
        "popcorn-crevasse",
        "wide-crevasse",
        "big-crevasse",
        "upper-crevasse",
        "top-crevasse",
      ]).toContain(id);
      expect(ladders.some((laid) => laid.id === id)).toBe(true);
    }
    // Staged for the players, not their Sherpa (#212).
    expect(hazards.events).toEqual([
      { ...mountain.route.staged(7).collapse, trainees: ["player", "teammate"] },
    ]);
    expect(physics.ladders.filter(({ breaks }) => breaks !== undefined)).toMatchObject([
      { trainees: ["player", "teammate"] },
    ]);
    const untrained = mountain.scenario(7, undefined, undefined, false);
    expect(untrained.start[ObjectiveHazards.NAME]).not.toHaveProperty("events");
  });

  it("runs the mountain's clock at the knowledge base's ratio", () => {
    const mountain = new Mountain(knowledge);
    const rules = mountain.rules();
    const expedition = Expedition.start(mountain.scenario(1), rules.all);

    expedition.advance();

    expect(rules.clock.elapsed).toBeCloseTo(
      knowledge.number(Mountain.COMPRESSION) * SimulationClock.STEP_SECONDS,
      9,
    );
  });

  it("hands the picture how far a fixed rope gives under a climber, a few per cent of its length (#232)", () => {
    const { ropeStretch } = new Mountain(knowledge);

    expect(ropeStretch).toBe(knowledge.number("gear.fixed-rope-stretch"));
    // Static rope: under the 6 % of its standard, and not nothing.
    expect(ropeStretch).toBeGreaterThan(0.01);
    expect(ropeStretch).toBeLessThan(0.06);
  });

  it("gives each expedition rules of its own, so two rooms on one server share nothing", () => {
    const mountain = new Mountain(knowledge);

    const first = mountain.rules();
    const second = mountain.rules();

    expect(first.physics).not.toBe(second.physics);
    expect(first.clock).not.toBe(second.clock);
    expect(first.body).not.toBe(second.body);
    expect(first.hazards).not.toBe(second.hazards);
    expect(first.jolts).not.toBe(second.jolts);
    expect(first.logbook).not.toBe(second.logbook);
    expect(first.packs).not.toBe(second.packs);
    expect(first.sherpa).not.toBe(second.sherpa);
    expect(first.tents).not.toBe(second.tents);
    expect(first.devices).not.toBe(second.devices);
    expect(first.all[1]).toBe(first.packs);
    expect([...first.all.slice(0, 1), ...first.all.slice(2)]).toEqual([
      first.clock,
      first.tents,
      first.oxygen,
      first.body,
      first.hazards,
      first.jolts,
      first.physics,
      first.logbook,
      first.devices,
      first.sherpa,
    ]);
  });

  it("gives every climber a radio and a tracker (#260), on the knowledge base's numbers", () => {
    const mountain = new Mountain(knowledge);
    const scenario = mountain.scenario(1);
    const rules = mountain.rules();
    const expedition = Expedition.start(scenario, rules.all);

    // A point every 10 minutes, a battery of 14 days, and a message out in a few minutes.
    expect(mountain.deviceNumbers()).toEqual({
      interval: 10 * 60,
      life: 14 * 24 * 3600,
      delivery: 3 * 60,
    });
    for (const climber of scenario.climbers) {
      expect(rules.devices.tracker(climber)).toMatchObject({ tracking: false, charge: 1 });
      expect(rules.devices.radio(climber)).toEqual({ contact: true });
    }

    expedition.advance([
      { kind: "radio", climber: Section.PLAYER, channel: "base-camp", phrase: "radio-check" },
      { kind: "tracker", climber: Section.PLAYER, do: "track" },
    ]);
    expect(rules.devices.calls).toMatchObject([{ phrase: "radio-check", heard: true }]);
    expect(rules.devices.tracker(Section.PLAYER)).toMatchObject({ tracking: true, points: 1 });
  });

  it("reads the Icefall's wind from its records (#260): still at night, a gale in a gust", () => {
    const mountain = new Mountain(knowledge);
    const { still, thermal, snow, strong, gust, scale } = mountain.windSpeeds();

    expect([still, thermal, snow, strong, gust]).toEqual([4, 12, 20, 45, 70]);
    // Each is held to the facts it was fitted to: under the breeze felt on the face at night, at
    // the warmest of a clear day about Camp II's usual wind (in m/s), the strongest the drones
    // flew in, and a gust at the low end of the storms that wreck Camp II's tents, a gale.
    const kilometresAnHour = 3.6;
    const campTwo = knowledge.range("weather.camp-2-wind");
    expect(still).toBeLessThan(knowledge.range("weather.beaufort-light-breeze").min);
    expect(still + thermal).toBeGreaterThanOrEqual(campTwo.min * kilometresAnHour);
    expect(still + thermal).toBeLessThanOrEqual(campTwo.max * kilometresAnHour);
    expect(snow).toBeGreaterThan(campTwo.min * kilometresAnHour);
    expect(snow).toBeLessThan(knowledge.range("weather.beaufort-near-gale").min);
    expect(strong).toBe(knowledge.number("weather.icefall-drone-wind"));
    expect(strong).toBeLessThan(knowledge.range("weather.beaufort-near-gale").min);
    const gale = knowledge.range("weather.beaufort-gale");
    expect(gust).toBeGreaterThanOrEqual(gale.min);
    expect(gust).toBeLessThanOrEqual(gale.max);
    expect(gust).toBe(knowledge.range("weather.camp-2-storm-wind").min);
    expect(mountain.dayWarmth().at(14 * 3600, "clear")).toBe(1);
    // The names the meter gives a wind start where the Beaufort scale's forces do.
    expect(scale).toEqual({ breeze: 6, fresh: 29, strong: 50, gale: 62 });
  });

  it("reads the air from its records (#260): Base Camp's April, colder a kilometre higher", () => {
    const mountain = new Mountain(knowledge);
    const { days, coldest, warmest, lapse, station } = mountain.airSettings();

    expect(days).toEqual({
      clear: { min: -10, max: 2 },
      cloud: { min: -7, max: -2 },
      snow: { min: -6, max: -3 },
      wind: { min: -13, max: -6 },
    });
    expect([coldest, warmest]).toEqual([6, 13]);
    expect(lapse).toBeCloseTo(6.6, 9);
    expect(station).toBe(5315);
    // Held to what the station and the climbers measured: within April's nights and afternoons,
    // never as cold as the spring's lowest or as warm as the shade's highest of 1953; coldest as
    // the sun comes onto the ice.
    const april = knowledge.range("weather.base-camp-april-temperatures");
    for (const { min, max } of Object.values(days)) {
      expect(min).toBeGreaterThanOrEqual(april.min);
      expect(max).toBeLessThanOrEqual(april.max);
      expect(min).toBeGreaterThan(knowledge.number("weather.base-camp-spring-lowest"));
      expect(max).toBeLessThan(knowledge.number("weather.icefall-shade-high"));
    }
    expect(coldest).toBe(mountain.hazardSettings().warmth.from);
    expect(lapse).toBe(knowledge.number("weather.premonsoon-lapse-rate"));
    // Carried up to the summit by the lapse rate, a clear day spans what the summit measured in
    // mid-May.
    const colder = (lapse * (knowledge.number("route.summit-altitude") - station)) / 1000;
    const summit = knowledge.range("weather.summit-temperature");
    expect(days.clear.min - colder).toBeLessThanOrEqual(summit.min);
    expect(days.clear.max - colder).toBeGreaterThanOrEqual(summit.max);
  });

  it("reads the wind chill from its records (#260): the index, the meter's factor and Canada's bands", () => {
    const { risks, ...index } = new Mountain(knowledge).windChill();

    expect(index).toEqual({
      constant: 13.12,
      air: 0.6215,
      wind: 11.37,
      airInWind: 0.3965,
      power: 0.16,
      warmest: 10,
      calmest: 4.8,
      factor: 1.5,
    });
    expect(risks).toEqual({
      moderate: { from: -10, freezes: null },
      high: { from: -28, freezes: { min: 10, max: 30 } },
      "very-high": { from: -40, freezes: { min: 5, max: 10 } },
      severe: { from: -48, freezes: { min: 2, max: 5 } },
      extreme: { from: -55, freezes: { min: 2, max: 2 } },
    });
  });

  it("gives the climbers their Sherpa, Pemba (#212): an NPC who guides the players, on the knowledge base's numbers", () => {
    const mountain = new Mountain(knowledge);
    const together = mountain.scenario(1);
    const alone = mountain.scenario(1, undefined, undefined, true, undefined, true);
    const settings = mountain.sherpaSettings();

    expect(together).toMatchObject({ climbers: ["player", "teammate", "pemba"], npcs: ["pemba"] });
    expect(together.start[Sherpa.NAME]).toMatchObject({
      climber: "pemba",
      clients: ["player", "teammate"],
      arrival: { from: mountain.route.destination.from, to: mountain.route.destination.to },
    });
    // Alone, the player climbs with Pemba, and nobody has a teammate's seat.
    expect(alone).toMatchObject({ climbers: ["player", "pemba"], npcs: ["pemba"] });
    expect(alone.start[Sherpa.NAME]).toMatchObject({ clients: ["player"] });
    expect(Expedition.start(alone, mountain.rules().all).scenario.climbers).toHaveLength(2);
    expect(settings).toEqual({
      lead: {
        near: knowledge.range("technique.sherpa-lead").min,
        far: knowledge.range("technique.sherpa-lead").max,
      },
      wait: knowledge.number("technique.sherpa-wait"),
      behind: {
        near: knowledge.range("technique.sherpa-behind").min,
        far: knowledge.range("technique.sherpa-behind").max,
      },
      rest: knowledge.number("technique.sherpa-rest") * 60,
      pass: knowledge.number("technique.sherpa-pass"),
      reach: knowledge.number("technique.haul-reach"),
      aid: knowledge.number("technique.rescue-reach"),
    });
    // He carries a client who can't walk down to the camp the section sets off from (#241).
    expect(together.start[Sherpa.NAME]).toMatchObject({
      base: { from: mountain.route.camps[0]?.from, to: mountain.route.camps[0]?.to },
    });
    expect(settings.lead.near).toBeLessThan(settings.lead.far);
    expect(settings.lead.far).toBeLessThan(settings.wait);
  });

  it("lays the route's hazards, in its weather, where the climbers start clear of them", () => {
    const mountain = new Mountain(knowledge);
    const rules = mountain.rules();
    const scenario = mountain.scenario(1);
    Expedition.start(scenario, rules.all);

    expect(rules.hazards.weather).toBe(mountain.route.hazards.weather);
    expect(rules.hazards.zones.map((zone) => zone.kind)).toEqual([
      "crevasse",
      "crevasse",
      "serac",
      "serac",
      "serac",
      "avalanche",
      "crevasse",
    ]);
    for (const id of scenario.climbers) {
      const along = rules.physics.along(id);
      expect(rules.hazards.zones.every((zone) => along < zone.from)).toBe(true);
    }
  });

  it("hands the hazards the knowledge base's numbers: the afternoon worse than the dawn", () => {
    const mountain = new Mountain(new KnowledgeBase(KNOWLEDGE_FILES));
    const chance = new HazardChance(mountain.hazardSettings());

    expect(mountain.hazardSettings().kinds.serac.rate).toBe(knowledge.number("hazards.serac-rate"));
    for (const kind of ["serac", "avalanche", "crevasse", "cornice"] as const) {
      expect(chance.perHour(kind, 14 * HOUR, "clear")).toBeGreaterThan(
        chance.perHour(kind, 4 * HOUR, "clear"),
      );
    }
    expect(chance.perHour("avalanche", 4 * HOUR, "snow")).toBeGreaterThan(
      chance.perHour("avalanche", 4 * HOUR, "clear"),
    );
  });

  it("starts every climber of the section at its foot, so a room's players set off together", () => {
    const mountain = new Mountain(knowledge);
    const rules = mountain.rules();
    const scenario = mountain.scenario(1);
    Expedition.start(scenario, rules.all);

    for (const id of scenario.climbers) {
      const climber = rules.physics.climber(id);
      expect(climber).toMatchObject({ y: rules.physics.terrain.height(climber.x), falling: false });
      expect(climber.x).toBeLessThan(20);
    }
  });
});
