import type { Pace, Tiredness } from "../simulation";

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
  /** Which boots came down on the snow this frame, for the puff they kick up. */
  readonly landed: readonly [boolean, boolean];
}

/** What the figure is doing, as the pose draws it: from one to the next, it blends. */
type Mode = "walk" | "rungs" | "wall" | "rise" | "fall" | "hang" | "dead";

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

/** A mode's targets this frame, and which boots are down. */
interface Made {
  readonly targets: Targets;
  readonly down: readonly [boolean, boolean];
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
 * go rung over rung. A fall takes them over face down, tumbling in the air, or hangs them below
 * the rope; they get up through a kneel; a dead climber lies still. From each to the next the pose
 * blends, in about a quarter of a second. It keeps only the picture's own: where in the stride,
 * the blends, and the clocks of the fall and the reach.
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
  /** A stride at each pace: how far the body goes while each boot takes a step. */
  static readonly STRIDE: Readonly<Record<Pace["pace"], number>> = {
    "rest-step": 0.42,
    steady: 0.56,
    faster: 0.66,
  };
  /** How far a boot steps on a ladder, about: a rung at life size, and on a ladder drawn smaller
   * than the figure the nearest whole number of rungs. Each boot goes two steps in a stride, from
   * a rung to the next but one, so both come down on rungs. */
  static readonly RUNG_STEP = 0.3;
  /** How high a boot lifts in a step, and on a ladder. */
  static readonly LIFT = 0.14;
  static readonly RUNG_LIFT = 0.22;
  /** How much of a leg's cycle its boot is down. */
  static readonly STANCE = 0.6;
  /** How much of each step of the rest step the figure stands still on its locked lower leg. */
  static readonly REST_PAUSE = 0.45;
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
  /** How a fallen climber lies: a quarter turn, face down along the ground. */
  static readonly FALLEN_RADIANS = Math.PI / 2;
  /** How long a climber takes to go over in a fall, and to get up after it. */
  static readonly FALL_SECONDS = 0.4;
  static readonly RISE_SECONDS = 1.2;
  /** How long a blend into each takes. */
  static readonly BLEND_SECONDS: Readonly<Record<Mode, number>> = {
    walk: 0.3,
    rungs: 0.3,
    wall: 0.35,
    rise: 0.5,
    fall: ClimberPose.FALL_SECONDS,
    hang: 0.5,
    dead: 0.6,
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
  /** How long the boots take to settle at a halt, or the stride to pick up again. */
  private static readonly SETTLE_SECONDS = 0.25;
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
  /** How far back over the locked lower leg the pelvis goes in the rest step's pause. */
  private static readonly REST_BACK = 0.04;
  /** How far a leg reaches, as a share of its length: never quite straight. */
  private static readonly REACH = 0.995;
  /** Where the near hand holds the jumar when the rope is out of its reach, from the shoulder:
   * the rope is lifted to it. How much of each step pushes the jumar up the rope; it grips for
   * the rest. How much shorter than that lift the rope to the anchor gets as the hand lets go:
   * nearer, the rope can't come up to it. */
  private static readonly JUMAR_HOLD: Joint = { x: 0.34, y: -0.3 };
  private static readonly JUMAR_PUSH = 0.7;
  private static readonly LET_GO = 0.3;
  /** How long the far hand takes to clip the second cowstail, or unclip it, and come back; how
   * far the body leans into the reach, and crouches to the rope. */
  private static readonly CLIP_SECONDS = 0.6;
  private static readonly CLIP_LEAN = 0.3;
  private static readonly CLIP_CROUCH = 0.15;
  /** Across a ladder: how far ahead of the shoulders each hand holds the lines. */
  private static readonly LINE_HOLDS: readonly [number, number] = [0.3, 0.18];
  /** Up a wall: how far toward the wall from the ladder's line the balls of the feet and the
   * hands are, and the ball of the foot from the ankle; the pelvis, up the ladder and off it; how
   * high over the feet the hands hold, about, and over the top; how far a foot or a hand comes off
   * between the rungs; the lean into it. */
  private static readonly WALL = {
    foot: 0.04,
    hand: 0.03,
    ball: 0.07,
    pelvis: { up: 0.68, off: -0.3 },
    hands: 1.2,
    over: 0.1,
    lift: 0.12,
    lean: 0.15,
  };
  /** Up a wall, the head looks up it, and once it comes over the wall's top, down onto it, the body
   * leaning over the edge to step off: the gaze up the wall and onto its top, how far over the top
   * the head is when it's looking down onto it, and how far the climber leans over it there. */
  private static readonly CREST = { up: -0.3, onto: 0.35, over: 0.45, lean: 0.4 };
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
  private lift = 0;
  private pushing = 0;
  /** How far into the rest step's rhythm, 0 to 1. */
  private resting = 0;
  /** Whether the second carabiner was on last frame, where it was, and the far hand's reach to
   * it: the seconds left. */
  private clipped: boolean | null = null;
  private carabinerSeen: Joint | null = null;
  private reaching = 0;
  /** How long the fall has run, how far it's in the air, and how far it's turned over there. */
  private fallen = 0;
  private aloft = 0;
  private spin = 0;
  /** How far up after a fall, 0 to 1. */
  private rising = 1;
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
    this.keepTime(frame, share, state, mode);
    const gait = this.gait(state, mode, share);
    const made = this.made(mode, state, gait);
    if (this.mode !== null && mode !== this.mode && this.last !== null) {
      const tilt = ClimberPose.nearest(this.last.tilt, made.targets.tilt);
      this.blendFrom = { ...this.last, tilt };
      this.blended = 0;
    }
    this.mode = mode;
    const targets = this.blend(made.targets, frame, mode);
    this.last = targets;
    const onSnow = mode === "walk";
    const landed: readonly [boolean, boolean] = [
      onSnow && made.down[0] && !this.down[0],
      onSnow && made.down[1] && !this.down[1],
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

  private modeOf(state: PoseState): Mode {
    if (state.dead) {
      return "dead";
    }
    if (state.falling) {
      return this.hangingFrom(state) === null ? "fall" : "hang";
    }
    if (this.rising < 1) {
      return "rise";
    }
    const { ladder } = state;
    if (ladder === null) {
      return "walk";
    }
    return Math.abs(ladder.way.y) >= 0.5 ? "wall" : "rungs";
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
    // The hand lets the jumar go where the rope runs on to its anchor less far than it lifts it.
    const grip = ClimberPose.smooth(1 + (state.slack - this.lift) / ClimberPose.LET_GO);
    this.holding += ((state.jumar !== null && upright ? grip : 0) - this.holding) * share;
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
  private gait(state: PoseState, mode: Mode, share: number): Gait {
    const { ladder } = state;
    let pace = ClimberPose.STRIDE[state.pace] * ClimberPose.TIRED[state.tiredness].stride;
    if (ladder !== null) {
      const across = mode === "wall" ? 1 : Math.abs(ladder.way.x);
      pace = ClimberPose.rungStride(ladder) * across;
    }
    const stride = this.stride === null ? pace : this.stride + (pace - this.stride) * share;
    this.stride = stride;
    const last = this.lastTravelled;
    const moved = last === null ? 0 : Math.abs(state.travelled - last);
    this.lastTravelled = state.travelled;
    if (mode === "walk" || mode === "rungs" || mode === "wall" || mode === "rise") {
      const ahead = moved / Math.max(stride, 1e-6);
      const onward = this.cycle + ahead;
      const cycle = onward + ClimberPose.ontoRungs(state, mode, stride, onward, ahead);
      this.cycle = ((cycle % 1) + 1) % 1;
    }
    // The rest step: in each step, the drawn walk stands still for the pause and then steps
    // through, the figure that far behind the climber's point.
    const step = (2 * this.cycle) % 1;
    const pause = ClimberPose.REST_PAUSE;
    const stepped = step < pause ? 0 : ClimberPose.smooth((step - pause) / (1 - pause));
    const lag = (this.resting * (step - stepped)) / 2;
    const into = ClimberPose.smooth(step / 0.15) * (1 - stepped);
    const phase = (this.cycle - lag + 1) % 1;
    this.settled = [this.settle(phase, 0, state, share), this.settle(phase, 1, state, share)];
    return {
      phase,
      stride,
      behind: lag * stride,
      pausing: this.resting * (1 - this.standing) * into,
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
    if (mode === "wall") {
      return this.wall(state, gait);
    }
    const walk = this.walk(state, gait);
    if (mode === "rise") {
      const up = ClimberPose.smooth((this.rising - 0.4) / 0.6);
      return { targets: ClimberPose.mix(this.kneel(state), walk.targets, up), down: walk.down };
    }
    return walk;
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
    const lift = (ladder === null ? ClimberPose.LIFT : ClimberPose.RUNG_LIFT) * tired.lift;
    const near = this.boot(state, gait, 0, lift);
    const far = this.boot(state, gait, 1, lift);
    const slope = this.slopeAt(state, 0, behind);
    const lean = this.walkingLean(state, slope);
    const pelvisX = -0.08 * lean - ClimberPose.REST_BACK * gait.pausing;
    const dip = (1 + Math.cos(4 * Math.PI * (gait.phase - ClimberPose.START))) / 2;
    const bob = ClimberPose.BOB * dip * (1 - this.standing);
    const sink = ClimberPose.SINK[state.tiredness] + ClimberPose.CLIP_CROUCH * this.reach();
    let height = this.height(state, pelvisX, behind) + ClimberPose.STANDING - sink - bob;
    // In the rest step's pause the climber stands straight on the back leg, locked, the boot on
    // its toe as far as its stiff ankle needs.
    const backIsNear = near.ankle.x < far.ankle.x;
    const back = backIsNear ? near : far;
    const backHip = ClimberPose.hipOf(pelvisX, backIsNear ? 0 : 1);
    const straight: Joint = { x: backHip.x, y: ClimberPose.reachUp(backHip, back.ankle) };
    const onToe = ClimberPose.stiff(straight, back, back.pivots);
    height += gait.pausing * (ClimberPose.reachUp(backHip, onToe.ankle) - height);
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
        nod: lean * 1.3 + tired.nod,
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
    const swing = ClimberPose.ARM_SWING * ClimberPose.TIRED[state.tiredness].swing;
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
      const x = shoulder.x + ClimberPose.JUMAR_HOLD.x;
      const y = shoulder.y + ClimberPose.JUMAR_HOLD.y;
      this.heldAt = {
        x: x + (onX - x) * within + along.x * ahead,
        y: y + (onY - y) * within + along.y * ahead,
      };
      this.lift = Math.hypot(this.heldAt.x - onX, this.heldAt.y - onY);
    }
    const held = this.heldAt;
    const onTheJumar = held === null ? near : ClimberPose.between(near, held, this.holding);
    const to = this.carabinerSeen;
    const reach = this.reach();
    if (to === null || reach <= 0) {
      return [onTheJumar, far];
    }
    const carabiner: Joint = { x: to.x - offset.x, y: to.y - offset.y };
    return [onTheJumar, ClimberPose.between(far, carabiner, reach)];
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
      weight: settled,
      pivots: ClimberPose.pivotsBetween(pivots, ClimberPose.OFF_THE_GROUND, aloft),
    };
  }

  /** Up or down a ladder on a wall: the balls of the feet on the rungs, the hands on rungs above,
   * each going rung over rung, hand against foot, the body back off the ladder. */
  private wall(state: PoseState, gait: Gait): Made {
    const wall = ClimberPose.WALL;
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
    const at = (up: number, off: number): Joint => ({
      x: up * rise.x + off * toWall.x,
      y: up * rise.y + off * toWall.y,
    });
    const ankleOf = (onRungs: OnRungs): Joint => {
      const ball = at(Math.max(onRungs.up, bottom), wall.foot - onRungs.off);
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
    let up = wall.pelvis.up;
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
    // How far over the wall's top the head has come, going up: none going down.
    const headUp = up + ClimberPose.SPINE * Math.cos(wall.lean) + ClimberPose.NECK;
    const over = sign > 0 ? ClimberPose.smooth((headUp - top) / crest.over) : 0;
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
        nod: sign > 0 ? crest.up + (crest.onto - crest.up) * over : 0.4,
        ankles: [nearAnkle, farAnkle],
        soles: [0, 0],
        pivots: [ClimberPose.ON_A_WALL, ClimberPose.ON_A_WALL],
        hands,
        tilt: 0,
        offset: ClimberPose.ORIGIN,
      },
      down: [near.down, far.down],
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
   * cowstail, the near hand up on it, the legs dangling. */
  private hanging(state: PoseState): Targets {
    const hold = this.hangingFrom(state) ?? ClimberPose.UP;
    const tilt = Math.min(Math.max(Math.atan2(hold.x, hold.y), -0.9), 0.9);
    const above = ClimberPose.turned(hold, -tilt);
    const shoulder = ClimberPose.shoulderOf(ClimberPose.ORIGIN, -0.08);
    const reach = ClimberPose.UPPER_ARM + ClimberPose.FOREARM - 0.02;
    const away = Math.hypot(above.x - shoulder.x, above.y - shoulder.y);
    const share = away > reach ? reach / away : 1;
    const { metres, hz } = ClimberPose.HANGING_SWAY;
    const sway = metres * Math.sin(2 * Math.PI * hz * this.fallen);
    const [nearFoot, farFoot] = ClimberPose.HANGING_FEET;
    return {
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
      offset: ClimberPose.ORIGIN,
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
    const nearArm = ClimberPose.bend(nearRoot, hands[0], UPPER_ARM, FOREARM, -1);
    const farArm = ClimberPose.bend(farRoot, hands[1], UPPER_ARM, FOREARM, -1);
    const { jumar, carabiner } = state;
    const onTheRope = jumar === null ? null : ClimberPose.inside(jumar, offset, tilt);
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
      tilt,
      offset,
      jumar: onTheRope === null ? null : ClimberPose.between(onTheRope, nearArm.end, this.holding),
      carabiner: carabiner === null ? null : ClimberPose.inside(carabiner, offset, tilt),
      landed,
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
