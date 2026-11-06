import type { GradientPoint, SlopeSettings } from "../physics";
import type { KnowledgeBase } from "./knowledge-base";

/**
 * The slope physics' numbers, from the knowledge base (docs/conventions/slope-physics.md →
 * Numbers): gravity, the snow's friction and the cost of walking by gradient, which are facts;
 * and the walking power, the fastest walk, the ladder speeds, the slips, the cowstail's reach, a
 * hazard's knock and self-arrest, coefficients fitted to the Icefall's hours and the chronicle
 * (content/facts/technique.json). The ground walked runs from the steepest down to the steepest
 * up, the Icefall's; a ladder, from down a wall to across to up one.
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
      walkingCost: SlopeFacts.walkingCost(knowledge),
      steepest,
      walkingPower: number("walking-power"),
      fastestWalk: number("fastest-walk"),
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

  /** The cost of walking by gradient, as Minetti et al. measured it: down the steepest gradient
   * measured, down the least costly, on the level and up the steepest; and up the gradient past
   * which the muscles work at their efficiency, where a metre of height costs what it does up the
   * steepest. Walking derives the steeper ground's, up and down, from the steepest measured. */
  private static walkingCost(knowledge: KnowledgeBase): readonly GradientPoint[] {
    const number = (name: string): number => knowledge.number(`technique.walking-cost-${name}`);
    const { min, max } = knowledge.range("technique.walking-cost-gradients");
    const efficient = knowledge.number("technique.walking-efficiency-gradient");
    const sine = (gradient: number): number => gradient / Math.sqrt(1 + gradient * gradient);
    const steepUp = number("steep-up");
    return [
      [min, number("steep-down")],
      [number("least-gradient"), number("least")],
      [0, number("level")],
      [efficient, (steepUp * sine(efficient)) / sine(max)],
      [max, steepUp],
    ];
  }
}
