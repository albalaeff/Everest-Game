import { describe, expect, it } from "vitest";

import { Expedition, HazardChance, SimulationClock } from "../simulation";
import type { HazardWeather } from "../simulation";
import { KnowledgeBase } from "./knowledge-base";
import { KNOWLEDGE_FILES } from "./knowledge-files";
import { Mountain } from "./mountain";
import { Section } from "./section";

const knowledge = new KnowledgeBase(KNOWLEDGE_FILES);
const HOUR = 60 * 60;
const DAY = 24 * HOUR;

/** A climb from `seed` on the Icefall, its weather drawn or held, alone with Pemba, nobody
 * staged to train on. */
function climbOn(seed: number, weather: HazardWeather | "drawn") {
  const mountain = new Mountain(knowledge);
  const rules = mountain.rules();
  const scenario = mountain.scenario(seed, undefined, undefined, false, undefined, true, weather);
  const expedition = Expedition.start(scenario, rules.all);
  return { mountain, rules, expedition };
}

/** Plays `hours` of the mountain's time, nobody moving. */
function wait(expedition: Expedition, rules: ReturnType<Mountain["rules"]>, hours: number): void {
  const steps = Math.ceil((hours * HOUR) / rules.clock.secondsAStep);
  for (let step = 0; step < steps; step += 1) {
    expedition.advance();
  }
}

describe("the weather on the Icefall (#272)", () => {
  it("is drawn from the climb's seed: the same seed, the same days; mornings mostly clear", () => {
    const skies = (seed: number) => {
      const { rules } = climbOn(seed, "drawn");
      return Array.from({ length: 10 }, (_, day) => rules.weather.at(day * DAY + 7 * HOUR));
    };
    expect(skies(5)).toEqual(skies(5));
    let clear = 0;
    let mornings = 0;
    let afternoons = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      const { rules } = climbOn(seed, "drawn");
      for (let day = 0; day < 10; day += 1) {
        const morning = rules.weather.at(day * DAY + 7 * HOUR);
        const afternoon = rules.weather.at(day * DAY + 16 * HOUR);
        clear += morning === "clear" ? 1 : 0;
        mornings += morning === "snow" || morning === "storm" ? 1 : 0;
        afternoons += afternoon === "snow" || afternoon === "storm" ? 1 : 0;
      }
    }
    // A spring day in the Khumbu: driest in the morning, snowing more in the afternoon.
    expect(clear / 600).toBeGreaterThan(0.5);
    expect(afternoons).toBeGreaterThan(2 * mornings);
  });

  it("is what the hazards and the jolts feel each step, a storm and all", () => {
    const { rules, expedition } = climbOn(9, "storm");
    expedition.advance();
    expect([rules.hazards.weather, rules.jolts.weather]).toEqual(["storm", "storm"]);
    // In the cold of the night, a storm brings avalanches at its snow's and its wind's odds at once.
    const settings = new Mountain(knowledge).hazardSettings();
    const odds = settings.kinds.avalanche;
    const night = new HazardChance(settings).perHour("avalanche", 3 * HOUR, "storm");
    expect(night).toBeCloseTo(odds.rate * odds.snow * odds.wind, 9);
    const gust = rules.jolts.perHour("gust", 3 * HOUR, "storm");
    expect(gust).toBeGreaterThan(rules.jolts.perHour("gust", 3 * HOUR, "snow"));
  });

  it("chills a climber who stands in a storm, while one who waits out a clear night doesn't", () => {
    const stormy = climbOn(3, "storm");
    wait(stormy.expedition, stormy.rules, 3);
    const player = stormy.rules.body.climber(Section.PLAYER);
    expect(player.symptoms).toContain("cold");
    const core = stormy.rules.body.chilled(Section.PLAYER)?.core ?? 37;
    expect(core).toBeLessThan(37);
    expect(core).toBeGreaterThan(35);

    const clear = climbOn(3, "clear");
    wait(clear.expedition, clear.rules, 3);
    expect(clear.rules.body.climber(Section.PLAYER).symptoms).not.toContain("cold");
    expect(clear.rules.body.chilled(Section.PLAYER)?.core).toBe(37);
  });

  it("is forecast by Base Camp better than by the general model, from the same days", () => {
    let baseCamp = 0;
    let general = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      const { mountain, rules } = climbOn(seed, "drawn");
      const issued = 6 * HOUR;
      const right = (forecaster: "base-camp" | "general") =>
        mountain
          .forecast(forecaster, rules.weather, seed)
          .issued(issued, 5400)
          .flatMap(({ periods }) => periods)
          .filter(({ sky, from }) => {
            let worst = 0;
            const order: readonly HazardWeather[] = ["clear", "cloud", "wind", "snow", "storm"];
            for (let hour = 0; hour < 6; hour += 1) {
              const truly = rules.weather.at(from + hour * HOUR + HOUR / 2);
              worst = Math.max(worst, order.indexOf(truly));
            }
            return sky === order[worst];
          }).length;
      baseCamp += right("base-camp");
      general += right("general");
    }
    expect(baseCamp).toBeGreaterThan(general);
    expect(SimulationClock.STEPS_PER_SECOND).toBe(20);
  });
});
