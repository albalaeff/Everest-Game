import { describe, expect, it } from "vitest";

import sherpaTexts from "../../content/sherpa.json";
import { KnowledgeBase } from "./knowledge-base";
import { KNOWLEDGE_FILES } from "./knowledge-files";
import { SherpaFacts } from "./sherpa-facts";

const knowledge = new KnowledgeBase(KNOWLEDGE_FILES);

describe("SherpaFacts: the numbers Pemba says, from the knowledge base (#212, #218)", () => {
  it("fills his lines with the knowledge base's numbers, the years as they're written", () => {
    const { fills } = new SherpaFacts(knowledge);
    const ladders = knowledge.range("route.icefall-ladders");

    expect(fills).toEqual({
      flow: Math.round(knowledge.number("route.icefall-flow") * 10) / 10,
      least: ladders.min,
      most: ladders.max,
      fallYear: "2012",
      avalancheYear: "2014",
      stormYear: "1996",
      quakeYear: "2015",
      fieldAltitude: Math.round(knowledge.number("route.football-field-altitude") / 10) * 10,
      campAltitude: Math.round(knowledge.number("route.camp-1-altitude") / 10) * 10,
      camp2Altitude: Math.round(knowledge.number("route.camp-2-altitude") / 10) * 10,
      water: Math.round(knowledge.number("body.water-loss") * 10) / 10,
      clientLeast: knowledge.range("sherpas.client-crossings").min,
      clientMost: knowledge.range("sherpas.client-crossings").max,
      crossLeast: knowledge.range("sherpas.icefall-crossings").min,
      crossMost: knowledge.range("sherpas.icefall-crossings").max,
      firstYear: "1953",
      firstTime: "11:30",
      kamiRita: knowledge.number("history.most-ascents"),
      lhakpa: knowledge.number("history.most-ascents-woman"),
      babuHours: knowledge.number("history.longest-on-top"),
    });
  });

  it("has a number for every fill his lines name, but the clock's time", () => {
    const { fills } = new SherpaFacts(knowledge);
    const named = Object.values(sherpaTexts.en).flatMap((line) =>
      [...line.matchAll(/\{(\w+)\}/gu)].map(([, fill]) => fill ?? ""),
    );

    expect([...new Set(named)].filter((fill) => fill !== "time").sort()).toEqual(
      Object.keys(fills).sort(),
    );
  });
});
