import type { Pace, Tiredness } from "../simulation";

/** A joint of the figure, in metres from the snow under the climber, x the way they face. */
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

/** A boot: the ankle it's laced to, and how far it's turned, in radians, 0 level: its sole along
 * the snow it stands on, or its heel peeled up off it, the toe down. */
export interface Foot {
  readonly ankle: Joint;
  readonly angle: number;
}

/** The snow's height `x` metres ahead of the climber, the way they face, above the snow under
 * them: what the boots stand on. */
export type Ground = (x: number) => number;

/** What the pose is made of this frame: the climber as the physics shows them, how they feel. */
export interface PoseState {
  /** How far they've come, in metres over the ground and the ladders: the gait is paced by the
   * way covered, not by time, so the feet stay planted as the physics moves the climber. */
  readonly travelled: number;
  readonly moving: boolean;
  readonly falling: boolean;
  readonly dead: boolean;
  /** A cowstail clipped to a rope: the near hand holds the jumar on the line ahead. */
  readonly onRope: boolean;
  /** The ropes the jumar's cowstail and the other one are clipped to, or none: when one changes,
   * the climber bends to the anchor and its hand clips it there. */
  readonly clipped: readonly [string | null, string | null];
  readonly onLadder: boolean;
  /** How far the slope rises a metre ahead, the way the climber faces, the snow's bumps aside:
   * the spine leans into it, the jumar goes up it and the eyes follow it. */
  readonly rise: number;
  /** The snow the boots stand on, its bumps and all. */
  readonly ground: Ground;
  readonly tiredness: Tiredness;
  readonly pace: Pace["pace"];
}

/** The figure's joints this frame, in metres from the snow under the climber, facing +x. */
export interface Pose {
  readonly pelvis: Joint;
  readonly shoulder: Joint;
  readonly head: Joint;
  /** The near leg and the far one, from the hips to the ankles. */
  readonly legs: readonly [Limb, Limb];
  readonly arms: readonly [Limb, Limb];
  /** The near boot and the far one, on the legs' ends. */
  readonly feet: readonly [Foot, Foot];
  /** How far forward the spine leans, in radians. */
  readonly lean: number;
  /** How far over the whole figure has gone, in radians: 0 on its feet, flat once dead. */
  readonly tilt: number;
  /** How far the near hand holds the jumar on the rope, 0 to 1. */
  readonly holding: number;
  /** Where the face looks, in radians above the level: down at the feet, and now and then up
   * the slope ahead. */
  readonly gaze: number;
}

/**
 * How a climber stands and moves (docs/guidelines/graphics.md → animation shows the body's
 * state): a skeleton in metres, its legs and arms set by two-bone inverse kinematics. The walk is
 * paced by the ground covered, so a boot stays where it was set down as the physics moves the
 * climber: it lands flat on the snow, however the snow lies under it, its heel peels up about the
 * ball as the leg pushes off, and it swings forward clear of the snow, the toe up before it lands.
 * The stride shortens in the rest step, whose downhill leg locks straight under the weight, its
 * boot flat, and lengthens at a faster pace; the spine leans into the slope, and further the more
 * tired they are, and an exhausted climber at a halt bends double with their hands on their
 * knees. The eyes are on the feet, and now and then up the slope ahead. A clipped cowstail puts
 * the near hand on the jumar, which it holds still on the rope while the climber steps up to it
 * and then slides on, and the far hand on the rope just beyond it; when a cowstail moves to
 * another rope, the climber crouches and bends to the anchor, and that hand clips it there. On a
 * ladder the steps are short and high and both hands hold the lines; a fall takes them off their
 * feet, and a dead climber lies flat. It keeps only the picture's own: where in the stride, how
 * many strides, how long a fall and each clip have run, and the ropes it last saw clipped.
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
  /** A boot: how high the ankle is above its sole, how far behind the ankle its heel is, how far
   * ahead its ball, about which the heel peels up, and where its sole ends at the toe. */
  static readonly ANKLE = 0.105;
  static readonly HEEL = 0.1;
  static readonly BALL = 0.16;
  static readonly TOE = 0.2;
  /** How high a boot's sole stands above the snow on its crampons, their points in it. */
  static readonly CRAMPONS = 0.012;
  /** The pelvis' height standing, the knees a little bent. */
  static readonly STANDING = 0.93;
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
  /** Where the eyes are, in radians from the slope: on the feet, and up the slope ahead. */
  static readonly GAZE = { down: -0.3, up: 0.1 };
  /** The rope through the jumar: how far ahead of it the rope comes up off the snow, and how far
   * beyond it the far hand holds it. */
  static readonly ROPE_AHEAD = 1.3;
  static readonly ROPE_HOLD = 0.13;
  /** How long the feet take to come together at a halt, or to pick up the stride again, and the
   * near hand to take the jumar or let it go. */
  private static readonly SETTLE_SECONDS = 0.4;
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
  /** How far the heel peels up as the leg pushes off, in radians, by pace: the rest step lifts
   * its boot flat off the snow. */
  private static readonly PEEL: Readonly<Record<Pace["pace"], number>> = {
    "rest-step": 0,
    steady: 0.6,
    faster: 0.7,
  };
  /** Where in a leg's cycle its heel starts to peel up, and how far its toe comes up, in
   * radians, before the boot lands. */
  private static readonly HEEL_OFF = 0.4;
  private static readonly TOE_UP = 0.16;
  /** The steepest ground the feet follow, as a rise a metre: a wall is a ladder's, not theirs. */
  private static readonly MOST_RISE = 1.2;
  /** How far the spine leans into the slope, a share of its angle going up. */
  private static readonly SLOPE_LEAN = 0.35;
  /** How much of each step the jumar is held still on the rope, before it slides on. */
  private static readonly JUMAR_HOLD = 0.7;
  /** A clip at an anchor: how long it takes, how far the climber bends, crouches and looks down,
   * and where the hand goes, above the snow ahead. */
  private static readonly CLIP_SECONDS = 1.2;
  private static readonly CLIP_LEAN = 0.55;
  private static readonly CLIP_CROUCH = 0.22;
  private static readonly CLIP_GAZE = 0.5;
  private static readonly ANCHOR: Joint = { x: 0.4, y: 0.3 };
  /** How often the climber looks up the slope as they walk, and for how long, in strides. */
  private static readonly LOOK = { every: 7, strides: 1.5 };
  /** Half the gap between the feet at a stand, and the hips' and shoulders' depth apart. */
  private static readonly STANDING_FEET = 0.1;
  private static readonly HIP_SPREAD = 0.02;
  private static readonly SHOULDER_SPREAD = 0.02;
  /** How far an arm swings in a stride, in radians each way. */
  private static readonly ARM_SWING = 0.45;
  /** Where the hands go: on the jumar ahead, on a ladder's lines, and on the knees. */
  private static readonly JUMAR: Joint = { x: 0.45, y: 0.98 };
  private static readonly LADDER_LINES: readonly [Joint, Joint] = [
    { x: 0.38, y: 1.2 },
    { x: 0.3, y: 1.12 },
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
  /** A ladder's rungs, level under the boots. */
  private static readonly LEVEL: Ground = () => 0;
  /** Where along a boot's sole, from the ankle, it feels for the snow under it: heel to ball. */
  private static readonly SOLE = [-1, -0.5, 0, 0.5, 1].map((share) =>
    share < 0 ? share * ClimberPose.HEEL : share * ClimberPose.BALL,
  );

  /** Where in the stride, 0 to 1: a quarter in, the feet are together. */
  private phase = 0.25;
  /** How many whole strides the legs have made. */
  private strides = 0;
  private lastTravelled: number | null = null;
  /** How far the figure is at a stand, 0 walking to 1 standing. */
  private standing = 1;
  /** How far the near hand is on the jumar, 0 to 1. */
  private holding = 0;
  /** How long the fall has run, in seconds. */
  private fallen = 0;
  /** The ropes the cowstails were on last frame, none before the first; and how long each hand's
   * clip has run, in seconds. */
  private clipped: readonly [string | null, string | null] | null = null;
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
      const phase = this.phase + (across * ClimberPose.STANCE) / stride;
      this.strides += Math.floor(phase);
      this.phase = phase % 1;
    }
    for (const hand of [0, 1] as const) {
      if (this.clipped !== null && this.clipped[hand] !== state.clipped[hand]) {
        this.clipping[hand] = 0;
      }
      this.clipping[hand] += frame;
    }
    this.clipped = state.clipped;
    const settle = frame / ClimberPose.SETTLE_SECONDS;
    this.standing = ClimberPose.toward(this.standing, walking ? 0 : 1, settle);
    this.holding = ClimberPose.toward(this.holding, state.onRope && upright ? 1 : 0, settle);
    this.fallen = state.falling ? this.fallen + frame : 0;
    if (state.dead) {
      return ClimberPose.lying(
        { x: 0, y: 0.72 },
        0.15,
        ClimberPose.DEAD_RADIANS,
        ClimberPose.DEAD_FEET,
        ClimberPose.DEAD_HANDS,
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
      );
    }
    return this.onFeet(state, stride, rise);
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

  /** Where the rope through a jumar at `jumar` comes up to it off the snow ahead. */
  static ropeOff(jumar: Joint, ground: Ground): Joint {
    const x = jumar.x + ClimberPose.ROPE_AHEAD;
    return { x, y: ground(x) };
  }

  private onFeet(state: PoseState, stride: number, rise: number): Pose {
    const { phase } = this;
    const standing = ClimberPose.smooth(this.standing);
    const holding = ClimberPose.smooth(this.holding);
    const ground = state.onLadder ? ClimberPose.LEVEL : state.ground;
    const bentDouble = state.tiredness === "exhausted" && !state.moving;
    const resting = state.pace === "rest-step" && !state.onLadder;
    const tired = ClimberPose.LEAN[state.tiredness];
    const clips = this.clipping.map((seconds) => ClimberPose.clipBend(seconds));
    const clip = Math.max(...clips);
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
    const peel = state.onLadder ? 0 : ClimberPose.PEEL[state.pace];
    const pelvisX = -0.08 * lean;
    const hips = [0, 1].map((leg) => pelvisX + (leg === 0 ? 1 : -1) * ClimberPose.HIP_SPREAD);
    const feet = [0, 1].map((leg) =>
      ClimberPose.blend(
        ClimberPose.stepping(ground, (phase + leg / 2) % 1, stride, lift, peel),
        ClimberPose.planted(ground, (leg === 0 ? 1 : -1) * ClimberPose.STANDING_FEET),
        standing,
      ),
    );
    // The pelvis as high as the walk or the stand has it, crouched for a clip, and no higher than
    // each leg reaches: in the rest step the walk's is higher, so the downhill leg locks.
    const most =
      (resting ? ClimberPose.KNEE_LOCKED : ClimberPose.KNEE_BENT) *
      (ClimberPose.THIGH + ClimberPose.SHIN);
    let height =
      walkingHeight + (standingHeight - walkingHeight) * standing - clip * ClimberPose.CLIP_CROUCH;
    for (const [leg, { ankle }] of feet.entries()) {
      const across = ankle.x - (hips[leg] ?? pelvisX);
      if (Math.abs(across) < most) {
        height = Math.min(height, ankle.y + Math.sqrt(most * most - across * across));
      }
    }
    const pelvis: Joint = { x: pelvisX, y: height };
    const legs = feet.map((foot, leg) =>
      ClimberPose.bend(
        { x: hips[leg] ?? pelvisX, y: pelvis.y },
        foot.ankle,
        ClimberPose.THIGH,
        ClimberPose.SHIN,
        1,
      ),
    ) as [Limb, Limb];
    const boots = feet.map((foot, leg) => ({
      ankle: legs[leg === 0 ? 0 : 1].end,
      angle: foot.angle,
    })) as [Foot, Foot];
    const shoulder: Joint = {
      x: pelvis.x + ClimberPose.SPINE * Math.sin(lean),
      y: pelvis.y + ClimberPose.SPINE * Math.cos(lean),
    };
    const head: Joint = {
      x: shoulder.x + ClimberPose.NECK * Math.sin(lean * 1.3),
      y: shoulder.y + ClimberPose.NECK * Math.cos(lean * 1.3),
    };
    const { down, up } = ClimberPose.GAZE;
    const looking = state.onLadder ? 0 : this.lookingUp() * (1 - standing);
    const gaze = Math.atan(rise) + down + (up - down) * looking - clip * ClimberPose.CLIP_GAZE;
    const reach = ClimberPose.UPPER_ARM + ClimberPose.FOREARM - 0.04;
    const jumar = ClimberPose.between(
      this.jumarWalking(stride, rise),
      { x: ClimberPose.JUMAR.x, y: ClimberPose.JUMAR.y + rise * ClimberPose.JUMAR.x },
      standing,
    );
    const anchor: Joint = {
      x: ClimberPose.ANCHOR.x,
      y: ClimberPose.ANCHOR.y + ground(ClimberPose.ANCHOR.x),
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
      } else {
        hand = ClimberPose.between(hand, ClimberPose.farHold(jumar, ground), holding);
      }
      hand = ClimberPose.between(hand, anchor, clips[arm] ?? 0);
      return ClimberPose.bend(root, hand, ClimberPose.UPPER_ARM, ClimberPose.FOREARM, -1);
    }) as [Limb, Limb];
    return { pelvis, shoulder, head, legs, arms, feet: boots, lean, tilt: 0, holding, gaze };
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
      x = front - range + range * ClimberPose.smooth(sliding);
    }
    return { x, y: ClimberPose.JUMAR.y + rise * x };
  }

  /** How far up the slope the climber looks as they walk, 0 to 1: for a stride and a half in
   * every seven, and at their feet the rest of the way. */
  private lookingUp(): number {
    const { every, strides } = ClimberPose.LOOK;
    const into = ((this.strides + this.phase) % every) - (every - strides);
    return into > 0 ? Math.sin((Math.PI * into) / strides) ** 2 : 0;
  }

  /** How far a hand's clip bends the climber, `seconds` into it: down and back up, 0 once done. */
  private static clipBend(seconds: number): number {
    const share = seconds / ClimberPose.CLIP_SECONDS;
    return share < 1 ? Math.sin(Math.PI * share) : 0;
  }

  /** Where a boot is at `phase` of its leg's cycle: set down on the snow and going back under the
   * climber for the stance, its heel peeling up `peel` about the ball by the end of it as the leg
   * pushes off; then lifted `lift`, swung forward clear of the snow and set down flat again, its
   * toe up just before. */
  private static stepping(
    ground: Ground,
    phase: number,
    stride: number,
    lift: number,
    peel: number,
  ): Foot {
    const half = stride / 2;
    if (phase < ClimberPose.STANCE) {
      const pushing = (phase - ClimberPose.HEEL_OFF) / (ClimberPose.STANCE - ClimberPose.HEEL_OFF);
      return ClimberPose.peeled(
        ground,
        ClimberPose.planted(ground, half - (phase / ClimberPose.STANCE) * stride),
        peel * ClimberPose.smooth(pushing),
      );
    }
    const swing = (phase - ClimberPose.STANCE) / (1 - ClimberPose.STANCE);
    const from = ClimberPose.peeled(ground, ClimberPose.planted(ground, -half), peel);
    const to = ClimberPose.planted(ground, half);
    const share = ClimberPose.smooth(swing);
    const raised = lift * Math.sin(Math.PI * swing);
    const x = from.ankle.x + (to.ankle.x - from.ankle.x) * share;
    // Over a hump of the snow between where it left and where it lands, the boot goes higher.
    const over = ClimberPose.planted(ground, x).ankle.y + raised / 2;
    return {
      ankle: { x, y: Math.max(from.ankle.y + (to.ankle.y - from.ankle.y) * share + raised, over) },
      angle:
        from.angle +
        (to.angle - from.angle) * share +
        ClimberPose.TOE_UP * Math.sin(Math.PI * swing) * swing,
    };
  }

  /** A boot set down with its sole under the ankle `x` metres ahead of the climber: flat along
   * the snow under it from heel to toe. */
  private static planted(ground: Ground, x: number): Foot {
    const { HEEL, TOE, BALL } = ClimberPose;
    const angle = Math.atan((ground(x + TOE) - ground(x - HEEL)) / (HEEL + TOE));
    return ClimberPose.resting(ground, x + BALL * Math.cos(angle), angle);
  }

  /** A boot set down, with its heel peeled `by` radians up off the snow: it rocks onto its ball,
   * whose place across it keeps, and turns about it, the toe down. */
  private static peeled(ground: Ground, foot: Foot, by: number): Foot {
    if (by === 0) {
      return foot;
    }
    const { ankle, angle } = foot;
    const ball = ankle.x + ClimberPose.BALL * Math.cos(angle) + ClimberPose.ANKLE * Math.sin(angle);
    return ClimberPose.resting(ground, ball, angle - by);
  }

  /** A boot turned `angle`, its ball `ball` metres ahead of the climber, standing on its
   * crampons on the highest of the snow under its sole from the heel to the ball. */
  private static resting(ground: Ground, ball: number, angle: number): Foot {
    const { BALL, ANKLE } = ClimberPose;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    let under = -Infinity;
    for (const along of ClimberPose.SOLE) {
      const x = ball + (along - BALL) * cos;
      under = Math.max(under, ground(x) - (sin / cos) * (x - ball));
    }
    const y = under + ClimberPose.CRAMPONS;
    return { ankle: { x: ball - BALL * cos - ANKLE * sin, y: y - BALL * sin + ANKLE * cos }, angle };
  }

  /** Where the far hand holds the rope: a little beyond the jumar, towards where the rope comes
   * up off the snow. */
  private static farHold(jumar: Joint, ground: Ground): Joint {
    const off = ClimberPose.ropeOff(jumar, ground);
    const along = Math.hypot(off.x - jumar.x, off.y - jumar.y);
    return {
      x: jumar.x + ((off.x - jumar.x) / along) * ClimberPose.ROPE_HOLD,
      y: jumar.y + ((off.y - jumar.y) / along) * ClimberPose.ROPE_HOLD,
    };
  }

  private static clamp(value: number, most: number): number {
    return Math.min(Math.max(value, -most), most);
  }

  /** `value` moved towards `target` by no more than `most`. */
  private static toward(value: number, target: number, most: number): number {
    return value + ClimberPose.clamp(target - value, most);
  }

  /** A share from 0 to 1 eased in and out; outside them, the nearer. */
  private static smooth(share: number): number {
    const clamped = Math.min(Math.max(share, 0), 1);
    return clamped * clamped * (3 - 2 * clamped);
  }

  private static lying(
    pelvis: Joint,
    lean: number,
    tilt: number,
    feet: readonly [Joint, Joint],
    hands: readonly [Joint, Joint],
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
    const boots = legs.map((leg) => ({ ankle: leg.end, angle: 0 })) as [Foot, Foot];
    return { pelvis, shoulder, head, legs, arms, feet: boots, lean, tilt, holding: 0, gaze: 0 };
  }

  private static between(from: Joint, to: Joint, share: number): Joint {
    return { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share };
  }

  /** Two boots `share` of the way from one to the other. */
  private static blend(from: Foot, to: Foot, share: number): Foot {
    return {
      ankle: ClimberPose.between(from.ankle, to.ankle, share),
      angle: from.angle + (to.angle - from.angle) * share,
    };
  }
}
