import { describe, expect, it } from "vitest";

import crowds from "../../content/facts/crowds.json";
import time from "../../content/facts/time.json";
import { KnowledgeBase } from "./knowledge-base";
import type { KnowledgeFile, KnowledgeRecord } from "./knowledge-base";

const SOURCE = { title: "A source", url: "https://example.com/" };

const fact = (id: string, versions: KnowledgeRecord["versions"]): KnowledgeRecord => ({
  id,
  kind: "fact",
  status: "source only",
  versions,
});

const FILES: readonly KnowledgeFile[] = [
  {
    facts: [
      { id: "body.rate", kind: "coefficient", status: "source only", value: 0.2 },
      { id: "body.spread", kind: "coefficient", status: "source only", range: { min: 1, max: 3 } },
      fact("oxygen.flow", [{ value: 3, source: SOURCE, checked: "2026-11-01" }]),
      { id: "oxygen.swap", kind: "question" },
    ],
  },
  {
    facts: [
      fact("route.camp", [
        { range: { min: 6400, max: 6500 }, source: SOURCE, checked: "2026-11-01" },
        { value: 6300, source: SOURCE, checked: "2026-11-01" },
      ]),
      fact("medicine.descent", [{ note: "Descend.", source: SOURCE, checked: "2026-11-01" }]),
    ],
  },
];

describe("KnowledgeBase", () => {
  const base = new KnowledgeBase(FILES);

  it("gives a coefficient's value", () => {
    expect(base.number("body.rate")).toBe(0.2);
  });

  it("gives the middle of a coefficient's range", () => {
    expect(base.number("body.spread")).toBe(2);
  });

  it("gives a fact's value", () => {
    expect(base.number("oxygen.flow")).toBe(3);
  });

  it("gives the middle of what a fact's sources say, where they disagree", () => {
    expect(base.number("route.camp")).toBe(6400);
  });

  it("has no number for a question, a claim in words, or a record that isn't there", () => {
    expect(() => base.number("oxygen.swap")).toThrow("oxygen.swap");
    expect(() => base.number("medicine.descent")).toThrow("medicine.descent");
    expect(() => base.number("route.summit")).toThrow("route.summit");
  });

  it("reads the game's own records: the scale, and the summit day it's fitted to", () => {
    const real = new KnowledgeBase([time, crowds]);

    expect(real.number("time.compression")).toBeGreaterThan(1);
    expect(real.number("crowds.south-col-to-summit-2026")).toBeGreaterThan(0);
  });
});
