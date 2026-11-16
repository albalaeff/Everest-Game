import type { KnowledgeBase } from "./knowledge-base";

/**
 * The numbers Pemba says (#212), from the knowledge base (docs/conventions.md → Data, not
 * literals), each by the name his lines in content/sherpa.json fill it in under: how far the
 * Icefall's ice flows a day (`route.icefall-flow`), how many ladders the Icefall Doctors fix the
 * route with
 * (`route.icefall-ladders`, the range its sources give), the years of the ladder fall of 2012 and
 * the avalanche of 2014 (`accidents.*`), and the altitudes of the Football Field and Camp 1. And
 * what he knows as a Sherpa (#218): how many times a client and a Sherpa cross the Icefall in a
 * season (`sherpas.*`), the year and the hour of the first ascent, and the records of Kami Rita,
 * Lhakpa and Babu Chiri (`history.*`); the years of the storm of 1996 and the earthquake's
 * avalanche of 2015, Camp 2's altitude, and the water a climber loses a day up here
 * (`body.water-loss`). A year is written as it is, not as a number with its thousands marked, and
 * an hour as a clock writes it.
 */
export class SherpaFacts {
  constructor(private readonly knowledge: KnowledgeBase) {}

  /** Each number by the name his lines fill it in under. */
  get fills(): Readonly<Record<string, string | number>> {
    const { knowledge } = this;
    const ladders = knowledge.range("route.icefall-ladders");
    const sherpas = knowledge.range("sherpas.icefall-crossings");
    const clients = knowledge.range("sherpas.client-crossings");
    const tenths = (value: number): number => Math.round(value * 10) / 10;
    const tens = (value: number): number => Math.round(value / 10) * 10;
    const onTheClock = (hours: number): string => {
      const minutes = Math.round(hours * 60);
      return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
    };
    return {
      flow: tenths(knowledge.number("route.icefall-flow")),
      least: ladders.min,
      most: ladders.max,
      fallYear: String(knowledge.year("accidents.2012-ladder-fall")),
      avalancheYear: String(knowledge.year("accidents.2014-icefall-avalanche")),
      stormYear: String(knowledge.year("accidents.1996-storm")),
      quakeYear: String(knowledge.year("accidents.2015-earthquake-avalanche")),
      fieldAltitude: tens(knowledge.number("route.football-field-altitude")),
      campAltitude: tens(knowledge.number("route.camp-1-altitude")),
      camp2Altitude: tens(knowledge.number("route.camp-2-altitude")),
      water: tenths(knowledge.number("body.water-loss")),
      clientLeast: clients.min,
      clientMost: clients.max,
      crossLeast: sherpas.min,
      crossMost: sherpas.max,
      firstYear: String(knowledge.number("history.first-ascent")),
      firstTime: onTheClock(knowledge.number("history.first-ascent-time")),
      kamiRita: knowledge.number("history.most-ascents"),
      lhakpa: knowledge.number("history.most-ascents-woman"),
      babuHours: knowledge.number("history.longest-on-top"),
    };
  }
}
