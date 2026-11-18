import type { HandView } from "../simulation";
import type { InHand } from "./climber-pose";

/**
 * A device on its way out of where it's carried, in the hand, and on its way back (#271), from
 * the hand as the `Devices` rule has it: what's in it, what was, and for how long. It comes out
 * over `OUT` seconds and goes back over `AWAY`; changed for another, the first goes back before
 * the next comes out. A climber talks into the radio for `TALK` seconds after a phrase. The
 * picture's own seconds, not the mountain's (docs/guidelines.md); it keeps nothing, so a
 * teammate's hand and a replay's show the same.
 */
export class DeviceHold {
  static readonly OUT = 0.7;
  static readonly AWAY = 0.6;
  static readonly TALK = 1.6;

  /** What the picture shows of a hand: the device, how far out it is, and whether it's talked
   * into; or nothing, with empty hands. */
  static of(hand: HandView): InHand | null {
    const { device, was, seconds, spoke } = hand;
    const { OUT, AWAY, TALK } = DeviceHold;
    if (was !== null && seconds < AWAY) {
      return { kind: was, out: 1 - seconds / AWAY, talking: false };
    }
    if (device === null) {
      return null;
    }
    const since = was === null ? seconds : seconds - AWAY;
    const talking = device === "radio" && spoke !== null && spoke < TALK;
    return { kind: device, out: Math.min(1, since / OUT), talking };
  }
}
