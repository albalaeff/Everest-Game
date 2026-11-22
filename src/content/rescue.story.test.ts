import { describe, expect, it } from "vitest";

import type { SherpaDoing } from "../agents";
import { Expedition } from "../simulation";
import { KnowledgeBase } from "./knowledge-base";
import { KNOWLEDGE_FILES } from "./knowledge-files";
import { Mountain } from "./mountain";
import { Section } from "./section";
import { Crossing } from "./testing/crossing";

const knowledge = new KnowledgeBase(KNOWLEDGE_FILES);
const HOUR = 3600;
const PLAYER = Section.PLAYER;
const SHERPA = "pemba";

/** A climb of the Icefall alone with Pemba, on the game's rules and numbers, with no training
 * events: the player walks up it as a careful walker does until `stop` says so. */
function climbing(seed: number, stop: (along: number) => boolean) {
  const mountain = new Mountain(knowledge);
  const rules = mountain.rules();
  const scenario = mountain.scenario(seed, undefined, undefined, false, undefined, true);
  const expedition = Expedition.start(scenario, rules.all);
  const crossing = new Crossing(expedition, rules.physics, PLAYER, "up", true);
  const { physics, clock } = rules;
  while (!stop(physics.along(PLAYER)) && clock.elapsed < 8 * HOUR) {
    crossing.step();
  }
  return { mountain, rules, expedition };
}

/** Plays on, the player doing nothing more, until they're set down in Base Camp or `hours` of
 * the mountain's have gone by since: what Pemba did meanwhile, and how long it took. */
function rescued(
  { rules, expedition }: ReturnType<typeof climbing>,
  hours: number,
): { readonly doing: ReadonlySet<SherpaDoing>; readonly hours: number } {
  const { clock, logbook, sherpa } = rules;
  const from = clock.elapsed;
  const doing = new Set<SherpaDoing>();
  expedition.advance([{ kind: "walk", climber: PLAYER, direction: "stop" }]);
  while ((logbook.page(PLAYER).evacuated ?? null) === null && clock.elapsed - from < hours * HOUR) {
    expedition.advance();
    doing.add(sherpa.view.doing);
  }
  const took = (clock.elapsed - from) / HOUR;
  // A few seconds more, in camp.
  for (let step = 0; step < 100; step += 1) {
    expedition.advance();
    doing.add(sherpa.view.doing);
  }
  return { doing, hours: took };
}

/**
 * A hard landing in the Khumbu Icefall, and the rescue (#241), on the game's own ground and
 * numbers: Pemba treats the player where they lie and carries them down the route, ladders and
 * all, to Base Camp, where the climb ends.
 */
describe("Pemba rescues the player in the Khumbu Icefall (#241)", () => {
  it("splints a leg broken past the Popcorn's crevasses, and carries the player back across both ladders to Base Camp", () => {
    // A seed on which nobody slips on the way: on seed 3 Pemba's boots go on the blue ice he
    // carries the player back over, since #290 changed what the seed draws.
    const climb = climbing(6, (along) => along >= 150);
    const { physics, logbook } = climb.rules;
    const base = climb.mountain.route.base;
    physics.injure(PLAYER, { part: "leg", kind: "fracture" }, climb.expedition.step);
    const { doing, hours } = rescued(climb, 12);
    const player = physics.climber(PLAYER);
    const pemba = physics.climber(SHERPA);

    expect(logbook.page(PLAYER).evacuated ?? null).not.toBeNull();
    expect([...doing]).toEqual(
      expect.arrayContaining(["reaching", "treating", "carrying", "evacuated"]),
    );
    expect(player).toMatchObject({ down: true, dead: false, carriedBy: null });
    expect(player.injuries).toMatchObject([{ kind: "fracture", splinted: true }]);
    expect(physics.along(PLAYER)).toBeLessThanOrEqual(base?.to ?? 0);
    expect(pemba).toMatchObject({ dead: false, carrying: null });
    expect(pemba.falls.every((fall) => fall.held !== false)).toBe(true);
    expect(physics.kitsSpent(SHERPA)).toEqual({ firstAid: 1, rescueKit: 0 });
    // The way up to there takes the walker under an hour and a half; the carry down, a casualty
    // on his back at a third of his stride, takes a few hours.
    expect(hours).toBeGreaterThan(1);
    expect(hours).toBeLessThan(8);
  });

  it("goes down his rope to a player who lies on the first crevasse's floor, hauls them out and carries them to Base Camp", () => {
    const climb = climbing(5, () => true);
    const { physics, logbook, packs } = climb.rules;
    // The floor of the first crevasse, 12 m under its ladder.
    const [ladder] = climb.mountain.route.layout.ladders.filter(
      ({ id }) => id === "first-crevasse",
    );
    const floor = ((ladder?.from ?? 0) + (ladder?.to ?? 0)) / 2;
    physics.stand(PLAYER, floor, false);
    physics.injure(PLAYER, { part: "leg", kind: "open-fracture" }, climb.expedition.step);
    const lies = physics.climber(PLAYER);
    const spots = physics.anchorSpots(PLAYER);
    const { doing, hours } = rescued(climb, 12);
    const [line] = physics.lines;
    const player = physics.climber(PLAYER);

    expect(physics.deadEnd(floor)).toBe(true);
    expect(lies).toMatchObject({ down: true });
    expect(spots).toEqual([ladder?.from, ladder?.to]);
    expect(logbook.page(PLAYER).evacuated ?? null).not.toBeNull();
    expect([...doing]).toEqual(
      expect.arrayContaining([
        "anchoring",
        "reaching",
        "treating",
        "hauling-out",
        "carrying",
        "evacuated",
      ]),
    );
    expect(line).toMatchObject({ top: ladder?.from, built: 1 });
    expect(player.injuries).toMatchObject([
      { kind: "open-fracture", tourniquet: true, splinted: true },
    ]);
    expect(player).toMatchObject({ down: true, dead: false });
    expect(physics.climber(SHERPA).falls.every((fall) => fall.held !== false)).toBe(true);
    expect(packs.pack(SHERPA).items).toMatchObject({ "first-aid": 0, "rescue-kit": 0 });
    expect(hours).toBeLessThan(6);
  });
});
