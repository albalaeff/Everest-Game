import { describe, expect, it } from "vitest";

import texts from "../../content/climber.json";
import { GuideAdvice } from "../content/guide-advice";
import { KnowledgeBase } from "../content/knowledge-base";
import { KNOWLEDGE_FILES } from "../content/knowledge-files";
import { Questionnaire } from "../content/questionnaire";
import { ClimberScreen } from "./climber-screen";

const questionnaire = new Questionnaire();
const guide = new GuideAdvice(new KnowledgeBase(KNOWLEDGE_FILES), questionnaire);

describe("ClimberScreen's words, content/climber.json", () => {
  it("has the screen's words, each choice's and each of the guide's lines, in English and Russian", () => {
    const choices = [...Questionnaire.ONE, ...Questionnaire.SOME].flatMap((question) =>
      questionnaire.answers(question).map((id) => `${question}-${id}`),
    );
    const names = [
      ...ClimberScreen.TEXTS,
      "height-value",
      "weight-value",
      ...choices,
      ...guide.names,
    ];
    const english: Readonly<Record<string, string>> = texts.en;
    const russian: Readonly<Record<string, string>> = texts.ru;

    for (const name of names) {
      expect(english[name], name).toBeTruthy();
      expect(russian[name], name).toBeTruthy();
    }
    expect(Object.keys(russian).sort()).toEqual(Object.keys(english).sort());
    expect(Object.keys(english).sort()).toEqual([...new Set(names)].sort());
  });
});
