import { SeededRandom } from "../simulation";

/** How a ladder shakes this frame, as the picture draws it, at a point `along` it, in metres from
 * its start: how far down it goes there, in metres, and how far it rolls over its long axis,
 * in radians, one way or the other. */
export interface Shake {
  drop(along: number): number;
  roll(along: number): number;
}

/** A jerk of a creaking ladder's failing anchor: when it slips, in seconds from the creak's start,
 * how far its end drops, in metres, and which way the ladder rolls with it. */
interface Jerk {
  readonly at: number;
  readonly depth: number;
  readonly turn: 1 | -1;
}

/**
 * How a ladder over a crevasse shakes, as a real one does (#228), for the picture alone: no game
 * state, its jerks drawn from a seed of its own. One creaking before it breaks (#209) doesn't
 * buzz: the anchor at its failing end slips in jerks, a few at uneven times, each dropping that end
 * a little further, sharp, the ladder ringing after each and settling, and trembling all the while,
 * a little rolled with each jerk. One whose twist is on its way (#197) rocks over its long axis, the
 * wave of it running along its lashed sections, most at its middle and none at its anchored ends,
 * harder as the twist comes, and settles once it's come and gone. One just hauled back across
 * bounces once on the lip and settles. Along its length, a shape of the sine: nought at its ends.
 */
export class LadderShake {
  /** A ladder at rest. */
  static readonly STILL: Shake = { drop: () => 0, roll: () => 0 };

  /** The creak's jerks: how many, from when, how far apart on average and how unevenly, in
   * seconds; how far each drops the failing end, in metres, the least and the most; how fast a
   * jerk drops, in seconds; how hard it rings after, in metres, how many times a second and how
   * soon it dies, in seconds; how far it rolls the ladder, in radians, and how soon that dies. */
  private static readonly JERK = {
    count: 6,
    first: 0.15,
    apart: 0.42,
    uneven: 0.6,
    depth: { least: 0.015, most: 0.045 },
    falls: 0.05,
    ring: 0.012,
    hz: 11,
    dies: 0.18,
    roll: 0.12,
    rollDies: 0.35,
    rollHz: 2.4,
  };
  /** The creak's tremble all the while: how far, in metres, and how many times a second. */
  private static readonly TREMBLE = { metres: 0.003, hz: 17 };
  /** The twist's rock: how far it rolls at its height, in radians, how many times a second, how far
   * behind the wave runs along it, in radians from end to end, how far it bobs, in metres; how long
   * it takes to grow, and to settle once it's over, in seconds. */
  private static readonly TWIST = {
    roll: 0.3,
    hz: 1.3,
    lag: 1.4,
    bob: 0.02,
    grows: 1.2,
    settles: 0.6,
  };
  /** The bounce on the lip as it's laid back across: how far, in metres, how many times a second,
   * and how soon it dies, in seconds. */
  private static readonly LANDING = { metres: 0.05, hz: 3.5, dies: 0.3 };

  private readonly jerks: readonly Jerk[];

  /** A ladder `length` metres long, its jerks drawn from `seed`. */
  constructor(
    private readonly length: number,
    seed: number,
  ) {
    const random = SeededRandom.fromSeed(seed);
    const { JERK } = LadderShake;
    const jerks: Jerk[] = [];
    let at = JERK.first;
    for (let index = 0; index < JERK.count; index += 1) {
      const depth = JERK.depth.least + random.fraction() * (JERK.depth.most - JERK.depth.least);
      jerks.push({ at, depth, turn: random.fraction() < 0.5 ? 1 : -1 });
      at += JERK.apart * (1 + JERK.uneven * (2 * random.fraction() - 1));
    }
    this.jerks = jerks;
  }

  /** Creaking, `seconds` since it began, its `free` end the one whose anchor fails: that end
   * drops in jerks, the other holds. */
  creaking(seconds: number, free: "start" | "finish" | null): Shake {
    const { JERK, TREMBLE } = LadderShake;
    let slipped = 0;
    let ring = 0;
    let rolled = 0;
    for (const { at, depth, turn } of this.jerks) {
      if (seconds < at) {
        break;
      }
      const since = seconds - at;
      slipped += depth * LadderShake.smooth(since / JERK.falls);
      ring += JERK.ring * Math.exp(-since / JERK.dies) * Math.sin(2 * Math.PI * JERK.hz * since);
      rolled +=
        turn *
        JERK.roll *
        Math.exp(-since / JERK.rollDies) *
        Math.sin(2 * Math.PI * JERK.rollHz * since);
    }
    return {
      drop: (along) => {
        const share = this.share(along);
        const end = free === "start" ? 1 - share : free === "finish" ? share : 0;
        const tremble = TREMBLE.metres * Math.sin(2 * Math.PI * TREMBLE.hz * seconds + along * 3);
        return slipped * end * end + (ring + tremble) * this.middle(along);
      },
      roll: (along) => rolled * this.middle(along),
    };
  }

  /** Its twist on its way for `seconds`, and over for `over` seconds, nought while it's still on:
   * rocking over its long axis, growing as it comes, settling once it's gone. */
  twisting(seconds: number, over: number): Shake {
    const { TWIST } = LadderShake;
    const height =
      LadderShake.smooth(seconds / TWIST.grows) * (over > 0 ? Math.exp(-over / TWIST.settles) : 1);
    const turn = 2 * Math.PI * TWIST.hz * seconds;
    return {
      drop: (along) => TWIST.bob * height * this.middle(along) * Math.sin(2 * turn),
      roll: (along) =>
        TWIST.roll * height * this.middle(along) * Math.sin(turn - this.share(along) * TWIST.lag),
    };
  }

  /** Laid back across `seconds` ago, once hauled up (#228): a bounce on the lip, dying away. */
  landing(seconds: number): Shake {
    const { LANDING } = LadderShake;
    const bounce =
      LANDING.metres *
      Math.exp(-seconds / LANDING.dies) *
      Math.sin(2 * Math.PI * LANDING.hz * seconds);
    return { drop: (along) => bounce * this.middle(along), roll: () => 0 };
  }

  /** How far along it `along` is, 0 at its start to 1 at its end. */
  private share(along: number): number {
    return Math.min(Math.max(along / (this.length || 1), 0), 1);
  }

  /** The sine's shape along it: 1 at its middle, nought at its ends. */
  private middle(along: number): number {
    return Math.sin(Math.PI * this.share(along));
  }

  private static smooth(share: number): number {
    const t = Math.min(Math.max(share, 0), 1);
    return t * t * (3 - 2 * t);
  }
}
