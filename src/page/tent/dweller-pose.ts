import { DwellerHands } from "./dweller-hands";
import { DwellerHead } from "./dweller-head";
import { DwellerShapes } from "./dweller-shapes";

/** A point of the tent's picture, in its pixels: across to the right, and down. */
export interface Spot {
  readonly x: number;
  readonly y: number;
}

/** A point in three dimensions: a spot, and how far toward the viewer it is. */
interface Point extends Spot {
  readonly z: number;
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

/** Which way an elbow points: out to the side, or down by the body, for a hand held in front of
 * it. */
export type Elbow = "out" | "down";

/** What a hand holds: the guitar's pick, or its neck, too. */
export type Held =
  "nothing" | "spoon" | "bottle" | "bar" | "pouch" | "snow" | "lighter" | "pick" | "neck";

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
  /** Where the eyes look, -1 to 1 each way: to the viewer's left and right, up and down. */
  readonly gaze: Spot;
  /** How far in front of the shoulders each hand is, toward the viewer, in pixels: 0 beside the
   * body, more at the chest or the mouth. The arms are bent in three dimensions and drawn flat,
   * so one that reaches toward the viewer is drawn shorter. */
  readonly ahead: readonly [number, number];
  /** Which way each elbow points. */
  readonly elbows: readonly [Elbow, Elbow];
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
  /** The bones, in the picture's pixels, the slope climber's (#264): the upper arm, and the
   * forearm to the middle of the hand, where it grips. */
  static readonly UPPER_ARM = DwellerShapes.UPPER_ARM;
  static readonly FOREARM = DwellerShapes.FOREARM + DwellerShapes.GRIP;
  /** From the hips, sitting upright: each shoulder, the nearer the stove first, the neck, the
   * head's middle over the neck, and the mouth from the head's middle. */
  static readonly SHOULDERS: readonly [Spot, Spot] = DwellerShapes.SHOULDERS;
  static readonly NECK: Spot = DwellerShapes.NECK;
  static readonly HEAD: Spot = DwellerShapes.HEAD;
  static readonly MOUTH: Spot = DwellerHead.MOUTH;
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
    { x: -84, y: -24 },
    { x: 86, y: -24 },
  ];
  private static readonly POT: Spot = { x: -238, y: -50 };
  private static readonly SNOW: Spot = { x: -182, y: 0 };
  private static readonly BOTTLE: Spot = { x: -124, y: 16 };
  private static readonly CHEST: Spot = { x: 10, y: -88 };
  private static readonly PACK: Spot = { x: -150, y: -104 };
  /** How far along the floor from the seat the door is, and the pack's seat. */
  static readonly FROM_DOOR = -330;
  static readonly AT_PACK = 190;
  /** The guitar on the lap: where its strings are strummed, and the ends of the stretch of its
   * neck the other hand plays on. */
  private static readonly STRUM: Spot = { x: -16, y: -44 };
  private static readonly FRETS: readonly [Spot, Spot] = [
    { x: 96, y: -94 },
    { x: 149, y: -119 },
  ];
  /** The strum's beat, in strokes a second. */
  private static readonly BEAT = 2.6;
  /** Which way the nearer the stove's elbow points, for each way: x to the viewer's right, y
   * down and z toward the viewer; the other's is mirrored. A little back, as elbows bend, so one
   * swings round behind its arm as the hand moves, never jumps. */
  private static readonly POLES: Readonly<Record<Elbow, Point>> = {
    out: { x: -0.7, y: 0.7, z: -0.3 },
    down: { x: -0.25, y: 1, z: -0.3 },
  };
  /** How far in front of the shoulders the hands are on the knees, which the thighs bring
   * toward the viewer, at the chest and at the mouth. */
  private static readonly AT_KNEES = 100;
  private static readonly AT_CHEST = 95;
  private static readonly AT_MOUTH = 80;
  /** How far along the mats they go to lie down, and how far back they lean on the way, in
   * degrees. */
  private static readonly TO_BED = 130;
  private static readonly LAID_BACK = 64;
  /** How far a bottle tips to pour, in degrees; and how far off the mats the hips are on hands
   * and knees. */
  private static readonly POUR = 118;
  /** How far from the hand that holds it by its middle a bottle's mouth is, and how far beyond
   * the hand a spoon's bowl and a bar's end are. */
  static readonly BOTTLE_NECK = DwellerHands.BOTTLE_NECK;
  static readonly SPOON = DwellerHands.SPOON;
  private static readonly BAR = DwellerHands.BAR;
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
        return DwellerPose.entering(DwellerPose.share(act, t), true);
      case "leave":
        return DwellerPose.entering(1 - DwellerPose.share(act, t), false);
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
    const [one, other] = look.elbows;
    const first = DwellerPose.arm(
      shoulders[0],
      look.hands[0],
      look.ahead[0],
      DwellerPose.pole(one, 0),
    );
    const second = DwellerPose.arm(
      shoulders[1],
      look.hands[1],
      look.ahead[1],
      DwellerPose.pole(other, 1),
    );
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

  /** Where the lips are for a pose that leans and tilts so: where a spoon, a bar or a bottle
   * goes. */
  static mouthAt(lean: number, tilt: number): Spot {
    const neck = DwellerPose.turned(DwellerPose.NECK, -lean);
    const angle = -lean * 0.55 + tilt;
    const head = DwellerPose.turned(DwellerPose.HEAD, angle);
    const lips = DwellerPose.turned(DwellerPose.MOUTH, angle);
    return { x: neck.x + head.x + lips.x, y: neck.y + head.y + lips.y };
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
      gaze: { x: -0.3 - 0.7 * glance, y: 0.25 - 0.2 * glance },
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
      gaze: { x: -1, y: 0.8 },
      ahead: [0, DwellerPose.AT_KNEES],
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
        gaze: { x: -1, y: 1 },
        ahead: [0, DwellerPose.AT_KNEES],
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
        gaze: { x: -1, y: 0.7 },
        ahead: [0, DwellerPose.AT_KNEES],
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
        gaze: { x: 0.3, y: 1 },
        ahead: [DwellerPose.AT_CHEST, DwellerPose.AT_CHEST],
        elbows: ["down", "down"],
      };
    }
    // A spoonful to the mouth every two seconds, and chewing between.
    const cycle = (t % 2) / 2;
    const lift = DwellerPose.arc(cycle / 0.7);
    const lean = 8;
    const lips = DwellerPose.mouthAt(lean, 2);
    // The hand under the mouth, the spoon's bowl up at the lips.
    const mouth = DwellerPose.holding(lips, DwellerPose.SPOON, lean, DwellerPose.AT_MOUTH);
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
      gaze: { x: 0.1 - 0.4 * lift, y: 1 - 1.2 * lift },
      ahead: [
        DwellerPose.AT_CHEST + (DwellerPose.AT_MOUTH - DwellerPose.AT_CHEST) * lift,
        DwellerPose.AT_CHEST,
      ],
      elbows: ["down", "down"],
    };
  }

  private static drinking(share: number): DwellerLook {
    const up = DwellerPose.ease(share / 0.3) * (1 - DwellerPose.ease((share - 0.75) / 0.25));
    const tilt = -16 * up;
    const lips = DwellerPose.mouthAt(2, tilt);
    // The bottle's mouth to the lips: the hand holds it by its middle, tipped, up and to the
    // side of them.
    const tipped = (DwellerPose.POUR * Math.PI) / 180;
    const mouth = {
      x: lips.x - DwellerPose.BOTTLE_NECK * Math.sin(tipped),
      y: lips.y + DwellerPose.BOTTLE_NECK * Math.cos(tipped),
    };
    return {
      ...DwellerPose.STILL,
      lean: 2,
      tilt,
      hands: [DwellerPose.mix(DwellerPose.BOTTLE, mouth, up), DwellerPose.KNEES[1]],
      holds: ["bottle", "nothing"],
      tip: DwellerPose.POUR * DwellerPose.ease((up - 0.35) / 0.5),
      mouth: up > 0.9 ? 0.5 : 0,
      eyes: up > 0.9 ? 0.25 : 1,
      gaze: { x: -0.2, y: -0.7 * up },
      ahead: [DwellerPose.AT_MOUTH * 0.6 * up, DwellerPose.AT_KNEES],
    };
  }

  private static biting(share: number): DwellerLook {
    // Two bites, a chew after each.
    const bite = share < 0.5 ? share / 0.5 : (share - 0.5) / 0.5;
    const up = DwellerPose.arc(Math.min(1, bite / 0.55));
    const lips = DwellerPose.mouthAt(4, 0);
    // The bar's end at the lips, the hand under it.
    const mouth = DwellerPose.holding(lips, DwellerPose.BAR, 4, DwellerPose.AT_MOUTH);
    const rest = { x: -60, y: -74 };
    const chew = bite > 0.55 ? 0.3 + 0.3 * Math.sin(2 * Math.PI * 9 * bite) : 0;
    return {
      ...DwellerPose.STILL,
      lean: 4,
      hands: [DwellerPose.mix(rest, mouth, up), DwellerPose.KNEES[1]],
      holds: ["bar", "nothing"],
      mouth: Math.max(chew, up > 0.85 ? 0.9 : 0),
      gaze: { x: -0.5, y: 0.6 - 0.4 * up },
      ahead: [
        DwellerPose.AT_CHEST + (DwellerPose.AT_MOUTH - DwellerPose.AT_CHEST) * up,
        DwellerPose.AT_KNEES,
      ],
      elbows: ["down", "out"],
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
      holds: ["pick", "neck"],
      mouth: 0.25 + 0.25 * Math.sin(beat / 4),
      eyes: Math.min(DwellerPose.blink(t), Math.sin(t / 3.1) > 0.75 ? 0.15 : 1),
      guitar: true,
      tap: Math.max(0, Math.sin(beat / 2)),
      gaze: Math.sin(t / 2.3) > 0.6 ? { x: -0.1, y: 0 } : { x: 1, y: 0.8 },
      ahead: [50, 40],
      elbows: ["out", "down"],
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
      gaze: { x: -1, y: 0.5 },
      hands: [
        DwellerPose.mix(KNEES[0], { x: PACK.x + 18 * reach, y: PACK.y - 12 * reach }, over),
        DwellerPose.mix(KNEES[1], { x: PACK.x + 60 - 20 * reach, y: PACK.y + 30 * reach }, over),
      ],
      ahead: [DwellerPose.AT_KNEES * (1 - over), DwellerPose.AT_KNEES * (1 - over)],
    };
  }

  /** In from the door, `inward`, or out to it: on hands and knees, facing the way they go. */
  private static entering(share: number, inward: boolean): DwellerLook {
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
      turned: inward && up < 0.5,
      gaze: { x: -0.8, y: 0.5 },
      ahead: [DwellerPose.AT_KNEES * up, DwellerPose.AT_KNEES * up],
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
      gaze: { x: 0, y: -0.5 * stretch },
      ahead: [DwellerPose.AT_KNEES * (1 - stretch), DwellerPose.AT_KNEES * (1 - stretch)],
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
    gaze: { x: -0.3, y: 0.25 },
    ahead: [DwellerPose.AT_KNEES, DwellerPose.AT_KNEES],
    elbows: ["out", "out"],
  };

  /** How far through an act that plays once `seconds` is, 0 to 1. */
  private static share(act: Act, seconds: number): number {
    return Math.min(1, seconds / (DwellerPose.ONCE[act] ?? 1));
  }

  /** An arm from `shoulder` to `target`, `ahead` of it toward the viewer, its elbow bent the
   * way `pole` points: the hand as near the target as the arm reaches, the bones their lengths
   * in three dimensions, and drawn flat, so a bone that points toward the viewer is shorter. */
  private static arm(
    shoulder: Spot,
    target: Spot,
    ahead: number,
    pole: Point,
  ): { readonly elbow: Spot; readonly hand: Spot; readonly angle: number } {
    const { UPPER_ARM: upper, FOREARM: lower } = DwellerPose;
    const to = { x: target.x - shoulder.x, y: target.y - shoulder.y, z: ahead };
    const far = Math.hypot(to.x, to.y, to.z);
    const reach = Math.min(Math.max(far, Math.abs(upper - lower) + 0.01), upper + lower - 0.01);
    const along =
      far < 1e-9 ? { x: 0, y: 1, z: 0 } : { x: to.x / far, y: to.y / far, z: to.z / far };
    // The elbow on the circle it can be on, the way the pole points square to the arm.
    const dot = pole.x * along.x + pole.y * along.y + pole.z * along.z;
    const square = {
      x: pole.x - dot * along.x,
      y: pole.y - dot * along.y,
      z: pole.z - dot * along.z,
    };
    const size = Math.hypot(square.x, square.y, square.z);
    const side =
      size < 1e-9
        ? { x: 0, y: 0, z: -1 }
        : { x: square.x / size, y: square.y / size, z: square.z / size };
    const cos = (upper * upper + reach * reach - lower * lower) / (2 * upper * reach);
    const sin = Math.sqrt(Math.max(0, 1 - cos * cos));
    const elbow = {
      x: shoulder.x + upper * (along.x * cos + side.x * sin),
      y: shoulder.y + upper * (along.y * cos + side.y * sin),
    };
    const hand = { x: shoulder.x + along.x * reach, y: shoulder.y + along.y * reach };
    const angle = (Math.atan2(hand.y - elbow.y, hand.x - elbow.x) * 180) / Math.PI - 90;
    return { elbow, hand, angle };
  }

  /** Which way an elbow of `side` points. */
  private static pole(elbow: Elbow, side: 0 | 1): Point {
    const { x, y, z } = DwellerPose.POLES[elbow];
    return { x: side === 0 ? x : -x, y, z };
  }

  /** Where the first hand goes, `ahead` and its elbow down, for what it holds along the forearm
   * to reach `spot` `length` beyond it: a spoon's bowl or a bar's end to the lips, for a body
   * that leans `lean`. */
  private static holding(spot: Spot, length: number, lean: number, ahead: number): Spot {
    const shoulder = DwellerPose.turned(DwellerPose.SHOULDERS[0], -lean);
    const pole = DwellerPose.pole("down", 0);
    let hand = { x: spot.x, y: spot.y + length };
    // The forearm's way moves little with the hand: a few steps find it.
    for (let step = 0; step < 4; step += 1) {
      const arm = DwellerPose.arm(shoulder, hand, ahead, pole);
      const dx = arm.hand.x - arm.elbow.x;
      const dy = arm.hand.y - arm.elbow.y;
      const size = Math.hypot(dx, dy) || 1;
      hand = { x: spot.x - (dx / size) * length, y: spot.y - (dy / size) * length };
    }
    return hand;
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
