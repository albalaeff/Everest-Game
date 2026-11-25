import { describe, expect, it } from "vitest";

import { Expedition, SimulationClock } from "../simulation";
import { KnowledgeBase } from "./knowledge-base";
import { KNOWLEDGE_FILES } from "./knowledge-files";
import { Mountain } from "./mountain";
import { Section } from "./section";
import { Crossing } from "./testing/crossing";

const knowledge = new KnowledgeBase(KNOWLEDGE_FILES);
const HOUR = 3600;
/** Longer than any crossing the sources give: a walker still short of Camp 1 after it is lost. */
const LONGEST_HOURS = 8;
const SHERPA = "pemba";

/** What a crossing of the Icefall alone, by a walker careful or not, guided by Pemba on the game's
 * rules and numbers, showed of him, step by step: who was ahead, what he did, where he stood still
 * under the seracs, and how the player's falls ended. */
function guided(seed: number, careful: boolean, training: boolean) {
  const mountain = new Mountain(knowledge);
  const rules = mountain.rules();
  const scenario = mountain.scenario(seed, undefined, undefined, training, undefined, true);
  const expedition = Expedition.start(scenario, rules.all);
  const crossing = new Crossing(expedition, rules.physics, Section.PLAYER, "up", careful);
  const { physics, sherpa, hazards, clock } = rules;
  const end = mountain.route.destination.from;
  const seracs = hazards.zones.filter(({ kind }) => kind === "serac");
  const held = new Set<string>();
  const doing = new Set<string>();
  let steps = 0;
  let ahead = 0;
  let still = 0;
  let longestStill = 0;
  while (physics.along(Section.PLAYER) < end && clock.elapsed < LONGEST_HOURS * HOUR) {
    crossing.step();
    steps += 1;
    const view = sherpa.view;
    const pemba = physics.climber(SHERPA);
    const along = physics.along(SHERPA);
    if (along > physics.along(Section.PLAYER)) {
      ahead += 1;
    }
    if (view.ladder !== null) {
      held.add(view.ladder);
    }
    doing.add(view.doing);
    const under = seracs.some(({ from, to }) => along >= from && along <= to);
    still = under && !pemba.moving && !pemba.falling && view.doing !== "holding" ? still + 1 : 0;
    longestStill = Math.max(longestStill, still);
  }
  return {
    mountain,
    rules,
    arrived: physics.along(Section.PLAYER) >= end,
    ahead: ahead / steps,
    held,
    doing,
    longestStill,
  };
}

describe("Pemba guides the player through the Khumbu Icefall (#212)", () => {
  it("leads a careful player all the way to Camp 1, first across every ladder, holding its line from the far end, and never waits under the seracs", () => {
    // A seed with no slip of the player's to wait out (#278): on seed 2 they slip just above the
    // crux's step of ice, since the cowstails go across at the walls' ladders and the seed draws
    // otherwise (#305), and on seed 3 at the foot of the first step.
    const { mountain, rules, arrived, ahead, held, longestStill } = guided(12, true, false);
    const pemba = rules.physics.climber(SHERPA);

    expect(arrived).toBe(true);
    expect(ahead).toBeGreaterThan(0.9);
    expect([...held].sort()).toEqual([...rules.physics.ladders].sort());
    // The longest he stood still under the seracs was a changeover of his cowstails at an anchor:
    // two clips at his technique's pace (#197), and a step for each unclip.
    const { technique = 1 } = mountain.route.layout.climbers.find(({ id }) => id === SHERPA) ?? {};
    const clip = (mountain.route.settings.clip / technique) * SimulationClock.STEPS_PER_SECOND;
    expect(longestStill).toBeLessThanOrEqual(2 * Math.ceil(clip) + 5);
    expect(pemba.dead).toBe(false);
    expect(pemba.falls.every((fall) => fall.held !== false)).toBe(true);
    expect(rules.physics.along(SHERPA)).toBeGreaterThanOrEqual(mountain.route.destination.from);
  });

  it("pulls the player out when the ladder staged to break gives way under them near his end, and sits with them on safe ground", () => {
    const { rules, arrived, doing } = guided(1, false, true);
    const player = rules.physics.climber(Section.PLAYER);
    const broke = player.falls.find((fall) => fall.broke === true);

    expect(broke).toMatchObject({ held: true, pulled: true });
    expect([...doing]).toEqual(expect.arrayContaining(["holding", "rescuing", "resting"]));
    expect(arrived).toBe(true);
    expect(rules.physics.climber(SHERPA).dead).toBe(false);
  });
});
