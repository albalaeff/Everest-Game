import type { PackNumbers } from "../simulation";
import type { KnowledgeBase } from "./knowledge-base";

/**
 * The packs' numbers, from the knowledge base (content/facts/gear.json): what a jumar, a second
 * ice tool, a litre of water, a bar of food and a bottle of oxygen weigh, the most of each a
 * climber carries, how much a drink takes and the energy in a bar. A climber carries one jumar
 * and one second tool: the first tool is the ice axe everyone has.
 */
export class PackFacts {
  readonly numbers: PackNumbers;

  constructor(knowledge: KnowledgeBase) {
    const number = (name: string): number => knowledge.number(`gear.${name}`);
    this.numbers = {
      weights: {
        jumar: number("jumar-weight"),
        "ice-tool": number("ice-tool-weight"),
        water: number("water-weight"),
        food: number("food-bar-weight"),
        oxygen: knowledge.number("oxygen.bottle-weight"),
      },
      most: {
        jumar: 1,
        "ice-tool": 1,
        water: number("most-water"),
        food: number("most-food"),
        oxygen: number("most-oxygen"),
      },
      sip: number("drink"),
      bar: number("food-bar-energy"),
    };
  }
}
