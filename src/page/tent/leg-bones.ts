import { Vector3 } from "./hand-bones";

/**
 * How a leg is set, in degrees, as a clinician measures it from standing, in the order of the
 * joint coordinate system the hip's angles are given in (Grood and Suntay): the hip bent forward
 * (`flex`), the thigh then swung out to the side (`spread`) and turned out about its own length
 * (`turn`); the knee bent (`knee`); the ankle pointed, the toes away from the shin (`point`), or
 * flexed up the other way.
 */
export interface LegSet {
  readonly flex: number;
  readonly spread: number;
  readonly turn: number;
  readonly knee: number;
  readonly point: number;
}

/** The ways a body's hips face: its right, down along a standing leg, and its front. */
export interface PelvisTurn {
  readonly right: Vector3;
  readonly down: Vector3;
  readonly front: Vector3;
}

/**
 * A leg in three dimensions, in the tent's pixels: the hip, the knee, the ankle, the back of the
 * heel, the ball of the foot and the toes' tip; and the ways the thigh's front (the kneecap's),
 * the shin's front and the sole face, so a drawing knows which side of each part the viewer sees.
 */
export interface Leg {
  readonly hip: Vector3;
  readonly knee: Vector3;
  readonly ankle: Vector3;
  readonly heel: Vector3;
  readonly ball: Vector3;
  readonly toe: Vector3;
  readonly kneecap: Vector3;
  readonly shin: Vector3;
  readonly sole: Vector3;
}

/** A joint's range, in degrees: the least and the most it bends. */
type Range = readonly [least: number, most: number];

/** A leg's lengths, in millimetres: from the hip to the knee and the knee to the ankle, the ankle
 * off the floor, standing; the foot from the back of the heel to the toes' tip, and to the ball of
 * the foot; and the back of the heel behind the ankle. */
export interface LegLengths {
  readonly thigh: number;
  readonly shin: number;
  readonly ankle: number;
  readonly foot: number;
  readonly ball: number;
  readonly heel: number;
}

/**
 * The bones of a man's leg (#285), in millimetres, as ANSUR II measured the US Army's men in
 * 2012: from the hip to the knee and the knee to the ankle, the ankle off the floor, and the foot
 * to the ball and the toes (body.thigh-length, body.shin-length, body.ankle-height,
 * body.foot-length, body.ball-of-foot-length). Set by its joints' angles (`LegSet`), each within
 * the range a healthy man's joint bends (body.hip-flexion, body.hip-extension, body.knee-flexion,
 * body.ankle-dorsiflexion, body.ankle-plantarflexion), it gives the leg's joints in three
 * dimensions at the tent's scale, so a drawing shows it as it's seen and a test holds every pose
 * to its joints.
 */
export class LegBones {
  /** The tent's pixels in a millimetre: 300 to a metre. */
  static readonly SCALE = 0.3;
  /** A median man's leg. */
  static readonly MAN: LegLengths = {
    thigh: 409,
    shin: 419,
    ankle: 73,
    foot: 271,
    ball: 201,
    heel: 52,
  };
  /** Each joint's range, in degrees: the hip's bend back and forward, its swing in and out and
   * its turn in and out; the knee's; the ankle's flex up and point down. */
  static readonly RANGES: Readonly<Record<keyof LegSet, Range>> = {
    flex: [-17, 130],
    spread: [-14, 38],
    turn: [-33, 44],
    knee: [-1, 138],
    point: [-13, 55],
  };
  /** Standing upright, facing the viewer: right across, down the screen, front toward the
   * viewer. */
  static readonly UPRIGHT: PelvisTurn = {
    right: new Vector3(1, 0, 0),
    down: new Vector3(0, 1, 0),
    front: Vector3.OUT,
  };

  constructor(readonly lengths: LegLengths = LegBones.MAN) {}

  /** The leg on `side`, -1 the viewer's left and 1 the right, its hip at `hip`, set as `set`, in
   * hips turned as `pelvis`. */
  posed(side: -1 | 1, hip: Vector3, set: LegSet, pelvis = LegBones.UPRIGHT): Leg {
    const scale = LegBones.SCALE;
    const { thigh, shin: shinLength, ankle: height, foot, ball, heel: behind } = this.lengths;
    const { right } = pelvis;
    // The hip bends forward about the hips' line across, from down toward the front.
    let along = pelvis.down.turned(right, set.flex);
    let front = pelvis.front.turned(right, set.flex);
    // The thigh swings out about the axis square to the hips' line and to itself, the knee away
    // from the middle; the viewer's left leg out to the left.
    const floating = right.cross(along).unit();
    along = along.turned(floating, -side * set.spread);
    front = front.turned(floating, -side * set.spread);
    // It turns out about its own length, the kneecap toward its side.
    front = front
      .turned(along, side * set.turn)
      .across(along)
      .unit();
    const knee = hip.plus(along.times(thigh * scale));
    // The knee bends about its axis across the thigh: the shin back from the kneecap's way.
    const axis = front.cross(along).unit();
    const shinAlong = along.turned(axis, set.knee);
    const shin = front.turned(axis, set.knee);
    const ankle = knee.plus(shinAlong.times(shinLength * scale));
    // The ankle points about the same axis: the toes from the shin's front toward its length.
    const toes = shin.turned(axis, set.point);
    const down = shinAlong.turned(axis, set.point);
    const heel = ankle.plus(down.times(height * scale)).minus(toes.times(behind * scale));
    return {
      hip,
      knee,
      ankle,
      heel,
      ball: heel.plus(toes.times(ball * scale)),
      toe: heel.plus(toes.times(foot * scale)),
      kneecap: front,
      shin,
      sole: down,
    };
  }

  /** The joint `set` bends past its range, if any: what a pose must never ask. */
  beyond(set: LegSet): keyof LegSet | null {
    for (const [joint, [least, most]] of Object.entries(LegBones.RANGES) as [
      keyof LegSet,
      Range,
    ][]) {
      if (set[joint] < least || set[joint] > most) {
        return joint;
      }
    }
    return null;
  }
}
