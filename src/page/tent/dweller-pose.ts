/** A point of the tent's picture, in its pixels: across to the right, and down. */
export interface Spot {
  readonly x: number;
  readonly y: number;
}

/** What the person in the tent is seen doing: sitting, at the stove melting snow, cooking and
 * eating a meal, asleep in the bag, playing the guitar; and, once each, crawling in and out,
 * a drink, a bar, a hand in the pack, lying down and sitting up again. */
export type Act =
  | "idle"
  | "melt"
  | "cook"
  | "sleep"
  | "guitar"
  | "enter"
  | "leave"
  | "drink"
  | "bar"
  | "pack"
  | "lie"
  | "wake";

/** What a hand holds. */
export type Held = "nothing" | "spoon" | "bottle" | "bar" | "pouch" | "snow" | "lighter";

/**
 * The person in the tent this frame, from their hips as they sit: how far along the floor from
 * their seat they are, and how far off it their hips are; how far they lean toward the stove, in
 * degrees; how far back their head tilts, and to the side; where each hand is, the one nearer
 * the stove first, and what it holds; how far open the mouth is, 0 to 1, and the eyes, 1 to 0;
 * whether they face the pack, away from the stove; how far into the sleeping bag they are, 0
 * sitting up to 1 lying in it; how much of them shows; and whether the guitar is on their lap.
 */
export interface DwellerLook {
  readonly shift: number;
  readonly rise: number;
  readonly lean: number;
  readonly tilt: number;
  readonly sway: number;
  readonly hands: readonly [Spot, Spot];
  readonly holds: readonly [Held, Held];
  readonly mouth: number;
  readonly eyes: number;
  readonly turned: boolean;
  readonly lying: number;
  readonly shown: number;
  readonly guitar: boolean;
  /** How far the stove's flame is lit, 0 to 1, and how far its door is open for the fumes. */
  readonly flame: number;
  /** A tap of the foot, 0 to 1. */
  readonly tap: number;
  /** How far what the first hand holds is tipped from upright, in degrees clockwise: a bottle
   * to the mouth or over the pot. `null` for what lies along the forearm, as a spoon does. */
  readonly tip: number | null;
}

/** The person's joints this frame, in the picture's pixels from their hips: the shoulders,
 * elbows and hands, the neck, and the head's middle and its angle, in degrees. */
export interface DwellerJoints {
  readonly torso: number;
  readonly neck: Spot;
  readonly head: Spot;
  readonly headAngle: number;
  readonly mouth: Spot;
  readonly shoulders: readonly [Spot, Spot];
  readonly elbows: readonly [Spot, Spot];
  readonly hands: readonly [Spot, Spot];
  /** Each forearm's angle, in degrees from pointing down, for what the hand holds. */
  readonly forearms: readonly [number, number];
}

/**
 * How the person in the tent moves (#258), the picture's own: a pose for each thing they do, from
 * the seconds they've been at it and, for the stove, how far through the chore is. Sitting, they
 * breathe, blink and look about; melting snow, they lean to the pot in the vestibule, feed it
 * snow and stir; cooking, they light the stove, pour the bottle's water in, then eat from the
 * pouch, the spoon to the mouth and back; a drink tips the bottle and the head; the guitar is
 * strummed with one hand while the other moves along its neck, the head and a foot keeping time;
 * packing, they turn to the pack and reach into it; to sleep they lie down in the bag, and wake
 * with a stretch. The arms are two bones each, bent to where the hands go, so they keep their
 * lengths. It holds nothing: the same act and seconds give the same pose.
 */
export class DwellerPose {
  /** The bones, in the picture's pixels: the upper arm, the forearm to the middle of the hand. */
  static readonly UPPER_ARM = 92;
  static readonly FOREARM = 88;
  /** From the hips, sitting upright: each shoulder, the nearer the stove first, the neck, the
   * head's middle over the neck, and the mouth from the head's middle. */
  static readonly SHOULDERS: readonly [Spot, Spot] = [
    { x: -42, y: -134 },
    { x: 40, y: -130 },
  ];
  static readonly NECK: Spot = { x: -2, y: -152 };
  static readonly HEAD: Spot = { x: -4, y: -44 };
  static readonly MOUTH: Spot = { x: -10.4, y: 24.4 };
  /** How much bigger than its drawing the head is. */
  static readonly HEAD_SCALE = 1.16;
  /** How long each act that plays once takes, in seconds. */
  static readonly ONCE: Readonly<Partial<Record<Act, number>>> = {
    enter: 1.8,
    leave: 1.1,
    drink: 2.4,
    bar: 2.6,
    pack: 2.4,
    lie: 1.2,
    wake: 1.8,
  };
  /** Where the hands rest, on the knees; where the pot is in the vestibule, and the snow beside
   * it; the bottle on the floor, and the pouch held at the chest; the pack, from the seat they
   * move to for it. */
  private static readonly KNEES: readonly [Spot, Spot] = [
    { x: -92, y: -34 },
    { x: 84, y: -30 },
  ];
  private static readonly POT: Spot = { x: -238, y: -54 };
  private static readonly SNOW: Spot = { x: -181, y: -6 };
  private static readonly BOTTLE: Spot = { x: -122, y: 12 };
  private static readonly CHEST: Spot = { x: 14, y: -92 };
  private static readonly PACK: Spot = { x: -150, y: -128 };
  /** How far along the floor from the seat the door is, and the pack's seat. */
  static readonly FROM_DOOR = -330;
  static readonly AT_PACK = 190;
  /** The guitar on the lap: where its strings are strummed, and the ends of the stretch of its
   * neck the other hand plays on. */
  private static readonly STRUM: Spot = { x: 30, y: -60 };
  private static readonly FRETS: readonly [Spot, Spot] = [
    { x: 112, y: -105 },
    { x: 190, y: -150 },
  ];
  /** The strum's beat, in strokes a second. */
  private static readonly BEAT = 2.6;
  /** How far under its shoulder a hand is as its elbow has swung to the other side: raised to
   * the mouth for the first arm, at the chest for the second; and how far the hand rises as it
   * swings. */
  private static readonly RAISED = -45;
  private static readonly AT_CHEST = 10;
  private static readonly TURNING = 30;
  /** How far along the mats they go to lie down, and how far back they lean on the way, in
   * degrees. */
  private static readonly TO_BED = 130;
  private static readonly LAID_BACK = 64;
  /** How far a bottle tips to pour, in degrees; and how far off the mats the hips are on hands
   * and knees. */
  private static readonly POUR = 118;
  /** How far from the hand that holds it by its middle a bottle's mouth is. */
  static readonly BOTTLE_NECK = 46;
  private static readonly ON_KNEES = 46;

  /** The look of the act `seconds` in, a chore `progress` of the way through. */
  look(act: Act, seconds: number, progress = 0): DwellerLook {
    const t = Math.max(0, seconds);
    switch (act) {
      case "melt":
        return DwellerPose.melting(t);
      case "cook":
        return DwellerPose.cooking(t, progress);
      case "sleep":
        return DwellerPose.asleep(t);
      case "guitar":
        return DwellerPose.strumming(t);
      case "enter":
        return DwellerPose.entering(DwellerPose.share(act, t));
      case "leave":
        return DwellerPose.entering(1 - DwellerPose.share(act, t));
      case "drink":
        return DwellerPose.drinking(DwellerPose.share(act, t));
      case "bar":
        return DwellerPose.biting(DwellerPose.share(act, t));
      case "pack":
        return DwellerPose.packing(DwellerPose.share(act, t));
      case "lie":
        return DwellerPose.lyingDown(DwellerPose.share(act, t));
      case "wake":
        return DwellerPose.waking(DwellerPose.share(act, t));
      default:
        return DwellerPose.sitting(t);
    }
  }

  /** The joints of a look: the arms bent from the shoulders to where the hands go. */
  joints(look: DwellerLook): DwellerJoints {
    const turn = (spot: Spot): Spot => DwellerPose.turned(spot, -look.lean);
    const shoulders: readonly [Spot, Spot] = [
      turn(DwellerPose.SHOULDERS[0]),
      turn(DwellerPose.SHOULDERS[1]),
    ];
    const neck = turn(DwellerPose.NECK);
    const headAngle = -look.lean * 0.55 + look.tilt;
    const over = DwellerPose.turned(DwellerPose.HEAD, headAngle);
    const head = { x: neck.x + over.x + look.sway, y: neck.y + over.y };
    const lips = DwellerPose.turned(DwellerPose.MOUTH, headAngle);
    // An elbow points out from the body with the hand low, on a knee. The first arm's swings
    // out to the side for a hand at the mouth or over the head; the second's hangs under a hand
    // at the chest or higher, on the guitar's neck.
    const first = DwellerPose.arm(shoulders[0], look.hands[0], 1, DwellerPose.RAISED);
    const second = DwellerPose.arm(shoulders[1], look.hands[1], -1, DwellerPose.AT_CHEST);
    return {
      torso: -look.lean,
      neck,
      head,
      headAngle,
      mouth: { x: head.x + lips.x, y: head.y + lips.y },
      shoulders,
      elbows: [first.elbow, second.elbow],
      hands: [first.hand, second.hand],
      forearms: [first.angle, second.angle],
    };
  }

  /** Where the mouth is for a pose that leans and tilts so: where a spoon or a bottle goes. */
  private static mouthAt(lean: number, tilt: number): Spot {
    const neck = DwellerPose.turned(DwellerPose.NECK, -lean);
    const angle = -lean * 0.55 + tilt;
    const head = DwellerPose.turned(DwellerPose.HEAD, angle);
    const lips = DwellerPose.turned(DwellerPose.MOUTH, angle);
    return { x: neck.x + head.x + lips.x - 14, y: neck.y + head.y + lips.y + 6 };
  }

  private static sitting(t: number): DwellerLook {
    const breath = Math.sin((2 * Math.PI * t) / 4.2);
    // A look to the door, and back, now and then.
    const glance = DwellerPose.pulse(t, 9, 1.6);
    const [near, far] = DwellerPose.KNEES;
    return {
      ...DwellerPose.STILL,
      lean: 4 + 1.2 * breath,
      tilt: -6 * glance,
      sway: -3 * glance,
      hands: [
        { x: near.x, y: near.y - 1.5 * breath },
        { x: far.x, y: far.y - 1.5 * breath },
      ],
      eyes: DwellerPose.blink(t),
    };
  }

  private static melting(t: number): DwellerLook {
    const stir = (2 * Math.PI * t) / 1.5;
    const { POT, SNOW, KNEES } = DwellerPose;
    const stirring = { x: POT.x + 13 * Math.cos(stir), y: POT.y - 34 + 5 * Math.sin(stir) };
    // Every six seconds the spoon is left in the pot, and a lump of snow goes in from the sack.
    const feed = (t % 6) / 1.8;
    const drop = { x: POT.x + 6, y: POT.y - 30 };
    const hand =
      feed >= 1
        ? stirring
        : feed < 0.3
          ? DwellerPose.mix(stirring, SNOW, DwellerPose.ease(feed / 0.3))
          : feed < 0.7
            ? DwellerPose.mix(SNOW, drop, DwellerPose.ease((feed - 0.3) / 0.4))
            : DwellerPose.mix(drop, stirring, DwellerPose.ease((feed - 0.7) / 0.3));
    const held: Held = feed >= 1 ? "spoon" : feed >= 0.3 && feed < 0.7 ? "snow" : "nothing";
    return {
      ...DwellerPose.STILL,
      lean: 30 + 2 * Math.sin(stir / 2),
      tilt: 10,
      hands: [hand, KNEES[1]],
      holds: [held, "nothing"],
      eyes: DwellerPose.blink(t),
      flame: 1,
    };
  }

  private static cooking(t: number, progress: number): DwellerLook {
    const { POT, BOTTLE, CHEST, KNEES } = DwellerPose;
    if (progress < 0.12) {
      // The lighter to the burner, and the flame comes up.
      const lit = DwellerPose.ease(progress / 0.12);
      return {
        ...DwellerPose.STILL,
        lean: 30,
        tilt: 10,
        hands: [{ x: POT.x + 44, y: POT.y + 52 }, KNEES[1]],
        holds: ["lighter", "nothing"],
        eyes: DwellerPose.blink(t),
        flame: lit,
      };
    }
    if (progress < 0.38) {
      // The bottle's water into the pot.
      const pour = DwellerPose.arc((progress - 0.12) / 0.26);
      return {
        ...DwellerPose.STILL,
        lean: 26,
        tilt: 8,
        hands: [DwellerPose.mix(BOTTLE, { x: POT.x + 34, y: POT.y - 50 }, pour), KNEES[1]],
        holds: ["bottle", "nothing"],
        tip: -DwellerPose.POUR * DwellerPose.ease((pour - 0.35) / 0.5),
        eyes: DwellerPose.blink(t),
        flame: 1,
      };
    }
    if (progress < 0.62) {
      // The pouch filled and left to stand, the hands warming on it.
      const breath = Math.sin((2 * Math.PI * t) / 3.4);
      return {
        ...DwellerPose.STILL,
        lean: 12 + breath,
        tilt: 4,
        hands: [
          { x: CHEST.x - 30, y: CHEST.y + 8 },
          { x: CHEST.x + 22, y: CHEST.y + 6 },
        ],
        holds: ["nothing", "pouch"],
        eyes: DwellerPose.blink(t),
        flame: 0,
      };
    }
    // A spoonful to the mouth every two seconds, and chewing between.
    const cycle = (t % 2) / 2;
    const lift = DwellerPose.arc(cycle / 0.7);
    const lean = 8;
    const mouth = DwellerPose.mouthAt(lean, 2);
    const dip = { x: CHEST.x - 6, y: CHEST.y - 20 };
    const chew = cycle > 0.7 ? 0.25 + 0.25 * Math.sin(2 * Math.PI * 4 * t) : 0;
    return {
      ...DwellerPose.STILL,
      lean,
      tilt: 2,
      hands: [DwellerPose.mix(dip, mouth, lift), CHEST],
      holds: ["spoon", "pouch"],
      mouth: Math.max(chew, Math.min(1, Math.max(0, (lift - 0.5) * 4))),
      eyes: DwellerPose.blink(t),
    };
  }

  private static drinking(share: number): DwellerLook {
    const up = DwellerPose.ease(share / 0.3) * (1 - DwellerPose.ease((share - 0.75) / 0.25));
    const tilt = -16 * up;
    const lips = DwellerPose.mouthAt(2, tilt);
    // The bottle's mouth to the lips: the hand holds it by its middle, short of them.
    const mouth = { x: lips.x - 26, y: lips.y - 28 };
    return {
      ...DwellerPose.STILL,
      lean: 2,
      tilt,
      hands: [DwellerPose.mix(DwellerPose.BOTTLE, mouth, up), DwellerPose.KNEES[1]],
      holds: ["bottle", "nothing"],
      tip: DwellerPose.POUR * DwellerPose.ease((up - 0.35) / 0.5),
      mouth: up > 0.9 ? 0.5 : 0,
      eyes: up > 0.9 ? 0.25 : 1,
    };
  }

  private static biting(share: number): DwellerLook {
    // Two bites, a chew after each.
    const bite = share < 0.5 ? share / 0.5 : (share - 0.5) / 0.5;
    const up = DwellerPose.arc(Math.min(1, bite / 0.55));
    const mouth = DwellerPose.mouthAt(4, 0);
    const rest = { x: -60, y: -74 };
    const chew = bite > 0.55 ? 0.3 + 0.3 * Math.sin(2 * Math.PI * 9 * bite) : 0;
    return {
      ...DwellerPose.STILL,
      lean: 4,
      hands: [DwellerPose.mix(rest, mouth, up), DwellerPose.KNEES[1]],
      holds: ["bar", "nothing"],
      mouth: Math.max(chew, up > 0.85 ? 0.9 : 0),
    };
  }

  private static strumming(t: number): DwellerLook {
    const beat = 2 * Math.PI * DwellerPose.BEAT * t;
    const { STRUM, FRETS } = DwellerPose;
    // A chord every two bars: three places along the neck, in turn.
    const chord = [0.15, 0.6, 0.95, 0.4][Math.floor(t / 1.54) % 4] ?? 0;
    const slide = DwellerPose.ease(((t % 1.54) / 1.54) * 6);
    const before = [0.15, 0.6, 0.95, 0.4][(Math.floor(t / 1.54) + 3) % 4] ?? 0;
    const at = before + (chord - before) * slide;
    return {
      ...DwellerPose.STILL,
      lean: 6 + 2 * Math.sin(beat / 2),
      tilt: 5 * Math.sin(beat / 2),
      sway: 3 * Math.sin(beat / 4),
      hands: [
        { x: STRUM.x + 10 * Math.sin(beat), y: STRUM.y + 17 * Math.sin(beat) },
        DwellerPose.mix(FRETS[0], FRETS[1], at),
      ],
      mouth: 0.25 + 0.25 * Math.sin(beat / 4),
      eyes: Math.min(DwellerPose.blink(t), Math.sin(t / 3.1) > 0.75 ? 0.15 : 1),
      guitar: true,
      tap: Math.max(0, Math.sin(beat / 2)),
    };
  }

  private static packing(share: number): DwellerLook {
    // Over to the pack, a hand into it twice, and back.
    const over = DwellerPose.ease(share / 0.2) * (1 - DwellerPose.ease((share - 0.82) / 0.18));
    const reach = Math.sin(2 * Math.PI * 2 * Math.max(0, share - 0.2));
    const { PACK, KNEES } = DwellerPose;
    return {
      ...DwellerPose.STILL,
      shift: DwellerPose.AT_PACK * over,
      lean: 22 * over,
      tilt: 8 * over,
      turned: over > 0.5,
      hands: [
        DwellerPose.mix(KNEES[0], { x: PACK.x + 18 * reach, y: PACK.y - 12 * reach }, over),
        DwellerPose.mix(KNEES[1], { x: PACK.x + 60 - 20 * reach, y: PACK.y + 30 * reach }, over),
      ],
    };
  }

  private static entering(share: number): DwellerLook {
    // In from the door on hands and knees, and up onto the seat.
    const along = DwellerPose.ease(share / 0.7);
    const up = DwellerPose.ease((share - 0.55) / 0.45);
    const crawl = Math.sin(2 * Math.PI * 2.2 * share);
    const [near, far] = DwellerPose.KNEES;
    return {
      ...DwellerPose.STILL,
      shift: DwellerPose.FROM_DOOR * (1 - along) || 0,
      rise: DwellerPose.ON_KNEES * (1 - up) || 0,
      lean: 62 * (1 - up) + 4 * up,
      tilt: 30 * (1 - up),
      hands: [
        DwellerPose.mix({ x: -150 + 18 * crawl, y: DwellerPose.ON_KNEES + 14 }, near, up),
        DwellerPose.mix({ x: -96 - 18 * crawl, y: DwellerPose.ON_KNEES + 16 }, far, up),
      ],
      shown: DwellerPose.ease(share / 0.25),
    };
  }

  private static lyingDown(share: number): DwellerLook {
    // Back and along the mats toward the pillow, and into the bag as they go down.
    const down = DwellerPose.ease(share / 0.85);
    return {
      ...DwellerPose.sitting(0),
      shift: DwellerPose.TO_BED * down,
      lean: 4 - DwellerPose.LAID_BACK * down,
      tilt: -10 * down,
      lying: DwellerPose.ease((share - 0.45) / 0.55),
      eyes: 1 - down,
    };
  }

  private static asleep(t: number): DwellerLook {
    return {
      ...DwellerPose.STILL,
      lying: 1,
      eyes: 0,
      mouth: 0.1 + 0.08 * Math.sin((2 * Math.PI * t) / 5),
    };
  }

  private static waking(share: number): DwellerLook {
    // Up out of the bag, a stretch with both arms over the head and a yawn.
    const up = DwellerPose.ease(share / 0.4);
    const stretch = DwellerPose.arc((share - 0.3) / 0.6);
    const [near, far] = DwellerPose.KNEES;
    return {
      ...DwellerPose.STILL,
      shift: DwellerPose.TO_BED * (1 - up),
      lying: 1 - DwellerPose.ease(share / 0.22),
      lean: 4 - DwellerPose.LAID_BACK * (1 - up) - 8 * stretch,
      tilt: -14 * stretch,
      hands: [
        DwellerPose.mix(near, { x: -86, y: -268 }, stretch),
        DwellerPose.mix(far, { x: 92, y: -262 }, stretch),
      ],
      mouth: stretch,
      eyes: 1 - 0.8 * stretch,
    };
  }

  private static readonly STILL: DwellerLook = {
    shift: 0,
    rise: 0,
    lean: 4,
    tilt: 0,
    sway: 0,
    hands: DwellerPose.KNEES,
    holds: ["nothing", "nothing"],
    mouth: 0,
    eyes: 1,
    turned: false,
    lying: 0,
    shown: 1,
    guitar: false,
    flame: 0,
    tap: 0,
    tip: null,
  };

  /** How far through an act that plays once `seconds` is, 0 to 1. */
  private static share(act: Act, seconds: number): number {
    return Math.min(1, seconds / (DwellerPose.ONCE[act] ?? 1));
  }

  /** An arm from `shoulder` to `target`, its elbow to `side` while the hand is lower than `turn`
   * under the shoulder, to the other side once it's as high as that, and between the two over
   * `TURNING` pixels of the hand's way up. */
  private static arm(
    shoulder: Spot,
    target: Spot,
    side: 1 | -1,
    turn: number,
  ): { readonly elbow: Spot; readonly hand: Spot; readonly angle: number } {
    const low = DwellerPose.bend(shoulder, target, side);
    const share = DwellerPose.ease((shoulder.y + turn - target.y) / DwellerPose.TURNING + 1);
    if (share <= 0) {
      return low;
    }
    const high = DwellerPose.bend(shoulder, target, side === 1 ? -1 : 1);
    const elbow = DwellerPose.mix(low.elbow, high.elbow, share);
    const angle = (Math.atan2(low.hand.y - elbow.y, low.hand.x - elbow.x) * 180) / Math.PI - 90;
    return { elbow, hand: low.hand, angle };
  }

  /** An arm from `shoulder` to `target`, its elbow bent to `side`: the hand as near the target
   * as the arm reaches, the bones their lengths. */
  private static bend(
    shoulder: Spot,
    target: Spot,
    side: 1 | -1,
  ): { readonly elbow: Spot; readonly hand: Spot; readonly angle: number } {
    const { UPPER_ARM: upper, FOREARM: lower } = DwellerPose;
    const dx = target.x - shoulder.x;
    const dy = target.y - shoulder.y;
    const far = Math.hypot(dx, dy);
    const reach = Math.min(Math.max(far, Math.abs(upper - lower) + 0.01), upper + lower - 0.01);
    const towards = far < 1e-9 ? Math.PI / 2 : Math.atan2(dy, dx);
    const inner = Math.acos((upper * upper + reach * reach - lower * lower) / (2 * upper * reach));
    const angle = towards + side * inner;
    const elbow = {
      x: shoulder.x + upper * Math.cos(angle),
      y: shoulder.y + upper * Math.sin(angle),
    };
    const hand = {
      x: shoulder.x + reach * Math.cos(towards),
      y: shoulder.y + reach * Math.sin(towards),
    };
    const fore = (Math.atan2(hand.y - elbow.y, hand.x - elbow.x) * 180) / Math.PI - 90;
    return { elbow, hand, angle: fore };
  }

  /** A point turned by `degrees` about the hips, clockwise on the screen. */
  private static turned(spot: Spot, degrees: number): Spot {
    const angle = (degrees * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return { x: spot.x * cos - spot.y * sin, y: spot.x * sin + spot.y * cos };
  }

  private static mix(from: Spot, to: Spot, share: number): Spot {
    return { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share };
  }

  /** 0 to 1 with an easy start and end. */
  private static ease(share: number): number {
    const t = Math.min(Math.max(share, 0), 1);
    return t * t * (3 - 2 * t);
  }

  /** There and back again: 0, up to 1 halfway, and 0 again. */
  private static arc(share: number): number {
    const t = Math.min(Math.max(share, 0), 1);
    return DwellerPose.ease(1 - Math.abs(2 * t - 1));
  }

  /** There and back within `long` seconds, once every `every`: 0 the rest of the time. */
  private static pulse(t: number, every: number, long: number): number {
    const into = t % every;
    return into < long ? DwellerPose.arc(into / long) : 0;
  }

  /** The eyes through a blink, every few seconds: 1 open, 0 shut. */
  private static blink(t: number): number {
    const into = t % 3.7;
    return into < 0.16 ? Math.abs(into / 0.08 - 1) : 1;
  }
}
