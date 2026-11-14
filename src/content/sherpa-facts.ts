import type { KnowledgeBase } from "./knowledge-base";

/**
 * The numbers Pemba says (#212), from the knowledge base (docs/conventions.md → Data, not
 * literals), each by the name his lines in content/sherpa.json fill it in under: how far the
 * Icefall's ice flows a day (`route.icefall-flow`), how many minutes the Icefall Doctors take to
 * lash a broken ladder back (`technique.ladder-relash`), how many ladders they fix the route with
 * (`route.icefall-ladders`, the range its sources give), the years of the ladder fall of 2012 and
 * the avalanche of 2014 (`accidents.*`), and the altitudes of the Football Field and Camp 1. A
 * year is written as it is, not as a number with its thousands marked.
 */
export class SherpaFacts {
  constructor(private readonly knowledge: KnowledgeBase) {}

  /** Each number by the name his lines fill it in under. */
  get fills(): Readonly<Record<string, string | number>> {
    const { knowledge } = this;
    const ladders = knowledge.range("route.icefall-ladders");
    const tenths = (value: number): number => Math.round(value * 10) / 10;
    const tens = (value: number): number => Math.round(value / 10) * 10;
    return {
      flow: tenths(knowledge.number("route.icefall-flow")),
      minutes: knowledge.number("technique.ladder-relash"),
      least: ladders.min,
      most: ladders.max,
      fallYear: String(knowledge.year("accidents.2012-ladder-fall")),
      avalancheYear: String(knowledge.year("accidents.2014-icefall-avalanche")),
      fieldAltitude: tens(knowledge.number("route.football-field-altitude")),
      campAltitude: tens(knowledge.number("route.camp-1-altitude")),
    };
  }
}
