import type { SlopeSettings } from "../physics";
import type { KnowledgeBase } from "./knowledge-base";

/**
 * The slope physics' numbers, from the knowledge base (docs/conventions/slope-physics.md →
 * Numbers): gravity and the snow's friction, which are facts; and the walking and ladder speeds,
 * the slips, the cowstail's reach, a hazard's knock and self-arrest, coefficients fitted to the
 * Icefall's hours and the chronicle (content/facts/technique.json). The speed by steepness runs
 * from the steepest ground walked down to the steepest walked up, the Icefall's; on a ladder,
 * from down a wall to across to up one.
 */
export class SlopeFacts {
  /** A wall, as a ladder's steepness in degrees: straight up. */
  static readonly WALL = 90;

  readonly settings: SlopeSettings;

  constructor(knowledge: KnowledgeBase) {
    const number = (name: string): number => knowledge.number(`technique.${name}`);
    const steepest = knowledge.range("route.icefall-steepness").max;
    const slipFree = number("slip-free-steepness");
    const slip = number("slip-chance-steep");
    this.settings = {
      gravity: number("gravity"),
      friction: number("snow-friction"),
      cowstail: number("cowstail-reach"),
      walkingSpeed: [
        [-steepest, number("walking-speed-steep-down")],
        [0, number("walking-speed-flat")],
        [steepest, number("walking-speed-steep-up")],
      ],
      slipChance: [
        [-steepest, slip],
        [-slipFree, 0],
        [slipFree, 0],
        [steepest, slip],
      ],
      ladderSpeed: [
        [-SlopeFacts.WALL, number("ladder-speed-down")],
        [0, number("ladder-speed-across")],
        [SlopeFacts.WALL, number("ladder-speed-up")],
      ],
      ladderSlipChance: [[0, number("ladder-slip-chance")]],
      knock: number("knock-speed"),
      arrestSpeed: number("arrest-speed"),
      axeReach: number("axe-reach"),
    };
  }
}
