import { DwellerHands } from "./dweller-hands";
import type { Held } from "./dweller-hands";
import { DwellerHead } from "./dweller-head";
import { DwellerShapes } from "./dweller-shapes";
import { HandBones, HandTurn, Vector3 } from "./hand-bones";
import type { HandShape } from "./hand-bones";

export type { Held } from "./dweller-hands";

/** A point of the tent's picture, in its pixels: across to the right, and down. */
export interface Spot {
  readonly x: number;
  readonly y: number;
}

/** A point in three dimensions: a spot, and how far toward the viewer it is. */
export interface Point extends Spot {
  readonly z: number;
}

/** What the person in the tent is seen doing: sitting; at the stove melting snow; cooking, which
 * is lighting the stove, pouring the bottle's water into the pot, warming the hands while it
 * boils, filling the meal's pouch from the pot, letting it stand, and eating; asleep in the bag;
 * playing the guitar; and, once each, crawling in and out, a drink, a bar, a hand in the pack,
 * lying down and sitting up again. */
export type Act =
  | "idle"
  | "melt"
  | "light"
  | "pour"
  | "boil"
  | "fill"
  | "steep"
  | "eat"
  | "sleep"
  | "guitar"
  | "enter"
  | "leave"
  | "drink"
  | "bar"
  | "pack"
  | "lie"
  | "wake";

/**
 * A hand this frame: where it grips, or its middle when it holds nothing, from the hips; how far
 * in front of the shoulders that is, toward the viewer, in pixels; which way its elbow points,
 * as the nearer the stove's does, across to the viewer's right, down and toward the viewer (the
 * other's is mirrored);
 * what it holds; which way that points, its top or its working end, in degrees clockwise from
 * straight up, or, for an empty hand, its fingers; how firmly the hand is set to that, 0 lying
 * along the forearm as it falls to 1; and, for a hand across what it holds, which side of it the
 * wrist is on: 1 as the hand reaches out from the body, -1 from the other side.
 *
 * And, for the hand's own shape (#274): what an empty hand is ready to take, or has just let go,
 * shaped and turned for it; how far it's closed on that, 0 open to 1, closed by itself on what it
 * holds; how far an open hand is spread out flat, 0 relaxed to 1, as on the mats or to a stove's
 * warmth; and which way the back of an empty hand faces, as the nearer the stove's does (the
 * other's is mirrored), up and toward the viewer by itself.
 */
export interface HandLook {
  readonly at: Spot;
  readonly ahead: number;
  readonly elbow: Point;
  readonly holds: Held;
  readonly aim: number;
  readonly firm: number;
  readonly side: 1 | -1;
  readonly ready?: Held;
  readonly shut?: number;
  readonly spread?: number;
  readonly back?: Point;
}

/** A hand in three dimensions this frame (#274): how it's posed and turned, where its wrist is,
 * from the hips and toward the viewer from the shoulders, and how far toward the viewer what it
 * holds is, `null` for nothing or what's carried behind the arm. */
export interface HandPlace {
  readonly shape: HandShape;
  readonly turn: HandTurn;
  readonly wrist: Vector3;
  readonly thing: number | null;
}

/**
 * The person in the tent this frame, from their hips as they sit: how far along the floor from
 * their seat they are, and how far off it their hips are; how far they lean toward the stove, in
 * degrees; how far back their head tilts, and to the side; each hand, the one nearer the stove
 * first; how far open the mouth is, 0 to 1, and the eyes, 1 to 0; whether they face the pack,
 * away from the stove; how far into the sleeping bag they are, 0 sitting up to 1 lying in it; how
 * much of them shows; and whether the guitar is on their lap.
 */
export interface DwellerLook {
  readonly shift: number;
  readonly rise: number;
  readonly lean: number;
  readonly tilt: number;
  readonly sway: number;
  readonly hands: readonly [HandLook, HandLook];
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
  /** Where the eyes look, -1 to 1 each way: to the viewer's left and right, up and down. */
  readonly gaze: Spot;
  /** What's poured, from where to where: the bottle's water into the pot, the pot's into the
   * pouch. */
  readonly stream: readonly [Spot, Spot] | null;
  /** A lump of snow on its way down into the pot. */
  readonly lump: Spot | null;
  /** A meal's pouch set down to stand on the lap, where it's held from and how it leans, while
   * the hand that brought it takes it again another way. */
  readonly pouch: { readonly at: Spot; readonly aim: number } | null;
  /** What the first hand's thing goes into, out of sight: the pot on the stove, or the pouch in
   * the other hand. */
  readonly dips: "pot" | "pouch" | null;
}

/** The person's joints this frame, in the picture's pixels from their hips: the shoulders,
 * elbows and wrists, where each hand grips, the neck, and the head's middle and its angle. */
export interface DwellerJoints {
  readonly torso: number;
  readonly neck: Spot;
  readonly head: Spot;
  readonly headAngle: number;
  readonly mouth: Spot;
  readonly shoulders: readonly [Spot, Spot];
  readonly elbows: readonly [Spot, Spot];
  readonly wrists: readonly [Spot, Spot];
  readonly hands: readonly [Spot, Spot];
  /** Each forearm's angle and each hand's, in degrees clockwise from pointing down; and which
   * way what each hand holds points, in degrees clockwise from straight up. */
  readonly forearms: readonly [number, number];
  readonly palms: readonly [number, number];
  readonly aims: readonly [number, number];
  /** How far toward the viewer each elbow is, from the shoulders; and each hand in three
   * dimensions. */
  readonly elbowsAhead: readonly [number, number];
  readonly grips: readonly [HandPlace, HandPlace];
}

/** An arm as it reaches: its elbow and its wrist, where the hand grips, the forearm's angle and
 * the hand's, which way what it holds points, how far toward the viewer the elbow is, and the
 * hand in three dimensions. */
interface Reach {
  readonly elbow: Spot;
  readonly wrist: Spot;
  readonly at: Spot;
  readonly forearm: number;
  readonly palm: number;
  readonly aim: number;
  readonly elbowAhead: number;
  readonly place: HandPlace;
}

/** A value at each of some times, in order. */
type Keys<T> = readonly (readonly [number, T])[];

/**
 * How the person in the tent moves (#258, #269), the picture's own: a pose for each thing they
 * do, from the seconds they've been at it. Each movement is its key poses in time, eased from one
 * to the next along curves, the body leaning in and the head and the eyes following the hands. A
 * chore's parts each begin and end at the same pose by the stove, so one runs into the next.
 *
 * Sitting, they breathe, blink and look about. To light the stove they hold a lighter to the
 * burner, and the flame comes up. Melting snow, they stir the pot, the spoon down in it; leave
 * the spoon there, take a lump from the snow sack and drop it in; and stir again. Cooking, they
 * take the bottle from the floor and pour its water into the pot; hold their hands to the stove
 * while it boils; take a pouch, lift the pot by its handle and fill the pouch; seal it and let it
 * stand; then eat, the spoon into the pouch and up to the mouth, chewing between. For a drink the
 * bottle comes up from the floor, tips with the head and goes back; a bar comes out of a pocket
 * for two bites. The guitar is strummed with one hand while the other moves along its neck, the
 * head and a foot keeping time; packing, they turn to the pack and reach into it; to sleep they
 * lie down in the bag, and wake with a stretch.
 *
 * An arm is three bones, the upper arm, the forearm and the hand, bent in three dimensions to
 * where the hand grips and drawn flat, so one that reaches toward the viewer is shorter; its
 * elbow points the way the pose says, and is never behind the arm, where the forearm would be
 * seen end on. The hand turns at the wrist to what it holds, across a bottle or along a spoon,
 * no further than a wrist bends; what's left, the thing takes up in the fingers, and a pose asks
 * for no more than that: what's held points the way the pose aims it, so a bottle is upright as
 * it's taken from the floor, its mouth is at the lips, and a spoon's bowl is in the pouch. It
 * holds nothing: the same act and seconds give the same pose.
 */
export class DwellerPose {
  /** The bones, in the picture's pixels, the slope climber's (#264): the upper arm, and the
   * forearm to the wrist. */
  static readonly UPPER_ARM = DwellerShapes.UPPER_ARM;
  static readonly FOREARM = DwellerShapes.FOREARM;
  /** How far a wrist bends, in degrees: an empty hand's way from its forearm's, and, in the
   * tests, a hand's from its forearm's whatever it holds. */
  static readonly WRIST_BEND = 75;
  /** The way the back of an empty hand faces, unless a pose says: up and toward the viewer, as a
   * hand lies on a knee. */
  static readonly BACK_UP: Point = { x: 0, y: -0.6, z: 0.8 };
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
    drink: 3.5,
    bar: 3.6,
    pack: 2.4,
    lie: 1.2,
    wake: 1.8,
  };
  /** What's done aside from a chore, and leaves the stove as it burns. */
  static readonly ASIDE: readonly Act[] = ["drink", "bar", "pack"];
  /** How long each part of a chore's movement takes, in seconds: after it, they wait by the
   * stove, or hold what they hold. Melting and eating go round: a round of each. */
  static readonly LASTS = {
    light: 2.2,
    pour: 4.8,
    boil: 3.2,
    fill: 5.3,
    steep: 2.2,
    melt: 7.2,
    eat: 2.4,
  } as const;
  /** From the hips on the seat, where the tent's things are (`TentArt`): the middle of the pot's
   * rim, how far to its wall inside and down to its bottom; the burner's flame under it; the
   * pot's handle; the snow in its sack; the nearest bottle, by its middle; and the nearest meal's
   * pouch, where it's held, and how it leans. */
  static readonly POT: Spot = { x: -236.6, y: -50.5 };
  static readonly POT_INSIDE = { half: 28, deep: 62 };
  static readonly BURNER: Spot = { x: -236.6, y: 7.5 };
  static readonly HANDLE: Spot = { x: -236.6, y: -28.5 };
  static readonly SNOW: Spot = { x: -181, y: 1.5 };
  static readonly BOTTLE: Spot = { x: -123, y: 22 };
  static readonly MEAL: Spot = { x: 217.3, y: 15.6 };
  static readonly MEAL_LEANS = -8;
  /** How the pouch leans toward the pot as it's filled. */
  static readonly FILL_LEANS = -18;
  /** How far along the floor from the seat the door is, and the pack's seat; and how far over
   * toward the meals they shift to take one from the pile. */
  static readonly FROM_DOOR = -330;
  static readonly AT_PACK = 190;
  static readonly TO_MEALS = 45;
  /** Where the hands rest, on the knees; and the pack, from the seat they move to for it. */
  private static readonly KNEES: readonly [Spot, Spot] = [
    { x: -84, y: -24 },
    { x: 86, y: -24 },
  ];
  private static readonly PACK: Spot = { x: -150, y: -104 };
  /** The guitar on the lap: where its strings are strummed, and the ends of the stretch of its
   * neck the other hand plays on; and the strum's beat, in strokes a second. */
  private static readonly STRUM: Spot = { x: -16, y: -44 };
  private static readonly FRETS: readonly [Spot, Spot] = [
    { x: 96, y: -94 },
    { x: 149, y: -119 },
  ];
  private static readonly BEAT = 2.6;
  /** The ways an elbow points, as the nearer the stove's does (the other's is mirrored), as a
   * person's hang: out to the side, for a hand on its knee; down, for a hand held up in front
   * of the body; out and down, for a hand that reaches out to the stove; out, down and back,
   * for one that reaches down beside the body to the floor; out level, for a hand that reaches
   * down into something held at the chest; and back toward the knees, on hands and knees; under
   * the arm, for one that reaches out and up beside the shoulder, and back behind it, as it
   * turns from the one way to the other; out level, for one that carries something
   * from the side round to the front. Each pose keeps its elbow's way well off the arm's line,
   * where it's clear which side of the arm the elbow is: turning from the one side to the
   * other, round behind it. Never up over the shoulder, as a wing, nor round behind the arm for
   * long, where the forearm points at the viewer, a sleeve seen end on. */
  private static readonly OUT: Point = { x: -0.7, y: 0.7, z: 0 };
  private static readonly DOWN: Point = { x: -0.25, y: 1, z: 0 };
  private static readonly WIDE: Point = { x: -0.85, y: 0.5, z: 0.05 };
  private static readonly BEHIND: Point = { x: -0.6, y: 0.8, z: -0.1 };
  private static readonly SIDE: Point = { x: -0.9, y: 0.2, z: 0 };
  private static readonly BACK: Point = { x: 0.7, y: -0.45, z: -0.2 };
  private static readonly UNDER: Point = { x: 0.35, y: 1, z: 0 };
  private static readonly REAR: Point = { x: -0.35, y: 0.35, z: -0.87 };
  private static readonly CARRY: Point = { x: -1, y: 0, z: 0 };
  /** How far each elbow is drawn from its pose's way toward where it leaves the wrist straight,
   * from none to all: the hand turned to what it holds, the forearm follows it. */
  private static readonly STRAIGHT = 0.8;
  /** How far off the arm's line, in pixels, that elbow is before its way counts in full. */
  private static readonly OFF_LINE = 28;
  /** How much of how far off its line the arm's bend puts the elbow that way must be off it to
   * count in full: near the line, it's not clear which side of the arm it's on. */
  private static readonly FOLDED = 0.6;
  /** How much less that elbow draws it the further up it is: an arm that holds something up
   * bends at the wrist, its elbow down, not out like a wing. */
  private static readonly UP = 0.6;
  /** How much of the hand's way toward or from the viewer that elbow follows: a hand turned to
   * the viewer doesn't draw the elbow back behind the body, the forearm end on. */
  private static readonly KEEP = 0.2;
  /** How much of the forearm's way toward or from the viewer the hand follows. */
  private static readonly FLAT = 0.4;
  /** How much an elbow is pulled out from the body and down, besides its pose's way. */
  private static readonly HANG = { OUTWARD: 0.45, DOWNWARD: 0.3 };
  /** How far toward the viewer a hand reaches at the most, for how far across the picture it
   * is from its shoulder: a little more than that far, the arm no steeper toward the viewer. */
  private static readonly FORWARD = 1.3;
  /** How far in front of the shoulders the hands are on the knees, which the thighs bring
   * toward the viewer, at the chest and at the mouth. */
  private static readonly AT_KNEES = 80;
  private static readonly AT_CHEST = 70;
  private static readonly AT_MOUTH = 60;
  /** How far along the mats they go to lie down, and how far back they lean on the way, in
   * degrees; and how far off the mats the hips are on hands and knees. */
  private static readonly TO_BED = 130;
  private static readonly LAID_BACK = 64;
  private static readonly ON_KNEES = 46;
  /** The way the back of the fist on the stirring spoon faces: to the stove's side, and up. */
  private static readonly ON_SPOON: Point = { x: 0.85, y: -0.5, z: 0.1 };
  /** By the stove: how far they lean to it and how far the head bows. */
  private static readonly TENDING = { lean: 26, tilt: 12 };
  /** The meal's pouch as it's held to eat from: where, and how it leans to the spoon. */
  private static readonly SUPPER = { at: { x: 12, y: -38 }, aim: -8 };
  /** How far a bottle tips before its water runs, in degrees; and how far a lump of snow falls
   * in a second's square, in pixels. */
  private static readonly RUNS = 80;
  private static readonly FALLS = 450;

  /** The look of the act `seconds` in. */
  look(act: Act, seconds: number): DwellerLook {
    const t = Math.max(0, seconds);
    switch (act) {
      case "melt":
        return DwellerPose.melting(t);
      case "light":
        return DwellerPose.lighting(t);
      case "pour":
        return DwellerPose.pouring(t);
      case "boil":
        return DwellerPose.boiling(t);
      case "fill":
        return DwellerPose.filling(t);
      case "steep":
        return DwellerPose.steeping(t);
      case "eat":
        return DwellerPose.eating(t);
      case "sleep":
        return DwellerPose.asleep(t);
      case "guitar":
        return DwellerPose.strumming(t);
      case "enter":
        return DwellerPose.entering(DwellerPose.share(act, t), true);
      case "leave":
        return DwellerPose.entering(1 - DwellerPose.share(act, t), false);
      case "drink":
        return DwellerPose.drinking(t);
      case "bar":
        return DwellerPose.biting(t);
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

  /** The joints of a look: the arms bent from the shoulders to where the hands grip. */
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
    const first = DwellerPose.reach(shoulders[0], look.hands[0], 0);
    const second = DwellerPose.reach(shoulders[1], look.hands[1], 1);
    return {
      torso: -look.lean,
      neck,
      head,
      headAngle,
      mouth: { x: head.x + lips.x, y: head.y + lips.y },
      shoulders,
      elbows: [first.elbow, second.elbow],
      wrists: [first.wrist, second.wrist],
      hands: [first.at, second.at],
      forearms: [first.forearm, second.forearm],
      palms: [first.palm, second.palm],
      aims: [first.aim, second.aim],
      elbowsAhead: [first.elbowAhead, second.elbowAhead],
      grips: [first.place, second.place],
    };
  }

  /** Where the lips are for a pose that leans, tilts and sways so: where a spoon, a bar or a
   * bottle goes. */
  static mouthAt(lean: number, tilt: number, sway = 0): Spot {
    const neck = DwellerPose.turned(DwellerPose.NECK, -lean);
    const angle = -lean * 0.55 + tilt;
    const head = DwellerPose.turned(DwellerPose.HEAD, angle);
    const lips = DwellerPose.turned(DwellerPose.MOUTH, angle);
    return { x: neck.x + head.x + lips.x + sway, y: neck.y + head.y + lips.y };
  }

  /** Which way something points that's aimed so, in degrees clockwise from straight up: one
   * pixel long. */
  static pointing(aim: number): Spot {
    const angle = (aim * Math.PI) / 180;
    return { x: Math.sin(angle), y: -Math.cos(angle) };
  }

  /** Where the pot's lip is, the pot held by its handle at `at` and tipped `aim`. */
  static lip(at: Spot, aim: number): Spot {
    const { x, y } = DwellerHands.POT_LIP;
    const angle = (aim * Math.PI) / 180;
    return {
      x: at.x + x * Math.cos(angle) - y * Math.sin(angle),
      y: at.y + x * Math.sin(angle) + y * Math.cos(angle),
    };
  }

  // Sitting, and by the stove.

  private static sitting(t: number): DwellerLook {
    const breath = Math.sin((2 * Math.PI * t) / 4.2);
    // A look to the door, and back, now and then.
    const glance = DwellerPose.pulse(t, 9, 1.6);
    return {
      ...DwellerPose.STILL,
      lean: 4 + 1.2 * breath,
      tilt: -6 * glance,
      sway: -3 * glance,
      hands: [DwellerPose.resting(0, -1.5 * breath), DwellerPose.resting(1, -1.5 * breath)],
      eyes: DwellerPose.blink(t),
      gaze: { x: -0.3 - 0.7 * glance, y: 0.25 - 0.2 * glance },
    };
  }

  /** The lighter to the burner: leant right over to the stove, two strikes of the thumb, the
   * second catches, and the flame comes up. */
  private static lighting(t: number): DwellerLook {
    const { BURNER, KNEES, TENDING } = DwellerPose;
    const glide = DwellerPose.glide;
    const aim = -24;
    const there = DwellerPose.holding(
      { x: BURNER.x + 16, y: BURNER.y + 1 },
      aim,
      DwellerHands.REACH.lighter,
    );
    // The thumb's strike dips the hand a little.
    const strike = DwellerPose.bump(t, 0.87, 0.1) + DwellerPose.bump(t, 1.1, 0.1);
    const at = DwellerPose.along(t, [
      [0, KNEES[0]],
      [0.35, { x: -138, y: -28 }],
      [0.75, there],
      [1.5, there],
      [1.85, { x: -150, y: -18 }],
      [2.2, KNEES[0]],
    ]);
    const holds = DwellerPose.pick<Held>(t, [
      [0, "nothing"],
      [0.3, "lighter"],
      [0.82, "lit"],
      [0.92, "lighter"],
      [1.05, "lit"],
      [1.34, "lighter"],
      [1.82, "nothing"],
    ]);
    return {
      ...DwellerPose.STILL,
      lean: glide(t, [
        [0, 4],
        [0.75, 31],
        [1.5, 31],
        [2.2, TENDING.lean],
      ]),
      tilt: glide(t, [
        [0, 0],
        [0.75, 14],
        [1.5, 14],
        [2.2, TENDING.tilt],
      ]),
      hands: [
        {
          at: { x: at.x, y: at.y + 2 * strike },
          holds,
          aim,
          firm: glide(t, [
            [0.1, 0],
            [0.5, 1],
            [1.6, 1],
            [2, 0],
          ]),
          ready: "lighter",
          shut: glide(t, [
            [0.22, 0],
            [0.32, 1],
            [1.8, 1],
            [1.95, 0],
          ]),
          ahead: glide(t, [
            [0, DwellerPose.AT_KNEES],
            [0.75, 26],
            [1.5, 26],
            [2.2, DwellerPose.AT_KNEES],
          ]),
          elbow: DwellerPose.swing(t, [
            [0, DwellerPose.OUT],
            [0.6, DwellerPose.BEHIND],
            [1.6, DwellerPose.BEHIND],
            [2.2, DwellerPose.OUT],
          ]),
          side: 1,
        },
        DwellerPose.resting(1),
      ],
      eyes: DwellerPose.blink(t),
      gaze: { x: -1, y: 1 },
      flame: glide(t, [
        [1.08, 0],
        [1.45, 1],
      ]),
    };
  }

  /** The bottle from the floor, its water into the pot, and back to where it stood: leant over to
   * the stove, the bottle tipped over the pot from under it, the elbow out and down. */
  private static pouring(t: number): DwellerLook {
    const { BOTTLE, POT, KNEES, TENDING } = DwellerPose;
    const glide = DwellerPose.glide;
    const reach = DwellerHands.REACH.bottle;
    const standing = { x: BOTTLE.x, y: BOTTLE.y - reach };
    const carried = { x: -158, y: -118 };
    const over = { x: POT.x + 4, y: POT.y - 22 };
    // The bottle's mouth leads: up from where it stood, over the pot, and back.
    const mouth = DwellerPose.along(t, [
      [0.65, standing],
      [0.82, standing],
      [1.45, carried],
      [1.95, over],
      [3.3, over],
      [3.75, carried],
      [4.3, standing],
    ]);
    const aim =
      glide(t, [
        [0.82, 0],
        [1.4, -14],
        [2, -100],
        [3.25, -114],
        [3.75, -10],
        [4.3, 0],
      ]) + (t > 2 && t < 3.25 ? 1.5 * Math.sin(2 * Math.PI * 2.2 * t) : 0);
    const way = DwellerPose.pointing(aim);
    const held = { x: mouth.x - way.x * reach, y: mouth.y - way.y * reach };
    const taken = t >= 0.74 && t < 4.36;
    const at = taken
      ? held
      : DwellerPose.along(t, [
          [0, KNEES[0]],
          [0.4, { x: BOTTLE.x - 6, y: BOTTLE.y - 34 }],
          [0.65, BOTTLE],
          [0.74, BOTTLE],
          [4.36, BOTTLE],
          [4.45, BOTTLE],
          [4.62, { x: BOTTLE.x - 4, y: BOTTLE.y - 30 }],
          [4.8, KNEES[0]],
        ]);
    const running = taken && aim < -DwellerPose.RUNS;
    return {
      ...DwellerPose.STILL,
      // Down to the bottle, then right over to the pot to pour.
      lean: glide(t, [
        [0, TENDING.lean],
        [0.65, 22],
        [1.95, 30],
        [3.3, 30],
        [4.3, 22],
        [4.8, TENDING.lean],
      ]),
      tilt: glide(t, [
        [0, TENDING.tilt],
        [0.65, 14],
        [1.9, 16],
        [3.3, 16],
        [4.8, TENDING.tilt],
      ]),
      hands: [
        {
          at,
          holds: taken ? "bottle" : "nothing",
          aim,
          firm: glide(t, [
            [0.1, 0],
            [0.5, 1],
            [4.45, 1],
            [4.75, 0],
          ]),
          ready: "bottle",
          shut: glide(t, [
            [0.45, 0],
            [0.65, 0.2],
            [0.76, 1],
            [4.34, 1],
            [4.48, 0.2],
            [4.7, 0],
          ]),
          ahead: glide(t, [
            [0, DwellerPose.AT_KNEES],
            [0.65, 34],
            [1.95, 30],
            [3.3, 30],
            [4.3, 34],
            [4.8, DwellerPose.AT_KNEES],
          ]),
          elbow: DwellerPose.swing(t, [
            [0, DwellerPose.OUT],
            [0.45, DwellerPose.BEHIND],
            [1.1, DwellerPose.BEHIND],
            [1.8, DwellerPose.WIDE],
            [3.4, DwellerPose.WIDE],
            [4.0, DwellerPose.BEHIND],
            [4.5, DwellerPose.BEHIND],
            [4.8, DwellerPose.OUT],
          ]),
          side: 1,
        },
        DwellerPose.resting(1),
      ],
      eyes: DwellerPose.blink(t),
      gaze: {
        x: -1,
        y: glide(t, [
          [0, 0.85],
          [0.6, 1],
          [1.9, 0.7],
          [3.3, 0.7],
          [4.3, 1],
          [4.8, 0.85],
        ]),
      },
      flame: 1,
      stream: running ? [mouth, { x: mouth.x - 3, y: POT.y + 30 }] : null,
    };
  }

  /** The hands held out to the flame while the water comes to the boil, spread to its warmth,
   * the palms to it, the fingers working. */
  private static boiling(t: number): DwellerLook {
    const { KNEES, TENDING } = DwellerPose;
    const glide = DwellerPose.glide;
    const warm = glide(t, [
      [0, 0],
      [0.8, 1],
      [2.4, 1],
      [3.2, 0],
    ]);
    // The fingers work in the warmth, one hand after the other.
    const rub = (2 * Math.PI * t) / 0.95;
    const near = DwellerPose.along(t, [
      [0, KNEES[0]],
      [0.75, { x: -190, y: -34 }],
      [2.45, { x: -190, y: -34 }],
      [3.2, KNEES[0]],
    ]);
    const far = DwellerPose.along(t, [
      [0, KNEES[1]],
      [0.85, { x: -142, y: -58 }],
      [2.35, { x: -142, y: -58 }],
      [3.2, KNEES[1]],
    ]);
    // A look up at the door, where the steam goes.
    const glance = DwellerPose.bump(t, 1.9, 0.45);
    // The palms down to the flame, the backs up and to the viewer.
    const palmsDown = { x: 0.3, y: -0.75, z: 0.6 };
    return {
      ...DwellerPose.STILL,
      lean: TENDING.lean + 3 * warm,
      tilt: TENDING.tilt - 12 * glance,
      hands: [
        {
          at: { x: near.x + 3 * warm * Math.sin(rub), y: near.y + 2 * warm * Math.cos(rub) },
          holds: "nothing",
          aim: -100 + 7 * Math.sin(rub),
          firm: warm,
          spread: 0.75 * warm,
          back: palmsDown,
          ahead: DwellerPose.AT_KNEES - 55 * warm,
          elbow: DwellerPose.swing(t, [
            [0, DwellerPose.OUT],
            [0.75, DwellerPose.WIDE],
            [2.45, DwellerPose.WIDE],
            [3.2, DwellerPose.OUT],
          ]),
          side: 1,
        },
        {
          at: { x: far.x - 3 * warm * Math.sin(rub), y: far.y + 2 * warm * Math.sin(rub) },
          holds: "nothing",
          aim: -106 - 7 * Math.sin(rub),
          firm: warm,
          spread: 0.75 * warm,
          // As the nearer hand's, seen in a mirror: the same way in the picture.
          back: { x: -palmsDown.x, y: palmsDown.y, z: palmsDown.z },
          ahead: DwellerPose.AT_KNEES - 30 * warm,
          elbow: DwellerPose.swing(t, [
            [0, DwellerPose.OUT],
            [0.85, DwellerPose.DOWN],
            [2.35, DwellerPose.DOWN],
            [3.2, DwellerPose.OUT],
          ]),
          side: 1,
        },
      ],
      eyes: DwellerPose.blink(t),
      gaze: { x: -1 + 0.4 * glance, y: 0.85 - 1.3 * glance },
      flame: 1,
    };
  }

  /** A pouch from the pile, lifted by its top and set down to stand on the lap, taken again by
   * its side and held low by the stove's side of the lap; the pot off the stove by its handle,
   * its water poured into the pouch just over it; the pot back, the stove out. */
  private static filling(t: number): DwellerLook {
    const { MEAL, MEAL_LEANS, HANDLE, KNEES, TENDING, SUPPER } = DwellerPose;
    const glide = DwellerPose.glide;
    // The pouch: taken from the pile by its top, the fingers over its face, and set down on the
    // lap, held there by its top while the other hand takes the pot and leans back up with it;
    // let go, and taken again by its side, leant to the pot to be filled, and brought up to the
    // lap.
    const filled = { x: -14, y: -16 };
    const [set, letGo, freed, retaken] = [1.42, 2.0, 2.1, 2.32];
    const byTop = t >= 0.82 && t < letGo;
    const pouchAim = glide(t, [
      [0.82, MEAL_LEANS],
      [set, -3],
      [retaken, -3],
      [2.5, DwellerPose.FILL_LEANS],
      [4.1, DwellerPose.FILL_LEANS],
      [5.3, SUPPER.aim],
    ]);
    // Over toward the pile on the hips to reach it, and back.
    const shifts: Keys<number> = [
      [0.1, 0],
      [0.65, DwellerPose.TO_MEALS],
      [0.95, DwellerPose.TO_MEALS],
      [1.55, 0],
    ];
    const shift = glide(t, shifts);
    // Where the hand goes, from the seat: from the knee over the pile and down to the pouch's
    // top; up out of the pile with it, and down onto the lap; then up off its top, and down to
    // its side. The pile doesn't move with them: where it is from the seat is where it is along the
    // floor less how far over they've shifted.
    const floor = (time: number, spot: Spot): readonly [number, Spot] => [
      time,
      { x: spot.x - glide(time, shifts), y: spot.y },
    ];
    const pouch = DwellerPose.along(t, [
      [0, KNEES[1]],
      floor(0.5, { x: MEAL.x - 14, y: MEAL.y - 34 }),
      floor(0.75, MEAL),
      floor(0.9, MEAL),
      floor(1.12, { x: MEAL.x - 34, y: MEAL.y - 26 }),
      [set, filled],
      [letGo, filled],
      [freed, { x: filled.x + 8, y: filled.y - 58 }],
      [retaken - 0.02, filled],
      [4.1, filled],
      [5.3, SUPPER.at],
    ]);
    const way = DwellerPose.pointing(pouchAim);
    const opening = {
      x: pouch.x + way.x * DwellerHands.REACH.pouch,
      y: pouch.y + way.y * DwellerHands.REACH.pouch,
    };
    // The pot: lifted by its handle, tipped about its lip over the pouch, and put back.
    const lifted = t >= 1.78 && t < 4.82;
    const potAim = glide(t, [
      [2.5, 0],
      [3.1, 66],
      [3.75, 74],
      [4.15, 0],
    ]);
    // Just over the pouch's opening as it leans to the pot, a little to the stove's side.
    const leant = DwellerPose.pointing(DwellerPose.FILL_LEANS);
    const over = {
      x: filled.x + leant.x * DwellerHands.REACH.pouch - 9,
      y: filled.y + leant.y * DwellerHands.REACH.pouch - 16,
    };
    const upright = DwellerPose.lip({ x: 0, y: 0 }, 0);
    const lip = DwellerPose.along(t, [
      [1.78, { x: HANDLE.x + upright.x, y: HANDLE.y + upright.y }],
      [2.5, { x: over.x - 4, y: over.y + 4 }],
      [3.1, over],
      [3.75, over],
      [4.15, { x: over.x - 4, y: over.y + 4 }],
      [4.82, { x: HANDLE.x + upright.x, y: HANDLE.y + upright.y }],
    ]);
    const tipped = DwellerPose.lip({ x: 0, y: 0 }, potAim);
    const handle = { x: lip.x - tipped.x, y: lip.y - tipped.y };
    const hand = lifted
      ? handle
      : DwellerPose.along(t, [
          [0, KNEES[0]],
          [0.95, KNEES[0]],
          [1.45, { x: HANDLE.x + 30, y: HANDLE.y - 20 }],
          [1.72, HANDLE],
          [1.78, HANDLE],
          [4.82, HANDLE],
          [4.9, HANDLE],
          [5.3, KNEES[0]],
        ]);
    const running = lifted && potAim > 52;
    return {
      ...DwellerPose.STILL,
      shift,
      lean: glide(t, [
        [0, TENDING.lean],
        [0.75, -10],
        [1.72, 30],
        [2.6, 10],
        [4.1, 10],
        [4.82, 30],
        [5.3, 6],
      ]),
      tilt: glide(t, [
        [0, TENDING.tilt],
        [0.75, 4],
        [1.72, 14],
        [3.1, 16],
        [4.1, 14],
        [5.3, 9],
      ]),
      hands: [
        {
          at: hand,
          holds: lifted ? "pot" : "nothing",
          aim: potAim,
          firm: glide(t, [
            [1.0, 0],
            [1.6, 1],
            [4.9, 1],
            [5.2, 0],
          ]),
          ready: "pot",
          shut: glide(t, [
            [1.5, 0],
            [1.7, 0.2],
            [1.8, 1],
            [4.8, 1],
            [4.92, 0.2],
            [5.1, 0],
          ]),
          ahead: glide(t, [
            [0.95, DwellerPose.AT_KNEES],
            [1.72, 24],
            [2.6, 62],
            [4.15, 62],
            [4.82, 24],
            [5.3, DwellerPose.AT_KNEES],
          ]),
          // Out, a little up, from the knee to the handle and round in front to the pouch and
          // back: the one side of the arm the whole way, never along it.
          elbow: DwellerPose.CARRY,
          side: 1,
        },
        {
          at: pouch,
          holds: byTop ? "lifted" : t >= retaken ? "pouch" : "nothing",
          aim: pouchAim,
          firm: glide(t, [
            [0.2, 0],
            [0.7, 1],
            [letGo, 1],
            [freed, 0],
            [retaken - 0.04, 1],
          ]),
          ready: t < freed ? "lifted" : "pouch",
          shut: glide(t, [
            [0.55, 0],
            [0.74, 0.2],
            [0.86, 1],
            [letGo, 1],
            [freed - 0.02, 0],
            [retaken - 0.12, 0],
            [retaken, 1],
          ]),
          ahead: glide(t, [
            [0, DwellerPose.AT_KNEES],
            [0.75, 34],
            [set, DwellerPose.AT_CHEST],
          ]),
          elbow: DwellerPose.swing(t, [
            [0, DwellerPose.OUT],
            [0.75, DwellerPose.BEHIND],
            [set, DwellerPose.DOWN],
          ]),
          side: 1,
        },
      ],
      eyes: DwellerPose.blink(t),
      gaze: {
        x: glide(t, [
          [0, -1],
          [0.6, 1],
          [1.05, 1],
          [1.4, 0.1],
          [1.72, 0.1],
          [2.05, -1],
          [2.6, -0.2],
          [4.1, -0.2],
          [4.6, -1],
          [5.3, 0],
        ]),
        y: 0.9,
      },
      flame: glide(t, [
        [1.55, 1],
        [1.9, 0],
      ]),
      stream: running ? [lip, { x: opening.x, y: opening.y + 6 }] : null,
      pouch: t >= letGo && t < retaken ? { at: filled, aim: -3 } : null,
    };
  }

  /** The pouch sealed, finger and thumb run along its top from above, and left to stand. */
  private static steeping(t: number): DwellerLook {
    const { KNEES, SUPPER } = DwellerPose;
    const glide = DwellerPose.glide;
    const way = DwellerPose.pointing(SUPPER.aim);
    const top = {
      x: SUPPER.at.x + way.x * (DwellerHands.REACH.pouch + 3),
      y: SUPPER.at.y + way.y * (DwellerHands.REACH.pouch + 3),
    };
    // Along the pouch's top, square to the way it stands.
    const edge = (by: number): Spot => ({ x: top.x - way.y * by, y: top.y + way.x * by });
    const near = DwellerPose.along(t, [
      [0, KNEES[0]],
      [0.55, edge(-19)],
      [1.2, edge(19)],
      [1.4, { x: edge(19).x + 2, y: edge(19).y - 9 }],
      [2.2, KNEES[0]],
    ]);
    const glance = DwellerPose.bump(t, 1.75, 0.4);
    return {
      ...DwellerPose.STILL,
      lean: 6,
      tilt: 9 - 11 * glance,
      hands: [
        {
          at: near,
          holds: t >= 0.5 && t < 1.3 ? "seal" : "nothing",
          aim: 180 + SUPPER.aim,
          firm: glide(t, [
            [0.1, 0],
            [0.45, 1],
            [1.35, 1],
            [1.8, 0],
          ]),
          ready: "seal",
          shut: glide(t, [
            [0.35, 0],
            [0.52, 1],
            [1.28, 1],
            [1.45, 0],
          ]),
          ahead: DwellerPose.AT_CHEST,
          elbow: DwellerPose.swing(t, [
            [0, DwellerPose.OUT],
            [0.55, DwellerPose.SIDE],
            [1.3, DwellerPose.SIDE],
            [2.2, DwellerPose.OUT],
          ]),
          side: 1,
        },
        DwellerPose.supper(t < 1.15 ? "pouch" : "sealed"),
      ],
      eyes: DwellerPose.blink(t),
      gaze: { x: 0.1 - 0.9 * glance, y: 0.9 - 0.9 * glance },
    };
  }

  /** Eating from the pouch on the lap: the spoon down into it from the side, level up to the
   * mouth and back, chewing between. */
  private static eating(t: number): DwellerLook {
    const { KNEES, SUPPER, LASTS } = DwellerPose;
    const glide = DwellerPose.glide;
    const reach = DwellerHands.REACH.spoon;
    // The spoon comes up from the lap first; then round and round.
    const begins = 0.5;
    const round = t < begins ? 0 : (t - begins) % LASTS.eat;
    const way = DwellerPose.pointing(SUPPER.aim);
    const opening = {
      x: SUPPER.at.x + way.x * DwellerHands.REACH.pouch,
      y: SUPPER.at.y + way.y * DwellerHands.REACH.pouch,
    };
    const tilt = glide(round, [
      [0, 9],
      [0.85, 7],
      [1.25, 13],
      [1.45, 11],
      [1.85, 2],
      [2.4, 9],
    ]);
    const lean = glide(round, [
      [0, 6],
      [0.85, 6],
      [1.25, 9],
      [1.45, 8],
      [1.85, 5],
      [2.4, 6],
    ]);
    const lips = DwellerPose.mouthAt(lean, tilt);
    const above = { x: opening.x - 10, y: opening.y - 15 };
    const bowl = DwellerPose.along(round, [
      [0, above],
      [0.38, { x: opening.x + 4, y: opening.y + 22 }],
      [0.58, { x: opening.x, y: opening.y + 15 }],
      [0.85, { x: opening.x - 9, y: opening.y - 24 }],
      [1.25, { x: lips.x - 3, y: lips.y + 2 }],
      [1.45, { x: lips.x - 3, y: lips.y + 2 }],
      [1.72, { x: lips.x - 17, y: lips.y + 12 }],
      [2.2, above],
      [2.4, above],
    ]);
    // Steep into the pouch, level with its load on the way up, and tipped to the lips.
    const aim = glide(round, [
      [0, 138],
      [0.38, 144],
      [0.58, 134],
      [0.85, 108],
      [1.25, 66],
      [1.45, 62],
      [1.72, 82],
      [2.2, 134],
      [2.4, 138],
    ]);
    const dir = DwellerPose.pointing(aim);
    const pinched = { x: bowl.x - dir.x * reach, y: bowl.y - dir.y * reach };
    const at =
      t < begins
        ? DwellerPose.along(t, [
            [0, KNEES[0]],
            [begins, pinched],
          ])
        : pinched;
    // The mouth opens for the spoon, closes on it, and chews until the next.
    const chewing = 0.1 + 0.16 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 3.1 * t));
    const mouth =
      t < begins
        ? 0
        : round < 0.55
          ? chewing * (1 - round / 0.55)
          : round < 0.95
            ? 0
            : round < 1.42
              ? glide(round, [
                  [0.95, 0],
                  [1.2, 0.85],
                  [1.3, 0.85],
                  [1.42, 0.12],
                ])
              : chewing;
    const loaded = t >= begins && round >= 0.5 && round < 1.4;
    return {
      ...DwellerPose.STILL,
      lean,
      tilt,
      hands: [
        {
          at,
          holds: t < 0.2 ? "nothing" : loaded ? "spoonful" : "spoon",
          aim,
          firm: glide(t, [
            [0.05, 0],
            [0.4, 1],
          ]),
          ready: "spoon",
          shut: glide(t, [
            [0.1, 0],
            [0.22, 1],
          ]),
          ahead: glide(round, [
            [0, DwellerPose.AT_CHEST],
            [0.85, DwellerPose.AT_CHEST],
            [1.25, DwellerPose.AT_MOUTH],
            [1.72, DwellerPose.AT_MOUTH],
            [2.2, DwellerPose.AT_CHEST],
          ]),
          // The elbow out to the side to reach down into the pouch, and down to lift to the
          // mouth.
          elbow:
            t < begins
              ? DwellerPose.swing(t, [
                  [0, DwellerPose.OUT],
                  [begins, DwellerPose.SIDE],
                ])
              : DwellerPose.swing(round, [
                  [0, DwellerPose.SIDE],
                  [0.6, DwellerPose.SIDE],
                  [1.25, DwellerPose.DOWN],
                  [1.6, DwellerPose.DOWN],
                  [2.2, DwellerPose.SIDE],
                  [2.4, DwellerPose.SIDE],
                ]),
          side: 1,
        },
        DwellerPose.supper("pouch"),
      ],
      mouth,
      eyes: DwellerPose.blink(t),
      gaze: {
        x: glide(round, [
          [0, 0.2],
          [0.85, 0.1],
          [1.25, -0.5],
          [1.85, -0.3],
          [2.4, 0.2],
        ]),
        y: glide(round, [
          [0, 1],
          [0.85, 0.9],
          [1.25, 0.4],
          [1.85, 0.1],
          [2.4, 1],
        ]),
      },
      dips: "pouch",
    };
  }

  /** The other hand with the meal's pouch, standing on the lap to eat from. */
  private static supper(holds: Held): HandLook {
    const { SUPPER } = DwellerPose;
    return {
      at: SUPPER.at,
      holds,
      aim: SUPPER.aim,
      firm: 1,
      ahead: DwellerPose.AT_CHEST,
      elbow: DwellerPose.DOWN,
      side: 1,
    };
  }

  /** Melting snow: the spoon round the pot, in the fist; then it's left there, a lump comes
   * from the sack in the cupped hand and is let fall in, and the spoon goes round again. */
  private static melting(t: number): DwellerLook {
    const { POT, SNOW, KNEES, TENDING, LASTS } = DwellerPose;
    const glide = DwellerPose.glide;
    const left = DwellerPose.SPOON_LEFT;
    // The hand goes from the knee to the spoon standing in the pot; then round and round, from
    // where the spoon is taken up.
    const begins = 0.7;
    const taken = 5.8;
    const round = t < begins ? taken : (t - begins + taken) % LASTS.melt;
    const turn = round < 2.6 ? round / 1.3 : round >= taken ? (round - taken) / 1.4 : 0;
    const stirs = t >= begins && (round < 2.6 || round >= taken);
    const spoon = DwellerPose.stirring(turn);
    const above = { x: left.at.x + 10, y: left.at.y - 12 };
    const drop = { x: POT.x + 6, y: POT.y - 26 };
    const at =
      t < begins
        ? DwellerPose.along(t, [
            [0, KNEES[0]],
            [0.58, above],
            [begins, left.at],
          ])
        : stirs
          ? spoon.at
          : DwellerPose.along(round, [
              [2.6, left.at],
              [2.8, above],
              [3.5, { x: SNOW.x + 2, y: SNOW.y - 30 }],
              [3.82, { x: SNOW.x, y: SNOW.y - 12 }],
              [4.1, { x: SNOW.x, y: SNOW.y - 24 }],
              [4.85, drop],
              [5.15, drop],
              [5.68, above],
              [taken, left.at],
            ]);
    const holds: Held =
      t < 0.64
        ? "nothing"
        : stirs || round < 2.66 || round >= 5.76
          ? "stirrer"
          : round >= 3.86 && round < 5
            ? "snow"
            : "nothing";
    // The hand's own way when it holds no spoon: from the spoon's, the fingers down into the
    // sack; up and out toward the pot with the lump in the palm, the palm turned down over it to
    // let the lump fall, and back to the spoon's.
    const fingers = glide(round, [
      [2.66, left.aim],
      [3.5, 180],
      [4.1, 180],
      [4.4, 282],
      [5.2, 282],
      [5.76, left.aim],
    ]);
    const aim = holds === "stirrer" ? spoon.aim : t < begins ? left.aim : fingers;
    const falling = round >= 5 && round < 5.42 ? round - 5 : null;
    const sack = glide(round, [
      [2.7, 0],
      [3.5, 1],
      [4.1, 1],
      [4.85, 0],
    ]);
    // The wrist goes slack between the spoon and the snow, as the hand turns from the one to the
    // other.
    const slack = glide(round, [
      [2.66, 1],
      [2.9, 0],
      [3.4, 0],
      [3.65, 1],
      [5.05, 1],
      [5.35, 0],
      [5.56, 0],
      [5.74, 1],
    ]);
    // The hand's back: to the stove's side on the spoon; to the viewer down into the sack; down
    // with the lump in the palm, and up as the palm turns over above the pot.
    const [palmUp, palmDown] = [
      { x: 0, y: 1, z: 0.35 },
      { x: 0.1, y: -1, z: 0.35 },
    ];
    const backs: Keys<Point> = [
      [2.66, DwellerPose.ON_SPOON],
      [3.5, { x: 0.3, y: 0, z: 1 }],
      [4.1, { x: 0.3, y: 0, z: 1 }],
      [4.4, palmUp],
      [4.85, palmUp],
      [5.0, palmDown],
      [5.2, palmDown],
      [5.76, DwellerPose.ON_SPOON],
    ];
    return {
      ...DwellerPose.STILL,
      lean:
        t < begins
          ? glide(t, [
              [0, TENDING.lean],
              [begins, 27],
            ])
          : 27 + 3 * sack + (stirs ? 1.2 * Math.sin(2 * Math.PI * turn) : 0),
      tilt: 13 + 2 * sack,
      hands: [
        {
          at,
          holds,
          aim,
          firm: Math.min(
            glide(t, [
              [0.2, 0],
              [0.55, 1],
            ]),
            t < begins ? 1 : slack,
          ),
          ready: t < begins || round < 3.3 || round > 5.5 ? "stirrer" : "snow",
          // Open from the knee, closing on the spoon as it's reached.
          shut:
            t < begins
              ? glide(t, [
                  [0.48, 0],
                  [0.64, 1],
                ])
              : holds === "stirrer"
                ? 1
                : glide(round, [
                    [2.66, 1],
                    [2.8, 0],
                    [3.62, 0],
                    [3.86, 1],
                    [4.98, 1],
                    [5.08, 0],
                    [5.62, 0],
                    [5.76, 1],
                  ]),
          back: t < begins ? DwellerPose.ON_SPOON : DwellerPose.swing(round, backs),
          ahead:
            t < begins
              ? glide(t, [
                  [0, DwellerPose.AT_KNEES],
                  [0.58, 26],
                ])
              : 26 + 14 * sack,
          // Under the arm held out to stir, and down to the sack and back: out from the knee,
          // turning round behind the arm to under it.
          elbow:
            t < begins
              ? DwellerPose.swing(t, [
                  [0, DwellerPose.OUT],
                  [0.25, DwellerPose.REAR],
                  [begins, DwellerPose.UNDER],
                ])
              : DwellerPose.UNDER,
          side: 1,
        },
        DwellerPose.resting(1),
      ],
      eyes: DwellerPose.blink(t),
      gaze: { x: -1 + 0.3 * sack, y: 0.85 + 0.15 * sack },
      flame: 1,
      lump:
        falling === null
          ? null
          : { x: drop.x - 2, y: drop.y + 6 + DwellerPose.FALLS * falling * falling },
      dips: "pot",
    };
  }

  /** The spoon as it stirs, `turn` of the way round the pot: its bowl down in the water, its
   * handle rocking in the fist over the rim; where it's held, and which way it points. */
  private static stirring(turn: number): { readonly at: Spot; readonly aim: number } {
    const { POT } = DwellerPose;
    const angle = 2 * Math.PI * turn;
    const bowl = { x: POT.x + 13 * Math.cos(angle), y: POT.y + 34 + 3 * Math.sin(angle) };
    const aim = 180 - 7 * Math.cos(angle);
    return { at: DwellerPose.holding(bowl, aim, DwellerHands.REACH.stirrer), aim };
  }

  /** The spoon as it's left standing in the pot, between stirs. */
  static readonly SPOON_LEFT = DwellerPose.stirring(0);

  // A drink and a bar.

  /** A drink: leant to the bottle beside them, the arm down the side and the hand round it from
   * the side; up in front with the elbow down, tipped at the lips with the head back, and down
   * again to stand where it stood. */
  private static drinking(t: number): DwellerLook {
    const { BOTTLE, KNEES } = DwellerPose;
    const glide = DwellerPose.glide;
    const reach = DwellerHands.REACH.bottle;
    const lean = glide(t, [
      [0, 4],
      [0.62, 20],
      [1.05, 8],
      [1.3, 3],
      [2.45, 1],
      [2.85, 8],
      [3.12, 18],
      [3.5, 4],
    ]);
    const swallow = t > 1.45 && t < 2.4 ? Math.sin((2 * Math.PI * (t - 1.45)) / 0.34) : 0;
    const tilt =
      glide(t, [
        [0, 0],
        [0.6, 12],
        [1.3, -3],
        [1.75, -12],
        [2.4, -16],
        [2.8, 0],
        [3.15, 11],
        [3.5, 0],
      ]) - swallow;
    const aim =
      glide(t, [
        [0.7, 0],
        [0.9, 4],
        [1.12, 52],
        [1.3, 76],
        [1.75, 96],
        [2.4, 113],
        [2.62, 70],
        [2.8, 30],
        [2.95, 0],
        [3.2, 0],
      ]) +
      1.5 * swallow;
    const way = DwellerPose.pointing(aim);
    const lips = DwellerPose.mouthAt(lean, tilt);
    // At the lips, the bottle is where they are; on its way, it comes up the side and round in
    // front of the chest.
    const sipping = { x: lips.x - 1 - way.x * reach, y: lips.y + 1 - way.y * reach };
    const moving = DwellerPose.along(t, [
      [0, KNEES[0]],
      [0.4, { x: BOTTLE.x - 8, y: BOTTLE.y - 36 }],
      [0.62, BOTTLE],
      [0.72, BOTTLE],
      [0.98, { x: -126, y: -62 }],
      [1.3, { x: -76, y: -190 }],
      [2.45, { x: -62, y: -212 }],
      [2.75, { x: -112, y: -118 }],
      [2.95, { x: -128, y: -50 }],
      [3.12, BOTTLE],
      [3.2, BOTTLE],
      [3.36, { x: BOTTLE.x - 6, y: BOTTLE.y - 32 }],
      [3.5, KNEES[0]],
    ]);
    const share = DwellerPose.ease((t - 1.12) / 0.2) * (1 - DwellerPose.ease((t - 2.42) / 0.22));
    const taken = t >= 0.66 && t < 3.16;
    return {
      ...DwellerPose.STILL,
      lean,
      tilt,
      hands: [
        {
          at: DwellerPose.mix(moving, sipping, share),
          holds: taken ? "bottle" : "nothing",
          aim,
          firm: glide(t, [
            [0.08, 0],
            [0.45, 1],
            [3.2, 1],
            [3.45, 0],
          ]),
          ready: "bottle",
          shut: glide(t, [
            [0.42, 0],
            [0.6, 0.2],
            [0.7, 1],
            [3.14, 1],
            [3.24, 0.2],
            [3.42, 0],
          ]),
          ahead: glide(t, [
            [0, DwellerPose.AT_KNEES],
            [0.62, 34],
            [0.98, 46],
            [1.3, DwellerPose.AT_MOUTH],
            [2.45, DwellerPose.AT_MOUTH],
            [2.95, 46],
            [3.12, 34],
            [3.5, DwellerPose.AT_KNEES],
          ]),
          // Back and out down the side to the floor; down under the bottle to lift it to the
          // lips.
          elbow: DwellerPose.swing(t, [
            [0, DwellerPose.OUT],
            [0.4, DwellerPose.BEHIND],
            [0.8, DwellerPose.BEHIND],
            [1.3, DwellerPose.DOWN],
            [2.6, DwellerPose.DOWN],
            [3.0, DwellerPose.BEHIND],
            [3.25, DwellerPose.BEHIND],
            [3.5, DwellerPose.OUT],
          ]),
          side: 1,
        },
        DwellerPose.resting(1),
      ],
      mouth: glide(t, [
        [1.15, 0],
        [1.3, 0.4],
        [2.42, 0.4],
        [2.55, 0.28],
        [2.85, 0.22],
        [3.05, 0],
      ]),
      eyes: glide(t, [
        [1.25, 1],
        [1.5, 0.28],
        [2.4, 0.28],
        [2.6, 1],
      ]),
      gaze: {
        x: glide(t, [
          [0, -0.3],
          [0.3, -0.9],
          [1.3, -0.2],
          [2.6, -0.3],
          [2.95, -0.9],
          [3.5, -0.3],
        ]),
        y: glide(t, [
          [0, 0.25],
          [0.3, 1],
          [1.3, -0.2],
          [1.75, -0.8],
          [2.6, 0.3],
          [2.95, 1],
          [3.5, 0.25],
        ]),
      },
    };
  }

  /** A bar: out of the chest pocket, held between the thumb and the fingers, two bites with
   * chewing between, and back into it. */
  private static biting(t: number): DwellerLook {
    const { KNEES } = DwellerPose;
    const glide = DwellerPose.glide;
    const reach = DwellerHands.REACH.bar;
    const pocket = { x: -34, y: -98 };
    const held = { x: -50, y: -136 };
    const tilt = glide(t, [
      [0, 0],
      [0.45, 8],
      [1, 6],
      [1.25, -3],
      [1.6, 0],
      [2.15, 0],
      [2.55, 6],
      [2.8, -3],
      [3.2, 0],
    ]);
    const lean = 4;
    const lips = DwellerPose.mouthAt(lean, tilt);
    const aim = glide(t, [
      [0.45, 8],
      [1, 34],
      [1.25, 38],
      [1.6, 18],
      [2.15, 18],
      [2.55, 34],
      [2.8, 38],
      [3.12, 8],
    ]);
    const way = DwellerPose.pointing(aim);
    const bitten = { x: lips.x - 2 - way.x * reach, y: lips.y + 1 - way.y * reach };
    // The teeth close on the bar, and the hand tugs it away.
    const tugged = { x: bitten.x - 5, y: bitten.y + 4 };
    const at = DwellerPose.along(t, [
      [0, KNEES[0]],
      [0.45, pocket],
      [0.56, pocket],
      [1, bitten],
      [1.14, bitten],
      [1.26, tugged],
      [1.6, held],
      [2.15, held],
      [2.55, bitten],
      [2.69, bitten],
      [2.81, tugged],
      [3.1, pocket],
      [3.22, pocket],
      [3.6, KNEES[0]],
    ]);
    const chewing = 0.1 + 0.2 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 3.3 * t));
    const bite = (from: number): number =>
      glide(t, [
        [from - 0.15, 0],
        [from, 0.9],
        [from + 0.12, 0.9],
        [from + 0.22, 0.1],
      ]);
    const mouth =
      t < 0.85
        ? 0
        : t < 1.22
          ? bite(1)
          : t < 2.38
            ? chewing
            : t < 2.77
              ? Math.max(bite(2.55), t < 2.45 ? chewing : 0)
              : chewing * (1 - DwellerPose.ease((t - 3.2) / 0.4));
    return {
      ...DwellerPose.STILL,
      lean,
      tilt,
      hands: [
        {
          at,
          holds: t >= 0.5 && t < 3.16 ? "bar" : "nothing",
          aim,
          firm: glide(t, [
            [0.1, 0],
            [0.45, 1],
            [3.2, 1],
            [3.5, 0],
          ]),
          ready: "bar",
          // Its back to the viewer's left, the thumb toward the viewer, as it holds the bar.
          back: { x: -0.9, y: -0.2, z: 0.3 },
          shut: glide(t, [
            [0.36, 0],
            [0.52, 1],
            [3.14, 1],
            [3.3, 0],
          ]),
          ahead: glide(t, [
            [0, DwellerPose.AT_KNEES],
            [0.45, 70],
            [1, DwellerPose.AT_MOUTH],
            [2.8, DwellerPose.AT_MOUTH],
            [3.1, 70],
            [3.6, DwellerPose.AT_KNEES],
          ]),
          elbow: DwellerPose.swing(t, [
            [0, DwellerPose.OUT],
            [0.45, DwellerPose.DOWN],
            [3.2, DwellerPose.DOWN],
            [3.6, DwellerPose.OUT],
          ]),
          side: 1,
        },
        DwellerPose.resting(1),
      ],
      mouth,
      eyes: DwellerPose.blink(t),
      gaze: {
        x: -0.4,
        y: glide(t, [
          [0, 0.25],
          [0.45, 0.9],
          [1, 0.5],
          [1.6, 0.1],
          [2.15, 0.2],
          [2.55, 0.5],
          [3.1, 0.9],
          [3.6, 0.25],
        ]),
      },
    };
  }

  // The guitar, the pack, the door and the bag.

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
        {
          ...DwellerPose.resting(0),
          at: { x: STRUM.x + 10 * Math.sin(beat), y: STRUM.y + 17 * Math.sin(beat) },
          holds: "pick",
          // The pick down to the strings, the wrist swinging it through them.
          aim: 160 + 14 * Math.sin(beat),
          firm: 1,
          ahead: 50,
        },
        {
          ...DwellerPose.resting(1),
          at: DwellerPose.mix(FRETS[0], FRETS[1], at),
          holds: "neck",
          // Along the neck, toward its head.
          aim: 65,
          firm: 1,
          ahead: 40,
          elbow: DwellerPose.DOWN,
        },
      ],
      mouth: 0.25 + 0.25 * Math.sin(beat / 4),
      eyes: Math.min(DwellerPose.blink(t), Math.sin(t / 3.1) > 0.75 ? 0.15 : 1),
      guitar: true,
      tap: Math.max(0, Math.sin(beat / 2)),
      gaze: Math.sin(t / 2.3) > 0.6 ? { x: -0.1, y: 0 } : { x: 1, y: 0.8 },
    };
  }

  private static packing(share: number): DwellerLook {
    // Over to the pack, a hand into it twice, and back.
    const over = DwellerPose.ease(share / 0.2) * (1 - DwellerPose.ease((share - 0.82) / 0.18));
    const reach = Math.sin(2 * Math.PI * 2 * Math.max(0, share - 0.2));
    const { PACK, KNEES, AT_KNEES } = DwellerPose;
    return {
      ...DwellerPose.STILL,
      shift: DwellerPose.AT_PACK * over,
      lean: 22 * over,
      tilt: 8 * over,
      turned: over > 0.5,
      gaze: { x: -1, y: 0.5 },
      hands: [
        {
          ...DwellerPose.resting(0),
          // Out round the shoulder and up over its top, the arm well out from the shoulder,
          // and down into it.
          at: DwellerPose.curve(
            KNEES[0],
            { x: PACK.x - 60, y: PACK.y + 64 },
            { x: PACK.x - 20 + 8 * reach, y: PACK.y - 34 + 24 * reach },
            over,
          ),
          // Fingers first into the pack.
          aim: 200,
          firm: 0,
          ahead: AT_KNEES * (1 - over) - 26 * over,
          // From out over the knee to under the arm as it goes out and up, turning round
          // behind it on the way rather than ever along it.
          elbow: DwellerPose.swing(over, [
            [0, DwellerPose.OUT],
            [0.4, DwellerPose.REAR],
            [1, DwellerPose.UNDER],
          ]),
        },
        {
          ...DwellerPose.resting(1),
          at: DwellerPose.mix(
            KNEES[1],
            { x: PACK.x + 60 - 20 * reach, y: PACK.y + 30 * reach },
            over,
          ),
          aim: 190,
          firm: 0,
          ahead: AT_KNEES * (1 - over),
        },
      ],
    };
  }

  /** In from the door, `inward`, or out to it: on hands and knees, facing the way they go, the
   * palms flat on the mats, the fingers spread. */
  private static entering(share: number, inward: boolean): DwellerLook {
    // In from the door on hands and knees, and up onto the seat.
    const along = DwellerPose.ease(share / 0.7);
    const up = DwellerPose.ease((share - 0.55) / 0.45);
    const crawl = Math.sin(2 * Math.PI * 2.2 * share);
    const { KNEES, ON_KNEES, AT_KNEES } = DwellerPose;
    const palm = (side: 0 | 1, at: Spot): HandLook => ({
      ...DwellerPose.resting(side),
      at: DwellerPose.mix(at, KNEES[side], up),
      aim: -90,
      // Off the mats, the hand goes slack before the elbow turns round to the knee.
      firm: Math.max(0, 1 - 2 * up),
      spread: 1 - up,
      // The palm down on the mats, its back up.
      back: { x: 0, y: -1, z: 0.15 },
      ahead: AT_KNEES * up,
      // On hands and knees the elbows bend back, toward the knees; out as the hands come up
      // onto them, turning round behind the arm.
      elbow: DwellerPose.swing(up, [
        [0, DwellerPose.BACK],
        [0.5, DwellerPose.REAR],
        [1, DwellerPose.OUT],
      ]),
    });
    return {
      ...DwellerPose.STILL,
      shift: DwellerPose.FROM_DOOR * (1 - along) || 0,
      rise: ON_KNEES * (1 - up) || 0,
      lean: 62 * (1 - up) + 4 * up,
      tilt: 30 * (1 - up),
      hands: [
        palm(0, { x: -150 + 18 * crawl, y: ON_KNEES + 14 }),
        palm(1, { x: -96 - 18 * crawl, y: ON_KNEES + 16 }),
      ],
      shown: DwellerPose.ease(share / 0.25),
      turned: inward && up < 0.5,
      gaze: { x: -0.8, y: 0.5 },
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
    // Up out of the bag, a stretch with both arms over the head, the fingers spread, and a yawn.
    const up = DwellerPose.ease(share / 0.4);
    const stretch = DwellerPose.arc((share - 0.3) / 0.6);
    const { KNEES, AT_KNEES } = DwellerPose;
    // The palms turning forward as the arms go up, the backs round by the little finger's side
    // until they face away from the viewer.
    const turning = Math.PI * DwellerPose.ease((stretch - 0.2) / 0.6);
    const back = {
      x: -0.9 * Math.sin(turning),
      y: -0.6 * Math.cos(turning),
      z: 0.8 * Math.cos(turning),
    };
    return {
      ...DwellerPose.STILL,
      shift: DwellerPose.TO_BED * (1 - up),
      lying: 1 - DwellerPose.ease(share / 0.22),
      lean: 4 - DwellerPose.LAID_BACK * (1 - up) - 8 * stretch,
      tilt: -14 * stretch,
      hands: [
        {
          ...DwellerPose.resting(0),
          at: DwellerPose.mix(KNEES[0], { x: -86, y: -268 }, stretch),
          aim: -10,
          firm: stretch,
          spread: stretch,
          back,
          ahead: AT_KNEES * (1 - stretch),
        },
        {
          ...DwellerPose.resting(1),
          at: DwellerPose.mix(KNEES[1], { x: 92, y: -262 }, stretch),
          aim: 10,
          firm: stretch,
          spread: stretch,
          back,
          ahead: AT_KNEES * (1 - stretch),
        },
      ],
      mouth: stretch,
      eyes: 1 - 0.8 * stretch,
      gaze: { x: 0, y: -0.5 * stretch },
    };
  }

  /** A hand at rest on its knee, `lift` off it with the breath: open, lying as the forearm
   * falls. */
  private static resting(side: 0 | 1, lift = 0): HandLook {
    const knee = DwellerPose.KNEES[side];
    return {
      at: { x: knee.x, y: knee.y + lift },
      ahead: DwellerPose.AT_KNEES,
      elbow: DwellerPose.OUT,
      holds: "nothing",
      aim: 0,
      firm: 0,
      side: 1,
    };
  }

  private static readonly STILL: DwellerLook = {
    shift: 0,
    rise: 0,
    lean: 4,
    tilt: 0,
    sway: 0,
    hands: [DwellerPose.resting(0), DwellerPose.resting(1)],
    mouth: 0,
    eyes: 1,
    turned: false,
    lying: 0,
    shown: 1,
    guitar: false,
    flame: 0,
    tap: 0,
    gaze: { x: -0.3, y: 0.25 },
    stream: null,
    lump: null,
    pouch: null,
    dips: null,
  };

  /** How far through an act that plays once `seconds` is, 0 to 1. */
  private static share(act: Act, seconds: number): number {
    return Math.min(1, seconds / (DwellerPose.ONCE[act] ?? 1));
  }

  // The arms.

  /** An arm from `shoulder` to where `hand` grips, in three dimensions (#274): the hand posed for
   * what it holds (`HandBones`) and turned to hold it as the pose aims it, round a thing that can
   * turn in it as near the forearm's way as it goes, a flat thing's face to the viewer, as firmly
   * as it's set, lying along the forearm as it falls; an empty hand's fingers the pose's way, no
   * further from the forearm's than a wrist bends; the wrist where the hand's pose puts it; and
   * the upper arm and the forearm bent to the wrist, the elbow the pose's way. The forearm's way
   * and the hand's settle each other over a few rounds. The further arm is the nearer's mirror
   * image. */
  private static reach(shoulder: Spot, hand: HandLook, side: 0 | 1): Reach {
    const { SCALE } = HandBones;
    const flip = (way: Vector3): Vector3 => (side === 1 ? way.mirrored() : way);
    const from = flip(new Vector3(shoulder.x, shoulder.y, 0));
    // No further toward the viewer than the arm can reach without its forearm pointing at the
    // viewer, a sleeve seen end on: the nearer the hand is to the shoulder across the picture,
    // the less; smoothly, so nothing jumps. How far toward the viewer a hand is doesn't show.
    const across = Math.hypot(hand.at.x - shoulder.x, hand.at.y - shoulder.y);
    const most = DwellerPose.FORWARD * across + DwellerPose.UPPER_ARM / 4;
    const ahead = hand.ahead / Math.sqrt(1 + (hand.ahead / most) ** 2);
    const grip = flip(new Vector3(hand.at.x, hand.at.y, ahead));
    const aimed = DwellerPose.way(side === 1 ? -hand.aim : hand.aim);
    const holds = hand.holds === "nothing" ? (hand.ready ?? "nothing") : hand.holds;
    const shut = hand.shut ?? (hand.holds === "nothing" ? 0 : 1);
    const shape = HandBones.shape(DwellerHands.GRIPS[holds], shut, hand.spread ?? 0);
    const back = hand.back ?? DwellerPose.BACK_UP;
    const facing = new Vector3(back.x, back.y, back.z);
    const firm = Math.min(1, Math.max(0, hand.firm));
    // An empty hand, or one round a lump of snow, points its fingers the pose's way; the pot
    // hangs from its handle in the fist whichever way the hand is turned.
    const loose = holds === "nothing" || holds === "snow";
    const hangs = DwellerHands.CARRIED.includes(holds);
    const turnFor = (seen: Vector3): HandTurn => {
      // A hand lies across the picture rather than pointing at the viewer, as far as its
      // forearm lets it: so the wrist it puts behind or before what it holds doesn't push the
      // forearm round toward the viewer in turn.
      const forearm = new Vector3(seen.x, seen.y, seen.z * DwellerPose.FLAT).unit();
      if (loose) {
        return HandTurn.of(DwellerPose.bent(forearm, forearm.toward(aimed, firm)), facing);
      }
      if (hangs) {
        return HandTurn.of(forearm, facing);
      }
      const relaxed = HandTurn.of(forearm, facing);
      return relaxed.toward(HandBones.turned(shape, aimed, forearm), firm);
    };
    // Where the hand is put by: what it holds, where it's held in it; an empty hand, by the
    // middle of its palm as it rests, and by where what it's ready for will be as firmly as it
    // reaches for it: so what it's ready for can change while it rests, and nothing jumps.
    const hold = hand.holds === "nothing" ? HandBones.MIDDLE.toward(shape.hold, firm) : shape.hold;
    const wristFor = (turn: HandTurn): Vector3 => grip.minus(turn.of(hold).times(SCALE));
    // The hand turns to the forearm of an arm bent straight to where it grips, its forearm as
    // long as the forearm and the hand, a way that moves as smoothly as the pose; then the arm
    // bends to the wrist the hand so turned puts where it is. No rounds of the hand's turn and
    // the arm's, which could settle one way in one frame and another in the next.
    const straight = DwellerPose.bent3(from, grip, hand.elbow, hold.size * SCALE);
    const turn = turnFor(straight.end.minus(straight.elbow).unit());
    const wristAt = wristFor(turn);
    // The elbow goes the pose's way, and toward where it would leave the wrist straight, a
    // forearm's length back along the hand: as far as that's off the arm's line, where the
    // elbow's way round it counts.
    const line = wristAt.minus(from).unit();
    const kept = new Vector3(turn.along.x, turn.along.y, turn.along.z * DwellerPose.KEEP).unit();
    const off = wristAt.minus(kept.times(DwellerPose.FOREARM)).minus(from).across(line);
    const { STRAIGHT, OFF_LINE, UPPER_ARM, FOREARM } = DwellerPose;
    const raised = Math.max(0, -off.unit().y) * DwellerPose.UP;
    // How far off the line the elbow is, as bent as the arm is: a way to it no further off than
    // that counts for as little.
    const reach = wristAt.minus(from).size;
    const cos = (UPPER_ARM ** 2 + reach ** 2 - FOREARM ** 2) / (2 * UPPER_ARM * reach || 1);
    const bentOff = UPPER_ARM * Math.sqrt(Math.max(0, 1 - Math.min(1, cos) ** 2));
    const pull = off.times(
      (STRAIGHT * (1 - raised)) / Math.max(off.size, OFF_LINE, DwellerPose.FOLDED * bentOff),
    );
    const posed = new Vector3(hand.elbow.x, hand.elbow.y, hand.elbow.z).unit();
    const pole = posed.times(1 - pull.size).plus(pull);
    const arm = DwellerPose.bent3(from, wristAt, pole);
    const at = arm.end.plus(turn.of(hold).times(SCALE));
    const pointed = hangs ? aimed : turn.of(loose ? new Vector3(0, 1, 0) : shape.aim);
    const placed = side === 1 ? turn.mirrored() : turn;
    const [elbow, wrist, held] = [flip(arm.elbow), flip(arm.end), flip(at)];
    const fingers = placed.along;
    const carried = DwellerHands.CARRIED.includes(holds) || hand.holds === "nothing";
    return {
      elbow: { x: elbow.x, y: elbow.y },
      wrist: { x: wrist.x, y: wrist.y },
      at: { x: held.x, y: held.y },
      forearm: DwellerPose.angle(elbow, wrist),
      palm: DwellerPose.angle({ x: 0, y: 0 }, fingers),
      aim: (Math.atan2(pointed.x * (side === 1 ? -1 : 1), -pointed.y) * 180) / Math.PI,
      elbowAhead: elbow.z,
      place: { shape, turn: placed, wrist, thing: carried ? null : held.z },
    };
  }

  /** Which way something points that's aimed so, in degrees clockwise from straight up, in three
   * dimensions: in the picture's plane. */
  private static way(aim: number): Vector3 {
    const angle = (aim * Math.PI) / 180;
    return new Vector3(Math.sin(angle), -Math.cos(angle), 0);
  }

  /** An empty hand's way, `wanted`, no further from the forearm's than a wrist bends. */
  private static bent(forearm: Vector3, wanted: Vector3): Vector3 {
    const angle = forearm.angle(wanted);
    const axis = forearm.cross(wanted);
    if (angle <= DwellerPose.WRIST_BEND || axis.size < 1e-9) {
      return wanted.unit();
    }
    return forearm.unit().turned(axis.unit(), DwellerPose.WRIST_BEND);
  }

  /** The way an elbow goes off its arm's line, `axis`: `pole`'s, square to the arm, as far as
   * the pole is square to it, with a steady pull out from the body and down besides, as an elbow
   * hangs; so where the pole is nearly the arm's own way the elbow still goes out and down,
   * never back behind the arm, and turns smoothly. */
  private static hanging(pole: Vector3, axis: Vector3): Vector3 {
    const { OUTWARD, DOWNWARD } = DwellerPose.HANG;
    const square = (way: Vector3): Vector3 => way.across(axis);
    return square(pole.unit())
      .plus(square(new Vector3(-1, 0, 0)).times(OUTWARD))
      .plus(square(new Vector3(0, 1, 0)).times(DOWNWARD))
      .unit();
  }

  /** The upper arm and the forearm from `shoulder` toward `target`, in three dimensions, the
   * lower `beyond` longer than the forearm: the elbow off their line `pole`'s way, as it hangs;
   * where the lower ends, as near the target as they reach, and where the forearm does along
   * it. A pose keeps the forearm from pointing at the viewer, a sleeve seen end on, by where it
   * puts the hand and which way the elbow hangs: the tests hold every movement to it. */
  private static bent3(
    shoulder: Vector3,
    target: Vector3,
    pole: Point,
    beyond = 0,
  ): { readonly elbow: Vector3; readonly end: Vector3 } {
    const upper = DwellerPose.UPPER_ARM;
    const lower = DwellerPose.FOREARM + beyond;
    const ahead = target.z - shoulder.z;
    const { along, reach, cos, sin } = DwellerPose.toward(shoulder, target, ahead, lower);
    const way = new Vector3(along.x, along.y, along.z);
    const off = DwellerPose.hanging(new Vector3(pole.x, pole.y, pole.z), way);
    const elbow = shoulder.plus(way.times(upper * cos).plus(off.times(upper * sin)));
    const end = shoulder.plus(way.times(reach));
    return { elbow, end: elbow.toward(end, DwellerPose.FOREARM / lower) };
  }

  /** The way from `shoulder` to `target`, `ahead` of it, one long: how far the two bones
   * reach that way, and the angle at the shoulder between the upper arm and it. */
  private static toward(
    shoulder: Spot,
    target: Spot,
    ahead: number,
    lower: number,
  ): { readonly along: Point; readonly reach: number; readonly cos: number; readonly sin: number } {
    const upper = DwellerPose.UPPER_ARM;
    const to = { x: target.x - shoulder.x, y: target.y - shoulder.y, z: ahead };
    const far = Math.hypot(to.x, to.y, to.z);
    const reach = Math.min(Math.max(far, Math.abs(upper - lower) + 0.01), upper + lower - 0.01);
    const along =
      far < 1e-9 ? { x: 0, y: 1, z: 0 } : { x: to.x / far, y: to.y / far, z: to.z / far };
    const cos = (upper * upper + reach * reach - lower * lower) / (2 * upper * reach);
    return { along, reach, cos, sin: Math.sqrt(Math.max(0, 1 - cos * cos)) };
  }

  /** Where a thing is held for its working end, `reach` from there, to be at `end`, aimed so. */
  private static holding(end: Spot, aim: number, reach: number): Spot {
    const way = DwellerPose.pointing(aim);
    return { x: end.x - way.x * reach, y: end.y - way.y * reach };
  }

  /** The angle of the way from one point to another, in degrees clockwise from pointing down. */
  private static angle(from: Spot, to: Spot): number {
    return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI - 90;
  }

  /** A point turned by `degrees` about the hips, clockwise on the screen. */
  private static turned(spot: Spot, degrees: number): Spot {
    const angle = (degrees * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return { x: spot.x * cos - spot.y * sin, y: spot.x * sin + spot.y * cos };
  }

  /** From one point to another by way of `by`, which bends the way toward it, `share` of the
   * way along. */
  private static curve(from: Spot, by: Spot, to: Spot, share: number): Spot {
    const u = Math.min(Math.max(share, 0), 1);
    const [a, b, c] = [(1 - u) * (1 - u), 2 * u * (1 - u), u * u];
    return { x: a * from.x + b * by.x + c * to.x, y: a * from.y + b * by.y + c * to.y };
  }

  private static mix(from: Spot, to: Spot, share: number): Spot {
    return { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share };
  }

  // Time.

  /** A value through its `keys` in time: smoothly from each to the next, at rest at the first
   * and the last, wherever it holds and wherever it turns back. */
  private static readonly glide = (t: number, keys: Keys<number>): number => {
    const last = keys.length - 1;
    const first = keys[0];
    const final = keys[last];
    if (first === undefined || final === undefined) {
      return 0;
    }
    if (t <= first[0]) {
      return first[1];
    }
    if (t >= final[0]) {
      return final[1];
    }
    let index = 0;
    while (index < last - 1 && t >= (keys[index + 1]?.[0] ?? Infinity)) {
      index += 1;
    }
    const [t0, p0] = keys[index] ?? first;
    const [t1, p1] = keys[index + 1] ?? final;
    const slope = (at: number): number => {
      const before = keys[at - 1];
      const here = keys[at];
      const after = keys[at + 1];
      if (before === undefined || here === undefined || after === undefined) {
        return 0;
      }
      if ((here[1] - before[1]) * (after[1] - here[1]) <= 0) {
        return 0;
      }
      return (after[1] - before[1]) / (after[0] - before[0]);
    };
    const long = t1 - t0;
    const s = (t - t0) / long;
    const s2 = s * s;
    const s3 = s2 * s;
    return (
      (2 * s3 - 3 * s2 + 1) * p0 +
      (s3 - 2 * s2 + s) * long * slope(index) +
      (-2 * s3 + 3 * s2) * p1 +
      (s3 - s2) * long * slope(index + 1)
    );
  };

  /** A point through its `keys` in time, as `glide` goes. */
  private static along(t: number, keys: Keys<Spot>): Spot {
    return {
      x: DwellerPose.glide(
        t,
        keys.map(([time, { x }]): readonly [number, number] => [time, x]),
      ),
      y: DwellerPose.glide(
        t,
        keys.map(([time, { y }]): readonly [number, number] => [time, y]),
      ),
    };
  }

  /** `share` of the way from one way to another, turned round the shortest way at an even
   * rate, as long as `from`: never shrunk to nothing between two ways nearly opposite. */
  static turning(from: Point, to: Point, share: number): Point {
    const a = new Vector3(from.x, from.y, from.z);
    const b = new Vector3(to.x, to.y, to.z);
    const axis = a.cross(b);
    const way =
      axis.size < 1e-9
        ? a
        : a
            .unit()
            .turned(axis.unit(), a.angle(b) * share)
            .times(a.size);
    return { x: way.x, y: way.y, z: way.z };
  }

  /** A way through its `keys` in time, as `glide` goes: turned from each to the next round
   * the shortest way, at an even rate, so it never shrinks to nothing between two keys nearly
   * opposite and turns all at once. */
  private static swing(t: number, keys: Keys<Point>): Point {
    const along = DwellerPose.glide(
      t,
      keys.map(([time], index): readonly [number, number] => [time, index]),
    );
    const index = Math.min(Math.max(Math.floor(along), 0), Math.max(keys.length - 2, 0));
    const [from, to] = [keys[index]?.[1], keys[index + 1]?.[1] ?? keys[index]?.[1]];
    if (from === undefined || to === undefined) {
      return { x: 0, y: 1, z: 0 };
    }
    const a = new Vector3(from.x, from.y, from.z).unit();
    const b = new Vector3(to.x, to.y, to.z).unit();
    const share = Math.min(Math.max(along - index, 0), 1);
    const angle = a.angle(b);
    const axis = a.cross(b);
    const way = axis.size < 1e-9 ? a : a.turned(axis.unit(), angle * share);
    return { x: way.x, y: way.y, z: way.z };
  }

  /** What `steps` has at `t`: the last of them begun. */
  private static pick<T>(t: number, steps: Keys<T>): T {
    let found = steps[0]?.[1] as T;
    for (const [from, value] of steps) {
      if (t >= from) {
        found = value;
      }
    }
    return found;
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

  /** There and back round `at`, `long` seconds each way: 0 the rest of the time. */
  private static bump(t: number, at: number, long: number): number {
    return DwellerPose.arc((t - at + long) / (2 * long));
  }

  /** The eyes through a blink, every few seconds: 1 open, 0 shut. */
  private static blink(t: number): number {
    const into = t % 3.7;
    return into < 0.16 ? Math.abs(into / 0.08 - 1) : 1;
  }
}
