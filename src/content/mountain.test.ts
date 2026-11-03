import { describe, expect, it } from "vitest";

import time from "../../content/facts/time.json";
import { Expedition, SimulationClock } from "../simulation";
import { KnowledgeBase } from "./knowledge-base";
import { Mountain } from "./mountain";
import { StandInRoute } from "./stand-in-route";

const knowledge = new KnowledgeBase([time]);

describe("Mountain", () => {
  it("builds the same expedition on the page and on the room server: one seed, one climb", () => {
    const page = new Mountain(knowledge);
    const server = new Mountain(knowledge);
    const pageRules = page.rules();
    const serverRules = server.rules();
    const onThePage = Expedition.start(page.scenario(7), pageRules.all);
    const onTheServer = Expedition.start(server.scenario(7), serverRules.all);
    const walk = { kind: "walk", climber: StandInRoute.PLAYER, direction: "right" } as const;

    onThePage.advance([walk]);
    onTheServer.advance([walk]);
    for (let step = 1; step < 200; step += 1) {
      onThePage.advance();
      onTheServer.advance();
    }

    expect(pageRules.physics.climber(StandInRoute.PLAYER).x).toBeGreaterThan(10.5);
    expect(serverRules.physics.climber(StandInRoute.PLAYER)).toEqual(
      pageRules.physics.climber(StandInRoute.PLAYER),
    );
    expect(onTheServer.save()).toEqual(onThePage.save());
  });

  it("runs the mountain's clock at the knowledge base's ratio", () => {
    const mountain = new Mountain(knowledge);
    const rules = mountain.rules();
    const expedition = Expedition.start(mountain.scenario(1), rules.all);

    expedition.advance();

    expect(rules.clock.elapsed).toBe(
      knowledge.number(Mountain.COMPRESSION) * SimulationClock.STEP_SECONDS,
    );
  });

  it("gives each expedition rules of its own, so two rooms on one server share nothing", () => {
    const mountain = new Mountain(knowledge);

    const first = mountain.rules();
    const second = mountain.rules();

    expect(first.physics).not.toBe(second.physics);
    expect(first.clock).not.toBe(second.clock);
    expect(first.all).toEqual([first.clock, first.physics]);
  });

  it("starts every climber of the section at its foot, so a room's players set off together", () => {
    const mountain = new Mountain(knowledge);
    const rules = mountain.rules();
    const scenario = mountain.scenario(1);
    Expedition.start(scenario, rules.all);

    for (const id of scenario.climbers) {
      expect(rules.physics.climber(id)).toMatchObject({ y: 0, falling: false });
      expect(rules.physics.climber(id).x).toBeLessThan(20);
    }
  });
});
