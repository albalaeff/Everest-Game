import { FrontShapes } from "../../rendering/front-shapes";
import { Vector3 } from "./hand-bones";
import { LegBones } from "./leg-bones";
import type { Leg, LegSet, PelvisTurn } from "./leg-bones";

/**
 * The tent person's legs in three dimensions (#285), from the hips, in the tent's pixels: y down,
 * z toward the viewer. Sitting on the mat, crossed as a man in a down suit sits within his joints'
 * ranges: the pelvis rolled back, the knees up and out, each ankle on the mat under the other
 * thigh, the shin of the leg on the viewer's right in front of the other's. Kneeling as they crawl
 * in and out: the hips turned toward the door and the body leaning onto the hands, the knees on
 * the mat and the shins trailing behind, the toes pointed. Between the two as they lean forward
 * to crawl, every joint's angle and the hips' turn eased from one to the other, so a leg never
 * jumps and never bends past its range.
 */
export class DwellerLegs {
  /** The hips' half-width, the slope's front figure's. */
  static readonly HIP = FrontShapes.LEGS.hip * 300;
  /** Sitting: the pelvis rolled back, and each leg's set, the viewer's left first. */
  static readonly ROLLED = 30;
  static readonly SITTING: readonly [LegSet, LegSet] = [
    { flex: 90, spread: 30, turn: 44, knee: 138, point: -5 },
    { flex: 90, spread: 30, turn: 44, knee: 120, point: 7 },
  ];
  /** Kneeling: the hips turned toward the door and leaning toward the hands as far as the body
   * does (`DwellerPose`'s crawl), the thighs upright under them, the knees on the mat, the shins
   * back along it and the toes pointed. */
  static readonly YAW = -70;
  static readonly LEAN = 62;
  static readonly KNEELING: readonly [LegSet, LegSet] = [
    { flex: 62, spread: 0, turn: 0, knee: 90, point: 50 },
    { flex: 62, spread: 0, turn: 0, knee: 90, point: 50 },
  ];

  private readonly bones = new LegBones();

  /** The legs `under` of the way from sitting to kneeling, the viewer's left first. */
  legs(under: number): readonly [Leg, Leg] {
    const share = Math.min(1, Math.max(0, under));
    const pelvis = DwellerLegs.pelvis(share);
    const leg = (side: 0 | 1): Leg => {
      const sign = side === 0 ? -1 : 1;
      const set = DwellerLegs.mix(DwellerLegs.SITTING[side], DwellerLegs.KNEELING[side], share);
      return this.bones.posed(sign, pelvis.right.times(sign * DwellerLegs.HIP), set, pelvis);
    };
    return [leg(0), leg(1)];
  }

  /** The joint `sets` bend past their range at `under`, if any: none, for a pose of these. */
  beyond(under: number): keyof LegSet | null {
    const share = Math.min(1, Math.max(0, under));
    for (const side of [0, 1] as const) {
      const set = DwellerLegs.mix(DwellerLegs.SITTING[side], DwellerLegs.KNEELING[side], share);
      const joint = this.bones.beyond(set);
      if (joint !== null) {
        return joint;
      }
    }
    return null;
  }

  /** The hips' turn `share` of the way from sitting, rolled back, to kneeling: turned toward the
   * door about the vertical, then leaning toward it about the hips' line. */
  private static pelvis(share: number): PelvisTurn {
    const up = new Vector3(0, 1, 0);
    const yaw = DwellerLegs.YAW * share;
    const pitch = DwellerLegs.ROLLED * (1 - share) - DwellerLegs.LEAN * share;
    const right = new Vector3(1, 0, 0).turned(up, yaw);
    return {
      right,
      down: up.turned(right, pitch),
      front: Vector3.OUT.turned(up, yaw).turned(right, pitch),
    };
  }

  private static mix(from: LegSet, to: LegSet, share: number): LegSet {
    const at = (a: number, b: number): number => a + (b - a) * share;
    return {
      flex: at(from.flex, to.flex),
      spread: at(from.spread, to.spread),
      turn: at(from.turn, to.turn),
      knee: at(from.knee, to.knee),
      point: at(from.point, to.point),
    };
  }
}
