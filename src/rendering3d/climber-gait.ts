/** A point in a climber's own frame, in metres from the ground under them: `x` to their right,
 * `y` up, and `z` behind them, so a step forward goes towards −z. */
export interface Reach {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** How a climber is moving, as the picture poses them: on their feet on the ground; across a
 * ladder laid over a crevasse; up or down one that stands against a wall, or a face of ice;
 * hanging on their rope; or down, lying where they came to rest. */
export type GaitMode = "ground" | "across" | "upright" | "hanging" | "down";

/** A climber's body at a moment: where the hips are, how far the trunk leans forward and turns,
 * where each ankle and each wrist is, left then right, and how far each boot tips toe-down. */
export interface Stance {
  readonly hips: Reach;
  readonly lean: number;
  readonly twist: number;
  readonly ankles: readonly [Reach, Reach];
  readonly toes: readonly [number, number];
  readonly wrists: readonly [Reach, Reach];
  /** How far through a stride they are, 0 to 1: the head bobs by it. */
  readonly phase: number;
  /** How much of a walk it is, from 0 standing to 1 in full stride. */
  readonly pace: number;
}

/** What a frame tells the gait: how far the climber went since the last one, forwards positive,
 * in metres; how long the frame was; how they're moving; and how high the ground is `ahead`
 * metres in front of them, over the ground under them. */
export interface GaitFrame {
  readonly metres: number;
  readonly seconds: number;
  readonly mode: GaitMode;
  readonly ground: (ahead: number) => number;
  /** Where each hand has something to hold, the rope or a rail, or nothing: it swings. */
  readonly holds?: readonly [Reach | null, Reach | null];
}

/**
 * A climber's steps, made from how far they've gone. The physics moves a climber as a point; the
 * picture gives the point legs: a stride is so many metres long, so the feet come down as often
 * as the ground goes by, and a foot on the ground stays where it was put until it's lifted,
 * neither sliding nor skating, on the flat, on a slope and across a ladder's rungs alike. Pure:
 * a figure in the picture and a test in Node take the same steps.
 */
export class ClimberGait {
  /** A body 1.78 m tall, as the tent's person is: the hips over the soles standing, the ankle
   * over the sole, how far apart the hips' joints are, and where the shoulders are from the hips. */
  static readonly HIPS = 0.94;
  static readonly ANKLE = 0.1;
  static readonly HIP_WIDTH = 0.105;
  static readonly SHOULDERS = { up: 0.5, out: 0.2 };
  /** How long a step is, in metres: uphill in crampons on the ground, from rung to rung over a
   * crevasse (every other rung, 28 cm apart), and a rung at a time up a wall. */
  private static readonly STEP: Readonly<Record<GaitMode, number>> = {
    ground: 0.5,
    across: 0.56,
    upright: 0.28,
    hanging: 0.5,
    down: 0.5,
  };
  /** How high a boot is lifted in a step, and how fast a walk starts and stops, a second. */
  private static readonly LIFT = 0.13;
  private static readonly EASE = 7;

  private phase = 0;
  private pace = 0;

  /** The body a frame later. */
  step({ metres, seconds, mode, ground, holds }: GaitFrame): Stance {
    const stride = ClimberGait.STEP[mode];
    this.phase = (((this.phase + metres / (2 * stride)) % 1) + 1) % 1;
    const moving = Math.abs(metres) > 1e-5 ? 1 : 0;
    this.pace += (moving - this.pace) * Math.min(seconds * ClimberGait.EASE, 1);
    const { phase, pace } = this;
    if (mode === "upright") {
      return this.upright(stride, holds);
    }
    if (mode === "hanging") {
      return this.hanging(seconds);
    }
    const across = mode === "across";
    const feet = [0, 1].map((foot) => {
      const own = (phase + foot * 0.5) % 1;
      const planted = own < 0.5;
      const swing = (own - 0.5) / 0.5;
      const eased = swing * swing * (3 - 2 * swing);
      const ahead = (planted ? 0.5 - 2 * own : eased - 0.5) * stride * pace;
      const lift = planted ? 0 : Math.sin(Math.PI * swing) * ClimberGait.LIFT * pace;
      const under = Math.min(Math.max(ground(ahead), -0.4), 0.4);
      return { ahead, lift, under };
    });
    const [left, right] = feet;
    const low = Math.min(left?.under ?? 0, right?.under ?? 0);
    const high = Math.max(left?.under ?? 0, right?.under ?? 0);
    const dip = 0.03 * pace * (0.5 - 0.5 * Math.cos(4 * Math.PI * phase));
    const crouch = across ? 0.07 : 0;
    const hips: Reach = {
      x: 0.018 * pace * Math.sin(2 * Math.PI * phase),
      y: ClimberGait.HIPS + low + 0.35 * (high - low) - dip - crouch,
      z: 0,
    };
    const slope = Math.atan2(ground(0.4) - ground(-0.4), 0.8);
    const ankle = (foot: 0 | 1): Reach => {
      const { ahead = 0, lift = 0, under = 0 } = feet[foot] ?? {};
      return {
        x: (foot === 0 ? -1 : 1) * (across ? 0.12 : ClimberGait.HIP_WIDTH + 0.01),
        y: under + lift + ClimberGait.ANKLE,
        z: -ahead,
      };
    };
    const toe = (foot: 0 | 1): number => {
      const { lift = 0 } = feet[foot] ?? {};
      return -slope * 0.8 + lift * 2.2;
    };
    const lean = (across ? 0.24 : 0.07 + 0.09 * pace) + Math.max(slope, 0) * 0.35;
    const swing = (foot: 0 | 1): Reach => {
      const side = foot === 0 ? -1 : 1;
      // An arm swings with the other leg, the elbow a little bent.
      const forward = Math.sin(2 * Math.PI * (phase + foot * 0.5)) * 0.15 * pace;
      return across
        ? { x: side * 0.4, y: hips.y + 0.06, z: -0.16 }
        : { x: side * 0.27, y: hips.y + 0.02 + Math.abs(forward) * 0.2, z: -0.05 - forward };
    };
    return {
      hips,
      lean,
      twist: 0.06 * pace * Math.sin(2 * Math.PI * phase),
      ankles: [ankle(0), ankle(1)],
      toes: [toe(0), toe(1)],
      wrists: [holds?.[0] ?? swing(0), holds?.[1] ?? swing(1)],
      phase,
      pace,
    };
  }

  /** On a ladder up a wall, or on a face: the boots on the rungs a step apart, the hands on the
   * rails above, each moving up as its side's turn comes. */
  private upright(stride: number, holds: GaitFrame["holds"]): Stance {
    const { phase, pace } = this;
    const rung = (foot: number): number => {
      const own = (phase + foot * 0.5) % 1;
      return own < 0.5 ? (0.5 - 2 * own) * stride : (((own - 0.5) / 0.5) * 2 - 1) * 0.5 * stride;
    };
    const ankle = (foot: 0 | 1): Reach => ({
      x: (foot === 0 ? -1 : 1) * 0.11,
      y: ClimberGait.ANKLE + 0.14 + rung(foot) * pace,
      z: -0.3,
    });
    const wrist = (foot: 0 | 1): Reach => ({
      x: (foot === 0 ? -1 : 1) * 0.19,
      y: 1.52 + rung(1 - foot) * pace,
      z: -0.36,
    });
    return {
      hips: { x: 0, y: ClimberGait.HIPS - 0.04, z: 0.06 },
      lean: 0.16,
      twist: 0,
      ankles: [ankle(0), ankle(1)],
      toes: [0.25, 0.25],
      wrists: [holds?.[0] ?? wrist(0), holds?.[1] ?? wrist(1)],
      phase,
      pace,
    };
  }

  /** Hanging on the rope: sat in the harness, the legs loose under them, the hands on the rope. */
  private hanging(seconds: number): Stance {
    this.phase = (this.phase + seconds * 0.15) % 1;
    const sway = Math.sin(2 * Math.PI * this.phase) * 0.05;
    return {
      hips: { x: 0, y: ClimberGait.HIPS, z: 0 },
      lean: -0.12,
      twist: sway,
      ankles: [
        { x: -0.13, y: 0.18, z: -0.22 + sway },
        { x: 0.13, y: 0.14, z: -0.3 - sway },
      ],
      toes: [0.5, 0.5],
      wrists: [
        { x: -0.08, y: 1.62, z: -0.2 },
        { x: 0.08, y: 1.5, z: -0.22 },
      ],
      phase: this.phase,
      pace: 0,
    };
  }
}
