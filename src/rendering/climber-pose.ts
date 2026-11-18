import type { Pace, Tiredness } from "../simulation";
import { IceTools } from "./ice-tools";
import type { DrawnTool, PickIn, Strike } from "./ice-tools";

/** A joint of the figure, in its metres from where it stands, x the way they face and y up. */
export interface Joint {
  readonly x: number;
  readonly y: number;
}

/** A leg or an arm: where it starts, its knee or elbow, and its ankle or hand. */
export interface Limb {
  readonly root: Joint;
  readonly middle: Joint;
  readonly end: Joint;
}

/** A ladder as the figure goes along it, in its metres from the climber's point. */
export interface LadderFooting {
  /** Which way along it they go, a length of 1: about (1, 0) across a crevasse, (0, 1) up a
   * wall and (0, -1) down it. */
  readonly way: Joint;
  /** How far that way from the climber's point a rung is, and how far apart the rungs are. */
  readonly rung: number;
  readonly spacing: number;
  /** How far that way from the climber's point its two ends are. */
  readonly ends: readonly [number, number];
}

/** What the pose is made of this frame: the climber as the physics shows them, how they feel. */
export interface PoseState {
  /** How far they've come, in the figure's metres: across the ground or a ladder over a crevasse
   * the way they face, along a ladder up a wall. The gait is paced by the way covered, not by
   * time, so a boot stays where it came down as the physics moves the climber on. */
  readonly travelled: number;
  readonly moving: boolean;
  readonly falling: boolean;
  readonly dead: boolean;
  readonly tiredness: Tiredness;
  readonly pace: Pace["pace"];
  /** The ground's height `ahead` of the climber's point, behind them below 0, in the figure's
   * metres from the point: the snow the boots stand on. Under them, it's how far below their
   * point the ground is: in a fall, how high they are off it. */
  readonly ground: (ahead: number) => number;
  /** The ground's own height `ahead`, a wall's face and a crevasse's edge as they are, in the
   * figure's metres from the point: what the headlamp lights, and stops at (#202). */
  readonly terrain: (ahead: number) => number;
  /** Where each cowstail's carabiner is, from the climber's point in the figure's metres, or null
   * when it's off: the first, the jumar, and the second. */
  readonly jumar: Joint | null;
  readonly carabiner: Joint | null;
  /** Whether their hand slides the jumar up the rope: its key is held. */
  readonly sliding: boolean;
  /** How far the rope runs on from the jumar to its nearer anchor, in the figure's metres: the
   * most it comes up off where it lies. */
  readonly slack: number;
  readonly ladder: LadderFooting | null;
  /** How steady their steps look, from 1, steady, to 0, as likely to slip as a step gets
   * (#208): the climber wobbles below `WOBBLE.from`. */
  readonly footing: number;
  /** Whether they're hauling a partner up the rope, braced at the edge (#209). */
  readonly hauling: boolean;
  /** Whether they hold a rope tight by hand with nobody to haul, braced: a ladder's line, held for
   * whoever crosses (#212). */
  readonly bracing?: boolean;
  /** Whether the rope holds them off the ground, as the physics has it: hanging on it after a
   * fall, or hauled up it (#239). They hang upright then, wherever the carabiner is drawn. Not
   * said, a carabiner above them in the air says so. */
  readonly hanging?: boolean;
  /** On the ice, each pick they swung in, the one they hang from first (`PickIn`): none anywhere
   * else. The face is their ladder, its line the ice. */
  readonly picks?: readonly PickIn[];
  /** Whether the pick they hang from bites poorly: swung at full stretch, or into brittle ice. */
  readonly pickPoor?: boolean;
  /** How many ice tools they carry: the axe, and a second tool. The axe, if not said. */
  readonly tools?: number;
  /** Whether the ladder they're on is a face of ice, on their front points: on their tools, or
   * lowering down it on its rope. */
  readonly onIce?: boolean;
  /** Hanging on their rope, how far ahead of the climber's point a wall's face stands over their
   * harness, within a leg's reach, in the figure's metres: they put their boots on it (#243).
   * None in the open air, or not hanging. */
  readonly face?: number | null;
  /** Going into a tent or coming out of it (#258), how far down on their hands and knees they
   * are: 0 on their feet, 1 crawling. Not said, they're on their feet. */
  readonly crawling?: number;
  /** Down with a bone broken, which limb (#241): they sit where they came to rest, a broken leg
   * out straight ahead of them, a broken arm held to the chest. None on their feet. Hauled up a
   * rescue line they hang in the harness, their boots off the wall. */
  readonly hurt?: "leg" | "arm" | null;
  /** Kneeling at their work for a casualty, the hands at it (#241): first aid, or lifting them
   * (`aid`), at the hurt limb where the picture has it, from the climber's point, if it's known;
   * or the screws of a rescue line's anchor, turned into the ice (`anchor`). */
  readonly tending?: Tending | null;
  /** Whether they carry a casualty on their back (#241). */
  readonly carrying?: boolean;
  /** Carried on a rescuer's back (#241): where the rescuer's hips are drawn, from the climber's
   * point, and how far the rescuer leans. */
  readonly riding?: Mounted | null;
  /** How much they limp on a sprained leg, 0 to 1 (#241). */
  readonly limp?: number;
}

/** A rescuer's work on their knees (`PoseState.tending`). */
export interface Tending {
  readonly what: "aid" | "anchor";
  readonly at: Joint | null;
}

/** Whom a carried climber rides on (`PoseState.riding`). */
export interface Mounted {
  readonly hips: Joint;
  readonly lean: number;
}

/** The figure's joints this frame, in its metres from where it stands, facing +x: the whole of it
 * turned by `tilt` round there. */
export interface Pose {
  readonly pelvis: Joint;
  readonly shoulder: Joint;
  readonly head: Joint;
  /** The near leg and the far one, each to its ankle. */
  readonly legs: readonly [Limb, Limb];
  /** The near arm and the far one, each to its hand. */
  readonly arms: readonly [Limb, Limb];
  /** Each boot's sole, in radians from the level, its toe up: along what it stands on. */
  readonly soles: readonly [number, number];
  /** How far forward the spine leans, and the head, in radians. */
  readonly lean: number;
  readonly nod: number;
  /** Up a wall, where the eyes look, in radians from the level towards the wall, up above 0: up
   * it while its top is far over the head, across the top as the eyes come level with it, down
   * onto it once over it (#222). The headlamp shines that way. Null anywhere else, where the lamp
   * goes by the slope under the boots. */
  readonly gaze: number | null;
  /** How far over the whole figure has gone, in radians: 0 on its feet, a quarter turn lying
   * face down along the ground, its head the way it faced. */
  readonly tilt: number;
  /** Where the figure stands, from the climber's point in its metres: a few centimetres behind
   * it while the rest step pauses on the locked leg, on the ground there. */
  readonly offset: Joint;
  /** Where the jumar is drawn, in the near hand that holds it, and the second carabiner: the
   * cowstails run to them from the harness. */
  readonly jumar: Joint | null;
  readonly carabiner: Joint | null;
  /** Which boots came down this frame: on the snow, for the puff they kick up, or on their front
   * points into a face of ice, for the chips. */
  readonly landed: readonly [boolean, boolean];
  /** Each ice tool they carry, the axe first, in a hand or strapped to the pack (`IceTools`). */
  readonly tools: readonly DrawnTool[];
  /** The picks that went into the ice this frame, for the chips they knock off. */
  readonly strikes: readonly Strike[];
  /** How hard the hand pulls on the jumar now, as a share of the climber's weight, 0 to 1
   * (#232): up steep ground, between the strokes that slide it on, while it grips the rope; none
   * on the flat, going down, at a halt or on a ladder, whose rungs bear the weight (#250). The
   * rope above it comes taut by it. */
  readonly pull: number;
}

/** What the figure is doing, as the pose draws it: from one to the next, it blends. */
type Mode = "walk" | "rungs" | "wall" | "rise" | "fall" | "hang" | "dead" | "sit" | "tend" | "ride";

/** The points a boot turns on as its stiff ankle needs, in its frame from the point of the sole
 * under the ankle, x along the sole and y up off it: as the shin leans too far forward over it,
 * and too far back. */
interface Pivots {
  readonly forward: Joint;
  readonly back: Joint;
}

/** Where the pose's joints go before the limbs are bent to them: what a blend mixes, so the bones
 * keep their lengths through it; and what each boot turns on. */
interface Targets {
  readonly pelvis: Joint;
  readonly lean: number;
  readonly nod: number;
  readonly ankles: readonly [Joint, Joint];
  readonly soles: readonly [number, number];
  readonly pivots: readonly [Pivots, Pivots];
  readonly hands: readonly [Joint, Joint];
  readonly tilt: number;
  readonly offset: Joint;
}

/** A mode's targets this frame, which boots are down, and up a wall where the eyes look. */
interface Made {
  readonly targets: Targets;
  readonly down: readonly [boolean, boolean];
  readonly gaze?: number;
}

/** Where the walk is: how far into the stride, the stride's length, how far behind the climber's
 * point the figure is drawn, and how far into the rest step's pause it stands, 0 to 1; and how far
 * a boot swinging at a halt has come down, each of the two halves of the stride's. */
interface Gait {
  readonly phase: number;
  readonly stride: number;
  readonly behind: number;
  readonly pausing: number;
  readonly settled: readonly [number, number];
}

/** A boot where it's drawn: its ankle, and its sole's angle. */
interface Foot {
  readonly ankle: Joint;
  readonly sole: number;
}

/** A boot this frame: where it is, whether it's down, how far its leg bears the weight, 0 to 1,
 * and what it turns on. */
interface Boot extends Foot {
  readonly down: boolean;
  readonly weight: number;
  readonly pivots: Pivots;
}

/** A foot or a hand on a wall's rungs: how far up the ladder, how far off it, and whether it's on
 * a rung. */
interface OnRungs {
  readonly up: number;
  readonly off: number;
  readonly down: boolean;
}

/** How a body lies face down: the ankles and the hands from its line, from the boots along it;
 * and its lean and nod. */
interface Lying {
  readonly ankles: readonly [Joint, Joint];
  readonly hands: readonly [Joint, Joint];
  readonly lean: number;
  readonly nod: number;
}

/**
 * How a climber stands and moves (docs/guidelines/graphics.md → The animation shows the body's
 * state): a skeleton in metres, its legs and arms bent to their places by two-bone inverse
 * kinematics. The walk is paced by the ground covered: each boot stays where it came down on the
 * real ground, rolls on its toe as the heel lifts, and swings to its next place clear of the
 * snow; the hips sink so both boots reach the slope, and the body leans into it. The boots are
 * stiff: the shin leans only so far from a boot's upright, and past that the boot turns with it,
 * rolling on its toe up a steep slope and on its heel down one (#175). The rest step
 * stands still on the locked lower leg after each step; tiredness shortens and lowers the steps,
 * stills the arms, bends the back and drops the head, and an exhausted climber at a halt bends
 * double, hands on knees. Clipped, the near hand holds the jumar and pushes it up in strokes while
 * its key is held, and lets it go near an anchor, where the rope can't come up to the hand; as the
 * second carabiner is clipped or unclipped, the climber bends and crouches to it, the far hand on
 * it.
 * Across a ladder each boot comes down on a rung, the hands on its lines; up a wall, boot and hand
 * go rung over rung. On a face of ice the boots kick in on their front points, and the ice tools
 * are swung in and out as `IceTools` moves them, the axe in the near hand; with one tool, the far
 * hand holds the jumar on the rope or braces on the ice, and the weight sinks onto each pick as it
 * settles. A fall takes them over face down, tumbling in the air, or hangs them below the rope;
 * they get up through a kneel; a dead climber lies still. A climber down with a bone broken
 * (#241) sits where they came to rest, a broken leg out straight and a hand on it, or a broken arm
 * held to the chest, rocking a little with the pain; hauled up a rescue line they hang in the
 * harness, clear of the ice; on a sprained leg they limp. Their rescuer kneels over them, the
 * hands at the hurt limb, or at the ice with an anchor's screws; and carries them on their back,
 * bent under them, the hands under their knees, the casualty's arms over the rescuer's shoulders.
 * From each to the next the pose blends, in about a quarter of a second. It keeps only the picture's own: where in the stride, the
 * blends, the clocks of the fall and the reach, the hand on the jumar, and the tools.
 */
export class ClimberPose {
  /** The bones, in metres, of a climber 1.77 m tall in boots and a down suit; the ankle stands
   * over the sole. */
  static readonly THIGH = 0.43;
  static readonly SHIN = 0.4;
  static readonly ANKLE = 0.08;
  static readonly SPINE = 0.49;
  static readonly UPPER_ARM = 0.31;
  static readonly FOREARM = 0.28;
  /** From the shoulders to the middle of the head. */
  static readonly NECK = 0.24;
  static readonly HEAD_RADIUS = 0.12;
  /** The pelvis' height over the soles standing, the knees a little bent. */
  static readonly STANDING = 0.86;
  /** A stride at each pace: how far the body goes while each boot takes a step. On the ground it
   * grows with the speed, so the steps come no faster than so many a second, up to the longest
   * (#222): the mountain's clock runs faster than the route is drawn, so the climber walks over
   * it faster than in life, and short strides would be a scurry. */
  static readonly STRIDE: Readonly<Record<Pace["pace"], number>> = {
    "rest-step": 0.42,
    steady: 0.56,
    faster: 0.66,
  };
  static readonly LONGEST_STRIDE: Readonly<Record<Pace["pace"], number>> = {
    "rest-step": 1,
    steady: 1.1,
    faster: 1.15,
  };
  static readonly STEPS_A_SECOND: Readonly<Record<Pace["pace"], number>> = {
    "rest-step": 2.2,
    steady: 2.6,
    faster: 3,
  };
  /** How far a boot steps on a ladder, about: a rung at life size, and on a ladder drawn smaller
   * than the figure the nearest whole number of rungs. Each boot goes two steps in a stride, from
   * a rung to the next but one, so both come down on rungs. */
  static readonly RUNG_STEP = 0.3;
  /** How high a boot lifts in a step, and on a ladder. */
  static readonly LIFT = 0.14;
  static readonly RUNG_LIFT = 0.22;
  /** How much of a leg's cycle its boot is down; and how much of the end of its swing it takes
   * the weight over, coming down. */
  static readonly STANCE = 0.6;
  private static readonly LOADING = 0.35;
  /** How much of each step of the rest step the figure stands still on its locked lower leg; and
   * below how many steps a second it starts to pause, and above how many it stops (#222): the
   * pause shows where careful steps go slowly, up steep ground, and gives way to a smooth careful
   * walk where they go faster. Each step decides at its start, where the figure is on its point
   * and stands on no locked leg, so the change shows no jolt. */
  static readonly REST_PAUSE = 0.45;
  static readonly PAUSED_STEPS = { from: 2.4, to: 2.6 };
  /** Careful steps (#222): how much lower the boots lift than at a steady pace, how much less the
   * arms swing and the pelvis dips, and how much lower the head looks, at the feet. */
  private static readonly CAREFUL = { lift: 0.4, swing: 0.6, bob: 0.7, nod: 0.12 };
  /** The lean, in radians, by tiredness; what walking, the jumar and a ladder add; and bent
   * double over the knees. */
  static readonly LEAN: Readonly<Record<Tiredness, number>> = {
    fresh: 0.06,
    tired: 0.14,
    "profoundly-tired": 0.24,
    exhausted: 0.4,
  };
  static readonly WALKING_LEAN = 0.16;
  static readonly HOLDING_LEAN = 0.2;
  static readonly LADDER_LEAN = 0.08;
  static readonly BENT_DOUBLE = 0.95;
  /** How high over a ladder's rungs the hands hold its lines. */
  static readonly LINES = 1;
  /** How far a ladder up a wall stands over the wall's top, as the Icefall's are set, so a
   * climber has its rails to hold as they step off it or onto it (#243): the picture draws it so,
   * and the hands go that far up it. */
  static readonly LADDER_OVER = 0.75;
  /** How a fallen climber lies: a quarter turn, face down along the ground. */
  static readonly FALLEN_RADIANS = Math.PI / 2;
  /** How long a climber takes to go over in a fall, and to get up after it. */
  static readonly FALL_SECONDS = 0.4;
  static readonly RISE_SECONDS = 1.2;
  /** How high over the snow the hips of a climber sat on it are (#241). */
  static readonly SEAT = 0.15;
  /** How long a blend into each takes. */
  static readonly BLEND_SECONDS: Readonly<Record<Mode, number>> = {
    walk: 0.3,
    rungs: 0.3,
    wall: 0.35,
    rise: 0.5,
    fall: ClimberPose.FALL_SECONDS,
    hang: 0.5,
    dead: 0.6,
    sit: 0.9,
    tend: 0.5,
    ride: 0.7,
  };
  /** By tiredness: the stride's and the lift's share, the arms' swing's, and the head's drop. */
  static readonly TIRED: Readonly<
    Record<Tiredness, { stride: number; lift: number; swing: number; nod: number }>
  > = {
    fresh: { stride: 1, lift: 1, swing: 1, nod: 0 },
    tired: { stride: 0.92, lift: 0.85, swing: 0.8, nod: 0.06 },
    "profoundly-tired": { stride: 0.82, lift: 0.7, swing: 0.55, nod: 0.16 },
    exhausted: { stride: 0.7, lift: 0.55, swing: 0.35, nod: 0.3 },
  };
  /** Where in the stride a climber stands at first: both boots down, one ahead. */
  private static readonly START = 0.05;
  /** How long the boots take to settle at a halt, or the stride to pick up again; and how long
   * the speed the stride grows with takes to follow the climber's, slower, so a boot down hardly
   * slides as the stride changes under it (#222). */
  private static readonly SETTLE_SECONDS = 0.25;
  private static readonly SPEED_SECONDS = 0.6;
  /** The sink of the pelvis by tiredness, standing. */
  private static readonly SINK: Readonly<Record<Tiredness, number>> = {
    fresh: 0,
    tired: 0.01,
    "profoundly-tired": 0.02,
    exhausted: 0.04,
  };
  /** How far the pelvis dips as the weight goes from one boot to the other. */
  private static readonly BOB = 0.02;
  /** The hips' and the shoulders' depth apart. */
  private static readonly HIP_SPREAD = 0.02;
  private static readonly SHOULDER_SPREAD = 0.02;
  /** How far an arm swings in a stride, in radians each way. */
  private static readonly ARM_SWING = 0.45;
  /** How far the heel comes up as the boot leaves the ground, in radians, and from where in its
   * cycle. */
  private static readonly HEEL_LIFT = 0.4;
  private static readonly HEEL_FROM = 0.35;
  /** How far a boot's stiff shaft lets the shin lean from the boot's upright, in radians: forward
   * over the toe, and back. Past them the boot turns with the shin: down, it rolls on its toe or
   * its heel as far as the leg needs. */
  static readonly BOOT_FLEX: Readonly<{ forward: number; back: number }> = {
    forward: 0.55,
    back: 0.3,
  };
  /** From the point of the sole under the ankle to its toe, where the stiff sole's rocker begins,
   * and to its heel: what a boot rolls on. */
  static readonly TOE = 0.2;
  static readonly HEEL = -0.105;
  /** From the point of the sole under the ankle to the ball of the foot, where a boot coming down
   * kicks up the snow. */
  static readonly BALL = 0.13;
  /** The most a boot turns on its toe or its heel for its stiff ankle. */
  private static readonly MOST_TURN = 1.2;
  /** The steepest a sole lies along the ground, in radians. */
  private static readonly SOLE_STEEPEST = 0.6;
  /** How far the slope leans the body into it: a share of its angle, between these. */
  private static readonly SLOPE_LEAN = { share: 0.45, least: -0.12, most: 0.3 };
  /** How far back over the locked lower leg the pelvis goes in the rest step's pause; how far
   * under the whole leg's reach it stands on it, locked; and how far into the step through it
   * comes down off it, before the back boot lifts (#222). */
  private static readonly REST_BACK = 0.08;
  private static readonly LOCK_SLACK = 0.02;
  private static readonly OFF_THE_LOCK = 0.18;
  /** How far a leg reaches, as a share of its length: never quite straight. */
  private static readonly REACH = 0.995;
  /** Where the near hand holds the jumar when the rope is out of its reach, from the shoulder:
   * the rope is lifted to it. How much of each step pushes the jumar up the rope; it grips for
   * the rest. How much shorter than that lift the rope to the anchor gets as the hand lets go:
   * nearer, the rope can't come up to it. */
  private static readonly JUMAR_HOLD: Joint = { x: 0.34, y: -0.3 };
  private static readonly JUMAR_PUSH = 0.7;
  private static readonly LET_GO = 0.3;
  /** The pull on the jumar between its strokes (#232): the steepness of the ground, as a sine,
   * from which a climber leans on the rope at all, and at which they pull with all they do. */
  private static readonly PULL = { from: 0.17, whole: 0.7 };
  /** How long the far hand takes to clip the second cowstail, or unclip it, and come back; how
   * far the body leans into the reach, and crouches to the rope. */
  private static readonly CLIP_SECONDS = 0.6;
  private static readonly CLIP_LEAN = 0.3;
  private static readonly CLIP_CROUCH = 0.15;
  /** Across a ladder: how far ahead of the shoulders each hand holds the lines. */
  private static readonly LINE_HOLDS: readonly [number, number] = [0.3, 0.18];
  /** Up a wall: how far toward the wall from the ladder's line the balls of the feet and the
   * hands are, and the ball of the foot from the ankle; the pelvis, up the ladder and off it; how
   * high over the feet the hands hold, about, and over the top, on the rails that stand over it
   * (`LADDER_OVER`); how far a foot or a hand comes off between the rungs; the lean into it. */
  private static readonly WALL = {
    foot: 0.04,
    hand: 0.03,
    ball: 0.07,
    pelvis: { up: 0.68, off: -0.3 },
    hands: 1.2,
    over: ClimberPose.LADDER_OVER - 0.25,
    lift: 0.12,
    lean: 0.15,
  };
  /** On a face of ice, front-pointing: the line is the ice itself, so the balls of the feet are
   * back off it, the boots' toes at the ice with only the crampons' front points in it; the
   * body stands taller and further out on straighter legs, hanging off the tools, and more
   * upright. */
  private static readonly ICE_WALL = {
    ...ClimberPose.WALL,
    foot: -0.105,
    over: 0.1,
    pelvis: { up: 0.84, off: -0.34 },
    lean: 0.08,
  };
  /** Up a wall, the head looks up it, across its top as the eyes come level with it, and once it
   * comes over the top, down onto it, the body leaning over the edge to step off (#222): the nod up
   * the wall and onto its top, how far under the top the head starts to come down to the level,
   * how far over the top it is when it's looking down onto it, and how far the climber leans over
   * it there. */
  private static readonly CREST = { up: -0.3, onto: 0.35, below: 0.6, over: 0.45, lean: 0.4 };
  /** On steps likely to slip (#208), a climber wobbles, more the likelier: below this footing,
   * swaying their body this far each way, so many times a second, their arms out for balance to
   * these hands, from the shoulder, the near one forward and the far one back. */
  /** Hauling a partner up the rope (#209): leaning back this far, sunk this far into the knees,
   * the hands reaching this far ahead at hip height, hand over hand so many times a second, this
   * far each pull. */
  private static readonly HAUL = {
    lean: -0.38,
    sink: 0.1,
    ahead: 0.42,
    hz: 1.1,
    pull: 0.16,
    hold: 0.55,
  };
  private static readonly WOBBLE = {
    from: 0.7,
    lean: 0.16,
    hz: 1.6,
    near: { x: 0.42, y: -0.05 },
    far: { x: -0.38, y: -0.12 },
  };
  /** How far above their harness a climber held by the rope is drawn hanging from at the least,
   * in metres, however low the carabiner is drawn (#239). */
  private static readonly HELD_ABOVE = 0.45;
  /** How far a climber held by the rope leans the way it pulls, in radians, at the most (#243):
   * the harness ties in at the waist, by the body's middle, so a pull from well to the side
   * swings them that way without laying them over. */
  private static readonly HANG_LEAN = 0.35;
  /** A fall: how high off the ground a body is in the air, how fast it tumbles there, and how
   * fast and how far the limbs flail. */
  private static readonly AIR_METRES = 0.4;
  private static readonly TUMBLE = 5;
  private static readonly FLAIL_HZ = 2.2;
  private static readonly FLAIL = 0.1;
  /** Lying face down: how far the body's line is off the ground, its front to it, and the pelvis
   * along it from the boots. */
  private static readonly LYING = { off: -0.15, pelvis: 0.86 };
  /** A slide's limbs, the legs straight and the hands under the shoulders, as for self-arrest;
   * and death's, along the body. */
  private static readonly SLIDING: Lying = {
    ankles: [
      { x: 0.06, y: 0.06 },
      { x: 0.03, y: 0.04 },
    ],
    hands: [
      { x: 0.14, y: 1.18 },
      { x: 0.1, y: 1.22 },
    ],
    lean: 0.12,
    nod: 0,
  };
  private static readonly DEAD: Lying = {
    ankles: [
      { x: 0.05, y: 0.06 },
      { x: 0.03, y: 0.04 },
    ],
    hands: [
      { x: 0.1, y: 0.8 },
      { x: 0.03, y: 0.84 },
    ],
    lean: 0,
    nod: 0.1,
  };
  /** Hanging from a cowstail: the legs dangling below the harness, how far they sway and how
   * often. */
  private static readonly HANGING_FEET: readonly [Joint, Joint] = [
    { x: 0.12, y: -0.78 },
    { x: -0.04, y: -0.8 },
  ];
  private static readonly HANGING_SWAY = { metres: 0.05, hz: 0.6 };
  /** Hanging beside a wall's face, the boots braced on it (#243), as a climber hauled up a wall
   * or jumaring up one walks their feet up it: from how far off the face the boots come onto it,
   * and over how much nearer they're fully on; how far out from it the harness hangs, the legs
   * pushing the body off; how far back the body leans, and the spine curls forward in the
   * harness; where a boot is set, level with the harness, the legs near straight as a stiff boot
   * needs with its sole flat on a wall, and how much further down it is when it steps up again; how much of its cycle it's set on the wall, and how far off it it lifts. A
   * boot set on the wall stays there as the body goes up, so the step's rise is the span over
   * the share it's set. */
  private static readonly BRACED = {
    reach: 0.9,
    ease: 0.3,
    off: 0.84,
    tilt: -0.45,
    lean: 0.2,
    top: 0,
    span: 0.28,
    set: 0.8,
    lift: 0.08,
  };
  /** Kneeling to get up: the pelvis low, a boot ahead, the other knee and toes on the ground, both
   * hands on the front knee. */
  private static readonly KNEEL = {
    pelvis: { x: 0, y: 0.5 },
    ankles: [
      { x: 0.3, y: 0.08 },
      { x: -0.42, y: 0.1 },
    ] as readonly [Joint, Joint],
    lean: 0.45,
    toes: -1.1,
  };
  /** Down with a bone broken (#241), sitting on the snow: where the hips are, from the climber's
   * point and off the snow; and how the pain rocks them, this far, so many times a second. With
   * a broken leg, leaning back on the far hand, propped behind them (`prop`): the leg out
   * straight ahead, this far from the hip, its heel on the snow and its toes up; the other knee
   * up, its boot this far ahead; the near hand on the thigh, this share of the way to the knee;
   * the head down to it. With a broken arm, hunched over it: both knees up, the forearm across
   * the body (`held`, from the hips) and the other hand under it. In a crevasse's narrow foot
   * (`room`: a wall's face this much over the seat, looked for this far to each side, this
   * finely) they sit `cramped`: the broken leg as far out as the ice ahead lets its boot, this
   * far at the least, the knee up; the back to the ice behind, nearly upright, the hand against
   * it, this high. */
  private static readonly SAT = {
    hips: { x: -0.06, y: ClimberPose.SEAT },
    rock: { radians: 0.03, hz: 0.28 },
    leg: {
      lean: -0.4,
      nod: 0.4,
      out: 0.79,
      heel: 0.11,
      toes: 1.22,
      knee: 0.44,
      thigh: 0.55,
      prop: { x: -0.36, y: 0.03 },
    },
    arm: {
      lean: 0.26,
      nod: 0.42,
      knees: [0.5, 0.4] as readonly [number, number],
      held: { x: 0.21, y: 0.33 },
      under: { x: 0.14, y: 0.27 },
    },
    room: { reach: 1.2, step: 0.05, wall: 0.35 },
    cramped: { boot: 0.1, least: 0.3, ease: 0.3, prop: 0.12, lean: -0.08, hand: 0.25 },
  };
  /** Hauled up a rescue line (#241), hurt: how far off a wall's face beside them they hang, in
   * the harness, their boots off it. */
  private static readonly HAULED_OFF = 0.34;
  /** On their knees at a casualty (#241): the kneel, bent this far over them, the head down; the
   * hands at the hurt limb where the picture has it, as far as the arms reach, or this far ahead
   * and this high off the snow (`aid`), working, this far round, so many times a second, one
   * against the other. Over work as low as `low` off the snow they bend all the way (`lean`),
   * and no further than `upright` over work as high as `high`: an arm held to the chest; and
   * further still, `step` by `step` up to `most`, till the hands reach it. At an anchor (`anchor`), down at the ice, the near hand turning a screw
   * in, this far round, so many turns a second, the far one steadying it. */
  private static readonly TEND = {
    lean: 0.8,
    upright: 0.5,
    low: 0.25,
    high: 0.55,
    most: 1.2,
    step: 0.05,
    nod: 0.55,
    ahead: 0.52,
    aid: { up: 0.3, round: 0.035, hz: 1.3 },
    anchor: { up: 0.1, round: 0.05, hz: 1.8 },
  };
  /** Carrying a casualty on their back (#241): bent forward under them this far at the least,
   * sunk this far into the knees, the hips this far back under the load, and each hand back at
   * the hips, under the casualty's knees. */
  private static readonly CARRY = {
    lean: 0.44,
    sink: 0.05,
    back: 0.04,
    hands: [
      { x: 0.13, y: -0.03 },
      { x: 0.09, y: -0.05 },
    ] as readonly [Joint, Joint],
  };
  /** Carried on a rescuer's back (#241), as in a pack carry: sat this far behind their hips and
   * above them, leaning on their back this much further than they lean, the head on their
   * shoulder; the arms over their shoulders, each hand this far from the rescuer's shoulder, on
   * their chest; the thighs round their waist, each boot hanging this far ahead of their hips
   * and below them, its toes down. */
  private static readonly RIDE = {
    seat: { x: -0.3, y: 0.1 },
    lean: 0.12,
    nod: 0.3,
    hands: [
      { x: 0.12, y: -0.1 },
      { x: 0.16, y: -0.14 },
    ] as readonly [Joint, Joint],
    boots: [
      { x: 0.34, y: -0.28 },
      { x: 0.28, y: -0.32 },
    ] as readonly [Joint, Joint],
    soles: [-0.38, -0.32] as readonly [number, number],
  };
  /** A limp on a sprained leg (#241): how far the hips drop onto it and the body lurches over it
   * as it takes the weight, at the most. */
  private static readonly LIMP = { drop: 0.045, lurch: 0.09 };
  /** On hands and knees, through a tent's door (#258): the pelvis over the knees, the back near
   * level, the head up to see ahead; where the ankles lie behind, the shins along the ground and
   * the toes down, and where the hands are planted ahead; how far along the ground a crawl's
   * stride goes, each hand going forward with the knee across from it, and how far a hand or a
   * knee reaches and lifts in it. */
  private static readonly ALL_FOURS = {
    pelvis: { x: -0.06, y: 0.47 },
    lean: 1.3,
    nod: 1.12,
    ankles: [
      { x: -0.5, y: 0.09 },
      { x: -0.42, y: 0.09 },
    ] as readonly [Joint, Joint],
    hands: [
      { x: 0.52, y: 0.03 },
      { x: 0.43, y: 0.03 },
    ] as readonly [Joint, Joint],
    toes: -1.2,
    stride: 0.5,
    reach: 0.08,
    lift: 0.04,
  };
  /** How far the body sinks onto a pick as the weight comes onto it; and the most it crouches on
   * the ice towards a tool in it below the shoulder and out of the arm's reach, as over a lip. */
  private static readonly LOAD_SINK = 0.025;
  private static readonly MOST_CROUCH = 0.45;
  private static readonly ORIGIN: Joint = { x: 0, y: 0 };
  private static readonly UP: Joint = { x: 0, y: 1 };
  private static readonly NONE_DOWN: readonly [boolean, boolean] = [false, false];
  /** What a boot turns on for its stiff ankle: on the snow its toe or its heel, on a ladder's
   * rung the rung under it, on a wall's the ball of the foot, and off the ground its ankle. */
  private static readonly ON_SNOW: Pivots = {
    forward: { x: ClimberPose.TOE, y: 0 },
    back: { x: ClimberPose.HEEL, y: 0 },
  };
  private static readonly ON_A_RUNG: Pivots = {
    forward: ClimberPose.ORIGIN,
    back: ClimberPose.ORIGIN,
  };
  private static readonly ON_A_WALL: Pivots = {
    forward: { x: ClimberPose.WALL.ball, y: 0 },
    back: { x: ClimberPose.WALL.ball, y: 0 },
  };
  private static readonly ON_THE_TOE: Pivots = {
    forward: { x: ClimberPose.TOE, y: 0 },
    back: { x: ClimberPose.TOE, y: 0 },
  };
  private static readonly OFF_THE_GROUND: Pivots = {
    forward: { x: 0, y: ClimberPose.ANKLE },
    back: { x: 0, y: ClimberPose.ANKLE },
  };

  /** Where in the stride, 0 to 1, as the way covered paces it. */
  private cycle = ClimberPose.START;
  private lastTravelled: number | null = null;
  /** The stride, eased to the one the pace and the tiredness give, so a boot down stays. */
  private stride: number | null = null;
  /** How far the figure is at a halt, 0 walking to 1 standing; and how far each half of the
   * stride's swinging boot has come down at it: it stays down when the walk goes on, until its
   * step would have brought it there. */
  private standing = 1;
  private settled: [number, number] = [0, 0];
  /** How far the near hand is on the jumar, 0 to 1, where it held it last, and how far off the
   * rope that lifted it; how far it pushes it in strokes. */
  private holding = 0;
  private heldAt: Joint | null = null;
  /** Which hand has the jumar, 0 the near one to 1 the far one: the far one once the near one
   * holds the axe. */
  private jumarSide = 0;
  /** The ice tools: where each is, and its swing; how far a tool in the ice was out of reach
   * below the shoulder last frame, and how far the climber crouches towards it. */
  private readonly tools = new IceTools();
  private short = -Infinity;
  private crouch = 0;
  private lift = 0;
  private pushing = 0;
  /** How hard the hand pulls on the jumar this frame (#232). */
  private pulling = 0;
  /** How far into the rest step's rhythm, 0 to 1; and how fast the climber's point goes over the
   * ground, in the figure's metres a second, smoothed. */
  private resting = 0;
  private speed = 0;
  /** Whether this step of the rest step pauses, and where in its step the walk was last frame. */
  private pauses = true;
  private lastStep = 0;
  /** Up a wall, where the eyes look this frame. */
  private gazing: number | null = null;
  /** Whether the second carabiner was on last frame, where it was, and the far hand's reach to
   * it: the seconds left. */
  private clipped: boolean | null = null;
  private carabinerSeen: Joint | null = null;
  private reaching = 0;
  /** How long the fall has run, how far it's in the air, and how far it's turned over there. */
  private fallen = 0;
  private aloft = 0;
  private spin = 0;
  /** Hanging, how far the boots are braced on a wall's face beside them, 0 to 1, and how far
   * ahead the face was when last seen (#243). */
  private braced = 0;
  private faceAhead = 0;
  /** How far up after a fall, 0 to 1. */
  private rising = 1;
  /** The pose's own seconds, which the wobble sways on. */
  private time = 0;
  private mode: Mode | null = null;
  /** Last frame's targets, and the blend from them to the new mode's: its seconds so far. */
  private last: Targets | null = null;
  private blendFrom: Targets | null = null;
  private blended = 0;
  private down: readonly [boolean, boolean] = [true, true];

  /** The pose `seconds` after the last one, for the climber in `state`. */
  advance(seconds: number, state: PoseState): Pose {
    const frame = Math.max(seconds, 0);
    const share = 1 - Math.exp(-frame / ClimberPose.SETTLE_SECONDS);
    const mode = this.modeOf(state);
    const picks = state.picks ?? [];
    this.tools.advance(frame, {
      picks,
      poor: state.pickPoor ?? false,
      carried: state.tools ?? 1,
      upright: !state.falling && !state.dead,
      // On a ladder, lowering down a face on its rope, or hauling, the hands are needed; so are
      // a rescuer's, and a casualty has put their axe away (#241).
      free:
        !state.hauling && !ClimberPose.rescue(state) && (state.ladder === null || picks.length > 0),
    });
    this.keepTime(frame, share, state, mode);
    // On the ice, down towards a tool out of reach below, as far as it is, and up off it again.
    const crouching = mode === "wall" && state.onIce === true && Number.isFinite(this.short);
    const crouch = crouching ? this.crouch + this.short : 0;
    this.crouch += (Math.min(Math.max(crouch, 0), ClimberPose.MOST_CROUCH) - this.crouch) * share;
    const gait = this.gait(state, mode, share, frame);
    this.time += frame;
    this.pulling = 0;
    const made = this.carrying(
      this.hauling(
        this.wobbling(this.limping(this.made(mode, state, gait), state, mode, gait), state, mode),
        state,
        mode,
      ),
      state,
      mode,
    );
    this.gazing = mode === "wall" ? (made.gaze ?? null) : null;
    if (this.mode !== null && mode !== this.mode && this.last !== null) {
      const tilt = ClimberPose.nearest(this.last.tilt, made.targets.tilt);
      this.blendFrom = { ...this.last, tilt };
      this.blended = 0;
    }
    this.mode = mode;
    const targets = this.blend(made.targets, frame, mode);
    this.last = targets;
    // On the snow a boot comes down; on a face of ice its front points kick in.
    const kicks = mode === "walk" || (mode === "wall" && state.onIce === true);
    const landed: readonly [boolean, boolean] = [
      kicks && made.down[0] && !this.down[0],
      kicks && made.down[1] && !this.down[1],
    ];
    this.down = made.down;
    return this.solve(state, targets, landed);
  }

  /** The middle joint of a limb from `root` towards `end`, its bones `upper` and `lower` long,
   * bent to `side` of the line between them: 1 is to its left, looking along it. An end out of
   * reach is brought to it, so the bones keep their lengths. */
  static bend(root: Joint, end: Joint, upper: number, lower: number, side: 1 | -1): Limb {
    const dx = end.x - root.x;
    const dy = end.y - root.y;
    const far = Math.hypot(dx, dy);
    const reach = Math.min(Math.max(far, Math.abs(upper - lower) + 1e-6), upper + lower - 1e-6);
    const towards = far < 1e-9 ? -Math.PI / 2 : Math.atan2(dy, dx);
    const inner = Math.acos((upper * upper + reach * reach - lower * lower) / (2 * upper * reach));
    const angle = towards + side * inner;
    return {
      root,
      middle: { x: root.x + upper * Math.cos(angle), y: root.y + upper * Math.sin(angle) },
      end: { x: root.x + reach * Math.cos(towards), y: root.y + reach * Math.sin(towards) },
    };
  }

  /** Whether their hands are a rescue's (#241): at a casualty or an anchor, under the knees of
   * one they carry; or they're a casualty, down or carried. */
  private static rescue(state: PoseState): boolean {
    return (
      state.tending != null || state.carrying === true || state.riding != null || state.hurt != null
    );
  }

  private modeOf(state: PoseState): Mode {
    if (state.dead) {
      return "dead";
    }
    if (state.riding != null) {
      return "ride";
    }
    if (state.falling) {
      return this.heldUp(state) || this.hangingFrom(state) !== null ? "hang" : "fall";
    }
    if (state.hurt != null) {
      return "sit";
    }
    if (this.rising < 1) {
      return "rise";
    }
    const { ladder } = state;
    if (ladder === null) {
      return state.tending == null ? "walk" : "tend";
    }
    return Math.abs(ladder.way.y) >= 0.5 ? "wall" : "rungs";
  }

  /** Whether the rope holds them up off the ground, as the physics has it (#239): one it holds
   * lying on a crevasse's floor lies there. */
  private heldUp(state: PoseState): boolean {
    return state.hanging === true && -state.ground(0) > ClimberPose.AIR_METRES;
  }

  /** What a falling climber hangs from: a cowstail's carabiner above them, off the ground. */
  private hangingFrom(state: PoseState): Joint | null {
    const hold = state.jumar ?? state.carabiner;
    const inTheAir = -state.ground(0) > ClimberPose.AIR_METRES;
    return hold !== null && inTheAir && hold.y > 0.05 ? hold : null;
  }

  /** The clocks: the halt, the hand on the jumar, the rest step, the reach to the second
   * carabiner, the fall and the getting up. */
  private keepTime(frame: number, share: number, state: PoseState, mode: Mode): void {
    const upright = mode === "walk" || mode === "rungs" || mode === "wall";
    this.standing += ((state.moving && upright ? 0 : 1) - this.standing) * share;
    // The hand lets the jumar go where the rope runs on to its anchor less far than it lifts it;
    // the near hand holds it, or the far one once the near one has the axe, and neither on two
    // tools.
    const grip = ClimberPose.smooth(1 + (state.slack - this.lift) / ClimberPose.LET_GO);
    const [nearFree, farFree] = this.tools.handsFree;
    const free = nearFree || farFree;
    this.jumarSide += ((nearFree ? 0 : farFree ? 1 : this.jumarSide) - this.jumarSide) * share;
    // Carrying, the hands are under the casualty's knees: the jumar rides on its cowstail.
    const holds = state.jumar !== null && upright && free && state.carrying !== true;
    this.holding += ((holds ? grip : 0) - this.holding) * share;
    const pushing = state.sliding && state.moving && upright;
    this.pushing += ((pushing ? 1 : 0) - this.pushing) * share;
    const resting = state.pace === "rest-step" && mode === "walk";
    this.resting += ((resting ? 1 : 0) - this.resting) * share;
    const clipped = state.carabiner !== null;
    this.reaching =
      this.clipped !== null && clipped !== this.clipped
        ? ClimberPose.CLIP_SECONDS
        : Math.max(0, this.reaching - frame);
    this.clipped = clipped;
    this.carabinerSeen = state.carabiner ?? this.carabinerSeen;
    const face = mode === "hang" ? (state.face ?? null) : null;
    this.faceAhead = face ?? this.faceAhead;
    const { BRACED } = ClimberPose;
    // A casualty hauled up hangs in the harness: no broken limb braces on the ice (#241).
    const able = state.hurt == null;
    const brace =
      face === null || !able ? 0 : ClimberPose.smooth((BRACED.reach - face) / BRACED.ease);
    this.braced += (brace - this.braced) * share;
    const inTheAir = !upright && -state.ground(0) > ClimberPose.AIR_METRES;
    this.aloft += ((inTheAir ? 1 : 0) - this.aloft) * share;
    const tumbling = inTheAir && mode === "fall";
    this.spin = ClimberPose.wrapped(
      tumbling ? this.spin + ClimberPose.TUMBLE * frame : this.spin * (1 - share),
    );
    if (state.falling || state.dead) {
      this.fallen += frame;
      this.rising = 0;
    } else {
      this.fallen = 0;
      const quicker = state.moving ? 2 : 1;
      this.rising = Math.min(1, this.rising + (quicker * frame) / ClimberPose.RISE_SECONDS);
    }
  }

  /** The stride's place and length, paced by the way covered, and the rest step's pause. */
  private gait(state: PoseState, mode: Mode, share: number, frame: number): Gait {
    const { ladder } = state;
    const last = this.lastTravelled;
    const moved = last === null ? 0 : Math.abs(state.travelled - last);
    this.lastTravelled = state.travelled;
    const speed = state.moving && frame > 1e-9 ? moved / frame : 0;
    this.speed += (speed - this.speed) * (1 - Math.exp(-frame / ClimberPose.SPEED_SECONDS));
    // On the ground the stride grows with the speed, so the steps come no faster than so many a
    // second, up to the longest (#222).
    const tired = ClimberPose.TIRED[state.tiredness].stride;
    const shortest = ClimberPose.STRIDE[state.pace] * tired;
    const longest = Math.max(shortest, ClimberPose.LONGEST_STRIDE[state.pace] * tired);
    const steps = ClimberPose.STEPS_A_SECOND[state.pace];
    let pace = Math.min(Math.max(shortest, (2 * this.speed * tired) / steps), longest);
    if (ladder !== null) {
      const across = mode === "wall" ? 1 : Math.abs(ladder.way.x);
      // Up a face of ice, each boot kicks in a step at a time; on a ladder, rung by rung.
      pace = state.onIce === true ? 2 * ladder.spacing : ClimberPose.rungStride(ladder) * across;
    }
    const stride = this.stride === null ? pace : this.stride + (pace - this.stride) * share;
    this.stride = stride;
    if (mode === "walk" || mode === "rungs" || mode === "wall" || mode === "rise") {
      const ahead = moved / Math.max(stride, 1e-6);
      const onward = this.cycle + ahead;
      const cycle = onward + ClimberPose.ontoRungs(state, mode, stride, onward, ahead);
      this.cycle = ((cycle % 1) + 1) % 1;
    }
    // The rest step: in each step, the drawn walk stands still for the pause and then steps
    // through, the figure that far behind the climber's point. It pauses where the steps come
    // slowly, and walks on smoothly where they come faster, decided at each step's start (#222).
    const step = (2 * this.cycle) % 1;
    if (step < this.lastStep) {
      const stepping = (2 * this.speed) / Math.max(stride, 1e-6);
      const { from, to } = ClimberPose.PAUSED_STEPS;
      this.pauses = this.pauses ? stepping < to : stepping < from;
    }
    this.lastStep = step;
    const resting = this.pauses ? this.resting : 0;
    const pause = ClimberPose.REST_PAUSE;
    const stepped = step < pause ? 0 : ClimberPose.smooth((step - pause) / (1 - pause));
    const lag = (resting * (step - stepped)) / 2;
    // Up onto the locked leg over the first half of the pause, and down off it through the step.
    const into = ClimberPose.smooth(step / (pause / 2)) * (1 - stepped);
    const phase = (this.cycle - lag + 1) % 1;
    this.settled = [this.settle(phase, 0, state, share), this.settle(phase, 1, state, share)];
    return {
      phase,
      stride,
      behind: lag * stride,
      pausing: resting * (1 - this.standing) * into,
      settled: this.settled,
    };
  }

  /** How much further into the stride than `cycle`, or less far, brings the boots onto a ladder's
   * rungs where they'd come down: up to half as far again as the way covered, or half as far, so
   * the stride stretches or shortens a little on the first rungs. */
  private static ontoRungs(
    state: PoseState,
    mode: Mode,
    stride: number,
    cycle: number,
    ahead: number,
  ): number {
    const { ladder } = state;
    if (ladder === null || (mode !== "rungs" && mode !== "wall") || stride <= 1e-6) {
      return 0;
    }
    const wall = mode === "wall";
    const spacing = ladder.spacing * (wall ? 1 : Math.abs(ladder.way.x));
    const rung = wall ? ladder.rung : ladder.rung * ladder.way.x;
    const off = (ClimberPose.STANCE * stride) / 2 - cycle * stride - rung;
    const past = spacing > 1e-9 ? off - spacing * Math.round(off / spacing) : 0;
    return Math.min(Math.max(past / stride, -ahead / 2), ahead / 2);
  }

  /** How far the swinging boot of a half of the stride has come down: none while it's down, more
   * at a halt, and as far while the walk goes on. */
  private settle(phase: number, half: 0 | 1, state: PoseState, share: number): number {
    if ((phase + half / 2) % 1 < ClimberPose.STANCE) {
      return 0;
    }
    const settled = this.settled[half];
    return state.moving ? settled : settled + (1 - settled) * share;
  }

  private made(mode: Mode, state: PoseState, gait: Gait): Made {
    if (mode === "dead") {
      return { targets: this.lying(state, ClimberPose.DEAD, 0), down: ClimberPose.NONE_DOWN };
    }
    if (mode === "fall") {
      const targets = this.lying(state, this.flailing(), this.spin);
      return { targets, down: ClimberPose.NONE_DOWN };
    }
    if (mode === "hang") {
      return { targets: this.hanging(state), down: ClimberPose.NONE_DOWN };
    }
    if (mode === "ride" && state.riding != null) {
      return { targets: ClimberPose.riding(state.riding), down: ClimberPose.NONE_DOWN };
    }
    if (mode === "sit") {
      return { targets: this.sitting(state), down: ClimberPose.NONE_DOWN };
    }
    if (mode === "tend" && state.tending != null) {
      return { targets: this.tending(state, state.tending), down: ClimberPose.NONE_DOWN };
    }
    if (mode === "wall") {
      return this.wall(state, gait);
    }
    const walk = this.walk(state, gait);
    const crawling = state.crawling ?? 0;
    if (crawling > 0 && mode === "walk") {
      // Down onto hands and knees, and up off them, through a tent's door (#258).
      const share = ClimberPose.smooth(crawling);
      return {
        targets: ClimberPose.mix(walk.targets, this.allFours(state), share),
        down: share < 0.5 ? walk.down : ClimberPose.NONE_DOWN,
      };
    }
    if (mode === "rise") {
      const up = ClimberPose.smooth((this.rising - 0.4) / 0.6);
      return { targets: ClimberPose.mix(this.kneel(state), walk.targets, up), down: walk.down };
    }
    return walk;
  }

  /** The targets of a climber on steps likely to slip: their body swaying from side to side, and
   * their arms out for balance, the hand on the jumar staying on it. Steady, as made. */
  private wobbling(made: Made, state: PoseState, mode: Mode): Made {
    const { WOBBLE } = ClimberPose;
    const unsure = ClimberPose.smooth((WOBBLE.from - state.footing) / WOBBLE.from);
    const upright = mode === "walk" || mode === "rungs" || mode === "wall";
    if (!upright || unsure <= 0) {
      return made;
    }
    const { targets } = made;
    const sway = unsure * WOBBLE.lean * Math.sin(2 * Math.PI * WOBBLE.hz * this.time);
    const lean = targets.lean + sway;
    const shoulder = ClimberPose.shoulderOf(targets.pelvis, lean);
    const out = (hand: Joint, to: { readonly x: number; readonly y: number }): Joint => ({
      x: hand.x + (shoulder.x + to.x - hand.x) * unsure,
      y: hand.y + (shoulder.y + to.y - hand.y) * unsure,
    });
    // Up a wall the hands keep to the rungs, and on the jumar the near one keeps to it.
    const [near, far] = targets.hands;
    const hands: readonly [Joint, Joint] =
      mode === "wall"
        ? targets.hands
        : [state.jumar === null ? out(near, WOBBLE.near) : near, out(far, WOBBLE.far)];
    return { ...made, targets: { ...targets, lean, hands } };
  }

  /** The targets of a climber hauling a partner up the rope, on their feet (#209): leaning back
   * on their heels, sunk into their knees, both hands on the rope ahead of them pulling it in,
   * hand over hand. Not hauling, as made. */
  private hauling(made: Made, state: PoseState, mode: Mode): Made {
    const bracing = state.bracing === true && !state.hauling;
    if ((!state.hauling && !bracing) || mode !== "walk") {
      return made;
    }
    const { HAUL } = ClimberPose;
    const { targets } = made;
    // Holding a rope tight with nobody on it: the same stance, eased, the hands still on it.
    const hold = bracing ? HAUL.hold : 1;
    const lean = HAUL.lean * hold;
    const pelvis = { x: targets.pelvis.x, y: targets.pelvis.y - HAUL.sink * hold };
    const cycle = bracing ? 0 : 2 * Math.PI * HAUL.hz * this.time;
    const pull = bracing ? 0 : HAUL.pull;
    const hand = (phase: number): Joint => ({
      x: pelvis.x + HAUL.ahead - pull * (0.5 + 0.5 * Math.sin(cycle + phase)),
      y: pelvis.y + 0.12 + (bracing ? 0.04 * Math.cos(phase) : 0.05 * Math.cos(cycle + phase)),
    });
    const hands: readonly [Joint, Joint] = [hand(0), hand(Math.PI)];
    return { ...made, targets: { ...targets, pelvis, lean, hands } };
  }

  /** Mixes the targets with the last mode's, as the blend into this one goes on. */
  private blend(targets: Targets, frame: number, mode: Mode): Targets {
    const from = this.blendFrom;
    if (from === null) {
      return targets;
    }
    this.blended += frame;
    const share = ClimberPose.smooth(this.blended / ClimberPose.BLEND_SECONDS[mode]);
    if (share >= 1) {
      this.blendFrom = null;
    }
    return ClimberPose.mix(from, targets, share);
  }

  /** On their feet, on the ground or across a ladder. */
  private walk(state: PoseState, gait: Gait): Made {
    const { ladder } = state;
    const { behind } = gait;
    const tired = ClimberPose.TIRED[state.tiredness];
    // Careful steps (#222): the boots kept low, the arms stiller, no dip, the eyes on the feet.
    const careful = this.resting;
    const { CAREFUL } = ClimberPose;
    const lift =
      (ladder === null ? ClimberPose.LIFT : ClimberPose.RUNG_LIFT) *
      tired.lift *
      (1 - CAREFUL.lift * careful);
    const near = this.boot(state, gait, 0, lift);
    const far = this.boot(state, gait, 1, lift);
    const slope = this.slopeAt(state, 0, behind);
    const lean = this.walkingLean(state, slope);
    const pelvisX = -0.08 * lean - ClimberPose.REST_BACK * gait.pausing;
    const dip = (1 + Math.cos(4 * Math.PI * (gait.phase - ClimberPose.START))) / 2;
    const bob = ClimberPose.BOB * dip * (1 - this.standing) * (1 - CAREFUL.bob * careful);
    const sink = ClimberPose.SINK[state.tiredness] + ClimberPose.CLIP_CROUCH * this.reach();
    let height = this.height(state, pelvisX, behind) + ClimberPose.STANDING - sink - bob;
    // In the rest step's pause the climber stands straight on the back leg, locked, on the boot as
    // it stands: the leg that's down, or the one behind if both are, never a boot swinging past it
    // (#222).
    const backIsNear = near.down === far.down ? near.ankle.x < far.ankle.x : near.down;
    const back = backIsNear ? near : far;
    const backHip = ClimberPose.hipOf(pelvisX, backIsNear ? 0 : 1);
    // Locked, not hyperextended: a reach short of the whole leg's to the boot as it stands, so
    // the knee and the boot don't flick between ways of standing on it; and down off it early in
    // the step through, before its boot lifts, so the hips don't jolt as the weight goes on.
    const locked = ClimberPose.reachUp(backHip, back.ankle) - ClimberPose.LOCK_SLACK;
    const onIt = 1 - ClimberPose.smooth(((2 * gait.phase) % 1) / ClimberPose.OFF_THE_LOCK);
    height += gait.pausing * onIt * Math.max(locked - height, 0);
    // Each boot turns as far as its stiff ankle needs, and the hips sink as far as each leg
    // bearing the weight needs to reach it.
    const nearFoot = ClimberPose.stiff(ClimberPose.hipOf(pelvisX, 0, height), near, near.pivots);
    const farFoot = ClimberPose.stiff(ClimberPose.hipOf(pelvisX, 1, height), far, far.pivots);
    const nearReach = ClimberPose.reachUp(ClimberPose.hipOf(pelvisX, 0), nearFoot.ankle);
    height += near.weight * (Math.min(height, nearReach) - height);
    const farReach = ClimberPose.reachUp(ClimberPose.hipOf(pelvisX, 1), farFoot.ankle);
    height += far.weight * (Math.min(height, farReach) - height);
    const pelvis: Joint = { x: pelvisX, y: height };
    const shoulder = ClimberPose.shoulderOf(pelvis, lean);
    const offset: Joint = {
      x: -behind,
      y: ladder === null ? state.ground(-behind) : this.height(state, -behind, 0),
    };
    const along: Joint = { x: Math.cos(slope), y: Math.sin(slope) };
    const hands = this.holdingHands(
      state,
      shoulder,
      offset,
      along,
      this.walkingHand(state, gait, shoulder, pelvis, lean, nearFoot.ankle, 0),
      this.walkingHand(state, gait, shoulder, pelvis, lean, farFoot.ankle, 1),
    );
    return {
      targets: {
        pelvis,
        lean,
        nod: lean * 1.3 + tired.nod + CAREFUL.nod * careful,
        ankles: [nearFoot.ankle, farFoot.ankle],
        soles: [nearFoot.sole, farFoot.sole],
        pivots: [near.pivots, far.pivots],
        hands,
        tilt: 0,
        offset,
      },
      down: [near.down, far.down],
    };
  }

  /** The spine's lean on their feet: by tiredness, walking, the jumar, a ladder and the slope, and
   * bent double, exhausted at a halt. */
  private walkingLean(state: PoseState, slope: number): number {
    const tired = ClimberPose.LEAN[state.tiredness];
    const { share, least, most } = ClimberPose.SLOPE_LEAN;
    const double = ClimberPose.bentDouble(state);
    const bent = double ? this.standing * (ClimberPose.BENT_DOUBLE - tired) : 0;
    return (
      tired +
      (1 - this.standing) * ClimberPose.WALKING_LEAN +
      this.holding * ClimberPose.HOLDING_LEAN +
      bent +
      (state.ladder === null ? 0 : ClimberPose.LADDER_LEAN) +
      Math.min(Math.max(slope * share, least), most) +
      ClimberPose.CLIP_LEAN * this.reach()
    );
  }

  /** How far the far hand is gone to the second carabiner, 0 to 1 and back. */
  private reach(): number {
    return Math.sin((Math.PI * this.reaching) / ClimberPose.CLIP_SECONDS);
  }

  /** A hand on their feet: swinging against the legs, on a ladder's line, or on the knee bent
   * double. */
  private walkingHand(
    state: PoseState,
    gait: Gait,
    shoulder: Joint,
    pelvis: Joint,
    lean: number,
    ankle: Joint,
    arm: 0 | 1,
  ): Joint {
    if (state.ladder !== null) {
      const x = shoulder.x + ClimberPose.LINE_HOLDS[arm];
      return { x, y: this.height(state, x, gait.behind) + ClimberPose.LINES };
    }
    const root = ClimberPose.armRoot(shoulder, arm);
    const swing =
      ClimberPose.ARM_SWING *
      ClimberPose.TIRED[state.tiredness].swing *
      (1 - ClimberPose.CAREFUL.swing * this.resting);
    const cycle = Math.cos(2 * Math.PI * (gait.phase + arm / 2 - ClimberPose.START));
    const angle = -swing * cycle * (1 - this.standing) + lean * 0.5;
    const reach = ClimberPose.UPPER_ARM + ClimberPose.FOREARM - 0.04;
    const hand: Joint = {
      x: root.x + reach * Math.sin(angle),
      y: root.y - reach * Math.cos(angle),
    };
    if (!ClimberPose.bentDouble(state)) {
      return hand;
    }
    const hip = ClimberPose.hipOf(pelvis.x, arm, pelvis.y);
    const knee = ClimberPose.bend(hip, ankle, ClimberPose.THIGH, ClimberPose.SHIN, 1).middle;
    return ClimberPose.between(hand, { x: knee.x + 0.02, y: knee.y + 0.02 }, this.standing);
  }

  /** The near hand on the jumar as far as it holds it, pushing it up the rope in strokes while
   * its key is held, and the far one going to the second carabiner while it reaches. */
  private holdingHands(
    state: PoseState,
    shoulder: Joint,
    offset: Joint,
    along: Joint,
    near: Joint,
    far: Joint,
  ): readonly [Joint, Joint] {
    const { jumar } = state;
    if (jumar !== null) {
      const onX = jumar.x - offset.x;
      const onY = jumar.y - offset.y;
      const away = Math.hypot(onX - shoulder.x, onY - shoulder.y);
      const within = 1 - ClimberPose.smooth((away - 0.5) / 0.2);
      const step = (2 * this.cycle) % 1;
      const push = ClimberPose.smooth(step / ClimberPose.JUMAR_PUSH) - step;
      const ahead = (push * this.pushing * (this.stride ?? 0)) / 2;
      // Between the strokes the jumar grips, and up steep ground the arm pulls on it (#232); not
      // on a ladder, whose rungs bear the weight, the rope beside it only backing them up (#250).
      const { from, whole } = ClimberPose.PULL;
      const gripping = Math.max(step - ClimberPose.JUMAR_PUSH, 0) / (1 - ClimberPose.JUMAR_PUSH);
      const steep = ClimberPose.smooth((along.y - from) / (whole - from));
      const going = this.pushing * (1 - this.standing) * this.holding;
      const onRungs = state.ladder !== null && state.onIce !== true;
      this.pulling = state.moving && !onRungs ? Math.sin(Math.PI * gripping) * steep * going : 0;
      const x = shoulder.x + ClimberPose.JUMAR_HOLD.x;
      const y = shoulder.y + ClimberPose.JUMAR_HOLD.y;
      this.heldAt = {
        x: x + (onX - x) * within + along.x * ahead,
        y: y + (onY - y) * within + along.y * ahead,
      };
      this.lift = Math.hypot(this.heldAt.x - onX, this.heldAt.y - onY);
    }
    const held = this.heldAt;
    const side = this.jumarSide;
    const nearOn =
      held === null ? near : ClimberPose.between(near, held, this.holding * (1 - side));
    const farOn = held === null ? far : ClimberPose.between(far, held, this.holding * side);
    const to = this.carabinerSeen;
    const reach = this.reach();
    if (to === null || reach <= 0) {
      return [nearOn, farOn];
    }
    const carabiner: Joint = { x: to.x - offset.x, y: to.y - offset.y };
    return [nearOn, ClimberPose.between(farOn, carabiner, reach)];
  }

  /** A boot at `phase` of its leg's cycle: down where it came down, its heel lifting at the end
   * as it rolls on its toe, or on the rung under it; or swinging from where it lifted to where it
   * comes down, clear of the snow, turning on its ankle once it's off it; at a halt, coming down
   * where it was going. */
  private boot(state: PoseState, gait: Gait, leg: 0 | 1, lift: number): Boot {
    const { stride, behind } = gait;
    const phase = (gait.phase + leg / 2) % 1;
    const stance = ClimberPose.STANCE;
    const half = (stance * stride) / 2;
    const heelUp = ClimberPose.HEEL_LIFT * (1 - this.standing) * (1 - gait.pausing);
    const pivots = state.ladder === null ? ClimberPose.ON_SNOW : ClimberPose.ON_A_RUNG;
    const on = pivots.forward.x;
    if (phase < stance) {
      const x = this.plant(state, half - phase * stride, behind);
      const rise = (phase - ClimberPose.HEEL_FROM) / (stance - ClimberPose.HEEL_FROM);
      const heel = heelUp * ClimberPose.smooth(rise);
      const slope = this.soleSlope(state, x, behind);
      const contact: Joint = { x, y: this.height(state, x, behind) };
      const ankle = ClimberPose.rolled(contact, slope, heel, on);
      return { ankle, sole: slope - heel, down: true, weight: 1, pivots };
    }
    const swung = (phase - stance) / (1 - stance);
    const lifted = -half - (1 - stance) * stride * swung;
    const from = this.plant(state, lifted, behind);
    const to = this.plant(state, lifted + stride, behind);
    const eased = ClimberPose.smooth(swung);
    const x = from + (to - from) * eased;
    const fromY = this.height(state, from, behind);
    const toY = this.height(state, to, behind);
    const fromSlope = this.soleSlope(state, from, behind);
    const toSlope = this.soleSlope(state, to, behind);
    const off = ClimberPose.rolled({ x: from, y: fromY }, fromSlope, heelUp, on);
    const onto = ClimberPose.rolled({ x: to, y: toY }, toSlope, 0, on);
    // The ankle goes from its place over the sole as it lifted to the one it comes down at.
    const overX = off.x - from + (onto.x - to - (off.x - from)) * eased;
    const overY = off.y - fromY + (onto.y - toY - (off.y - fromY)) * eased;
    const swinging: Joint = {
      x: x + overX,
      y: this.height(state, x, behind) + overY + lift * Math.sin(Math.PI * swung),
    };
    const sole = fromSlope - heelUp + (toSlope - fromSlope + heelUp) * eased;
    const settled = gait.settled[leg];
    const aloft = Math.sin(Math.PI * swung) * (1 - settled);
    return {
      ankle: ClimberPose.between(swinging, onto, settled),
      sole: sole + (toSlope - sole) * settled,
      down: settled > 0.95,
      // The leg takes the weight over the end of its swing, coming down, so the hips settle onto
      // a long step rather than drop at the moment it lands (#222).
      weight: Math.max(
        settled,
        ClimberPose.smooth((swung - 1 + ClimberPose.LOADING) / ClimberPose.LOADING),
      ),
      pivots: ClimberPose.pivotsBetween(pivots, ClimberPose.OFF_THE_GROUND, aloft),
    };
  }

  /** Up or down a ladder on a wall: the balls of the feet on the rungs, the hands on rungs above,
   * each going rung over rung, hand against foot, the body back off the ladder. */
  private wall(state: PoseState, gait: Gait): Made {
    const wall = state.onIce === true ? ClimberPose.ICE_WALL : ClimberPose.WALL;
    const way = state.ladder?.way ?? ClimberPose.UP;
    const sign = way.y >= 0 ? 1 : -1;
    const rise: Joint = { x: sign * way.x, y: sign * way.y };
    const toWall: Joint = { x: rise.y, y: -rise.x };
    const ends: readonly [number, number] = state.ladder?.ends ?? [0, 0];
    const spacing = state.ladder?.spacing ?? 0;
    // The hands hold rungs a whole number of them over the feet's, so they come down on rungs too.
    const handsOver =
      spacing > 1e-6 ? Math.max(1, Math.round(wall.hands / spacing)) * spacing : wall.hands;
    const bottom = Math.min(ends[0] * sign, ends[1] * sign);
    const top = Math.max(ends[0] * sign, ends[1] * sign);
    // The highest rung it has: no boot stands on one over its top (#243).
    const lowest = sign * (state.ladder?.rung ?? 0);
    const topRung =
      spacing > 1e-6 ? lowest + Math.floor((top - lowest) / spacing + 1e-9) * spacing : top;
    const at = (up: number, off: number): Joint => ({
      x: up * rise.x + off * toWall.x,
      y: up * rise.y + off * toWall.y,
    });
    const ankleOf = (onRungs: OnRungs): Joint => {
      const ball = at(Math.min(Math.max(onRungs.up, bottom), topRung), wall.foot - onRungs.off);
      return {
        x: ball.x - wall.ball * toWall.x + ClimberPose.ANKLE * rise.x,
        y: ball.y - wall.ball * toWall.y + ClimberPose.ANKLE * rise.y,
      };
    };
    const handOf = (onRungs: OnRungs): Joint =>
      at(Math.min(onRungs.up, top + wall.over), wall.hand - onRungs.off);
    const near = this.onRungs(state, gait, 0, 0);
    const far = this.onRungs(state, gait, 1, 0);
    const nearAnkle = ankleOf(near);
    const farAnkle = ankleOf(far);
    const base = at(0, wall.pelvis.off);
    // The weight sinks onto a pick as it settles in the ice, and the climber crouches towards one
    // out of reach below.
    let up = wall.pelvis.up - ClimberPose.LOAD_SINK * this.tools.loading - this.crouch;
    if (near.down) {
      const hip = ClimberPose.hipOf(base.x, 0, base.y);
      up = Math.min(up, ClimberPose.reachAlong(hip, rise, nearAnkle));
    }
    if (far.down) {
      const hip = ClimberPose.hipOf(base.x, 1, base.y);
      up = Math.min(up, ClimberPose.reachAlong(hip, rise, farAnkle));
    }
    const pelvis = at(up, wall.pelvis.off);
    const crest = ClimberPose.CREST;
    // How far over the wall's top the head has come, going up: none going down. The gaze comes
    // down from up the wall to the level as the eyes come up to the top, and onto it over it.
    const headUp = up + ClimberPose.SPINE * Math.cos(wall.lean) + ClimberPose.NECK;
    const over = sign > 0 ? ClimberPose.smooth((headUp - top) / crest.over) : 0;
    const level = sign > 0 ? ClimberPose.smooth(1 + (headUp - top) / crest.below) : 0;
    const lean = wall.lean + (crest.lean - wall.lean) * over;
    const shoulder = ClimberPose.shoulderOf(pelvis, lean);
    const hands = this.holdingHands(
      state,
      shoulder,
      ClimberPose.ORIGIN,
      way,
      handOf(this.onRungs(state, gait, 1, handsOver)),
      handOf(this.onRungs(state, gait, 0, handsOver)),
    );
    return {
      targets: {
        pelvis,
        lean,
        nod: sign > 0 ? crest.up * (1 - level) + crest.onto * over : 0.4,
        ankles: [nearAnkle, farAnkle],
        soles: [0, 0],
        pivots: [ClimberPose.ON_A_WALL, ClimberPose.ON_A_WALL],
        hands,
        tilt: 0,
        offset: ClimberPose.ORIGIN,
      },
      down: [near.down, far.down],
      ...(sign > 0 ? { gaze: (Math.PI / 2) * (1 - level) - crest.onto * over } : {}),
    };
  }

  /** A foot or a hand on a wall's rungs in a half of the stride, `over` higher than the feet: on
   * a rung, or going from one to the next but one, off the ladder; at a halt, onto the rung it
   * was going to. */
  private onRungs(state: PoseState, gait: Gait, half: 0 | 1, over: number): OnRungs {
    const { stride } = gait;
    const phase = (gait.phase + half / 2) % 1;
    const sign = (state.ladder?.way.y ?? 1) >= 0 ? 1 : -1;
    const stance = ClimberPose.STANCE;
    const down = (stance * stride) / 2;
    const along = sign * over;
    if (phase < stance) {
      const rung = this.rungAlong(state, along + down - phase * stride);
      return { up: sign * rung, off: 0, down: true };
    }
    const swung = (phase - stance) / (1 - stance);
    const lifted = along - down - (1 - stance) * stride * swung;
    const from = this.rungAlong(state, lifted);
    const to = this.rungAlong(state, lifted + stride);
    const settled = gait.settled[half];
    const going = from + (to - from) * ClimberPose.smooth(swung);
    return {
      up: sign * (going + (to - going) * settled),
      off: ClimberPose.WALL.lift * Math.sin(Math.PI * swung) * (1 - settled),
      down: settled > 0.95,
    };
  }

  /** Over in a fall, the limbs flailing, more in the air. */
  private flailing(): Lying {
    const { ankles, hands, lean, nod } = ClimberPose.SLIDING;
    const wave = Math.sin(2 * Math.PI * ClimberPose.FLAIL_HZ * this.fallen);
    const flail = ClimberPose.FLAIL * wave * (0.3 + 0.7 * this.aloft);
    const out = this.aloft * flail;
    return {
      ankles: [
        { x: ankles[0].x, y: ankles[0].y + flail },
        { x: ankles[1].x - out, y: ankles[1].y - flail },
      ],
      hands: [
        { x: hands[0].x, y: hands[0].y - flail },
        { x: hands[1].x - out, y: hands[1].y + flail },
      ],
      lean,
      nod,
    };
  }

  /** Lying face down along the ground from the boots, at the climber's point, turned `spin` more;
   * in the air, round the pelvis there. */
  private lying(state: PoseState, lying: Lying, spin: number): Targets {
    const { off, pelvis } = ClimberPose.LYING;
    const aloft = this.aloft;
    const slope = Math.atan((state.ground(0.3) - state.ground(-0.3)) / 0.6);
    const x = off * (1 - aloft);
    const y = -pelvis * aloft;
    const { ankles, hands } = lying;
    return {
      pelvis: { x, y: pelvis + y },
      lean: lying.lean,
      nod: lying.nod,
      ankles: [
        { x: x + ankles[0].x, y: y + ankles[0].y },
        { x: x + ankles[1].x, y: y + ankles[1].y },
      ],
      soles: [-0.3, -0.25],
      pivots: [ClimberPose.OFF_THE_GROUND, ClimberPose.OFF_THE_GROUND],
      hands: [
        { x: x + hands[0].x, y: y + hands[0].y },
        { x: x + hands[1].x, y: y + hands[1].y },
      ],
      tilt: ClimberPose.FALLEN_RADIANS - Math.min(Math.max(slope, -1), 1) * (1 - aloft) + spin,
      offset: ClimberPose.ORIGIN,
    };
  }

  /** Hanging from a cowstail below the rope: the pelvis at the harness, the body in line with the
   * cowstail as far as a harness leans them (`HANG_LEAN`), the near hand up on it, the legs
   * dangling. Held by the rope with the carabiner level with them or below, hauled up toward a
   * lip, they hang upright still, leaning its way (#239): a harness never turns a climber over,
   * nor lays them flat as the rope comes taut from the side (#243). Beside a wall's face, their
   * boots are on it (`bracedOn`). */
  private hanging(state: PoseState): Targets {
    const drawn = state.jumar ?? state.carabiner;
    const lifted =
      drawn === null ? null : { x: drawn.x, y: Math.max(drawn.y, ClimberPose.HELD_ABOVE) };
    const hold = this.hangingFrom(state) ?? (this.heldUp(state) ? lifted : null) ?? ClimberPose.UP;
    // Hauled up beside a wall's face, hurt, they hang clear of it, no boot on the ice (#241).
    const clear = state.hurt != null && state.face != null;
    const offset: Joint = clear
      ? { x: Math.min(0, this.faceAhead - ClimberPose.HAULED_OFF), y: 0 }
      : ClimberPose.ORIGIN;
    const most = ClimberPose.HANG_LEAN;
    const leant = Math.min(Math.max(Math.atan2(hold.x - offset.x, hold.y), -most), most);
    // Level with the carabiner or under it, the lean eases to half: the rope pulls them along,
    // not over; it comes on as the carabiner comes up over them, with no jump (#243).
    const over = drawn === null ? 1 : ClimberPose.smooth(drawn.y / ClimberPose.HELD_ABOVE);
    const tilt = leant * (0.5 + 0.5 * over);
    const above = ClimberPose.inside(hold, offset, tilt);
    const shoulder = ClimberPose.shoulderOf(ClimberPose.ORIGIN, -0.08);
    const reach = ClimberPose.UPPER_ARM + ClimberPose.FOREARM - 0.02;
    const away = Math.hypot(above.x - shoulder.x, above.y - shoulder.y);
    const share = away > reach ? reach / away : 1;
    const { metres, hz } = ClimberPose.HANGING_SWAY;
    const sway = metres * Math.sin(2 * Math.PI * hz * this.fallen);
    const [nearFoot, farFoot] = ClimberPose.HANGING_FEET;
    const free: Targets = {
      pelvis: ClimberPose.ORIGIN,
      lean: -0.08,
      nod: -0.25,
      ankles: [
        { x: nearFoot.x + sway, y: nearFoot.y },
        { x: farFoot.x - sway, y: farFoot.y },
      ],
      soles: [-0.35, -0.3],
      pivots: [ClimberPose.OFF_THE_GROUND, ClimberPose.OFF_THE_GROUND],
      hands: [
        {
          x: shoulder.x + (above.x - shoulder.x) * share,
          y: shoulder.y + (above.y - shoulder.y) * share,
        },
        { x: 0.1, y: 0.45 },
      ],
      tilt,
      offset,
    };
    return this.braced > 1e-3
      ? ClimberPose.mix(free, this.bracedOn(state, hold), this.braced)
      : free;
  }

  /** Hanging from `hold` beside a wall's face, the boots on it (#243): the harness out from the
   * face, the body leaning back off it on the cowstail, the knees bent, the soles flat on the
   * wall with their toes up it; each boot stays where it's set as the rope takes the body up,
   * then steps up, in turn, by how high off the ground they've come. */
  private bracedOn(state: PoseState, hold: Joint): Targets {
    const { BRACED, ANKLE } = ClimberPose;
    const { tilt, top, span, set, lift } = BRACED;
    const offset: Joint = { x: Math.min(0, this.faceAhead - BRACED.off), y: 0 };
    const wall = this.faceAhead - offset.x;
    const height = -state.ground(0);
    const stride = span / set;
    const boot = (leg: 0 | 1): Joint => {
      const turns = height / stride + leg / 2;
      const phase = turns - Math.floor(turns);
      const swung = phase < set ? 0 : ClimberPose.smooth((phase - set) / (1 - set));
      const down = phase < set ? (span * phase) / set : span * (1 - swung);
      const off = phase < set ? 0 : lift * Math.sin(Math.PI * swung);
      return ClimberPose.turned({ x: wall - ANKLE - off, y: top - down }, -tilt);
    };
    const shoulder = ClimberPose.shoulderOf(ClimberPose.ORIGIN, BRACED.lean);
    const above = ClimberPose.inside(hold, offset, tilt);
    const reach = ClimberPose.UPPER_ARM + ClimberPose.FOREARM - 0.02;
    const away = Math.hypot(above.x - shoulder.x, above.y - shoulder.y);
    const share = away > reach ? reach / away : 1;
    const sole = Math.PI / 2 + tilt;
    return {
      pelvis: ClimberPose.ORIGIN,
      lean: BRACED.lean,
      nod: -0.2,
      ankles: [boot(0), boot(1)],
      soles: [sole, sole],
      pivots: [ClimberPose.ON_A_RUNG, ClimberPose.ON_A_RUNG],
      hands: [
        {
          x: shoulder.x + (above.x - shoulder.x) * share,
          y: shoulder.y + (above.y - shoulder.y) * share,
        },
        { x: 0.16, y: 0.42 },
      ],
      tilt,
      offset,
    };
  }

  /** Down with a bone broken (#241), sitting on the snow where they came to rest (`SAT`), as the
   * ground lies under them. */
  private sitting(state: PoseState): Targets {
    const { SAT, ANKLE, THIGH, SHIN } = ClimberPose;
    const pelvis: Joint = { x: SAT.hips.x, y: SAT.hips.y + state.ground(SAT.hips.x) };
    const rock = SAT.rock.radians * Math.sin(2 * Math.PI * SAT.rock.hz * this.time);
    const onSnow = (x: number): Joint => ({ x, y: state.ground(x) + ANKLE });
    const lie = (x: number): number =>
      Math.atan((state.ground(x + 0.1) - state.ground(x - 0.1)) / 0.2);
    const rest = { tilt: 0, offset: ClimberPose.ORIGIN };
    if (state.hurt === "arm") {
      const { arm } = SAT;
      const [near, far] = [pelvis.x + arm.knees[0], pelvis.x + arm.knees[1]];
      return {
        ...rest,
        pelvis,
        lean: arm.lean + rock,
        nod: arm.nod,
        ankles: [onSnow(near), onSnow(far)],
        soles: [lie(near), lie(far)],
        pivots: [ClimberPose.ON_SNOW, ClimberPose.ON_SNOW],
        hands: [
          { x: pelvis.x + arm.held.x, y: pelvis.y + arm.held.y },
          { x: pelvis.x + arm.under.x, y: pelvis.y + arm.under.y },
        ],
      };
    }
    const { leg } = SAT;
    const hip = ClimberPose.hipOf(pelvis.x, 0, pelvis.y);
    // In a crevasse's narrow foot there's no room to lie a leg out, nor to lean back: the heel
    // against the ice ahead, the knee up, and the back to the ice behind.
    const ahead = this.roomBeside(state, 1);
    const behind = this.roomBeside(state, -1);
    const reach = Math.min(leg.out, Math.max(ahead - hip.x - SAT.cramped.boot, SAT.cramped.least));
    const cramped = ClimberPose.smooth((leg.out - reach) / SAT.cramped.ease);
    const out = hip.x + reach;
    const heel: Joint = { x: out, y: state.ground(out) + leg.heel };
    const knee = ClimberPose.bend(hip, heel, THIGH, SHIN, 1).middle;
    const onThigh = ClimberPose.between(hip, knee, leg.thigh);
    const up = pelvis.x + Math.min(leg.knee, reach - 0.06);
    const back = Math.min(-leg.prop.x, Math.max(behind - 0.05, SAT.cramped.prop));
    const upright = ClimberPose.smooth((-leg.prop.x - back) / SAT.cramped.ease);
    const prop = pelvis.x - back;
    return {
      ...rest,
      pelvis,
      lean: leg.lean * (1 - upright) + SAT.cramped.lean * upright + rock,
      nod: leg.nod,
      ankles: [heel, onSnow(up)],
      soles: [leg.toes * (1 - cramped) + lie(out), lie(up)],
      pivots: [ClimberPose.OFF_THE_GROUND, ClimberPose.ON_SNOW],
      hands: [
        { x: onThigh.x, y: onThigh.y + 0.07 },
        { x: prop, y: state.ground(prop) + leg.prop.y + SAT.cramped.hand * upright },
      ],
    };
  }

  /** How far to a side of a climber sitting on the snow, ahead of them (1) or behind (-1), the
   * ground runs on before a wall's face stands over it, in the figure's metres: as far as a leg
   * lies, or further, in the open. */
  private roomBeside(state: PoseState, side: 1 | -1): number {
    const { reach, step, wall } = ClimberPose.SAT.room;
    const seat = state.terrain(0);
    for (let away = step; away <= reach; away += step) {
      if (state.terrain(side * away) - seat > wall) {
        return away - step;
      }
    }
    return reach;
  }

  /** On their knees at a casualty or an anchor (#241, `TEND`): the kneel, bent over the work, the
   * hands at it. */
  private tending(state: PoseState, tending: Tending): Targets {
    const { TEND, UPPER_ARM, FOREARM } = ClimberPose;
    const kneel = this.kneel(state);
    const work = tending.what === "anchor" ? TEND.anchor : TEND.aid;
    const to: Joint = tending.at ?? {
      x: TEND.ahead,
      y: state.ground(TEND.ahead) + work.up,
    };
    const over = to.y - state.ground(to.x);
    const bent = ClimberPose.smooth((TEND.high - over) / (TEND.high - TEND.low));
    const reach = UPPER_ARM + FOREARM - 0.04;
    const short = (lean: number): number => {
      const from = ClimberPose.shoulderOf(kneel.pelvis, lean);
      return Math.hypot(to.x - from.x, to.y - from.y) - reach;
    };
    // Further over still, as far as a back bends, where the hands don't reach it yet.
    let lean = TEND.upright + (TEND.lean - TEND.upright) * bent;
    while (short(lean) > 0 && lean < TEND.most) {
      lean = Math.min(lean + TEND.step, TEND.most);
    }
    const shoulder = ClimberPose.shoulderOf(kneel.pelvis, lean);
    // As far towards it as the arms reach from the kneel, and never under the snow.
    const away = Math.hypot(to.x - shoulder.x, to.y - shoulder.y);
    const share = away > reach ? reach / away : 1;
    const x = shoulder.x + (to.x - shoulder.x) * share;
    const y = Math.max(shoulder.y + (to.y - shoulder.y) * share, state.ground(x) + 0.05);
    const turn = 2 * Math.PI * work.hz * this.time;
    const [cos, sin] = [work.round * Math.cos(turn), work.round * Math.sin(turn)];
    const far: Joint =
      tending.what === "anchor"
        ? { x: x - 0.07, y: y + 0.03 }
        : { x: x - 0.06 - cos, y: y + 0.02 - sin / 2 };
    return {
      ...kneel,
      lean,
      nod: TEND.nod,
      hands: [{ x: x + cos, y: y + sin }, far],
    };
  }

  /** Carried on the back of the rescuer `on` (#241, `RIDE`). */
  private static riding(on: Mounted): Targets {
    const { RIDE } = ClimberPose;
    const { hips } = on;
    const shoulder = ClimberPose.shoulderOf(hips, on.lean);
    const from = (joint: Joint, by: Joint): Joint => ({ x: joint.x + by.x, y: joint.y + by.y });
    return {
      pelvis: from(hips, RIDE.seat),
      lean: on.lean + RIDE.lean,
      nod: RIDE.nod,
      ankles: [from(hips, RIDE.boots[0]), from(hips, RIDE.boots[1])],
      soles: RIDE.soles,
      pivots: [ClimberPose.OFF_THE_GROUND, ClimberPose.OFF_THE_GROUND],
      hands: [from(shoulder, RIDE.hands[0]), from(shoulder, RIDE.hands[1])],
      tilt: 0,
      offset: ClimberPose.ORIGIN,
    };
  }

  /** On hands and knees (#258): the knees under the hips and the hands under the shoulders, on
   * the ground as it lies; crawling, a hand goes forward with the knee across from it, by the
   * ground covered. */
  private allFours(state: PoseState): Targets {
    const { pelvis, lean, nod, ankles, hands, toes, stride, reach, lift } = ClimberPose.ALL_FOURS;
    const phase = (2 * Math.PI * state.travelled) / stride;
    const limb = (rest: Joint, turn: number): Joint => {
      const x = rest.x + reach * Math.sin(phase + turn);
      return { x, y: rest.y + state.ground(x) + lift * Math.max(0, Math.cos(phase + turn)) };
    };
    return {
      pelvis: { x: pelvis.x, y: pelvis.y + state.ground(pelvis.x) + 0.012 * Math.sin(2 * phase) },
      lean,
      nod,
      ankles: [limb(ankles[0], 0), limb(ankles[1], Math.PI)],
      soles: [toes, toes],
      pivots: [ClimberPose.ON_THE_TOE, ClimberPose.ON_THE_TOE],
      hands: [limb(hands[0], Math.PI), limb(hands[1], 0)],
      tilt: 0,
      offset: ClimberPose.ORIGIN,
    };
  }

  /** The targets of a climber carrying a casualty on their back, on their feet (#241, `CARRY`):
   * bent forward under them, sunk into the knees, the hands back under the casualty's knees. Not
   * carrying, as made. */
  private carrying(made: Made, state: PoseState, mode: Mode): Made {
    if (state.carrying !== true || (mode !== "walk" && mode !== "rungs")) {
      return made;
    }
    const { CARRY } = ClimberPose;
    const { targets } = made;
    const lean = Math.max(targets.lean, CARRY.lean);
    const pelvis: Joint = { x: targets.pelvis.x - CARRY.back, y: targets.pelvis.y - CARRY.sink };
    const hand = (by: Joint): Joint => ({ x: pelvis.x + by.x, y: pelvis.y + by.y });
    const hands: readonly [Joint, Joint] = [hand(CARRY.hands[0]), hand(CARRY.hands[1])];
    return { ...made, targets: { ...targets, pelvis, lean, nod: lean, hands } };
  }

  /** The targets of a climber limping on a sprained leg, the near one (#241, `LIMP`): as it takes
   * the weight, the hips drop onto it and the body lurches over it. Sound, as made. */
  private limping(made: Made, state: PoseState, mode: Mode, gait: Gait): Made {
    const limp = Math.min(Math.max(state.limp ?? 0, 0), 1) * (1 - this.standing);
    if (limp <= 0 || mode !== "walk") {
      return made;
    }
    const { LIMP, STANCE } = ClimberPose;
    const { targets } = made;
    const onIt = gait.phase < STANCE ? Math.sin((Math.PI * gait.phase) / STANCE) ** 2 : 0;
    const pelvis: Joint = { x: targets.pelvis.x, y: targets.pelvis.y - LIMP.drop * limp * onIt };
    return {
      ...made,
      targets: { ...targets, pelvis, lean: targets.lean + LIMP.lurch * limp * onIt },
    };
  }

  /** Down on one knee to get up after a fall, both hands on the front knee. */
  private kneel(state: PoseState): Targets {
    const kneel = ClimberPose.KNEEL;
    const [front, back] = kneel.ankles;
    const pelvis: Joint = { x: kneel.pelvis.x, y: kneel.pelvis.y + state.ground(kneel.pelvis.x) };
    const frontAnkle: Joint = { x: front.x, y: front.y + state.ground(front.x) };
    const backAnkle: Joint = { x: back.x, y: back.y + state.ground(back.x) };
    const hip = ClimberPose.hipOf(pelvis.x, 0, pelvis.y);
    const knee = ClimberPose.bend(hip, frontAnkle, ClimberPose.THIGH, ClimberPose.SHIN, 1).middle;
    const slope = Math.atan((state.ground(front.x + 0.1) - state.ground(front.x - 0.1)) / 0.2);
    return {
      pelvis,
      lean: kneel.lean,
      nod: kneel.lean,
      ankles: [frontAnkle, backAnkle],
      soles: [slope, kneel.toes],
      pivots: [ClimberPose.ON_SNOW, ClimberPose.ON_THE_TOE],
      hands: [
        { x: knee.x + 0.04, y: knee.y + 0.04 },
        { x: knee.x, y: knee.y + 0.03 },
      ],
      tilt: 0,
      offset: ClimberPose.ORIGIN,
    };
  }

  /** The skeleton bent to its targets, each boot turned as far as its stiff ankle needs, with the
   * cowstails' ends. */
  private solve(state: PoseState, targets: Targets, landed: readonly [boolean, boolean]): Pose {
    const { pelvis, lean, nod, ankles, hands, soles, pivots, tilt, offset } = targets;
    const { THIGH, SHIN, UPPER_ARM, FOREARM, NECK } = ClimberPose;
    const shoulder = ClimberPose.shoulderOf(pelvis, lean);
    const head: Joint = {
      x: shoulder.x + NECK * Math.sin(nod),
      y: shoulder.y + NECK * Math.cos(nod),
    };
    const nearHip = ClimberPose.hipOf(pelvis.x, 0, pelvis.y);
    const farHip = ClimberPose.hipOf(pelvis.x, 1, pelvis.y);
    const near = ClimberPose.stiff(nearHip, { ankle: ankles[0], sole: soles[0] }, pivots[0]);
    const far = ClimberPose.stiff(farHip, { ankle: ankles[1], sole: soles[1] }, pivots[1]);
    const nearRoot = ClimberPose.armRoot(shoulder, 0);
    const farRoot = ClimberPose.armRoot(shoulder, 1);
    // Each hand on its tool, where `IceTools` has it: in the ice, swinging, or carried.
    const held = this.tools.place({
      roots: [nearRoot, farRoot],
      pelvis,
      lean,
      reach: UPPER_ARM + FOREARM,
      hands,
      inside: (point) => ClimberPose.inside(point, offset, tilt),
      turned: (way) => ClimberPose.turned(way, -tilt),
    });
    this.short = held.short;
    const nearArm = ClimberPose.bend(nearRoot, held.hands[0] ?? hands[0], UPPER_ARM, FOREARM, -1);
    const farArm = ClimberPose.bend(farRoot, held.hands[1] ?? hands[1], UPPER_ARM, FOREARM, -1);
    // Hanging, each cowstail runs up to the rope from the harness: one the physics has level
    // with them or below, hauled toward a lip, is drawn over it, as their hand on it is (#243).
    const up = (hold: Joint | null): Joint | null =>
      hold === null || this.mode !== "hang"
        ? hold
        : { x: hold.x, y: Math.max(hold.y, ClimberPose.HELD_ABOVE) };
    const jumar = up(state.jumar);
    const carabiner = up(state.carabiner);
    const onTheRope = jumar === null ? null : ClimberPose.inside(jumar, offset, tilt);
    const holder = ClimberPose.between(nearArm.end, farArm.end, this.jumarSide);
    return {
      pelvis,
      shoulder,
      head,
      legs: [
        ClimberPose.bend(nearHip, near.ankle, THIGH, SHIN, 1),
        ClimberPose.bend(farHip, far.ankle, THIGH, SHIN, 1),
      ],
      arms: [nearArm, farArm],
      soles: [near.sole, far.sole],
      lean,
      nod,
      gaze: this.gazing,
      tilt,
      offset,
      jumar: onTheRope === null ? null : ClimberPose.between(onTheRope, holder, this.holding),
      carabiner: carabiner === null ? null : ClimberPose.inside(carabiner, offset, tilt),
      landed,
      tools: held.tools,
      strikes: held.strikes,
      pull: Math.min(Math.max(this.pulling, 0), 1),
    };
  }

  /** The ground's height `x` ahead of where the figure stands, `behind` the climber's point: on a
   * ladder, its line. */
  private height(state: PoseState, x: number, behind: number): number {
    const { ladder } = state;
    if (ladder !== null) {
      const across = Math.abs(ladder.way.x) > 1e-6 ? ladder.way.x : 1;
      return (x * ladder.way.y) / across;
    }
    return state.ground(x - behind) - state.ground(-behind);
  }

  /** The slope's angle at `x` ahead, over a stride or so. */
  private slopeAt(state: PoseState, x: number, behind: number): number {
    const rise = this.height(state, x + 0.3, behind) - this.height(state, x - 0.3, behind);
    return Math.atan(rise / 0.6);
  }

  /** The angle a sole lies at `x` ahead: along the ground under it, from its heel to its toe, or
   * the ladder. */
  private soleSlope(state: PoseState, x: number, behind: number): number {
    const { ladder } = state;
    if (ladder !== null) {
      return Math.atan2(ladder.way.y, Math.abs(ladder.way.x));
    }
    const { HEEL, TOE } = ClimberPose;
    const toe = this.height(state, x + TOE, behind);
    const rise = (toe - this.height(state, x + HEEL, behind)) / (TOE - HEEL);
    const steepest = ClimberPose.SOLE_STEEPEST;
    return Math.min(Math.max(Math.atan(rise), -steepest), steepest);
  }

  /** Where a boot `x` ahead comes down: there on the ground, on the nearest rung across a
   * ladder. */
  private plant(state: PoseState, x: number, behind: number): number {
    const { ladder } = state;
    if (ladder === null) {
      return x;
    }
    const spacing = ladder.spacing * Math.abs(ladder.way.x);
    const rung = ladder.rung * ladder.way.x + behind;
    return spacing > 1e-9 ? rung + Math.round((x - rung) / spacing) * spacing : x;
  }

  /** The nearest rung to `along` the way up or down a wall. */
  private rungAlong(state: PoseState, along: number): number {
    const { ladder } = state;
    if (ladder === null || ladder.spacing <= 1e-9) {
      return along;
    }
    return ladder.rung + Math.round((along - ladder.rung) / ladder.spacing) * ladder.spacing;
  }

  /** The stride along a ladder: two steps of a whole number of rungs each. */
  private static rungStride(ladder: LadderFooting): number {
    const rungs = Math.round(ClimberPose.RUNG_STEP / Math.max(ladder.spacing, 1e-6));
    return 2 * Math.max(1, rungs) * ladder.spacing;
  }

  /** Whether they stand bent double over their knees: exhausted, at a halt on the ground. */
  private static bentDouble(state: PoseState): boolean {
    return state.tiredness === "exhausted" && !state.moving && state.ladder === null;
  }

  /** The highest a hip at `hip.x` can be and still reach `ankle`. */
  private static reachUp(hip: Joint, ankle: Joint): number {
    return hip.y + ClimberPose.reachAlong(hip, ClimberPose.UP, ankle);
  }

  /** The furthest along `way`, a length of 1, from `hip` that a hip still reaches `ankle`. */
  private static reachAlong(hip: Joint, way: Joint, ankle: Joint): number {
    const reach = (ClimberPose.THIGH + ClimberPose.SHIN) * ClimberPose.REACH;
    const dx = hip.x - ankle.x;
    const dy = hip.y - ankle.y;
    const toward = way.x * dx + way.y * dy;
    const left = toward * toward - (dx * dx + dy * dy - reach * reach);
    return -toward + Math.sqrt(Math.max(left, 0));
  }

  /** The ankle of a boot whose sole touches `contact` under it at `slope`, its heel come up by
   * `heel`, rolling on the point `on` along the sole from there: its toe, or the rung under it. */
  private static rolled(contact: Joint, slope: number, heel: number, on: number): Joint {
    const cos = Math.cos(slope);
    const sin = Math.sin(slope);
    const ankle: Joint = {
      x: contact.x - ClimberPose.ANKLE * sin,
      y: contact.y + ClimberPose.ANKLE * cos,
    };
    return ClimberPose.round(ankle, { x: contact.x + on * cos, y: contact.y + on * sin }, -heel);
  }

  /** A boot turned on one of its pivots as far as its stiff ankle needs: so its shin, from `hip`,
   * leans no further from the boot's upright than the boot lets it. */
  private static stiff(hip: Joint, foot: Foot, pivots: Pivots): Foot {
    const { forward, back } = ClimberPose.BOOT_FLEX;
    const flex = ClimberPose.flexOf(hip, foot);
    if (flex > forward) {
      return ClimberPose.turnedTo(hip, foot, pivots.forward, forward, -1);
    }
    if (flex < -back) {
      return ClimberPose.turnedTo(hip, foot, pivots.back, -back, 1);
    }
    return foot;
  }

  /** How far the shin of a leg from `hip` to a boot leans forward of the boot's upright, in
   * radians. */
  private static flexOf(hip: Joint, foot: Foot): number {
    const { THIGH, SHIN } = ClimberPose;
    const { middle: knee, end: ankle } = ClimberPose.bend(hip, foot.ankle, THIGH, SHIN, 1);
    const shin = Math.atan2(knee.y - ankle.y, knee.x - ankle.x);
    return ClimberPose.wrapped(foot.sole + Math.PI / 2 - shin);
  }

  /** A boot turned `way`, its toe up at 1, on `pivot`, a point of it, till its shin from `hip`
   * leans `limit` from its upright: the knee bends again as the ankle goes round, so it's found
   * by halving, from a turn far enough. */
  private static turnedTo(hip: Joint, foot: Foot, pivot: Joint, limit: number, way: 1 | -1): Foot {
    const { ankle, sole } = foot;
    const cos = Math.cos(sole);
    const sin = Math.sin(sole);
    const above = pivot.y - ClimberPose.ANKLE;
    const on: Joint = {
      x: ankle.x + pivot.x * cos - above * sin,
      y: ankle.y + pivot.x * sin + above * cos,
    };
    const turn = (angle: number): Foot => ({
      ankle: ClimberPose.round(ankle, on, way * angle),
      sole: sole + way * angle,
    });
    const past = (angle: number): boolean =>
      way * (ClimberPose.flexOf(hip, turn(angle)) - limit) < 0;
    let short = 0;
    let far = Math.min(Math.abs(ClimberPose.flexOf(hip, foot) - limit), ClimberPose.MOST_TURN);
    while (past(far) && far < ClimberPose.MOST_TURN) {
      short = far;
      far = Math.min(far * 2, ClimberPose.MOST_TURN);
    }
    for (let halving = 0; halving < 40; halving += 1) {
      const middle = (short + far) / 2;
      if (past(middle)) {
        short = middle;
      } else {
        far = middle;
      }
    }
    return turn(far);
  }

  /** `point` turned round `centre` by `angle`, anticlockwise: as a sole's angle goes up. */
  private static round(point: Joint, centre: Joint, angle: number): Joint {
    const away = ClimberPose.turned({ x: point.x - centre.x, y: point.y - centre.y }, -angle);
    return { x: centre.x + away.x, y: centre.y + away.y };
  }

  private static shoulderOf(pelvis: Joint, lean: number): Joint {
    return {
      x: pelvis.x + ClimberPose.SPINE * Math.sin(lean),
      y: pelvis.y + ClimberPose.SPINE * Math.cos(lean),
    };
  }

  /** The near hip, 0, or the far one, of a pelvis at `x` and `y`. */
  private static hipOf(x: number, side: 0 | 1, y = 0): Joint {
    return { x: x + (side === 0 ? 1 : -1) * ClimberPose.HIP_SPREAD, y };
  }

  private static armRoot(shoulder: Joint, side: 0 | 1): Joint {
    return {
      x: shoulder.x + (side === 0 ? 1 : -1) * ClimberPose.SHOULDER_SPREAD,
      y: shoulder.y - 0.02,
    };
  }

  /** A point from the climber's point, in the figure's frame: from where it stands, turned with
   * it by `tilt`. */
  private static inside(point: Joint, offset: Joint, tilt: number): Joint {
    return ClimberPose.turned({ x: point.x - offset.x, y: point.y - offset.y }, -tilt);
  }

  /** A point turned by `angle` the way the figure tilts: forward, from up toward +x. */
  private static turned(point: Joint, angle: number): Joint {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return { x: point.x * cos + point.y * sin, y: -point.x * sin + point.y * cos };
  }

  /** Targets `share` of the way from one set to another. */
  private static mix(from: Targets, to: Targets, share: number): Targets {
    const joint = (a: Joint, b: Joint): Joint => ClimberPose.between(a, b, share);
    const angle = (a: number, b: number): number => a + (b - a) * share;
    const pivots = (a: Pivots, b: Pivots): Pivots => ClimberPose.pivotsBetween(a, b, share);
    return {
      pelvis: joint(from.pelvis, to.pelvis),
      lean: angle(from.lean, to.lean),
      nod: angle(from.nod, to.nod),
      ankles: [joint(from.ankles[0], to.ankles[0]), joint(from.ankles[1], to.ankles[1])],
      soles: [angle(from.soles[0], to.soles[0]), angle(from.soles[1], to.soles[1])],
      pivots: [pivots(from.pivots[0], to.pivots[0]), pivots(from.pivots[1], to.pivots[1])],
      hands: [joint(from.hands[0], to.hands[0]), joint(from.hands[1], to.hands[1])],
      tilt: angle(from.tilt, to.tilt),
      offset: joint(from.offset, to.offset),
    };
  }

  private static between(from: Joint, to: Joint, share: number): Joint {
    return { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share };
  }

  private static pivotsBetween(from: Pivots, to: Pivots, share: number): Pivots {
    return {
      forward: ClimberPose.between(from.forward, to.forward, share),
      back: ClimberPose.between(from.back, to.back, share),
    };
  }

  /** `angle` moved by whole turns to within half a turn of `to`, so a blend goes the short way. */
  private static nearest(angle: number, to: number): number {
    return angle + 2 * Math.PI * Math.round((to - angle) / (2 * Math.PI));
  }

  /** An angle within half a turn of 0. */
  private static wrapped(angle: number): number {
    return angle - 2 * Math.PI * Math.round(angle / (2 * Math.PI));
  }

  /** 0 to 1 with an easy start and end. */
  private static smooth(share: number): number {
    const t = Math.min(Math.max(share, 0), 1);
    return t * t * (3 - 2 * t);
  }
}
