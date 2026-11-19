import { DwellerHands } from "./dweller-hands";
import type { Held } from "./dweller-hands";
import { DwellerPose } from "./dweller-pose";
import type { Act, DwellerLook, HandLook, Point, Spot } from "./dweller-pose";

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
  /** The way an empty hand's back faces where a pose doesn't say (`DwellerPose`'s). */
  private static readonly BACK = DwellerPose.BACK_UP;

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
    const unit = (way: Point): Point => {
      const size = Math.hypot(way.x, way.y, way.z) || 1;
      return { x: way.x / size, y: way.y / size, z: way.z / size };
    };
    const spot = (a: Spot, b: Spot): Spot => ({ x: number(a.x, b.x), y: number(a.y, b.y) });
    const hand = (a: HandLook, b: HandLook): HandLook => {
      const mixed = place(a, b);
      // A hand set for something else lets go of what it held, the first half of the way, and
      // takes up the new act's grip from slack, the second: so it turns from the one to the
      // other only while it's slack, as nothing jumps.
      if (DwellerHands.GRIPS[DwellerBlend.grip(a)] === DwellerHands.GRIPS[DwellerBlend.grip(b)]) {
        return mixed;
      }
      // Letting go, it keeps the old grip's aim and the way its back faces; taking up the new,
      // the new act's aim, which a slack hand doesn't follow yet, and its back turning from the
      // old way to the new.
      if (share < 0.5) {
        const part = 1 - 2 * share;
        return {
          ...mixed,
          ready: DwellerBlend.grip(a),
          firm: a.firm * part,
          shut: DwellerBlend.shut(a) * part,
          aim: a.aim,
          back: a.back ?? DwellerBlend.BACK,
        };
      }
      const part = 2 * share - 1;
      return {
        ...mixed,
        ready: DwellerBlend.grip(b),
        firm: b.firm * part,
        shut: DwellerBlend.shut(b) * part,
        aim: b.aim,
        back: DwellerPose.turning(
          unit(a.back ?? DwellerBlend.BACK),
          unit(b.back ?? DwellerBlend.BACK),
          part,
        ),
      };
    };
    const place = (a: HandLook, b: HandLook): HandLook => ({
      ...b,
      at: spot(a.at, b.at),
      ahead: number(a.ahead, b.ahead),
      // Turned round, not mixed, so the way never shrinks to nothing between two opposite ones.
      elbow: DwellerPose.turning(unit(a.elbow), unit(b.elbow), share),
      // The short way round.
      aim: a.aim + (b.aim - a.aim - 360 * Math.round((b.aim - a.aim) / 360)) * share,
      firm: number(a.firm, b.firm),
      // How far closed and spread, and the way an empty hand's back faces (#274).
      shut: number(DwellerBlend.shut(a), DwellerBlend.shut(b)),
      spread: number(a.spread ?? 0, b.spread ?? 0),
      ...(a.back === undefined && b.back === undefined
        ? {}
        : {
            back: DwellerPose.turning(
              unit(a.back ?? DwellerBlend.BACK),
              unit(b.back ?? DwellerBlend.BACK),
              share,
            ),
          }),
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

  /** What a hand holds, or what it's set for, holding nothing. */
  private static grip(hand: HandLook): Held {
    return hand.holds === "nothing" ? (hand.ready ?? "nothing") : hand.holds;
  }

  /** How far a hand is closed: shut on what it holds, open holding nothing, as a pose has it. */
  private static shut(hand: HandLook): number {
    return hand.shut ?? (hand.holds === "nothing" ? 0 : 1);
  }

  /** 0 to 1 with an easy start and end. */
  private static ease(share: number): number {
    const t = Math.min(Math.max(share, 0), 1);
    return t * t * (3 - 2 * t);
  }
}
