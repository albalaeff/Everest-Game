import { describe, expect, it } from "vitest";

import type { ClimberId, GameAction, Pace } from "../simulation";
import { Hike } from "../simulation/testing/hike";
import type { RidgeStart } from "../simulation/testing/test-ridge";
import { BodyFacts } from "./body-facts";
import { KnowledgeBase } from "./knowledge-base";
import { KNOWLEDGE_FILES } from "./knowledge-files";

const knowledge = new KnowledgeBase(KNOWLEDGE_FILES);
const { numbers } = new BodyFacts(knowledge);
const fact = (id: string): number => knowledge.number(id);
const range = (id: string) => knowledge.range(id);

const SOUTH_COL = fact("route.south-col-altitude");
const SUMMIT = fact("route.summit-altitude");
/** The sections from Camp 2 up, whose hours the paces are fitted to. */
const SECTIONS = [
  "time.camp-2-to-camp-3",
  "time.camp-3-to-south-col",
  "time.south-col-to-balcony",
  "time.balcony-to-south-summit",
  "time.south-summit-to-summit",
];
/** Summit day from the South Col: the hours the sections up take at a steady pace, and down. */
const UP = ["south-col-to-balcony", "balcony-to-south-summit", "south-summit-to-summit"]
  .map((section) => fact(`time.${section}`))
  .reduce((hours, section) => hours + section, 0);
const DOWN = fact("time.summit-to-south-col");

const walk = (climber: ClimberId): GameAction => ({ kind: "walk", climber, direction: "up" });
const pace = (climber: ClimberId, chosen: Pace["pace"]): GameAction => ({
  kind: "pace",
  climber,
  pace: chosen,
});
/** The hours from leaving the South Col, at the sources' hour, to an hour of the next day. */
const since = (hour: number): number => hour + 24 - fact("time.south-col-departure");
/** A hike on the game's own body numbers. */
const hike = (climbers: readonly RidgeStart[]): Hike => Hike.on(climbers, 0, numbers);

describe("BodyFacts: blood oxygen", () => {
  it("puts each SpO2 measured on the route at its place's altitude, falling as the route climbs", () => {
    const altitudes = numbers.saturation.map(([altitude]) => altitude);
    const readings = numbers.saturation.map(([, reading]) => reading);

    expect(altitudes[0]).toBe(0);
    expect(altitudes).toEqual([...altitudes].sort((low, high) => low - high));
    expect(readings).toEqual([...readings].sort((low, high) => high - low));
  });

  it("reads about the 70% measured climbing on oxygen, at the South Col and on the summit", () => {
    // The flows of the measurement: 2 L/min up to the South Col, 3 L/min on the summit.
    const climb = hike([
      { id: "anna", altitude: SOUTH_COL, flow: 2 },
      { id: "boris", altitude: SUMMIT, flow: 3 },
    ]);

    climb.hours(1, [walk("anna"), walk("boris")]);

    for (const id of ["anna", "boris"]) {
      const { oximeter } = climb.body.climber(id);
      expect(Math.abs(oximeter - fact("body.saturation-on-oxygen-climbing"))).toBeLessThanOrEqual(
        2,
      );
    }
    // What bottled oxygen is said to buy, a litre at a time at those flows.
    expect(numbers.oxygenGain.moving).toBeGreaterThanOrEqual(fact("oxygen.altitude-advantage") / 3);
    expect(numbers.oxygenGain.moving).toBeLessThanOrEqual(fact("oxygen.altitude-advantage") / 2);
  });

  it("reads the 95% measured resting at the South Col on 2 L/min: almost sea level's", () => {
    const rest = hike([{ id: "anna", altitude: SOUTH_COL, flow: 2 }]);

    rest.hours(1);

    expect(rest.body.climber("anna").oximeter).toBe(
      Math.round(fact("body.saturation-on-oxygen-resting")),
    );
  });

  it("leaves the capacity VO2max keeps at 3,000 m, at 5,000 m and on the summit, within 5 points", () => {
    const places = [
      { id: "anna", altitude: 3000, kept: fact("body.vo2max-3000") },
      { id: "boris", altitude: 5000, kept: fact("body.vo2max-5000") },
      { id: "vera", altitude: SUMMIT, kept: fact("body.vo2max-summit") },
    ];
    const climb = hike(places.map(({ id, altitude }) => ({ id, altitude })));

    climb.hours(
      1,
      places.map(({ id }) => walk(id)),
    );

    // Fresh, at a steady pace and carrying nothing, a climber's stride is the capacity they have.
    const shares = places.map(({ id, kept }) => ({
      left: Math.round(100 * climb.stride(id)),
      kept,
    }));
    expect(shares.map((share) => share.left)).toEqual([85, 65, 27]);
    for (const { left, kept } of shares) {
      expect(Math.abs(left - kept)).toBeLessThanOrEqual(5);
    }
    const decline = range("body.vo2max-decline");
    expect(numbers.capacity.decline).toBeGreaterThanOrEqual(decline.min);
    expect(numbers.capacity.decline).toBeLessThanOrEqual(decline.max);
  });
});

describe("BodyFacts: the paces", () => {
  it("leaves a climber surer-footed at the rest step and less at the faster pace, and less tired or not (#190)", () => {
    expect(numbers.paces["rest-step"].footing).toBe(fact("body.rest-step-footing"));
    expect(numbers.paces.faster.footing).toBe(fact("body.faster-footing"));
    expect(numbers.paces["rest-step"].footing).toBeGreaterThan(1);
    expect(numbers.paces.faster.footing).toBeLessThan(1);
    expect(numbers.footing).toEqual({
      tired: fact("body.tired-footing"),
      profoundlyTired: fact("body.profoundly-tired-footing"),
    });
    expect(numbers.footing.profoundlyTired).toBeLessThan(numbers.footing.tired);
    expect(numbers.footing.tired).toBeLessThan(1);
  });

  it("goes at the rest step and the faster pace the sections' longest and shortest hours ask", () => {
    const restStep = SECTIONS.map((id) => fact(id) / range(id).max);
    const faster = SECTIONS.map((id) => fact(id) / range(id).min);

    expect(numbers.paces.steady).toEqual({ speed: 1, effort: 1, footing: 1 });
    expect(numbers.paces["rest-step"].speed).toBeGreaterThanOrEqual(Math.min(...restStep));
    expect(numbers.paces["rest-step"].speed).toBeLessThanOrEqual(Math.max(...restStep));
    expect(numbers.paces.faster.speed).toBeGreaterThanOrEqual(Math.min(...faster));
    expect(numbers.paces.faster.speed).toBeLessThanOrEqual(Math.max(...faster));
  });
});

describe("BodyFacts: summit day", () => {
  const survivors = range("time.summit-hour-survivors");
  const back = range("time.back-at-south-col");

  it("tires a steady climber away from the South Col at 22:00 by the survivors' summit hour", () => {
    const climb = hike([{ id: "anna", altitude: SOUTH_COL }]);

    climb.hours(since(survivors.min), [walk("anna")]);
    const early = climb.body.climber("anna").tiredness;
    climb.hours(survivors.max - survivors.min);

    expect(early).toBe("fresh");
    expect(climb.body.climber("anna").tiredness).toBe("tired");
  });

  it("brings them back to the South Col tired, but able to go on, by noon to 14:00", () => {
    const climb = hike([{ id: "anna", altitude: SOUTH_COL }]);

    climb.hours(since(back.min), [walk("anna")]);
    const noon = climb.body.climber("anna");
    climb.hours(back.max - back.min);

    expect(noon).toMatchObject({ tiredness: "tired", pace: "steady" });
    expect(climb.body.climber("anna")).toMatchObject({ tiredness: "tired", pace: "steady" });
  });

  it("leaves them profoundly tired on the way down from a summit at the dead's hour, not the survivors'", () => {
    const late = hike([{ id: "anna", altitude: SOUTH_COL }]);
    const early = hike([{ id: "anna", altitude: SOUTH_COL }]);

    late.hours(since(fact("time.summit-hour-dead")), [walk("anna")]);
    const onTheSummit = late.body.climber("anna").tiredness;
    late.hours(DOWN);
    early.hours(since(survivors.max) + DOWN, [walk("anna")]);

    expect(onTheSummit).toBe("tired");
    expect(late.body.climber("anna")).toMatchObject({
      tiredness: "profoundly-tired",
      pace: "rest-step",
    });
    expect(early.body.climber("anna").tiredness).toBe("tired");
  });

  it("brings a climber at the faster pace to the summit profoundly tired, to rest-step down", () => {
    const climb = hike([{ id: "anna", altitude: SOUTH_COL }]);

    climb.hours(UP / numbers.paces.faster.speed, [walk("anna"), pace("anna", "faster")]);
    const onTheSummit = climb.body.climber("anna");
    climb.hours(DOWN / numbers.paces["rest-step"].speed);

    expect(onTheSummit).toMatchObject({ tiredness: "profoundly-tired", pace: "rest-step" });
    expect(climb.body.climber("anna").tiredness).toBe("profoundly-tired");
  });

  it("lets a climber profoundly tired on the summit rest-step down before they're exhausted", () => {
    const climb = hike([{ id: "anna", altitude: SUMMIT, fatigue: numbers.profoundlyTired }]);

    climb.hours(DOWN / numbers.paces["rest-step"].speed, [walk("anna")]);

    expect(climb.body.climber("anna")).toMatchObject({
      tiredness: "profoundly-tired",
      pace: "rest-step",
    });
  });
});

describe("BodyFacts: rest, water, food and sleep", () => {
  it("rests an exhausted climber at the South Col, below the death zone, within the hours they stay", () => {
    const stay = range("time.south-col-stay");
    const rest = hike([{ id: "anna", altitude: SOUTH_COL, fatigue: 1 }]);

    rest.hours(stay.min);

    expect(SOUTH_COL).toBeLessThan(numbers.deathZone);
    expect(rest.body.climber("anna").tiredness).toBe("fresh");
    expect(numbers.recovery).toBeLessThanOrEqual(fact("time.south-col-stay"));
  });

  it("costs a climber what the sources measured of thirst, hunger and short nights", () => {
    const dehydration = range("body.dehydration-effect");
    const eaten = range("body.energy-intake-share");

    // A climber 1% of their body mass past the threshold does 8–11% less work.
    expect(numbers.water.cost).toBeGreaterThanOrEqual(dehydration.min);
    expect(numbers.water.cost).toBeLessThanOrEqual(dehydration.max);
    // Short of a day's energy, they do as much less as climbers given no carbohydrate.
    expect(numbers.food.cost).toBe(fact("body.carbohydrate-effect"));
    // Hungry once they're shorter than a day of eating only 50–70% of what they spend leaves them.
    expect(numbers.food.hungryAfter).toBeGreaterThanOrEqual(1 - eaten.max / 100);
    expect(numbers.food.hungryAfter).toBeLessThanOrEqual(1 - eaten.min / 100);
    // Sleepy once the last 24 hours have left them no more sleep than acute sleep loss.
    expect(numbers.sleep.sleepyAfter).toBe(24 - fact("body.acute-sleep-loss"));
  });
});
