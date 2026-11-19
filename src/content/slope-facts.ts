import type { GradientPoint, SlopeSettings } from "../physics";
import type { KnowledgeBase } from "./knowledge-base";

/**
 * The slope physics' numbers, from the knowledge base (docs/conventions/slope-physics.md →
 * Numbers): gravity, the snow's friction and the cost of walking by gradient, which are facts;
 * and the walking power, the fastest walk, the ladder speeds, the slips' chances (#208), the cowstail's
 * reach, a clip's time, the hard stances and the jolts (#197), a hazard's knock, self-arrest, the
 * lethal landing and the climb back, coefficients fitted to the Icefall's hours and the chronicle
 * (content/facts/technique.json). The ground walked
 * runs from the steepest down to the steepest up, the Icefall's; a ladder, from down a wall to
 * across to up one. And how a hard landing injures and a casualty is rescued (#241): the speeds
 * that sprain, break a bone and break it open, the chance of walking away and the limb that takes
 * it, and a sprain's pace (content/facts/medicine.json), a rescue's reach, the minutes of its
 * anchor and of each piece of first aid, the haul up a rescue line, the lift and the carry.
 *
 * The records are life's numbers. The mountain's clock runs faster than the route is drawn
 * (`time.compression` over `route.drawn-scale`), so the climber walks and climbs that many
 * times faster than in life over the drawn ground, and slips at a metre's chance as in life, and a
 * ladder's bounce dies away that many times faster; a clip takes its seconds, and a chance a
 * second comes, the clock's times faster; a section takes its real hours by the clock. A fall, a
 * knock, a landing and the reaches are at life size, as the walls they happen on are drawn.
 */
export class SlopeFacts {
  /** A wall, as a ladder's steepness in degrees: straight up. */
  static readonly WALL = 90;

  readonly settings: SlopeSettings;

  constructor(knowledge: KnowledgeBase) {
    const number = (name: string): number => knowledge.number(`technique.${name}`);
    const speedUp = knowledge.number("time.compression") / knowledge.number("route.drawn-scale");
    const fast = (name: string): number => number(name) * speedUp;
    const medicine = (name: string): number => knowledge.number(`medicine.${name}`);
    // The mountain's minutes as seconds of play: the clock runs `time.compression` times faster.
    const mountainMinutes = (value: number): number =>
      (value * 60) / knowledge.number("time.compression");
    const minutes = (name: string): number => mountainMinutes(number(name));
    const seconds = (name: string): number => number(name) / knowledge.number("time.compression");
    // A chance a second of the mountain's as one a second of play: the clock runs that much faster.
    const perSecond = (name: string): number => number(name) * knowledge.number("time.compression");
    const steepest = knowledge.range("route.icefall-steepness").max;
    const slipFree = number("slip-free-steepness");
    const slip = number("slip-steep");
    this.settings = {
      gravity: number("gravity"),
      friction: number("snow-friction"),
      cowstail: number("cowstail-reach"),
      clip: seconds("clip-time"),
      walkingCost: SlopeFacts.walkingCost(knowledge),
      steepest,
      walkingPower: fast("walking-power"),
      fastestWalk: fast("fastest-walk"),
      pace: speedUp,
      uphillCostShare: number("uphill-cost-share"),
      slipChance: [
        [-steepest, slip],
        [-slipFree, 0],
        [slipFree, 0],
        [steepest, slip],
      ],
      ladderSpeed: [
        [-SlopeFacts.WALL, fast("ladder-speed-down")],
        [0, fast("ladder-speed-across")],
        [SlopeFacts.WALL, fast("ladder-speed-up")],
      ],
      ladderSlipChance: [[0, number("ladder-slip")]],
      footing: {
        ice: number("ice-slip"),
        iceSteep: number("ice-slip-steep"),
        iceFriction: number("ice-friction"),
        bounce: {
          excite: number("ladder-bounce-excite"),
          damp: fast("ladder-bounce-damp"),
          slip: number("ladder-bounce-slip"),
          held: number("ladder-bounce-held"),
        },
        crampon: {
          looseAfter: minutes("loose-crampon-after"),
          loose: number("loose-crampon-footing"),
          refit: minutes("crampon-refit"),
        },
        still: {
          steepness: number("flat-footing"),
          frontPoints: perSecond("front-points-slip"),
          bounce: perSecond("ladder-still-slip"),
          bounceFrom: number("ladder-still-from"),
        },
        braced: number("jolt-braced"),
        passing: { near: number("passing-near"), slip: number("passing-slip") },
      },
      lethalLanding: number("lethal-landing"),
      climbBack: fast("climb-back-speed"),
      rappel: fast("rappel-speed"),
      ladderBreak: { creak: seconds("ladder-creak"), reset: minutes("ladder-reset") },
      haul: { speed: fast("haul-speed"), reach: number("haul-reach") },
      knock: number("knock-speed"),
      arrestSpeed: number("arrest-speed"),
      axeReach: number("axe-reach"),
      iceClimb: {
        speed: fast("ice-climb-speed"),
        oneTool: number("ice-climb-one-tool"),
        reach: number("pick-reach"),
        lockOff: number("pick-lock-off"),
        stretch: number("pick-stretch"),
        snap: number("pick-snap"),
        overLip: number("pick-over-lip"),
        slip: number("ice-climb-slip"),
        oneToolSlip: number("ice-climb-one-tool-slip"),
        poor: number("poor-pick-slip"),
        swingSlip: number("axe-swing-slip"),
        hang: number("ice-hang-effort"),
      },
      // A landing's speeds are life's, as the falls are (#241); a rescue's minutes are the
      // mountain's, and its haul goes over the drawn ground as the others do.
      injury: {
        sprain: medicine("sprain-landing"),
        fracture: medicine("fracture-landing"),
        open: medicine("open-fracture-landing"),
        unhurt: {
          soft: medicine("landing-unhurt-soft"),
          hard: medicine("landing-unhurt-hard"),
        },
        leg: { flat: medicine("landing-leg-flat"), steep: medicine("landing-leg-steep") },
        sore: medicine("sprain-pace"),
        wrapped: medicine("sprain-wrapped-pace"),
      },
      rescue: {
        reach: number("rescue-reach"),
        anchor: minutes("rescue-anchor-minutes"),
        aid: {
          tourniquet: mountainMinutes(medicine("tourniquet-minutes")),
          splint: mountainMinutes(medicine("splint-minutes")),
          wrap: mountainMinutes(medicine("wrap-minutes")),
        },
        haul: fast("rescue-haul-speed"),
        lift: minutes("carry-lift-minutes"),
        carry: number("carry-pace"),
      },
    };
  }

  /** The cost of walking by gradient, as Minetti et al. measured it: down the steepest gradient
   * measured, down the least costly, on the level and up the steepest; and up the gradient past
   * which the muscles work at their efficiency, where a metre of height costs what it costs up the
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
