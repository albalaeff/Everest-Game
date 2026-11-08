import { describe, expect, it } from "vitest";

import { Expedition, HazardChance, SimulationClock } from "../simulation";
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

  it("gives each expedition rules of its own, so two rooms on one server share nothing", () => {
    const mountain = new Mountain(knowledge);

    const first = mountain.rules();
    const second = mountain.rules();

    expect(first.physics).not.toBe(second.physics);
    expect(first.clock).not.toBe(second.clock);
    expect(first.body).not.toBe(second.body);
    expect(first.hazards).not.toBe(second.hazards);
    expect(first.logbook).not.toBe(second.logbook);
    expect(first.all).toEqual([
      first.clock,
      first.oxygen,
      first.body,
      first.hazards,
      first.physics,
      first.logbook,
    ]);
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
