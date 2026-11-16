import { describe, expect, it } from "vitest";

import coachTexts from "../../content/coach.json";
import { Changeover } from "./changeover";

const english: Readonly<Record<string, string>> = coachTexts.en;
const russian: Readonly<Record<string, string>> = coachTexts.ru;

/** The keys a text names in braces ({R}), as the arrow, the steps and the gear write them. */
const braced = (text: string): string[] => [...text.matchAll(/\{([^}]+)\}/gu)].map(([key]) => key);
/** How many buttons a text names in brackets ([Clip 2]). */
const buttons = (text: string): number => [...text.matchAll(/\[[^\]]+\]/gu)].length;

describe("The coach's words, content/coach.json", () => {
  it("has every text in Russian too, in the same order", () => {
    expect(Object.keys(russian)).toEqual(Object.keys(english));
    for (const [name, text] of Object.entries(russian)) {
      expect(`${name}: ${text}`).not.toMatch(/: $/u);
    }
  });

  it("names the same keys, and as many buttons, in both languages", () => {
    for (const [name, text] of Object.entries(english)) {
      const translated = russian[name] ?? "";
      expect([name, braced(translated)]).toEqual([name, braced(text)]);
      expect([name, buttons(translated)]).toEqual([name, buttons(text)]);
    }
  });

  it("has each changeover step, each gear line and each mark the card and the slope show (#247)", () => {
    const steps = [
      ...new Changeover({ x: 0, y: 0 }, "old", "next").steps,
      ...new Changeover({ x: 0, y: 0 }, "old", null).steps,
    ];
    const names = [
      ...steps.flatMap((step) => [`step.${step}.pc`, `step.${step}.touch`]),
      ...["jumar", "carabiner"].flatMap((end) => [`gear.${end}.pc`, `gear.${end}.touch`]),
      "mark.anchor",
      "mark.rope-end",
      "rope-end.pc",
      "rope-end.touch",
    ];

    for (const name of names) {
      expect(english[name], name).toBeTruthy();
    }
    // Each step's key: the carabiner's on R and [Clip 2], the jumar's on E and [Clip 1].
    expect(english["step.carabiner-off.pc"]).toMatch(/^\{R\} /u);
    expect(english["step.jumar-on.touch"]).toMatch(/^\[Clip 1\] /u);
  });
});
