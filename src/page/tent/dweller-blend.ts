import { DwellerPose } from "./dweller-pose";
import type { Act, DwellerLook, HandLook, Spot } from "./dweller-pose";

/**
 * The person in the tent between one act and the next (#269): when what they do changes, a chore
 * begun or ended, or cut short by a drink, the pose they were in turns into the new act's over a
 * third of a second, so nothing jumps: the lean, the head, the eyes and the hands go from where
 * they were to where the new act has them, while it plays on. What a hand holds, and the rest
 * that's one thing or another, is the new act's at once. Not in or out of the sleeping bag, at
 * the door or turning to the pack, where the acts run on from each other by themselves. What's
 * done aside from a chore, a drink, a bar or a hand in the pack, leaves the stove as it burns.
 * It keeps the pose it last showed, and how the stove last burned.
 */
export class DwellerBlend {
  /** How long a pose takes to turn into the next act's, in seconds. */
  static readonly LASTS = 0.35;
  /** How far apart along the floor two poses can be and still be blended, in pixels. */
  private static readonly NEAR = 30;

  private act: Act | null = null;
  private shown: DwellerLook | null = null;
  private from: DwellerLook | null = null;
  private since = 0;
  private flame = 0;

  /** The look to show for `made`, which `act` has `seconds` after the last frame. */
  next(made: DwellerLook, act: Act, seconds: number): DwellerLook {
    const aside = DwellerPose.ASIDE.includes(act);
    if (!aside) {
      this.flame = made.flame;
    }
    const look = aside && made.flame !== this.flame ? { ...made, flame: this.flame } : made;
    if (act !== this.act) {
      const before = this.shown;
      this.from = before !== null && DwellerBlend.blends(before, look) ? before : null;
      this.since = 0;
      this.act = act;
    } else {
      this.since += Math.max(0, seconds);
    }
    const { from } = this;
    const share = from === null ? 1 : DwellerBlend.ease(this.since / DwellerBlend.LASTS);
    if (from === null || share >= 1) {
      this.from = null;
      this.shown = look;
      return look;
    }
    const mixed = DwellerBlend.mix(from, look, share);
    this.shown = mixed;
    return mixed;
  }

  /** Whether one pose can turn into another: both sitting up in sight, the same way round and
   * in the same place. */
  private static blends(from: DwellerLook, to: DwellerLook): boolean {
    const sitting = (look: DwellerLook): boolean => look.lying === 0 && look.shown >= 1;
    return (
      sitting(from) &&
      sitting(to) &&
      from.turned === to.turned &&
      Math.abs(from.shift - to.shift) < DwellerBlend.NEAR &&
      Math.abs(from.rise - to.rise) < DwellerBlend.NEAR
    );
  }

  private static mix(from: DwellerLook, to: DwellerLook, share: number): DwellerLook {
    const number = (a: number, b: number): number => a + (b - a) * share;
    const spot = (a: Spot, b: Spot): Spot => ({ x: number(a.x, b.x), y: number(a.y, b.y) });
    const hand = (a: HandLook, b: HandLook): HandLook => ({
      ...b,
      at: spot(a.at, b.at),
      ahead: number(a.ahead, b.ahead),
      elbow: {
        x: number(a.elbow.x, b.elbow.x),
        y: number(a.elbow.y, b.elbow.y),
        z: number(a.elbow.z, b.elbow.z),
      },
      // The short way round.
      aim: a.aim + (b.aim - a.aim - 360 * Math.round((b.aim - a.aim) / 360)) * share,
      firm: number(a.firm, b.firm),
    });
    return {
      ...to,
      shift: number(from.shift, to.shift),
      rise: number(from.rise, to.rise),
      lean: number(from.lean, to.lean),
      tilt: number(from.tilt, to.tilt),
      sway: number(from.sway, to.sway),
      hands: [hand(from.hands[0], to.hands[0]), hand(from.hands[1], to.hands[1])],
      mouth: number(from.mouth, to.mouth),
      eyes: number(from.eyes, to.eyes),
      flame: number(from.flame, to.flame),
      tap: number(from.tap, to.tap),
      gaze: spot(from.gaze, to.gaze),
    };
  }

  /** 0 to 1 with an easy start and end. */
  private static ease(share: number): number {
    const t = Math.min(Math.max(share, 0), 1);
    return t * t * (3 - 2 * t);
  }
}
