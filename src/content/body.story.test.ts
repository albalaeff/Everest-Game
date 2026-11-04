import { describe, expect, it } from "vitest";

import standIn from "../../content/route/stand-in.json";
import { Expedition, SimulationClock } from "../simulation";
import type { GameAction } from "../simulation";
import { KnowledgeBase } from "./knowledge-base";
import { KNOWLEDGE_FILES } from "./knowledge-files";
import { Mountain } from "./mountain";
import { StandInRoute } from "./stand-in-route";

const knowledge = new KnowledgeBase(KNOWLEDGE_FILES);
const TEAMMATE = "teammate";

/**
 * The body on the mountain (#22): the knowledge base's numbers set how far each climber's strides
 * go, so the pace they choose shows on the slope, and in how they feel. Nobody sees a number for
 * their condition but the oximeter's.
 */
describe("The body on the mountain: the faster pace gets ahead, and tires first", () => {
  it("takes the player, at the faster pace, past their steady teammate, out of breath and tired", () => {
    // Both set off a little short of tired, from the climb before.
    const fatigue = knowledge.number("body.tired") - 0.01;
    const bodies = standIn.bodies.map((body) => ({ ...body, fatigue }));
    const mountain = new Mountain(knowledge, new StandInRoute({ ...standIn, bodies }));
    const rules = mountain.rules();
    const expedition = Expedition.start(mountain.scenario(2026), rules.all);
    const setOff: readonly GameAction[] = [
      { kind: "pace", climber: StandInRoute.PLAYER, pace: "faster" },
      { kind: "walk", climber: StandInRoute.PLAYER, direction: "right" },
      { kind: "walk", climber: TEAMMATE, direction: "right" },
    ];

    expedition.advance(setOff);
    for (let step = 1; step < 40 * SimulationClock.STEPS_PER_SECOND; step += 1) {
      expedition.advance();
    }

    const { physics, body } = rules;
    expect(physics.climber(StandInRoute.PLAYER).x).toBeGreaterThan(physics.climber(TEAMMATE).x);
    expect(body.climber(StandInRoute.PLAYER)).toMatchObject({
      tiredness: "tired",
      symptoms: ["out-of-breath"],
      pace: "faster",
    });
    expect(body.climber(TEAMMATE)).toMatchObject({
      tiredness: "fresh",
      symptoms: [],
      pace: "steady",
    });
  });
});
