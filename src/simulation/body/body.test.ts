import { describe, expect, it } from "vitest";

import type { ExpeditionSave } from "../expedition";
import type { ClimberId, GameAction, Pace } from "../game-action";
import { Hike } from "../testing/hike";
import { TestRidge } from "../testing/test-ridge";
import type { RidgeStart } from "../testing/test-ridge";
import { Body } from "./body";

const walk = (climber: ClimberId): GameAction => ({ kind: "walk", climber, direction: "up" });
const pace = (climber: ClimberId, chosen: Pace["pace"]): GameAction => ({
  kind: "pace",
  climber,
  pace: chosen,
});

describe("Body: blood oxygen", () => {
  it("reads SpO2 off the altitude, between the data's points, and holds it past the last", () => {
    const hike = Hike.on([
      { id: "anna", altitude: 0 },
      { id: "boris", altitude: 2500 },
      { id: "vera", altitude: 6500 },
      { id: "gleb", altitude: 9000 },
    ]);

    hike.hours(1);

    const readings = ["anna", "boris", "vera", "gleb"].map((id) => hike.body.climber(id).oximeter);
    expect(readings).toEqual([98, 89, 70, 60]);
  });

  it("feels lower on oxygen: at rest, far lower than on the move", () => {
    const hike = Hike.on([
      { id: "anna", altitude: 8000 },
      { id: "boris", altitude: 8000, flow: 2 },
      { id: "vera", altitude: 8000, flow: 2 },
    ]);

    hike.hours(1, [walk("vera")]);

    expect(hike.body.climber("anna").oximeter).toBe(60);
    // On 2 L/min, 8,000 m feels like sea level at rest, and like 7,000 m on the move.
    expect(hike.body.climber("boris").oximeter).toBe(98);
    expect(hike.body.climber("vera").oximeter).toBe(67);
  });
});

describe("Body: the stride", () => {
  it("is a fresh climber's whole stride at sea level, at a steady pace with nothing to carry", () => {
    const hike = Hike.on([{ id: "anna", altitude: 0 }]);

    hike.hours(1, [walk("anna")]);

    expect(hike.stride("anna")).toBe(1);
  });

  it("loses what the altitude takes from capacity, and what the load takes", () => {
    // Capacity falls 10% for each 1,000 m above 1,000 m; 10 kg on 70 kg leave 7/8 of the speed.
    const hike = Hike.on([
      { id: "anna", altitude: 3000 },
      { id: "boris", altitude: 3000, load: 10 },
      { id: "vera", altitude: 12000 },
    ]);

    hike.hours(1);

    expect(hike.stride("anna")).toBeCloseTo(0.8, 9);
    expect(hike.stride("boris")).toBeCloseTo(0.7, 9);
    expect(hike.stride("vera")).toBe(0);
  });

  it("goes as far as their fitness takes them: their VO2max, as a share of the typical client's", () => {
    const hike = Hike.on([
      { id: "anna", altitude: 3000, fitness: 1.25 },
      { id: "boris", altitude: 3000, fitness: 0.5, load: 10 },
    ]);

    hike.hours(1);

    expect(hike.stride("anna")).toBeCloseTo(1, 9);
    expect(hike.stride("boris")).toBeCloseTo(0.35, 9);
  });

  it("gets back with oxygen the capacity of the altitude the body feels on the move", () => {
    const hike = Hike.on([
      { id: "anna", altitude: 6000 },
      { id: "boris", altitude: 6000, flow: 2 },
    ]);

    hike.hours(1);

    expect(hike.stride("anna")).toBeCloseTo(0.5, 9);
    expect(hike.stride("boris")).toBeCloseTo(0.6, 9);
  });

  it("goes at the pace chosen: the rest step shorter than the steady pace, the faster longer", () => {
    const hike = Hike.on([
      { id: "anna", altitude: 0 },
      { id: "boris", altitude: 0 },
      { id: "vera", altitude: 0 },
    ]);

    hike.hours(0.5, [pace("anna", "rest-step"), pace("vera", "faster")]);

    expect(["anna", "boris", "vera"].map((id) => hike.stride(id))).toEqual([0.5, 1, 2]);
    expect(hike.body.climber("anna").pace).toBe("rest-step");
  });

  it("takes a climber higher on the same ridge at a faster pace", () => {
    const hike = Hike.on(
      [
        { id: "anna", altitude: 0 },
        { id: "boris", altitude: 0 },
      ],
      100,
    );

    hike.hours(1, [pace("anna", "faster"), walk("anna"), walk("boris")]);

    expect(hike.ridge.climber("anna").altitude).toBeGreaterThan(
      1.9 * hike.ridge.climber("boris").altitude,
    );
  });
});

describe("Body: fatigue", () => {
  it("rises on the move, the faster the pace the faster, and not standing still", () => {
    // Ten hours of the steady pace exhaust a fresh climber, who's tired at half of them.
    const hike = Hike.on([
      { id: "anna", altitude: 0 },
      { id: "boris", altitude: 0 },
      { id: "vera", altitude: 0 },
      { id: "gleb", altitude: 0 },
    ]);
    const tiredness = () =>
      ["anna", "boris", "vera", "gleb"].map((id) => hike.body.climber(id).tiredness);

    hike.hours(1.5, [
      pace("anna", "rest-step"),
      walk("anna"),
      walk("boris"),
      pace("vera", "faster"),
      walk("vera"),
    ]);
    const early = tiredness();
    hike.hours(4.5);

    expect(early).toEqual(["fresh", "fresh", "tired", "fresh"]);
    expect(tiredness().filter((_, index) => index !== 2)).toEqual(["fresh", "tired", "fresh"]);
  });

  it("tires a climber by the share of their stride's power their steps take", () => {
    // Where the ground holds them back to half of it, as down a gentle slope, half as fast; at the
    // faster pace held back to the steady pace's power, as fast as at the steady pace.
    const hike = Hike.on([
      { id: "anna", altitude: 0 },
      { id: "boris", altitude: 0, exertion: 0.5 },
      { id: "vera", altitude: 0, exertion: 0.5 },
    ]);

    hike.hours(6, [walk("anna"), walk("boris"), pace("vera", "faster"), walk("vera")]);

    expect(["anna", "boris", "vera"].map((id) => hike.body.climber(id).tiredness)).toEqual([
      "tired",
      "fresh",
      "tired",
    ]);
  });

  it("tires a less fit climber more on the same climb, which takes them longer", () => {
    // At half the fitness, 300 m take six hours instead of three: tired past half of ten.
    const hike = Hike.on(
      [
        { id: "anna", altitude: 0 },
        { id: "boris", altitude: 0, fitness: 0.5 },
      ],
      100,
    );

    hike.hours(3, [walk("anna"), walk("boris")]);
    const fit = hike.body.climber("anna").tiredness;
    hike.hours(3, [{ kind: "walk", climber: "anna", direction: "stop" }]);

    expect(hike.ridge.climber("boris").altitude).toBeCloseTo(
      hike.ridge.climber("anna").altitude,
      6,
    );
    expect(fit).toBe("fresh");
    expect(hike.body.climber("boris").tiredness).toBe("tired");
  });

  it("lets a profoundly tired climber only rest-step, whatever the pace chosen", () => {
    const hike = Hike.on([{ id: "anna", altitude: 0, fatigue: 0.7 }]);

    hike.hours(1, [pace("anna", "faster"), walk("anna")]);

    expect(hike.body.climber("anna")).toMatchObject({
      tiredness: "profoundly-tired",
      pace: "rest-step",
      symptoms: [],
    });
    expect(hike.stride("anna")).toBe(0.5);
  });

  it("stops an exhausted climber, until rest brings them back below profound fatigue", () => {
    const hike = Hike.on([{ id: "anna", altitude: 0, fatigue: 0.95 }]);

    hike.hours(1.75, [walk("anna")]);
    const exhausted = hike.body.climber("anna");
    const stopped = hike.ridge.climber("anna");
    hike.hours(1.25);

    expect(exhausted.tiredness).toBe("exhausted");
    expect(stopped).toMatchObject({ stride: 0, moving: false });
    expect(hike.body.climber("anna")).toMatchObject({
      tiredness: "profoundly-tired",
      pace: "rest-step",
    });
    expect(hike.ridge.climber("anna")).toMatchObject({ stride: 0.5, moving: true });
  });

  it("falls at rest, but not in the death zone without oxygen", () => {
    const hike = Hike.on([
      { id: "anna", altitude: 7000, fatigue: 0.6 },
      { id: "boris", altitude: 8500, fatigue: 0.6 },
      { id: "vera", altitude: 8500, fatigue: 0.6, flow: 1 },
    ]);

    hike.hours(2);

    const tiredness = ["anna", "boris", "vera"].map((id) => hike.body.climber(id).tiredness);
    expect(tiredness).toEqual(["fresh", "tired", "fresh"]);
  });
});

describe("Body: water, food and sleep", () => {
  it("runs short of them as the hours pass, and feels it", () => {
    // 2.4 L of water a day: thirsty past 2% of 70 kg in 14 hours; 4,800 kcal a day: hungry past
    // half a day's in 12; sleepy past 16 hours awake.
    const hike = Hike.on([{ id: "anna", altitude: 0 }]);
    const symptoms = () => hike.body.climber("anna").symptoms;

    hike.hours(13);
    const at13 = symptoms();
    hike.hours(2);
    const at15 = symptoms();
    hike.hours(2);

    expect(at13).toEqual(["hungry"]);
    expect(at15).toEqual(["thirsty", "hungry"]);
    expect(symptoms()).toEqual(["thirsty", "hungry", "sleepy"]);
  });

  it("tires a climber faster for each one they're short of", () => {
    // Each short enough to cost 40% of their endurance: 4% of body mass past the threshold, two
    // days' food, 40 hours past a night's sleep.
    const climbers = ["anna", "boris", "vera", "gleb"];
    const hike = Hike.on([
      { id: "anna", altitude: 0 },
      { id: "boris", altitude: 0, water: 4.2 },
      { id: "vera", altitude: 0, food: 9600 },
      { id: "gleb", altitude: 0, awake: 56 },
    ]);

    hike.hours(4, climbers.map(walk));

    const views = climbers.map((id) => hike.body.climber(id));
    expect(views.map((view) => view.tiredness)).toEqual(["fresh", "tired", "tired", "tired"]);
    expect(views.map((view) => view.symptoms)).toEqual([[], ["thirsty"], ["hungry"], ["sleepy"]]);
  });

  it("leaves a climber out of breath at the faster pace on the move, and not standing", () => {
    const hike = Hike.on([
      { id: "anna", altitude: 0 },
      { id: "boris", altitude: 0 },
    ]);

    hike.hours(0.5, [pace("anna", "faster"), walk("anna"), pace("boris", "faster")]);

    expect(hike.body.climber("anna").symptoms).toEqual(["out-of-breath"]);
    expect(hike.body.climber("boris").symptoms).toEqual([]);
  });
});

describe("Body: what the player sees", () => {
  it("says how a climber feels in words, with no number but the oximeter's", () => {
    const hike = Hike.on([{ id: "anna", altitude: 0, fatigue: 0.6 }]);

    hike.hours(1, [walk("anna")]);

    const view = hike.body.climber("anna");
    const numbers = Object.entries(view).filter(([, value]) => typeof value === "number");
    expect(numbers).toEqual([["oximeter", 98]]);
    expect(view).toEqual({ tiredness: "tired", symptoms: [], oximeter: 98, pace: "steady" });
  });
});

describe("Body: the same body everywhere", () => {
  it("goes on exactly from a save, through JSON as it's stored and sent", () => {
    const climbers: readonly RidgeStart[] = [
      { id: "anna", altitude: 4000, water: 1 },
      { id: "boris", altitude: 7800, flow: 1, load: 12 },
      { id: "vera", altitude: 8400, fatigue: 0.9, awake: 20 },
    ];
    const whole = Hike.on(climbers, 100);
    whole.hours(3, [pace("anna", "faster"), walk("anna"), walk("boris"), walk("vera")]);
    const halfway = JSON.parse(JSON.stringify(whole.expedition.save())) as ExpeditionSave;
    const resumed = new Hike(halfway);

    whole.hours(3, [pace("boris", "rest-step")]);
    resumed.hours(3, [pace("boris", "rest-step")]);

    expect(resumed.expedition.save()).toEqual(whole.expedition.save());
    expect(resumed.body.climber("vera")).toEqual(whole.body.climber("vera"));
  });

  it("refuses a pace for a climber it has no body for", () => {
    const scenario = TestRidge.scenario(1, [
      { id: "anna", altitude: 0 },
      { id: "boris", altitude: 0 },
    ]);
    const start = {
      ...scenario.start,
      [Body.NAME]: Body.start([{ ...TestRidge.FRESH, id: "anna" }]),
    };
    const hike = new Hike({ ...scenario, start });

    expect(() => hike.hours(0.05, [pace("boris", "faster")])).toThrow(RangeError);
  });

  it("refuses a save from before the climbers had a fitness, so an older build's climb starts anew", () => {
    const save = Hike.on([{ id: "anna", altitude: 0 }]).expedition.save();
    const body = save.rules[Body.NAME] as { seen: number; climbers: { fitness?: number }[] };
    const climbers = body.climbers.map((climber) => ({ ...climber, fitness: undefined }));
    const before = JSON.parse(
      JSON.stringify({ ...save, rules: { ...save.rules, [Body.NAME]: { ...body, climbers } } }),
    ) as ExpeditionSave;

    expect(() => new Hike(before)).toThrow(RangeError);
  });

  it("refuses a body of no mass or fitness, more than exhausted, or short of less than nothing", () => {
    const anna = { ...TestRidge.FRESH, id: "anna" };

    expect(() => Body.start([{ ...anna, mass: 0 }])).toThrow(RangeError);
    expect(() => Body.start([{ ...anna, fitness: 0 }])).toThrow(RangeError);
    expect(() => Body.start([{ ...anna, fatigue: 1.5 }])).toThrow(RangeError);
    expect(() => Body.start([{ ...anna, water: -1 }])).toThrow(RangeError);
    expect(() => Body.start([{ ...anna, load: -1 }])).toThrow(RangeError);
  });
});
