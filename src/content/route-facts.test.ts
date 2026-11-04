import { describe, expect, it } from "vitest";

import route from "../../content/facts/route.json";
import { KnowledgeBase } from "./knowledge-base";

/** The South route's points, from Lukla up (spec.md → Route and world). */
const POINTS = [
  "lukla",
  "base-camp",
  "camp-1",
  "camp-2",
  "camp-3",
  "south-col",
  "balcony",
  "south-summit",
  "hillary-step",
  "summit",
];

/** The sections of the spec's route table, in its order. */
const SECTIONS = [
  "trek",
  "base-camp",
  "icefall",
  "western-cwm",
  "lhotse-face",
  "south-col",
  "summit-push",
  "descent",
];

describe("The South route's records", () => {
  const base = new KnowledgeBase([route]);
  const ids = new Set(route.facts.map((record) => record.id));

  it("has an altitude for every point, rising from Lukla to the summit", () => {
    const altitudes = POINTS.map((point) => base.number(`route.${point}-altitude`));

    expect(altitudes).toEqual([...altitudes].sort((low, high) => low - high));
    expect(new Set(altitudes).size).toBe(POINTS.length);
  });

  it("puts the summit at its surveyed height, within the sources' metre", () => {
    expect(base.number("route.summit-altitude")).toBeCloseTo(8849, 0);
  });

  it("has the hazards and the lessons of every section of the spec", () => {
    for (const section of SECTIONS) {
      expect(ids).toContain(`route.${section}-hazards`);
      expect(ids).toContain(`route.${section}-lessons`);
    }
  });

  it("has the Hillary Step as it is today, and as it was before 2015", () => {
    expect(ids).toContain("route.hillary-step-today");
    expect(base.number("route.hillary-step-before-2015")).toBeGreaterThan(0);
  });
});
