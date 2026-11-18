import { FrontShapes } from "../../rendering/front-shapes";
import type { DeviceKind } from "../../simulation";
import { DwellerHands } from "./dweller-hands";
import type { Held } from "./dweller-hands";
import { DwellerHead } from "./dweller-head";
import { DwellerShapes } from "./dweller-shapes";
import { TentArt } from "./tent-art";

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

/** A device as the person in the tent has it in hand (#271): the radio held by the shoulder,
 * the wrist turned up for the watch, the weather meter held out at the door, the tracker in both
 * hands. */
export const DEVICE_ACTS = ["radio", "watch", "meter", "tracker"] as const;
export type DeviceAct = (typeof DEVICE_ACTS)[number];

/** What the person in the tent is seen doing: sitting; at the stove melting snow; cooking, which
 * is lighting the stove, pouring the bottle's water into the pot, warming the hands while it
 * boils, filling the meal's pouch from the pot, letting it stand, and eating; asleep in the bag;
 * playing the guitar; and, once each, crawling in and out, a drink, a bar, a hand in the pack,
 * lying down and sitting up again; and with a device (#271): holding it, and, once each, taking
 * it from where it's kept, putting it back, and talking into the radio. */
export type Act =
  | DeviceAct
  | `${DeviceAct}-out`
  | `${DeviceAct}-away`
  | "radio-talk"
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
 */
export interface HandLook {
  readonly at: Spot;
  readonly ahead: number;
  readonly elbow: Point;
  readonly holds: Held;
  readonly aim: number;
  readonly firm: number;
  readonly side: 1 | -1;
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
  /** What the first hand's thing goes into, out of sight: the pot on the stove, or the pouch in
   * the other hand. */
  readonly dips: "pot" | "pouch" | null;
  /** Whether the door is held open for what they do (#271): a weather meter reads the wind
   * outside. Not said, it's as the stove and the way in have it. */
  readonly door?: boolean;
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
}

/** An arm as it reaches: its elbow and its wrist, where the hand grips, the forearm's angle and
 * the hand's, and which way what it holds points. */
interface Reach {
  readonly elbow: Spot;
  readonly wrist: Spot;
  readonly at: Spot;
  readonly forearm: number;
  readonly palm: number;
  readonly aim: number;
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
  /** How far a wrist bends either way as it's seen, in degrees; and how much further it seems
   * to, the forearm coming straight toward the viewer. */
  static readonly WRIST_BEND = 48;
  static readonly WRIST_LOOSE = 110;
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
    "radio-out": 1.4,
    "radio-away": 1.2,
    "radio-talk": 1.7,
    "watch-out": 1.6,
    "watch-away": 1.3,
    "meter-out": 1.7,
    "meter-away": 1.5,
    "tracker-out": 1.5,
    "tracker-away": 1.3,
  };
  /** The device each of the climber's is, as the person in the tent has it in hand (#271). */
  static readonly DEVICES: Readonly<Record<DeviceKind, DeviceAct>> = {
    radio: "radio",
    gps: "watch",
    wind: "meter",
    tracker: "tracker",
  };
  /** What's done aside from a chore, and leaves the stove as it burns. */
  static readonly ASIDE: readonly Act[] = [
    "drink",
    "bar",
    "pack",
    "radio-talk",
    ...DEVICE_ACTS.flatMap((device): Act[] => [device, `${device}-out`, `${device}-away`]),
  ];
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
  /** The suit's chest pocket, from the hips on the seat: where a bar is kept, and the pocket
   * weather meter (#271). */
  static readonly CHEST_POCKET: Spot = { x: -34, y: -98 };
  /** The devices where they're kept (#271), from the hips on the seat, by their middles: the
   * radio lying on the pad on the pack's side, its antenna away from the seat; and the tracker
   * standing in the mesh pocket on the wall by the door. The weather meter is in the suit's
   * chest pocket, and the watch on the wrist. */
  private static readonly PAD = FrontShapes.CROTCH * DwellerShapes.SCALE + 2;
  static readonly RADIO: Spot = {
    x: TentArt.RADIO_IN - TentArt.SEAT_IN + TentArt.RADIO.height / 2,
    y: DwellerPose.PAD - TentArt.RADIO.width / 2,
  };
  static readonly RADIO_LIES = 90;
  static readonly TRACKER: Spot = {
    x: TentArt.POCKET.into - TentArt.SEAT_IN + TentArt.TRACKER_IN.x,
    y:
      DwellerPose.PAD +
      TentArt.SEAT -
      2 -
      TentArt.POCKET.up +
      TentArt.TRACKER_IN.y -
      TentArt.TRACKER.height / 2,
  };
  /** Where each device is held (#271): the radio by the shoulder, to listen; the hand of the
   * wrist that's turned up for the watch, and where the other hand's finger presses its button;
   * the weather meter, out at arm's length toward the open door; and the tracker over the lap,
   * with the other hand's thumb on its keys. */
  private static readonly RADIO_HELD: Spot = { x: 62, y: -160 };
  private static readonly WRIST_UP: Spot = { x: 8, y: -118 };
  private static readonly AT_WATCH: Spot = { x: 26, y: -96 };
  private static readonly METER_OUT: Spot = { x: -250, y: -180 };
  private static readonly TRACKER_HELD: Spot = { x: -14, y: -92 };
  private static readonly AT_KEYS: Spot = { x: 12, y: -84 };
  /** How far along the floor from the seat the door is, and the pack's seat. */
  static readonly FROM_DOOR = -330;
  static readonly AT_PACK = 190;
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
  /** The ways an elbow points, as the nearer the stove's does (the other's is mirrored): out to
   * the side, for a hand on its knee; down, for a hand held up in front of the body; out and up,
   * toward the viewer, over an arm that reaches to the stove; in under the arm, for a hand that
   * takes a bottle standing by the body from its near side; back toward the knees, on hands and
   * knees; up, for a hand that tips a bottle over; and out level, for a hand that reaches down
   * into something held at the chest. An elbow that goes from the outer side of its arm to the
   * inner, or back, swings round in front of the arm, toward the viewer or down and out toward
   * them, never behind it: behind it the forearm points at the viewer, a sleeve seen end on. */
  private static readonly OUT: Point = { x: -0.7, y: 0.7, z: -0.3 };
  private static readonly DOWN: Point = { x: -0.25, y: 1, z: -0.3 };
  private static readonly OVER: Point = { x: -0.55, y: -0.45, z: 0.7 };
  private static readonly IN: Point = { x: 0.5, y: 0.5, z: -0.7 };
  private static readonly BACK: Point = { x: 0.7, y: -0.45, z: -0.3 };
  private static readonly FORE: Point = { x: 0, y: 0.3, z: 0.95 };
  private static readonly LIFT: Point = { x: -0.58, y: 0.58, z: 0.58 };
  private static readonly RAISED: Point = { x: -0.3, y: -0.75, z: 0.3 };
  private static readonly SIDE: Point = { x: -0.9, y: 0.2, z: -0.35 };
  /** The least of a forearm's length that's seen, however the arm is bent: an elbow that would
   * be so far round behind its arm that less was, is only as far round as leaves that much. */
  private static readonly SEEN = 0.5;
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
  /** By the stove: how far they lean to it and how far the head bows. */
  private static readonly TENDING = { lean: 24, tilt: 9 };
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
      case "radio":
        return DwellerPose.listening(t);
      case "watch":
        return DwellerPose.checking(t);
      case "meter":
        return DwellerPose.metering(t);
      case "tracker":
        return DwellerPose.reading(t);
      case "radio-talk":
        return DwellerPose.talking(t);
      case "radio-out":
      case "watch-out":
      case "meter-out":
      case "tracker-out":
        return DwellerPose.taking(act, t);
      case "radio-away":
      case "watch-away":
      case "meter-away":
      case "tracker-away":
        return DwellerPose.puttingBack(act, t);
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

  /** The lighter to the burner: two strikes, the second catches, and the flame comes up. */
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
      [0.7, there],
      [1.5, there],
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
        [0.7, 27],
        [1.5, 27],
        [2.2, TENDING.lean],
      ]),
      tilt: glide(t, [
        [0, 0],
        [0.7, 12],
        [1.5, 12],
        [2.2, TENDING.tilt],
      ]),
      hands: [
        {
          at: { x: at.x, y: at.y + 2 * strike },
          holds,
          aim: holds === "nothing" ? aim - 90 : aim,
          firm: glide(t, [
            [0.15, 0],
            [0.6, 1],
            [1.6, 1],
            [2, 0],
          ]),
          ahead: glide(t, [
            [0, DwellerPose.AT_KNEES],
            [0.7, 30],
            [1.5, 30],
            [2.2, DwellerPose.AT_KNEES],
          ]),
          elbow: DwellerPose.swing(t, [
            [0, DwellerPose.OUT],
            [0.7, DwellerPose.OVER],
            [1.5, DwellerPose.OVER],
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

  /** The bottle from the floor, its water into the pot, and back to where it stood. */
  private static pouring(t: number): DwellerLook {
    const { BOTTLE, POT, KNEES, TENDING } = DwellerPose;
    const glide = DwellerPose.glide;
    const reach = DwellerHands.REACH.bottle;
    const standing = { x: BOTTLE.x, y: BOTTLE.y - reach };
    const carried = { x: -170, y: -128 };
    const over = { x: POT.x + 5, y: POT.y - 24 };
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
        [1.4, -8],
        [2, -98],
        [3.25, -112],
        [3.75, -6],
        [4.3, 0],
      ]) + (t > 2 && t < 3.25 ? 1.5 * Math.sin(2 * Math.PI * 2.2 * t) : 0);
    const way = DwellerPose.pointing(aim);
    const held = { x: mouth.x - way.x * reach, y: mouth.y - way.y * reach };
    const taken = t >= 0.74 && t < 4.36;
    const at = taken
      ? held
      : DwellerPose.along(t, [
          [0, KNEES[0]],
          [0.65, BOTTLE],
          [0.74, BOTTLE],
          [4.36, BOTTLE],
          [4.45, BOTTLE],
          [4.8, KNEES[0]],
        ]);
    const running = taken && aim < -DwellerPose.RUNS;
    return {
      ...DwellerPose.STILL,
      // Up off the lean to pour, the elbow lifting as the bottle tips.
      lean: glide(t, [
        [0, TENDING.lean],
        [0.65, 20],
        [1.9, 3],
        [3.3, 1],
        [4.3, 20],
        [4.8, TENDING.lean],
      ]),
      tilt: glide(t, [
        [0, TENDING.tilt],
        [1.9, 20],
        [3.3, 20],
        [4.8, TENDING.tilt],
      ]),
      hands: [
        {
          at,
          holds: taken ? "bottle" : "nothing",
          aim: taken ? aim : aim - 90,
          firm: glide(t, [
            [0.2, 0],
            [0.6, 1],
            [4.45, 1],
            [4.75, 0],
          ]),
          ahead: glide(t, [
            [0, DwellerPose.AT_KNEES],
            [0.65, 70],
            [1.95, 30],
            [3.3, 30],
            [4.3, 70],
            [4.8, DwellerPose.AT_KNEES],
          ]),
          // The elbow comes round the front of the arm to be in under it as the hand goes
          // down for the bottle, and lifts as the bottle tips.
          elbow: DwellerPose.swing(t, [
            [0, DwellerPose.OUT],
            [0.3, DwellerPose.FORE],
            [0.6, DwellerPose.IN],
            [1.1, DwellerPose.IN],
            [1.5, DwellerPose.LIFT],
            [1.95, DwellerPose.RAISED],
            [3.3, DwellerPose.RAISED],
            [3.6, DwellerPose.LIFT],
            [3.9, DwellerPose.IN],
            [4.4, DwellerPose.IN],
            [4.6, DwellerPose.FORE],
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

  /** The hands held out to the flame while the water comes to the boil. */
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
      [0.75, { x: -184, y: -26 }],
      [2.45, { x: -184, y: -26 }],
      [3.2, KNEES[0]],
    ]);
    const far = DwellerPose.along(t, [
      [0, KNEES[1]],
      [0.85, { x: -132, y: -52 }],
      [2.35, { x: -132, y: -52 }],
      [3.2, KNEES[1]],
    ]);
    // A look up at the door, where the steam goes.
    const glance = DwellerPose.bump(t, 1.9, 0.45);
    return {
      ...DwellerPose.STILL,
      lean: TENDING.lean + 3 * warm,
      tilt: TENDING.tilt - 12 * glance,
      hands: [
        {
          at: { x: near.x + 3 * warm * Math.sin(rub), y: near.y + 2 * warm * Math.cos(rub) },
          holds: "nothing",
          aim: -96 + 7 * Math.sin(rub),
          firm: warm,
          ahead: DwellerPose.AT_KNEES - 65 * warm,
          elbow: DwellerPose.swing(t, [
            [0, DwellerPose.OUT],
            [0.75, DwellerPose.OVER],
            [2.45, DwellerPose.OVER],
            [3.2, DwellerPose.OUT],
          ]),
          side: 1,
        },
        {
          at: { x: far.x - 3 * warm * Math.sin(rub), y: far.y + 2 * warm * Math.sin(rub) },
          holds: "nothing",
          aim: -104 - 7 * Math.sin(rub),
          firm: warm,
          ahead: DwellerPose.AT_KNEES - 45 * warm,
          elbow: DwellerPose.swing(t, [
            [0, DwellerPose.OUT],
            [0.85, DwellerPose.OVER],
            [2.35, DwellerPose.OVER],
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

  /** A pouch from the pile, the pot off the stove by its handle, and the pot's water into the
   * pouch; the pot goes back, the stove out. */
  private static filling(t: number): DwellerLook {
    const { MEAL, MEAL_LEANS, HANDLE, KNEES, TENDING, SUPPER } = DwellerPose;
    const glide = DwellerPose.glide;
    // The pouch: taken from the pile, held by the stove's side of the lap to be filled, and
    // brought to the lap.
    const filled = { x: -22, y: -40 };
    const taken = t >= 0.82;
    const pouchAim = glide(t, [
      [0.82, MEAL_LEANS],
      [1.7, -3],
      [4.1, -3],
      [5.3, SUPPER.aim],
    ]);
    const pouch = DwellerPose.along(t, [
      [0, KNEES[1]],
      [0.75, MEAL],
      [0.9, MEAL],
      [1.75, filled],
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
    const over = { x: filled.x - 9, y: filled.y - DwellerHands.REACH.pouch - 20 };
    const upright = DwellerPose.lip({ x: 0, y: 0 }, 0);
    const lip = DwellerPose.along(t, [
      [1.78, { x: HANDLE.x + upright.x, y: HANDLE.y + upright.y }],
      [2.5, { x: over.x - 2, y: over.y + 6 }],
      [3.1, over],
      [3.75, over],
      [4.15, { x: over.x - 2, y: over.y + 6 }],
      [4.82, { x: HANDLE.x + upright.x, y: HANDLE.y + upright.y }],
    ]);
    const tipped = DwellerPose.lip({ x: 0, y: 0 }, potAim);
    const handle = { x: lip.x - tipped.x, y: lip.y - tipped.y };
    const hand = lifted
      ? handle
      : DwellerPose.along(t, [
          [0, KNEES[0]],
          [0.95, KNEES[0]],
          [1.72, HANDLE],
          [1.78, HANDLE],
          [4.82, HANDLE],
          [4.9, HANDLE],
          [5.3, KNEES[0]],
        ]);
    const running = lifted && potAim > 52;
    return {
      ...DwellerPose.STILL,
      lean: glide(t, [
        [0, TENDING.lean],
        [0.75, -5],
        [1.72, 23],
        [2.6, 10],
        [4.1, 10],
        [4.82, 22],
        [5.3, 6],
      ]),
      tilt: glide(t, [
        [0, TENDING.tilt],
        [0.75, 2],
        [1.72, 10],
        [3.1, 14],
        [4.1, 12],
        [5.3, 9],
      ]),
      hands: [
        {
          at: hand,
          holds: lifted ? "pot" : "nothing",
          aim: lifted ? potAim : potAim - 90,
          firm: glide(t, [
            [1.2, 0],
            [1.7, 1],
            [4.9, 1],
            [5.2, 0],
          ]),
          ahead: glide(t, [
            [0.95, DwellerPose.AT_KNEES],
            [1.72, 30],
            [2.6, DwellerPose.AT_CHEST],
            [4.15, DwellerPose.AT_CHEST],
            [4.82, 30],
            [5.3, DwellerPose.AT_KNEES],
          ]),
          elbow: DwellerPose.swing(t, [
            [0.95, DwellerPose.OUT],
            [1.72, DwellerPose.OVER],
            [2.6, DwellerPose.SIDE],
            [4.15, DwellerPose.SIDE],
            [4.82, DwellerPose.OVER],
            [5.3, DwellerPose.OUT],
          ]),
          side: 1,
        },
        {
          at: pouch,
          holds: taken ? "pouch" : "nothing",
          aim: pouchAim,
          // Loose in the fingers while the arm comes round from the pile.
          firm: glide(t, [
            [0.9, 0],
            [1.35, 0.15],
            [1.75, 1],
          ]),
          ahead: glide(t, [
            [0, DwellerPose.AT_KNEES],
            [0.75, 20],
            [1.75, DwellerPose.AT_CHEST],
          ]),
          elbow: DwellerPose.swing(t, [
            [0.9, DwellerPose.OUT],
            [1.75, DwellerPose.SIDE],
          ]),
          side: 1,
        },
      ],
      eyes: DwellerPose.blink(t),
      gaze: {
        x: glide(t, [
          [0, -1],
          [0.6, 1],
          [1.1, 1],
          [1.7, -1],
          [2.6, -0.4],
          [4.1, -0.4],
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
    };
  }

  /** The pouch sealed, finger and thumb run along its top, and left to stand. */
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
      [1.4, { x: edge(19).x + 2, y: edge(19).y - 7 }],
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
            [0.15, 0],
            [0.5, 1],
            [1.35, 1],
            [1.8, 0],
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
            [0.1, 0],
            [0.45, 1],
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
      elbow: DwellerPose.SIDE,
      side: 1,
    };
  }

  /** Melting snow: the spoon round the pot, in the fist; then it's left there, a lump comes
   * from the sack and is let fall in, and the spoon goes round again. */
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
    const above = { x: left.at.x + 8, y: left.at.y - 8 };
    const drop = { x: POT.x + 6, y: POT.y - 24 };
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
              [3.5, { x: SNOW.x + 2, y: SNOW.y - 32 }],
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
    // The hand's own turn: across the spoon, down into the sack, and down over the pot.
    const palm = glide(round, [
      [2.6, left.aim - 90],
      [3.5, 8],
      [4.1, 8],
      [4.85, 34],
      [5.15, 34],
      [5.68, left.aim - 90],
      [taken, left.aim - 90],
    ]);
    const aim = holds === "stirrer" ? spoon.aim : holds === "snow" ? palm - 90 : palm - 180;
    const falling = round >= 5 && round < 5.42 ? round - 5 : null;
    const sack = glide(round, [
      [2.7, 0],
      [3.5, 1],
      [4.1, 1],
      [4.85, 0],
    ]);
    return {
      ...DwellerPose.STILL,
      lean:
        t < begins
          ? glide(t, [
              [0, TENDING.lean],
              [begins, 15],
            ])
          : 15 + 8 * sack + (stirs ? 1.2 * Math.sin(2 * Math.PI * turn) : 0),
      tilt: 12 + 2 * sack,
      hands: [
        {
          at,
          holds,
          aim,
          firm: glide(t, [
            [0.25, 0],
            [0.62, 1],
          ]),
          ahead: 25 + 20 * sack,
          elbow:
            t < begins
              ? DwellerPose.swing(t, [
                  [0, DwellerPose.OUT],
                  [begins, DwellerPose.OVER],
                ])
              : DwellerPose.OVER,
          side: holds === "stirrer" ? -1 : 1,
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

  /** A drink: the bottle up from the floor, tipped at the lips with the head back, and down. */
  private static drinking(t: number): DwellerLook {
    const { BOTTLE, KNEES } = DwellerPose;
    const glide = DwellerPose.glide;
    const reach = DwellerHands.REACH.bottle;
    const lean = glide(t, [
      [0, 4],
      [0.6, 14],
      [1.3, 3],
      [2.45, 1],
      [2.95, 10],
      [3.22, 13],
      [3.5, 4],
    ]);
    const swallow = t > 1.45 && t < 2.4 ? Math.sin((2 * Math.PI * (t - 1.45)) / 0.34) : 0;
    const tilt =
      glide(t, [
        [0, 0],
        [0.6, 10],
        [1.3, -3],
        [1.75, -12],
        [2.4, -16],
        [2.8, 0],
        [3.22, 9],
        [3.5, 0],
      ]) - swallow;
    const aim =
      glide(t, [
        [0.7, 0],
        [0.95, 4],
        [1.3, 74],
        [1.75, 96],
        [2.4, 113],
        [2.75, 28],
        [2.92, 0],
        [3.2, 0],
      ]) +
      1.5 * swallow;
    const way = DwellerPose.pointing(aim);
    const lips = DwellerPose.mouthAt(lean, tilt);
    // At the lips, the bottle is where they are; on its way, it swings out round the knee.
    const sipping = { x: lips.x - 1 - way.x * reach, y: lips.y + 1 - way.y * reach };
    const moving = DwellerPose.along(t, [
      [0, KNEES[0]],
      [0.6, BOTTLE],
      [0.72, BOTTLE],
      [1, { x: -150, y: -58 }],
      [1.3, { x: -74, y: -196 }],
      [2.45, { x: -62, y: -214 }],
      [2.75, { x: -112, y: -120 }],
      [2.92, { x: -140, y: -44 }],
      [3.1, BOTTLE],
      [3.18, BOTTLE],
      [3.5, KNEES[0]],
    ]);
    const share = DwellerPose.ease((t - 1.12) / 0.2) * (1 - DwellerPose.ease((t - 2.42) / 0.22));
    const taken = t >= 0.66 && t < 3.14;
    return {
      ...DwellerPose.STILL,
      lean,
      tilt,
      hands: [
        {
          at: DwellerPose.mix(moving, sipping, share),
          holds: taken ? "bottle" : "nothing",
          aim: taken ? aim : aim - 90,
          firm: glide(t, [
            [0.15, 0],
            [0.55, 1],
            [3.18, 1],
            [3.45, 0],
          ]),
          ahead: glide(t, [
            [0, DwellerPose.AT_KNEES],
            [0.6, 70],
            [1, 55],
            [1.3, DwellerPose.AT_MOUTH],
            [2.45, DwellerPose.AT_MOUTH],
            [2.92, 55],
            [3.1, 70],
            [3.5, DwellerPose.AT_KNEES],
          ]),
          elbow: DwellerPose.swing(t, [
            [0, DwellerPose.OUT],
            [0.28, DwellerPose.FORE],
            [0.55, DwellerPose.IN],
            [0.9, DwellerPose.IN],
            [1.3, DwellerPose.DOWN],
            [2.6, DwellerPose.DOWN],
            [2.95, DwellerPose.IN],
            [3.15, DwellerPose.IN],
            [3.32, DwellerPose.FORE],
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
          [0.45, -0.9],
          [1.3, -0.2],
          [2.6, -0.3],
          [3.05, -0.9],
          [3.5, -0.3],
        ]),
        y: glide(t, [
          [0, 0.25],
          [0.45, 1],
          [1.3, -0.2],
          [1.75, -0.8],
          [2.6, 0.3],
          [3.05, 1],
          [3.5, 0.25],
        ]),
      },
    };
  }

  /** A bar: out of the chest pocket, two bites with chewing between, and back into it. */
  private static biting(t: number): DwellerLook {
    const { KNEES } = DwellerPose;
    const glide = DwellerPose.glide;
    const reach = DwellerHands.REACH.bar;
    const pocket = DwellerPose.CHEST_POCKET;
    const held = { x: -54, y: -132 };
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
      [1, 38],
      [1.25, 42],
      [1.6, 16],
      [2.15, 16],
      [2.55, 38],
      [2.8, 42],
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
            [0.15, 0],
            [0.5, 1],
            [3.2, 1],
            [3.5, 0],
          ]),
          ahead: glide(t, [
            [0, DwellerPose.AT_KNEES],
            [0.45, 70],
            [1, DwellerPose.AT_MOUTH],
            [2.8, DwellerPose.AT_MOUTH],
            [3.1, 70],
            [3.6, DwellerPose.AT_KNEES],
          ]),
          elbow: DwellerPose.DOWN,
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
          ahead: 50,
        },
        {
          ...DwellerPose.resting(1),
          at: DwellerPose.mix(FRETS[0], FRETS[1], at),
          holds: "neck",
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
          at: DwellerPose.mix(KNEES[0], { x: PACK.x + 18 * reach, y: PACK.y - 12 * reach }, over),
          ahead: AT_KNEES * (1 - over),
          elbow: DwellerPose.swing(over, [
            [0, DwellerPose.OUT],
            [1, DwellerPose.OVER],
          ]),
        },
        {
          ...DwellerPose.resting(1),
          at: DwellerPose.mix(
            KNEES[1],
            { x: PACK.x + 60 - 20 * reach, y: PACK.y + 30 * reach },
            over,
          ),
          ahead: AT_KNEES * (1 - over),
        },
      ],
    };
  }

  /** In from the door, `inward`, or out to it: on hands and knees, facing the way they go, the
   * palms flat on the mats. */
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
      firm: 1 - up,
      ahead: AT_KNEES * up,
      // On hands and knees the elbows bend back, toward the knees.
      elbow: DwellerPose.swing(up, [
        [0, DwellerPose.BACK],
        [0.5, DwellerPose.FORE],
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
    // Up out of the bag, a stretch with both arms over the head and a yawn.
    const up = DwellerPose.ease(share / 0.4);
    const stretch = DwellerPose.arc((share - 0.3) / 0.6);
    const { KNEES, AT_KNEES } = DwellerPose;
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
          ahead: AT_KNEES * (1 - stretch),
        },
        {
          ...DwellerPose.resting(1),
          at: DwellerPose.mix(KNEES[1], { x: 92, y: -262 }, stretch),
          ahead: AT_KNEES * (1 - stretch),
        },
      ],
      mouth: stretch,
      eyes: 1 - 0.8 * stretch,
      gaze: { x: 0, y: -0.5 * stretch },
    };
  }

  // The devices (#271).

  /** A device taken from where it's kept, to where it's held: `act`'s, `t` seconds in. Each ends
   * as its holding begins. */
  private static taking(act: `${DeviceAct}-out`, t: number): DwellerLook {
    switch (act) {
      case "radio-out":
        return DwellerPose.takingRadio(t);
      case "watch-out":
        return DwellerPose.turningWrist(t);
      case "meter-out":
        return DwellerPose.takingMeter(t);
      case "tracker-out":
        return DwellerPose.takingTracker(t);
    }
  }

  /** A device put back where it's kept: the way it came out, the other way round, in the time
   * putting it back takes. */
  private static puttingBack(act: `${DeviceAct}-away`, t: number): DwellerLook {
    const device = act.slice(0, -"-away".length) as DeviceAct;
    const out: `${DeviceAct}-out` = `${device}-out`;
    const back = 1 - DwellerPose.share(act, t);
    return DwellerPose.taking(out, back * (DwellerPose.ONCE[out] ?? 0));
  }

  /** The radio by the shoulder, to listen: cradled in the hand, its antenna up, the eyes on it. */
  private static listening(t: number): DwellerLook {
    const breath = Math.sin((2 * Math.PI * t) / 4.2);
    const { RADIO_HELD } = DwellerPose;
    return {
      ...DwellerPose.STILL,
      lean: 3 + breath,
      tilt: 5,
      sway: 3,
      hands: [
        DwellerPose.resting(0, -1.5 * breath),
        {
          at: { x: RADIO_HELD.x, y: RADIO_HELD.y - 1.5 * breath },
          ahead: DwellerPose.AT_CHEST,
          elbow: DwellerPose.DOWN,
          holds: "radio",
          aim: -10,
          firm: 1,
          side: 1,
        },
      ],
      eyes: DwellerPose.blink(t),
      gaze: { x: 0.55, y: 0.3 },
    };
  }

  /** The radio from the pad to the shoulder: a lean to it, the hand along it as it lies, and up,
   * turning it upright. */
  private static takingRadio(t: number): DwellerLook {
    const { KNEES, RADIO, RADIO_LIES, RADIO_HELD } = DwellerPose;
    const glide = DwellerPose.glide;
    return {
      ...DwellerPose.STILL,
      lean: glide(t, [
        [0, 4],
        [0.55, -9],
        [0.7, -9],
        [1.4, 3],
      ]),
      tilt: glide(t, [
        [0, 0],
        [0.5, 10],
        [0.75, 10],
        [1.4, 5],
      ]),
      sway: glide(t, [
        [0, 0],
        [0.5, 5],
        [1.4, 3],
      ]),
      hands: [
        DwellerPose.resting(0),
        {
          at: DwellerPose.along(t, [
            [0, KNEES[1]],
            [0.55, RADIO],
            [0.68, RADIO],
            [1, { x: 126, y: -72 }],
            [1.4, RADIO_HELD],
          ]),
          ahead: glide(t, [
            [0, DwellerPose.AT_KNEES],
            [0.55, 70],
            [1, 60],
            [1.4, DwellerPose.AT_CHEST],
          ]),
          elbow: DwellerPose.swing(t, [
            [0, DwellerPose.OUT],
            [0.28, DwellerPose.FORE],
            [0.5, DwellerPose.IN],
            [0.78, DwellerPose.IN],
            [1.4, DwellerPose.DOWN],
          ]),
          holds: t >= 0.62 ? "radio" : "nothing",
          aim: glide(t, [
            [0.1, 30],
            [0.5, RADIO_LIES],
            [0.68, RADIO_LIES],
            [1, 44],
            [1.4, -10],
          ]),
          firm: glide(t, [
            [0.15, 0],
            [0.5, 1],
          ]),
          side: 1,
        },
      ],
      gaze: {
        x: glide(t, [
          [0, -0.3],
          [0.4, 0.9],
          [0.8, 0.8],
          [1.4, 0.55],
        ]),
        y: glide(t, [
          [0, 0.25],
          [0.4, 1],
          [0.9, 0.6],
          [1.4, 0.3],
        ]),
      },
    };
  }

  /** A phrase into the radio: up to the lips, its top to the mouth, the words, and back to the
   * shoulder to hear the answer. */
  private static talking(t: number): DwellerLook {
    const { RADIO_HELD } = DwellerPose;
    const reach = DwellerHands.REACH.radio;
    const up = DwellerPose.ease(t / 0.35) * (1 - DwellerPose.ease((t - 1.3) / 0.4));
    const tilt = 5 - 4 * up;
    const sway = 3 + 3 * up;
    const aim = -10 - 26 * up;
    const way = DwellerPose.pointing(aim);
    const lips = DwellerPose.mouthAt(3, tilt, sway);
    const spoken = { x: lips.x + 7 - way.x * reach, y: lips.y + 8 - way.y * reach };
    const words = DwellerPose.ease((t - 0.36) / 0.1) * (1 - DwellerPose.ease((t - 1.18) / 0.1));
    return {
      ...DwellerPose.STILL,
      lean: 3,
      tilt,
      sway,
      hands: [
        DwellerPose.resting(0),
        {
          at: DwellerPose.mix(RADIO_HELD, spoken, up),
          ahead: DwellerPose.AT_CHEST + (DwellerPose.AT_MOUTH - DwellerPose.AT_CHEST) * up,
          elbow: DwellerPose.DOWN,
          holds: "radio",
          aim,
          firm: 1,
          side: 1,
        },
      ],
      mouth: words * (0.1 + 0.3 * Math.abs(Math.sin(2 * Math.PI * 3.1 * t))),
      gaze: { x: 0.55 - 0.45 * up, y: 0.3 - 0.2 * up },
    };
  }

  /** The watch read on the wrist turned up across the chest, the head down to it. */
  private static checking(t: number): DwellerLook {
    const breath = Math.sin((2 * Math.PI * t) / 4.2);
    return {
      ...DwellerPose.STILL,
      lean: 5 + breath,
      tilt: 15,
      hands: [DwellerPose.resting(0, -1.5 * breath), DwellerPose.wristUp(1)],
      eyes: 0.8 * DwellerPose.blink(t),
      gaze: { x: 0.2, y: 1 },
    };
  }

  /** The hand of the wrist that's turned up, `share` of the way from the knee. */
  private static wristUp(share: number): HandLook {
    const { KNEES, WRIST_UP } = DwellerPose;
    const up = DwellerPose.ease(share);
    return {
      at: DwellerPose.mix(KNEES[1], WRIST_UP, up),
      ahead: DwellerPose.AT_KNEES + (DwellerPose.AT_CHEST + 6 - DwellerPose.AT_KNEES) * up,
      elbow: DwellerPose.swing(up, [
        [0, DwellerPose.OUT],
        [1, DwellerPose.DOWN],
      ]),
      holds: "watch",
      aim: -58 * up,
      firm: up,
      side: 1,
    };
  }

  /** The wrist turned up for the watch: it comes up across the chest, the other hand's finger
   * presses its button, and goes back to its knee. */
  private static turningWrist(t: number): DwellerLook {
    const { KNEES, AT_WATCH } = DwellerPose;
    const glide = DwellerPose.glide;
    const over = DwellerPose.ease((t - 0.45) / 0.4) * (1 - DwellerPose.ease((t - 1.1) / 0.5));
    const press = DwellerPose.bump(t, 0.95, 0.1);
    return {
      ...DwellerPose.STILL,
      lean: glide(t, [
        [0, 4],
        [0.7, 5],
      ]),
      tilt: glide(t, [
        [0, 0],
        [0.7, 15],
      ]),
      hands: [
        {
          ...DwellerPose.resting(0),
          at: DwellerPose.mix(KNEES[0], { x: AT_WATCH.x, y: AT_WATCH.y + 3 * press }, over),
          ahead: DwellerPose.AT_KNEES + (DwellerPose.AT_CHEST + 14 - DwellerPose.AT_KNEES) * over,
          elbow: DwellerPose.swing(over, [
            [0, DwellerPose.OUT],
            [1, DwellerPose.DOWN],
          ]),
          aim: 96 * over,
          firm: 0.5 * over,
        },
        DwellerPose.wristUp(t / 0.7),
      ],
      eyes: glide(t, [
        [0.3, 1],
        [0.7, 0.8],
      ]),
      gaze: {
        x: glide(t, [
          [0, -0.3],
          [0.6, 0.2],
        ]),
        y: glide(t, [
          [0, 0.25],
          [0.6, 1],
        ]),
      },
    };
  }

  /** The weather meter held out at arm's length toward the open door, upright, its impeller in
   * the wind that comes in, the eyes on its display. */
  private static metering(t: number): DwellerLook {
    const { METER_OUT } = DwellerPose;
    const sway = Math.sin((2 * Math.PI * t) / 2.3);
    return {
      ...DwellerPose.STILL,
      lean: 20,
      tilt: -5,
      hands: [
        {
          at: { x: METER_OUT.x + 1.5 * sway, y: METER_OUT.y + Math.cos((2 * Math.PI * t) / 3.1) },
          ahead: 44,
          elbow: DwellerPose.OVER,
          holds: "meter",
          aim: -8,
          firm: 1,
          side: 1,
        },
        DwellerPose.resting(1),
      ],
      eyes: DwellerPose.blink(t),
      gaze: { x: -1, y: -0.45 },
      door: true,
    };
  }

  /** A hand up to the pocket on the wall for what stands in it at `kept`, and away with it to
   * `held` by way of `past`, over `whole` seconds: its elbow out and down under the hand as it
   * goes up, and `elbow`'s way as it ends; what it holds, `thing`, upright as it leaves the pocket and aimed `aim` as it
   * ends, `ahead` of the shoulders. */
  private static fromThePocket(
    t: number,
    whole: number,
    thing: Held,
    kept: Spot,
    past: Spot,
    held: {
      readonly at: Spot;
      readonly aim: number;
      readonly ahead: number;
      readonly elbow: Point;
    },
  ): HandLook {
    const glide = DwellerPose.glide;
    return {
      at: DwellerPose.along(t, [
        [0, DwellerPose.KNEES[0]],
        [0.52, kept],
        [0.68, kept],
        [1.05, past],
        [whole, held.at],
      ]),
      ahead: glide(t, [
        [0, DwellerPose.AT_KNEES],
        [0.52, 34],
        [1.05, 40],
        [whole, held.ahead],
      ]),
      elbow: DwellerPose.swing(t, [
        [0, DwellerPose.OUT],
        [0.68, DwellerPose.OUT],
        [whole, held.elbow],
      ]),
      holds: t >= 0.6 ? thing : "nothing",
      aim: glide(t, [
        [0.68, 0],
        [whole, held.aim],
      ]),
      firm: glide(t, [
        [0.15, 0],
        [0.48, 1],
      ]),
      side: 1,
    };
  }

  /** The weather meter from the chest pocket out to the door: a hand to the pocket, the meter
   * out of it, and a lean to the door with the arm out. */
  private static takingMeter(t: number): DwellerLook {
    const { KNEES, CHEST_POCKET, METER_OUT } = DwellerPose;
    const glide = DwellerPose.glide;
    return {
      ...DwellerPose.STILL,
      lean: glide(t, [
        [0, 4],
        [0.6, 4],
        [1.7, 20],
      ]),
      tilt: glide(t, [
        [0, 0],
        [0.45, 9],
        [0.65, 8],
        [1.7, -5],
      ]),
      hands: [
        {
          at: DwellerPose.along(t, [
            [0, KNEES[0]],
            [0.45, CHEST_POCKET],
            [0.58, CHEST_POCKET],
            [1.05, { x: -128, y: -146 }],
            [1.7, { x: METER_OUT.x, y: METER_OUT.y + 1 }],
          ]),
          ahead: glide(t, [
            [0, DwellerPose.AT_KNEES],
            [0.45, 70],
            [1.05, 56],
            [1.7, 44],
          ]),
          elbow: DwellerPose.swing(t, [
            [0, DwellerPose.OUT],
            [0.3, DwellerPose.DOWN],
            [0.7, DwellerPose.DOWN],
            [1.7, DwellerPose.OVER],
          ]),
          holds: t >= 0.5 ? "meter" : "nothing",
          aim: glide(t, [
            [0.45, 8],
            [0.7, 6],
            [1.7, -8],
          ]),
          firm: glide(t, [
            [0.15, 0],
            [0.45, 1],
          ]),
          side: 1,
        },
        DwellerPose.resting(1),
      ],
      gaze: {
        x: glide(t, [
          [0, -0.3],
          [0.45, -0.4],
          [1.7, -1],
        ]),
        y: glide(t, [
          [0, 0.25],
          [0.45, 0.9],
          [0.7, 0.7],
          [1.7, -0.45],
        ]),
      },
      door: t > 0.85,
    };
  }

  /** The tracker over the lap in one hand, the other's thumb on its keys now and then, the head
   * down to its screen. */
  private static reading(t: number): DwellerLook {
    const { TRACKER_HELD, AT_KEYS } = DwellerPose;
    const tap = DwellerPose.pulse(t, 1.3, 0.3);
    return {
      ...DwellerPose.STILL,
      lean: 7,
      tilt: 17,
      hands: [
        {
          at: TRACKER_HELD,
          ahead: DwellerPose.AT_CHEST + 12,
          elbow: DwellerPose.DOWN,
          holds: "tracker",
          aim: DwellerPose.TRACKER_AIM,
          firm: 1,
          side: 1,
        },
        DwellerPose.atKeys(1, AT_KEYS.y + 3 * tap),
      ],
      eyes: 0.8 * DwellerPose.blink(t),
      gaze: { x: -0.1, y: 1 },
    };
  }

  /** How the tracker leans in the hand over the lap, its screen to the face. */
  private static readonly TRACKER_AIM = 22;

  /** The hand whose thumb works the tracker's keys, `share` of the way there from its knee, its
   * thumb `y` down. */
  private static atKeys(share: number, y = DwellerPose.AT_KEYS.y): HandLook {
    const { KNEES, AT_KEYS } = DwellerPose;
    const over = DwellerPose.ease(share);
    return {
      ...DwellerPose.resting(1),
      at: DwellerPose.mix(KNEES[1], { x: AT_KEYS.x, y }, over),
      ahead: DwellerPose.AT_KNEES + (DwellerPose.AT_CHEST + 16 - DwellerPose.AT_KNEES) * over,
      elbow: DwellerPose.swing(over, [
        [0, DwellerPose.OUT],
        [1, DwellerPose.DOWN],
      ]),
      aim: -72 * over,
      firm: 0.5 * over,
    };
  }

  /** The tracker from the wall's pocket to the lap: a hand up to the pocket, round the tracker,
   * down to the lap, and the other hand over to its keys. */
  private static takingTracker(t: number): DwellerLook {
    const { TRACKER, TRACKER_HELD, TRACKER_AIM } = DwellerPose;
    const glide = DwellerPose.glide;
    return {
      ...DwellerPose.STILL,
      lean: glide(t, [
        [0, 4],
        [0.5, 6],
        [0.7, 6],
        [1.5, 7],
      ]),
      tilt: glide(t, [
        [0, 0],
        [0.45, -3],
        [0.8, -2],
        [1.5, 17],
      ]),
      hands: [
        DwellerPose.fromThePocket(
          t,
          1.5,
          "tracker",
          TRACKER,
          { x: TRACKER.x + 6, y: TRACKER.y - 34 },
          {
            at: TRACKER_HELD,
            aim: TRACKER_AIM,
            ahead: DwellerPose.AT_CHEST + 12,
            elbow: DwellerPose.DOWN,
          },
        ),
        DwellerPose.atKeys((t - 0.95) / 0.55),
      ],
      eyes: glide(t, [
        [0.9, 1],
        [1.5, 0.8],
      ]),
      gaze: {
        x: glide(t, [
          [0, -0.3],
          [0.4, -0.9],
          [0.9, -0.7],
          [1.5, -0.1],
        ]),
        y: glide(t, [
          [0, 0.25],
          [0.4, -0.3],
          [0.9, 0],
          [1.5, 1],
        ]),
      },
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
    dips: null,
  };

  /** How far through an act that plays once `seconds` is, 0 to 1. */
  private static share(act: Act, seconds: number): number {
    return Math.min(1, seconds / (DwellerPose.ONCE[act] ?? 1));
  }

  // The arms.

  /** An arm from `shoulder` to where `hand` grips: the hand set to what it holds as firmly as it
   * is, the wrist bent no further than a wrist bends, and what's left of the thing's aim taken
   * up in the fingers as far as they give. */
  private static reach(shoulder: Spot, hand: HandLook, side: 0 | 1): Reach {
    const { FOREARM, WRIST_BEND, WRIST_LOOSE } = DwellerPose;
    const shape = DwellerHands.SHAPES[hand.holds];
    const length = DwellerHands.WRIST[shape];
    // Which way the elbow is off the arm is settled once, for the forearm to where the hand
    // grips, and kept as the wrist is set.
    const pole = DwellerPose.elbowed(
      shoulder,
      hand.at,
      hand.ahead,
      side === 0 ? hand.elbow : { ...hand.elbow, x: -hand.elbow.x },
      FOREARM,
    );
    const square = DwellerHands.GRIPS[shape] === "across" ? 90 * hand.side : 180;
    // The hand lying along the forearm, one bone to where it grips: how it falls when nothing
    // sets it.
    const loose = DwellerPose.bend(shoulder, hand.at, hand.ahead, pole, FOREARM + length);
    const fallen = DwellerPose.angle(loose.elbow, loose.end);
    // What swings freely in the hand leaves the hand as it falls, and points its own way.
    const swings = DwellerHands.TURNS[hand.holds] !== undefined;
    if (hand.firm <= 0 || swings) {
      return {
        elbow: loose.elbow,
        wrist: DwellerPose.mix(loose.elbow, loose.end, FOREARM / (FOREARM + length)),
        at: loose.end,
        forearm: fallen,
        palm: fallen,
        aim: swings ? hand.aim : fallen - square,
      };
    }
    // The arm to the wrist of a hand turned so.
    const to = (palm: number): { readonly elbow: Spot; readonly end: Spot } => {
      const fingers = DwellerPose.fingers(palm);
      return DwellerPose.bend(
        shoulder,
        { x: hand.at.x - fingers.x * length, y: hand.at.y - fingers.y * length },
        hand.ahead,
        pole,
        FOREARM,
      );
    };
    // The hand turns toward what it holds as far as the wrist bends, and the wrist moves with
    // it: a few rounds settle them.
    const wanted = hand.aim + square;
    let palm = fallen + hand.firm * DwellerPose.turn(wanted - fallen) * 0.5;
    for (let pass = 0; pass < 8; pass += 1) {
      const arm = to(palm);
      const forearm = DwellerPose.angle(arm.elbow, arm.end);
      const short = Math.min(1, DwellerPose.far(arm.elbow, arm.end) / FOREARM);
      const limit = WRIST_BEND + (1 - short) * WRIST_LOOSE;
      const need = DwellerPose.turn(wanted - forearm);
      const set = forearm + hand.firm * Math.min(limit, Math.max(-limit, need));
      palm += DwellerPose.turn(set - palm) * 0.5;
    }
    const arm = to(palm);
    const fingers = DwellerPose.fingers(palm);
    // What the hand holds keeps its aim as far as it turns in the fingers; held loosely, it
    // turns with the hand.
    const cant = DwellerHands.CANT[shape];
    const spare = DwellerPose.turn(wanted - palm);
    const kept = hand.aim - (spare - Math.min(cant, Math.max(-cant, spare)));
    const carried = palm - square;
    return {
      elbow: arm.elbow,
      wrist: arm.end,
      at: { x: arm.end.x + fingers.x * length, y: arm.end.y + fingers.y * length },
      forearm: DwellerPose.angle(arm.elbow, arm.end),
      palm,
      aim: carried + DwellerPose.turn(kept - carried) * Math.min(1, hand.firm),
    };
  }

  /** Two bones from `shoulder` toward `target`, `ahead` of it toward the viewer, the upper arm
   * and one `lower` long, the elbow off the arm's line `side`'s way, which is square to it: the
   * end as near the target as they reach, the bones their lengths in three dimensions, and
   * drawn flat, so a bone that points toward the viewer is shorter. */
  private static bend(
    shoulder: Spot,
    target: Spot,
    ahead: number,
    side: Point,
    lower: number,
  ): { readonly elbow: Spot; readonly end: Spot } {
    const upper = DwellerPose.UPPER_ARM;
    const { along, reach, cos, sin } = DwellerPose.toward(shoulder, target, ahead, lower);
    // Square to this arm, should it point a little otherwise than the one the side was for.
    const dot = side.x * along.x + side.y * along.y + side.z * along.z;
    const across = { x: side.x - dot * along.x, y: side.y - dot * along.y };
    const size = Math.hypot(across.x, across.y, side.z - dot * along.z) || 1;
    return {
      elbow: {
        x: shoulder.x + upper * (along.x * cos + (across.x / size) * sin),
        y: shoulder.y + upper * (along.y * cos + (across.y / size) * sin),
      },
      end: { x: shoulder.x + along.x * reach, y: shoulder.y + along.y * reach },
    };
  }

  /** Which way the elbow is off the line of an arm that reaches from `shoulder` to `target`,
   * `ahead` of it, with one bone `lower` long below the elbow: `pole`'s way, square to the arm;
   * but no further round behind the arm than leaves `SEEN` of the lower bone to be seen, since
   * an elbow straight behind its arm points the forearm at the viewer, a sleeve seen end on. */
  private static elbowed(
    shoulder: Spot,
    target: Spot,
    ahead: number,
    pole: Point,
    lower: number,
  ): Point {
    const { SEEN } = DwellerPose;
    const upper = DwellerPose.UPPER_ARM;
    const { along, reach, cos, sin } = DwellerPose.toward(shoulder, target, ahead, lower);
    const dot = pole.x * along.x + pole.y * along.y + pole.z * along.z;
    const square = {
      x: pole.x - dot * along.x,
      y: pole.y - dot * along.y,
      z: pole.z - dot * along.z,
    };
    const size = Math.hypot(square.x, square.y, square.z);
    const side =
      size < 1e-9
        ? { x: 0, y: 0, z: 1 }
        : { x: square.x / size, y: square.y / size, z: square.z / size };
    // How far toward the viewer the lower bone runs depends on how far round from the front of
    // the arm the elbow is: the least it can be seen from in front, straight behind.
    const level = Math.sqrt(Math.max(0, 1 - along.z * along.z));
    const round = upper * sin * level;
    const least = (along.z * (reach - upper * cos) - lower * Math.sqrt(1 - SEEN * SEEN)) / round;
    if (round <= 1e-6 || least <= -1) {
      return side;
    }
    const near = { x: (-along.z * along.x) / level, y: (-along.z * along.y) / level, z: level };
    const across = {
      x: along.y * near.z - along.z * near.y,
      y: along.z * near.x - along.x * near.z,
      z: along.x * near.y - along.y * near.x,
    };
    const angle = Math.atan2(
      side.x * across.x + side.y * across.y + side.z * across.z,
      side.x * near.x + side.y * near.y + side.z * near.z,
    );
    const most = Math.acos(Math.min(1, least));
    if (Math.abs(angle) <= most) {
      return side;
    }
    const set = Math.sign(angle) * most;
    return {
      x: near.x * Math.cos(set) + across.x * Math.sin(set),
      y: near.y * Math.cos(set) + across.y * Math.sin(set),
      z: near.z * Math.cos(set) + across.z * Math.sin(set),
    };
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

  /** Which way a hand's fingers point that's turned so, one pixel long. */
  private static fingers(palm: number): Spot {
    const angle = (palm * Math.PI) / 180;
    return { x: -Math.sin(angle), y: Math.cos(angle) };
  }

  /** A turn in degrees, the short way round: from -180 to 180. */
  private static turn(degrees: number): number {
    return degrees - 360 * Math.round(degrees / 360);
  }

  private static far(a: Spot, b: Spot): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
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

  /** An elbow's way through its `keys` in time, as `glide` goes. */
  private static swing(t: number, keys: Keys<Point>): Point {
    const part = (of: (point: Point) => number): number =>
      DwellerPose.glide(
        t,
        keys.map(([time, point]): readonly [number, number] => [time, of(point)]),
      );
    return { x: part(({ x }) => x), y: part(({ y }) => y), z: part(({ z }) => z) };
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
