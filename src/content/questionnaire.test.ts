import { describe, expect, it } from "vitest";

import { Questionnaire } from "./questionnaire";
import type { ClimberAnswers } from "./questionnaire";

const questionnaire = new Questionnaire();
const { typical } = questionnaire;

/** The typical client, but for what `changes` says. */
const client = (changes: Partial<ClimberAnswers>): ClimberAnswers => ({ ...typical, ...changes });

describe("Questionnaire: the answers a device keeps", () => {
  it("keeps answers that answer every question within its limits", () => {
    const answers = client({ age: 52, illness: ["ams"], conditions: ["asthma", "diabetes"] });

    expect(questionnaire.check(JSON.parse(JSON.stringify(answers)))).toEqual(answers);
  });

  it("refuses answers from an older build, out of their limits, or not the questionnaire's", () => {
    const older = Object.fromEntries(
      Object.entries(typical).filter(([question]) => question !== "illness"),
    );

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
    expect(questionnaire.answers("experience")).toEqual([
      "none",
      "treks",
      "alpine",
      "7000",
      "8000",
    ]);
    expect(questionnaire.answers("conditions")).toEqual(questionnaire.data.conditions);
    expect(questionnaire.peak("8000")).toBe(8000);
    expect(questionnaire.peak("alpine")).toBeNull();
  });

  it("refuses a typical client the questionnaire can't ask about", () => {
    const data = { ...questionnaire.data, typical: client({ experience: "everest" }) };

    expect(() => new Questionnaire(data)).toThrow(RangeError);
  });
});
