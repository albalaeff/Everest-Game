import { describe, expect, it } from "vitest";

import { ClimberFacts } from "./climber-facts";
import { KnowledgeBase } from "./knowledge-base";
import { KNOWLEDGE_FILES } from "./knowledge-files";
import { Questionnaire } from "./questionnaire";
import type { ClimberAnswers } from "./questionnaire";

const knowledge = new KnowledgeBase(KNOWLEDGE_FILES);
const questionnaire = new Questionnaire();
const facts = new ClimberFacts(knowledge, questionnaire);
const number = (id: string): number => knowledge.number(id);
const { typical } = questionnaire;

/** The typical client, but for what `changes` says. */
const client = (changes: Partial<ClimberAnswers>): ClimberAnswers => ({ ...typical, ...changes });

describe("ClimberFacts: what the player's answers make of their climber", () => {
  it("makes the typical client as the body's and the physics' numbers have them: 1 and 1, at their mass", () => {
    expect(facts.climber(typical)).toEqual({ mass: typical.weight, fitness: 1, technique: 1 });
  });

  it("estimates VO2max as Jackson et al. do, from sex, age, BMI and the activity scale", () => {
    const man = client({ sex: "male", age: 30, height: 180, weight: 75, training: "hard-more" });
    const bmi = 75 / 1.8 ** 2;
    const jackson =
      number("body.vo2max-estimate-base") +
      7 * number("body.vo2max-estimate-activity") -
      30 * number("body.vo2max-estimate-age") -
      bmi * number("body.vo2max-estimate-bmi") +
      number("body.vo2max-estimate-sex");

    expect(facts.vo2max(man)).toBeCloseTo(jackson, 9);
    expect(facts.vo2max(man)).toBeCloseTo(51.9, 1);
    expect(facts.vo2max(typical)).toBeCloseTo(39.7, 1);
  });

  it("puts one who'd rather not say their sex halfway between a woman and a man", () => {
    const [woman, undisclosed, man] = (["female", "undisclosed", "male"] as const).map((sex) =>
      facts.vo2max(client({ sex })),
    );

    expect(undisclosed).toBeCloseTo(((woman ?? 0) + (man ?? 0)) / 2, 9);
  });

  it("makes a heavier, older, less trained climber less fit, and a fitter one more", () => {
    const heavy = facts.climber(client({ weight: 100 }));
    const unfit = facts.climber(client({ age: 55, weight: 95, training: "walks" }));
    const fit = facts.climber(client({ age: 30, weight: 68, training: "hard-more" }));

    expect(heavy.mass).toBe(100);
    expect(heavy.fitness).toBeLessThan(0.9);
    expect(unfit.fitness).toBeLessThan(0.6);
    expect(fit.fitness).toBeGreaterThan(1.15);
  });

  it("never estimates below the VO2max of independence, where the equation's lines run on", () => {
    const frail = client({ age: 80, height: 140, weight: 160, training: "none", sex: "female" });

    expect(facts.vo2max(frail)).toBe(number("body.independence-vo2max"));
    expect(facts.climber(frail).fitness).toBeGreaterThan(0);
  });

  it("gives a novice and a veteran their share of the speed on ladders and ropes, an alpine climber 1", () => {
    const technique = (experience: string): number => facts.climber(client({ experience })).technique;

    expect(technique("none")).toBe(number("technique.novice-share"));
    expect(technique("treks")).toBe(number("technique.novice-share"));
    expect(technique("alpine")).toBe(1);
    expect(technique("7000")).toBe(number("technique.veteran-share"));
    expect(technique("8000")).toBe(number("technique.veteran-share"));
  });

  it("reads the BMI as the weight over the square of the height in metres", () => {
    expect(ClimberFacts.bmi(client({ height: 200, weight: 100 }))).toBeCloseTo(25, 9);
  });
});

describe("Questionnaire: the answers a device keeps", () => {
  it("keeps answers that answer every question within its limits", () => {
    const answers = client({ age: 52, illness: ["ams"], conditions: ["asthma", "diabetes"] });

    expect(questionnaire.check(JSON.parse(JSON.stringify(answers)))).toEqual(answers);
  });

  it("refuses answers from an older build, out of their limits, or not the questionnaire's", () => {
    const { illness: _, ...older } = typical;

    expect(questionnaire.check(older)).toBeNull();
    expect(questionnaire.check(client({ age: 12 }))).toBeNull();
    expect(questionnaire.check(client({ weight: Number.NaN }))).toBeNull();
    expect(questionnaire.check(client({ training: "marathons" }))).toBeNull();
    expect(questionnaire.check(client({ conditions: ["asthma", "asthma"] }))).toBeNull();
    expect(questionnaire.check("a climber")).toBeNull();
    expect(questionnaire.check(null)).toBeNull();
  });

  it("offers each question's choices in the file's order, and the highest peak each experience has summited", () => {
    expect(questionnaire.answers("sex")).toEqual(["male", "female", "undisclosed"]);
    expect(questionnaire.answers("experience")).toEqual(["none", "treks", "alpine", "7000", "8000"]);
    expect(questionnaire.answers("conditions")).toEqual(questionnaire.data.conditions);
    expect(questionnaire.peak("8000")).toBe(8000);
    expect(questionnaire.peak("alpine")).toBeNull();
  });

  it("refuses a typical client the questionnaire can't ask about", () => {
    const data = { ...questionnaire.data, typical: client({ experience: "everest" }) };

    expect(() => new Questionnaire(data)).toThrow(RangeError);
  });
});
