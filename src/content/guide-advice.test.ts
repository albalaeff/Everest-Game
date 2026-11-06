import { describe, expect, it } from "vitest";

import { GuideAdvice } from "./guide-advice";
import { KnowledgeBase } from "./knowledge-base";
import { KNOWLEDGE_FILES } from "./knowledge-files";
import { Questionnaire } from "./questionnaire";
import type { ClimberAnswers } from "./questionnaire";

const knowledge = new KnowledgeBase(KNOWLEDGE_FILES);
const questionnaire = new Questionnaire();
const guide = new GuideAdvice(knowledge, questionnaire);
const { typical } = questionnaire;

/** The typical client, but for what `changes` says. */
const client = (changes: Partial<ClimberAnswers>): ClimberAnswers => ({ ...typical, ...changes });

/** The names of the lines the guide says of `answers`, in order. */
const said = (answers: ClimberAnswers): string[] => guide.lines(answers).map(({ name }) => name);

describe("GuideAdvice: what the guide says of the player's answers", () => {
  it("tells the typical client they're as fit as most, and that Nepal may ask for a 7,000 m peak", () => {
    expect(guide.lines(typical)).toEqual([
      { name: "guide-as-fit", fills: {} },
      { name: "guide-peak", fills: { peak: knowledge.number("rules.7000-m-peak") } },
    ]);
  });

  it("says how fit they are against the typical client, by the questionnaire's bands", () => {
    expect(said(client({ age: 25, weight: 65, training: "hard-more" }))[0]).toBe("guide-fitter");
    expect(said(client({ weight: 95 }))[0]).toBe("guide-less-fit");
    expect(said(client({ weight: 110, training: "none" }))[0]).toBe("guide-much-less-fit");
  });

  it("tells a novice the ladders and ropes will be slow, and a veteran they'll be quick, with no peak to climb first", () => {
    for (const experience of ["none", "treks"]) {
      expect(said(client({ experience }))).toEqual(["guide-as-fit", "guide-novice", "guide-peak"]);
    }
    for (const experience of ["7000", "8000"]) {
      expect(said(client({ experience }))).toEqual(["guide-as-fit", "guide-veteran"]);
    }
  });

  it("warns an older climber at the ages the Himalayan Database gives", () => {
    const fewer = knowledge.number("body.summits-by-age");
    const older = knowledge.number("body.older-climbers");

    expect(said(client({ age: fewer }))).not.toContain("guide-summits-by-age");
    expect(guide.lines(client({ age: fewer + 1 }))).toContainEqual({
      name: "guide-summits-by-age",
      fills: { age: fewer },
    });
    expect(said(client({ age: older }))).not.toContain("guide-older");
    expect(said(client({ age: older + 1 }))).not.toContain("guide-summits-by-age");
    expect(guide.lines(client({ age: older + 1 }))).toContainEqual({
      name: "guide-older",
      fills: { age: older },
    });
  });

  it("tells one with class 3 obesity that doctors advise against going high", () => {
    const heaviest = knowledge.number("body.severe-obesity") * (typical.height / 100) ** 2;

    expect(said(client({ weight: Math.floor(heaviest) }))).not.toContain("guide-severe-obesity");
    expect(said(client({ weight: Math.ceil(heaviest) }))).toContain("guide-severe-obesity");
  });

  it("warns of each altitude illness and condition the climber has had, in the questionnaire's order", () => {
    const answers = client({ illness: ["hape-hace", "ams"], conditions: ["diabetes", "asthma"] });

    expect(said(answers).slice(-4)).toEqual([
      "guide-ams",
      "guide-hape-hace",
      "guide-asthma",
      "guide-diabetes",
    ]);
  });

  it("names every line it may say", () => {
    const everything = client({
      illness: questionnaire.data.illness,
      conditions: questionnaire.data.conditions,
    });

    for (const name of said(everything)) {
      expect(guide.names).toContain(name);
    }
    expect(guide.names).toHaveLength(new Set(guide.names).size);
  });
});
