import { describe, expect, it } from "vitest";

import icefall from "../../content/route/icefall.json";
import { Expedition, SimulationClock } from "../simulation";
import type { GameAction } from "../simulation";
import { KnowledgeBase } from "./knowledge-base";
import { KNOWLEDGE_FILES } from "./knowledge-files";
import { Mountain } from "./mountain";
import { Section } from "./section";

const knowledge = new KnowledgeBase(KNOWLEDGE_FILES);
const TEAMMATE = "teammate";

/**
 * The body on the mountain (#22): the knowledge base's numbers set how far each climber's strides
 * go, so the pace they choose shows on the slope, and in how they feel. Nobody sees a number for
 * their condition but the oximeter's. On the flat, both walk as fast as their footing lets them
 * (#150): the faster pace tells once the way goes up, its first 13 m from 20 m along.
 */
describe("The body on the mountain: the faster pace gets ahead, and tires first", () => {
  /** The mountain's minutes it lasts: to the first slope at the fastest walk, and a few metres up
   * it, as far at any `time.compression`, since the climber goes as much faster as the clock. */
  const MINUTES = 12;

  it("takes the player, at the faster pace, past their steady teammate, out of breath and tired", () => {
    // Both set off a little short of tired, from the climb before.
    const fatigue = knowledge.number("body.tired") - 0.01;
    const bodies = icefall.bodies.map((body) => ({ ...body, fatigue }));
    const mountain = new Mountain(knowledge, new Section(knowledge, { ...icefall, bodies }));
    const rules = mountain.rules();
    const expedition = Expedition.start(mountain.scenario(2026), rules.all);
    const setOff: readonly GameAction[] = [
      { kind: "pace", climber: Section.PLAYER, pace: "faster" },
      { kind: "walk", climber: Section.PLAYER, direction: "right" },
      { kind: "walk", climber: TEAMMATE, direction: "right" },
    ];

    const steps =
      (MINUTES * 60 * SimulationClock.STEPS_PER_SECOND) / knowledge.number("time.compression");
    expedition.advance(setOff);
    for (let step = 1; step < steps; step += 1) {
      expedition.advance();
    }

    const { physics, body } = rules;
    expect(physics.climber(Section.PLAYER).x).toBeGreaterThan(physics.climber(TEAMMATE).x);
    expect(body.climber(Section.PLAYER)).toMatchObject({
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
