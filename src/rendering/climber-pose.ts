import type { Pace, Tiredness } from "../simulation";

/** A joint of the figure, in metres from the ground under the climber, x the way they face. */
export interface Joint {
  readonly x: number;
  readonly y: number;
}

/** A leg or an arm: where it starts, its knee or elbow, and its foot or hand. */
export interface Limb {
  readonly root: Joint;
  readonly middle: Joint;
  readonly end: Joint;
}

/** What the pose is made of this frame: the climber as the physics shows them, how they feel. */
export interface PoseState {
  /** How far they've come, in metres over the ground and the ladders: the gait is paced by the
   * way covered, not by time, so the feet stay planted as the physics moves the climber. */
  readonly travelled: number;
  readonly moving: boolean;
  readonly falling: boolean;
  readonly dead: boolean;
  /** The jumar clipped to a rope lying along the ground: the near hand holds it on the line
   * ahead. */
  readonly onRope: boolean;
  /** The ropes the jumar's cowstail and the other one are clipped to, or none: when one changes,
   * the climber bends to the anchor and its hand clips it there. */
  readonly clipped: readonly [string | null, string | null];
  readonly onLadder: boolean;
  /** How far the ground rises a metre ahead, the way the climber faces: the feet stand on it. */
  readonly rise: number;
  readonly tiredness: Tiredness;
  readonly pace: Pace["pace"];
}

/** A cowstail's last clip: the rope it came off and the one it's on now, either none, and how far
 * the hand has moved it, 0 to 1: 1 once done, and ever since. */
export interface Clip {
  readonly from: string | null;
  readonly to: string | null;
  readonly share: number;
}

/** The figure's joints this frame, in metres from the ground under the climber, facing +x. */
export interface Pose {
  readonly pelvis: Joint;
  readonly shoulder: Joint;
  readonly head: Joint;
  /** The near leg and the far one. */
  readonly legs: readonly [Limb, Limb];
  readonly arms: readonly [Limb, Limb];
  /** How far forward the spine leans, in radians. */
  readonly lean: number;
  /** How far over the whole figure has gone, in radians: 0 on its feet, flat once dead. */
  readonly tilt: number;
  /** How far the near hand holds the jumar on the rope, 0 to 1. */
  readonly holding: number;
  /** The jumar's cowstail's last clip, which the near hand makes, and the other's, the far
   * hand's. */
  readonly clips: readonly [Clip, Clip];
}

/**
 * How a climber stands and moves (docs/guidelines/graphics.md → animation shows the body's
 * state): a skeleton in metres, its legs and arms set by two-bone inverse kinematics. The walk is
 * paced by the ground covered, so a foot stays where it was set down as the physics moves the
 * climber, on the slope as it rises; the stride shortens in the rest step, whose downhill leg
 * locks straight under the weight, and lengthens at a faster pace; the spine leans into the slope,
 * and further the more tired they are, and an exhausted climber at a halt bends double with their
 * hands on their knees. A clipped cowstail puts the near hand on the jumar, which it holds still
 * on the rope while the climber steps up to it and then slides on; when a cowstail moves to
 * another rope, the climber crouches and bends to the anchor, and that hand clips it there. On a
 * ladder the steps are short and high and both hands hold the lines; a fall takes them off their
 * feet, and a dead climber lies flat. Each pose tells how far each clip has gone, from which rope
 * to which, for the gear to be moved with the hand (`Cowstails`). It keeps only the picture's own:
 * where in the stride, how long a fall and each clip have run, the ropes it last saw clipped and
 * the ones the cowstails came off.
 */
export class ClimberPose {
  /** The bones, in metres, of a climber 1.77 m tall in boots and a down suit. */
  static readonly THIGH = 0.43;
  static readonly SHIN = 0.43;
  static readonly SPINE = 0.49;
  static readonly UPPER_ARM = 0.31;
  static readonly FOREARM = 0.28;
  /** From the shoulders to the middle of the head. */
  static readonly NECK = 0.24;
  static readonly HEAD_RADIUS = 0.12;
  /** The pelvis' height standing, the knees a little bent. */
  static readonly STANDING = 0.8;
  /** A step's length at each pace, and on a ladder's rungs. */
  static readonly STRIDE: Readonly<Record<Pace["pace"], number>> = {
    "rest-step": 0.42,
    steady: 0.56,
    faster: 0.66,
  };
  static readonly RUNG_STRIDE = 0.3;
  /** How high a foot lifts in a step, and on a ladder. */
  static readonly LIFT = 0.16;
  static readonly RUNG_LIFT = 0.24;
  /** How much of a leg's cycle its foot is on the ground. */
  static readonly STANCE = 0.6;
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
  /** How far over a falling climber goes, and how long that takes, and how a dead one lies. */
  static readonly FALLEN_RADIANS = 1.2;
  static readonly FALL_SECONDS = 0.4;
  static readonly DEAD_RADIANS = Math.PI / 2;
  /** How long the feet take to come together at a halt, or to pick up the stride again. */
  private static readonly SETTLE_SECONDS = 0.25;
  /** The sink of the pelvis by tiredness, standing. */
  private static readonly SINK: Readonly<Record<Tiredness, number>> = {
    fresh: 0,
    tired: 0.01,
    "profoundly-tired": 0.02,
    exhausted: 0.04,
  };
  /** How much the pelvis bobs in a stride. */
  private static readonly BOB = 0.025;
  /** How far a planted leg reaches at most, as a share of its length: the knees a little bent
   * walking, and locked straight in the rest step, whose pelvis rises until the downhill leg is. */
  private static readonly KNEE_BENT = 0.97;
  private static readonly KNEE_LOCKED = 0.999;
  private static readonly REST_RISE = 0.08;
  /** The steepest ground the feet follow, as a rise a metre: a wall is a ladder's, not theirs. */
  private static readonly MOST_RISE = 1.2;
  /** How far the spine leans into the slope, a share of its angle going up. */
  private static readonly SLOPE_LEAN = 0.35;
  /** How much of each step the jumar is held still on the rope, before it slides on. */
  private static readonly JUMAR_HOLD = 0.7;
  /** A clip at an anchor: how long it takes, how far the climber bends and crouches, and where
   * the hand goes, above the ground ahead. */
  private static readonly CLIP_SECONDS = 1.2;
  private static readonly CLIP_LEAN = 0.55;
  private static readonly CLIP_CROUCH = 0.22;
  private static readonly ANCHOR: Joint = { x: 0.4, y: 0.3 };
  /** Half the gap between the feet at a stand, and the hips' and shoulders' depth apart. */
  private static readonly STANDING_FEET = 0.1;
  private static readonly HIP_SPREAD = 0.02;
  private static readonly SHOULDER_SPREAD = 0.02;
  /** How far an arm swings in a stride, in radians each way. */
  private static readonly ARM_SWING = 0.45;
  /** Where the hands go: on the jumar ahead, on a ladder's lines, and on the knees. */
  private static readonly JUMAR: Joint = { x: 0.42, y: 0.85 };
  private static readonly LADDER_LINES: readonly [Joint, Joint] = [
    { x: 0.38, y: 1.08 },
    { x: 0.3, y: 1 },
  ];
  /** The fall: the limbs flung out; and death: lying straight. */
  private static readonly FALLING_FEET: readonly [Joint, Joint] = [
    { x: 0.38, y: 0.22 },
    { x: -0.28, y: 0.12 },
  ];
  private static readonly FALLING_HANDS: readonly [Joint, Joint] = [
    { x: 0.34, y: 1.55 },
    { x: -0.3, y: 1.5 },
  ];
  private static readonly DEAD_FEET: readonly [Joint, Joint] = [
    { x: 0.08, y: 0 },
    { x: -0.06, y: 0 },
  ];
  private static readonly DEAD_HANDS: readonly [Joint, Joint] = [
    { x: 0.12, y: 0.5 },
    { x: -0.04, y: 0.55 },
  ];

  /** Where in the stride, 0 to 1: a quarter in, the feet are together. */
  private phase = 0.25;
  private lastTravelled: number | null = null;
  /** How far the figure is at a stand, 0 walking to 1 standing. */
  private standing = 1;
  /** How far the near hand is on the jumar, 0 to 1. */
  private holding = 0;
  /** How long the fall has run, in seconds. */
  private fallen = 0;
  /** The ropes the cowstails were on last frame, none before the first; the rope each came off at
   * its last clip; and how long each hand's clip has run, in seconds. */
  private clipped: readonly [string | null, string | null] | null = null;
  private readonly came: [string | null, string | null] = [null, null];
  private readonly clipping: [number, number] = [Infinity, Infinity];

  /** The pose `seconds` after the last one, for the climber in `state`. */
  advance(seconds: number, state: PoseState): Pose {
    const frame = Math.max(seconds, 0);
    const upright = !state.falling && !state.dead;
    const walking = state.moving && upright;
    const stride = state.onLadder ? ClimberPose.RUNG_STRIDE : ClimberPose.STRIDE[state.pace];
    const rise = state.onLadder ? 0 : ClimberPose.clamp(state.rise, ClimberPose.MOST_RISE);
    const moved = this.lastTravelled === null ? 0 : Math.abs(state.travelled - this.lastTravelled);
    this.lastTravelled = state.travelled;
    if (walking) {
      // A foot on the ground goes back under the climber as far as they come over the ground:
      // its stance, a share of the stride's cycle, is the stride's length across.
      const across = moved / Math.hypot(1, rise);
      this.phase = (this.phase + (across * ClimberPose.STANCE) / stride) % 1;
    }
    for (const hand of [0, 1] as const) {
      if (this.clipped !== null && this.clipped[hand] !== state.clipped[hand]) {
        this.came[hand] = this.clipped[hand];
        this.clipping[hand] = 0;
      }
      this.clipping[hand] += frame;
    }
    this.clipped = state.clipped;
    const clips = ([0, 1] as const).map((hand) => ({
      from: this.came[hand],
      to: state.clipped[hand],
      share: Math.min(1, this.clipping[hand] / ClimberPose.CLIP_SECONDS),
    })) as [Clip, Clip];
    const share = 1 - Math.exp(-frame / ClimberPose.SETTLE_SECONDS);
    this.standing += ((walking ? 0 : 1) - this.standing) * share;
    this.holding += ((state.onRope && upright ? 1 : 0) - this.holding) * share;
    this.fallen = state.falling ? this.fallen + frame : 0;
    if (state.dead) {
      return ClimberPose.lying(
        { x: 0, y: 0.72 },
        0.15,
        ClimberPose.DEAD_RADIANS,
        ClimberPose.DEAD_FEET,
        ClimberPose.DEAD_HANDS,
        clips,
      );
    }
    if (state.falling) {
      const over = Math.min(1, this.fallen / ClimberPose.FALL_SECONDS);
      return ClimberPose.lying(
        { x: 0, y: 0.75 },
        0.3,
        ClimberPose.FALLEN_RADIANS * over,
        ClimberPose.FALLING_FEET,
        ClimberPose.FALLING_HANDS,
        clips,
      );
    }
    return this.onFeet(state, stride, rise, clips);
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

  private onFeet(
    state: PoseState,
    stride: number,
    rise: number,
    clips: readonly [Clip, Clip],
  ): Pose {
    const { standing, holding, phase } = this;
    const bentDouble = state.tiredness === "exhausted" && !state.moving;
    const resting = state.pace === "rest-step" && !state.onLadder;
    const tired = ClimberPose.LEAN[state.tiredness];
    const bends = clips.map(({ share }) => ClimberPose.clipBend(share));
    const clip = Math.max(...bends);
    const lean =
      tired +
      (1 - standing) * ClimberPose.WALKING_LEAN +
      holding * ClimberPose.HOLDING_LEAN +
      (bentDouble ? standing * (ClimberPose.BENT_DOUBLE - tired) : 0) +
      (state.onLadder ? ClimberPose.LADDER_LEAN : 0) +
      Math.max(0, Math.atan(rise)) * ClimberPose.SLOPE_LEAN +
      clip * ClimberPose.CLIP_LEAN;
    const bob = ClimberPose.BOB * (1 + Math.cos(4 * Math.PI * phase));
    const walkingHeight = ClimberPose.STANDING - bob + (resting ? ClimberPose.REST_RISE : 0);
    const standingHeight = ClimberPose.STANDING - ClimberPose.SINK[state.tiredness];
    const lift = state.onLadder ? ClimberPose.RUNG_LIFT : ClimberPose.LIFT;
    const pelvisX = -0.08 * lean;
    const hips = [0, 1].map((leg) => pelvisX + (leg === 0 ? 1 : -1) * ClimberPose.HIP_SPREAD);
    const feet = [0, 1].map((leg) => {
      const stepping = ClimberPose.foot((phase + leg / 2) % 1, stride, lift);
      const still: Joint = { x: (leg === 0 ? 1 : -1) * ClimberPose.STANDING_FEET, y: 0 };
      const flat = ClimberPose.between(stepping, still, standing);
      return { x: flat.x, y: flat.y + rise * flat.x };
    });
    // The pelvis as high as the walk or the stand has it, crouched for a clip, and no higher than
    // each leg reaches: in the rest step the walk's is higher, so the downhill leg locks.
    const most =
      (resting ? ClimberPose.KNEE_LOCKED : ClimberPose.KNEE_BENT) *
      (ClimberPose.THIGH + ClimberPose.SHIN);
    let height =
      walkingHeight + (standingHeight - walkingHeight) * standing - clip * ClimberPose.CLIP_CROUCH;
    for (const [leg, foot] of feet.entries()) {
      const across = foot.x - (hips[leg] ?? pelvisX);
      if (Math.abs(across) < most) {
        height = Math.min(height, foot.y + Math.sqrt(most * most - across * across));
      }
    }
    const pelvis: Joint = { x: pelvisX, y: height };
    const legs = feet.map((foot, leg) =>
      ClimberPose.bend(
        { x: hips[leg] ?? pelvisX, y: pelvis.y },
        foot,
        ClimberPose.THIGH,
        ClimberPose.SHIN,
        1,
      ),
    ) as [Limb, Limb];
    const shoulder: Joint = {
      x: pelvis.x + ClimberPose.SPINE * Math.sin(lean),
      y: pelvis.y + ClimberPose.SPINE * Math.cos(lean),
    };
    const head: Joint = {
      x: shoulder.x + ClimberPose.NECK * Math.sin(lean * 1.3),
      y: shoulder.y + ClimberPose.NECK * Math.cos(lean * 1.3),
    };
    const reach = ClimberPose.UPPER_ARM + ClimberPose.FOREARM - 0.04;
    const jumar = ClimberPose.between(
      this.jumarWalking(stride, rise),
      { x: ClimberPose.JUMAR.x, y: ClimberPose.JUMAR.y + rise * ClimberPose.JUMAR.x },
      standing,
    );
    const anchor: Joint = {
      x: ClimberPose.ANCHOR.x,
      y: ClimberPose.ANCHOR.y + rise * ClimberPose.ANCHOR.x,
    };
    const arms = [0, 1].map((arm) => {
      const root: Joint = {
        x: shoulder.x + (arm === 0 ? 1 : -1) * ClimberPose.SHOULDER_SPREAD,
        y: shoulder.y - 0.02,
      };
      const swing = ClimberPose.ARM_SWING * Math.sin(2 * Math.PI * (phase + arm / 2) + Math.PI);
      const angle = swing * (1 - standing) + lean * 0.5;
      let hand: Joint = {
        x: root.x + reach * Math.sin(angle),
        y: root.y - reach * Math.cos(angle),
      };
      if (state.onLadder) {
        hand = ClimberPose.LADDER_LINES[arm === 0 ? 0 : 1];
      } else if (bentDouble) {
        const knee = legs[arm === 0 ? 0 : 1].middle;
        hand = ClimberPose.between(hand, { x: knee.x + 0.02, y: knee.y + 0.02 }, standing);
      } else if (arm === 0) {
        hand = ClimberPose.between(hand, jumar, holding);
      }
      hand = ClimberPose.between(hand, anchor, bends[arm] ?? 0);
      return ClimberPose.bend(root, hand, ClimberPose.UPPER_ARM, ClimberPose.FOREARM, -1);
    }) as [Limb, Limb];
    return { pelvis, shoulder, head, legs, arms, lean, tilt: 0, holding, clips };
  }

  /** Where the jumar is in the near hand as the climber walks, on the rope ahead along the slope:
   * held still while they step up to it, twice a stride, then slid on as far as they came. */
  private jumarWalking(stride: number, rise: number): Joint {
    const step = (2 * this.phase) % 1;
    // How far across the climber comes in a step, and how far the jumar goes back while held.
    const range = (ClimberPose.JUMAR_HOLD * stride) / (2 * ClimberPose.STANCE);
    const front = ClimberPose.JUMAR.x + range / 2;
    let x: number;
    if (step < ClimberPose.JUMAR_HOLD) {
      x = front - (step / ClimberPose.JUMAR_HOLD) * range;
    } else {
      const sliding = (step - ClimberPose.JUMAR_HOLD) / (1 - ClimberPose.JUMAR_HOLD);
      x = front - range + range * sliding * sliding * (3 - 2 * sliding);
    }
    return { x, y: ClimberPose.JUMAR.y + rise * x };
  }

  /** How far a hand's clip bends the climber, `share` of the way through it: down and back up, 0
   * once done. */
  private static clipBend(share: number): number {
    return share < 1 ? Math.sin(Math.PI * share) : 0;
  }

  private static clamp(value: number, most: number): number {
    return Math.min(Math.max(value, -most), most);
  }

  /** Where a foot is at `phase` of its cycle: on the ground, moving back under the body, for
   * the stance, then lifted and swung forward. */
  private static foot(phase: number, stride: number, lift: number): Joint {
    const half = stride / 2;
    if (phase < ClimberPose.STANCE) {
      return { x: half - (phase / ClimberPose.STANCE) * stride, y: 0 };
    }
    const swing = (phase - ClimberPose.STANCE) / (1 - ClimberPose.STANCE);
    return { x: -half + swing * stride, y: lift * Math.sin(Math.PI * swing) };
  }

  private static lying(
    pelvis: Joint,
    lean: number,
    tilt: number,
    feet: readonly [Joint, Joint],
    hands: readonly [Joint, Joint],
    clips: readonly [Clip, Clip],
  ): Pose {
    const shoulder: Joint = {
      x: pelvis.x + ClimberPose.SPINE * Math.sin(lean),
      y: pelvis.y + ClimberPose.SPINE * Math.cos(lean),
    };
    const head: Joint = {
      x: shoulder.x + ClimberPose.NECK * Math.sin(lean),
      y: shoulder.y + ClimberPose.NECK * Math.cos(lean),
    };
    const legs = feet.map((foot, leg) =>
      ClimberPose.bend(
        { x: pelvis.x + (leg === 0 ? 1 : -1) * ClimberPose.HIP_SPREAD, y: pelvis.y },
        foot,
        ClimberPose.THIGH,
        ClimberPose.SHIN,
        1,
      ),
    ) as [Limb, Limb];
    const arms = hands.map((hand, arm) =>
      ClimberPose.bend(
        { x: shoulder.x + (arm === 0 ? 1 : -1) * ClimberPose.SHOULDER_SPREAD, y: shoulder.y },
        hand,
        ClimberPose.UPPER_ARM,
        ClimberPose.FOREARM,
        -1,
      ),
    ) as [Limb, Limb];
    return { pelvis, shoulder, head, legs, arms, lean, tilt, holding: 0, clips };
  }

  private static between(from: Joint, to: Joint, share: number): Joint {
    return { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share };
  }
}
