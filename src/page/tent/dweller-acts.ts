import type { DeviceKind } from "../../simulation";
import { DwellerPose } from "./dweller-pose";
import { DEVICE_ACTS } from "./dweller-pose";
import type { Act, DeviceAct } from "./dweller-pose";

/** What the rules say of whoever is in the tent, as the acts read it: the chore in hand and how
 * far through it is, the mountain's second their last sleep here ended at, and the device they
 * have out (#271), which the devices' card shows. */
export interface TentWork {
  readonly chore: "melt" | "cook" | "nap" | "sleep" | "guitar" | null;
  readonly progress: number;
  readonly sleptTo: number | null;
  readonly device: DeviceKind | null;
}

/** What the person is seen doing this frame: the act, and how long they've been at it. */
export interface Acting {
  readonly act: Act;
  readonly seconds: number;
}

/**
 * What the person in the tent is seen doing, frame by frame (#258): they come in on hands and
 * knees; then their chore shows, melting, cooking or playing, or they sit; a drink, a bar and a
 * hand in the pack play once, over a chore too, and go back to it. A chore at the stove is seen
 * in its parts, each begun as the chore gets so far (#269): melting snow, the stove is lit and
 * then the pot stirred and fed; cooking, the stove is lit, the bottle's water poured into the
 * pot, the hands warmed while it boils, the pouch filled from the pot and left to stand, and the
 * meal eaten. For a sleep they lie down
 * first, sleep, and sit up with a stretch when it ends. A sleep the clock skipped, alone, is over
 * in the core before a frame shows it: it's seen by the second their last sleep ended at moving
 * on, and plays as lying down, a moment asleep and waking. On the way out they crawl to the door.
 * A device the card shows (#271) is taken from where it's kept and held, over a chore too, which
 * goes on; a phrase on the radio is talked into it once; and it's put back before another is
 * taken, before a drink, a bar, a hand in the pack or a sleep, and when the card closes.
 * It reads the rules and keeps only what it's showing.
 */
export class DwellerActs {
  /** How long a sleep is seen for at the least, in seconds: a skipped night's whole show. */
  static readonly DREAM = 2.6;
  private static readonly ONCE: readonly Act[] = [
    "enter",
    "leave",
    "drink",
    "bar",
    "pack",
    "lie",
    "wake",
    "radio-talk",
    ...DEVICE_ACTS.flatMap((device): Act[] => [`${device}-out`, `${device}-away`]),
  ];

  /** A chore's parts, and how far through the chore each begins: the mountain's time runs 36
   * times play's, so melting's 12 minutes are 20 seconds of play and cooking's 15 are 25, and
   * each part has the seconds its movement takes (`DwellerPose.LASTS`). */
  static readonly PARTS: Readonly<Record<"melt" | "cook", readonly (readonly [number, Act])[]>> = {
    melt: [
      [0, "light"],
      [0.11, "melt"],
    ],
    cook: [
      [0, "light"],
      [0.09, "pour"],
      [0.29, "boil"],
      [0.43, "fill"],
      [0.65, "steep"],
      [0.74, "eat"],
    ],
  };

  private act: Act = "enter";
  private seconds = 0;
  /** Whether they're in the bag; the acts to play once after this one; the last sleep seen
   * ending; and whether they're on their way out. */
  private lying = false;
  private readonly next: Act[] = [];
  private sleptTo: number | null;
  private leaving = false;
  /** The device in the hand, once it's out and until it's back (#271); and whether a phrase
   * waits to be said into the radio. */
  private held: DeviceAct | null = null;
  private toSay = false;

  /** `sleptTo` is the second their last sleep here ended at as they come in: nothing to show. */
  constructor(sleptTo: number | null = null) {
    this.sleptTo = sleptTo;
  }

  /** Whether they're asleep or on the way into or out of the bag: nothing else begins then. */
  get asleep(): boolean {
    return this.lying || this.act === "lie" || this.next.includes("lie");
  }

  /** The device they have in the hand, from when it's out of where it's kept until it's back
   * there (#271). */
  get holding(): DeviceAct | null {
    return this.held;
  }

  /** Whether the way out has been shown to its end. */
  get gone(): boolean {
    return this.leaving && this.act === "leave" && this.seconds >= DwellerActs.length("leave");
  }

  /** Plays a drink, a bar or a hand in the pack once, sitting up and at the end of what plays
   * once now; nothing while asleep or leaving. */
  play(act: "drink" | "bar" | "pack"): void {
    if (this.asleep || this.leaving || this.next.includes(act) || this.act === act) {
      return;
    }
    this.next.push(act);
  }

  /** A phrase is said on the radio (#271): they talk into it once, as soon as it's in the hand. */
  talk(): void {
    this.toSay = true;
  }

  /** They're leaving: to the door, from wherever they are, with nothing in the hand. */
  leave(): void {
    if (!this.leaving) {
      this.leaving = true;
      this.next.length = 0;
      this.held = null;
      this.toSay = false;
      this.begin("leave");
    }
  }

  /** The act `seconds` after the last frame, the tent's rule as `work` has it. */
  advance(seconds: number, work: TentWork): Acting {
    this.seconds += Math.max(0, seconds);
    if (!this.leaving) {
      this.follow(work);
    }
    return { act: this.act, seconds: this.seconds };
  }

  private follow(work: TentWork): void {
    const sleeping = work.chore === "nap" || work.chore === "sleep";
    const slept = work.sleptTo !== this.sleptTo && work.sleptTo !== null;
    this.sleptTo = work.sleptTo;
    // A sleep that began, or one the clock skipped whole: into the bag first.
    if ((sleeping || slept) && !this.asleep) {
      this.next.length = 0;
      this.next.push("lie", "sleep");
    }
    const once = DwellerActs.ONCE.includes(this.act);
    if (once && this.seconds < DwellerActs.length(this.act)) {
      return;
    }
    if (this.act === "lie") {
      this.lying = true;
    } else if (this.act === "wake") {
      this.lying = false;
    } else if (DwellerActs.away(this.act)) {
      this.held = null;
    } else if (this.act.endsWith("-out")) {
      this.held = this.act.slice(0, -"-out".length) as DeviceAct;
    }
    // A device goes back before anything else is taken up, or another device (#271).
    const wanted =
      work.device === null || this.asleep ? null : DwellerPose.DEVICES[work.device];
    const held = this.held;
    if (held !== null && (this.next.length > 0 || held !== wanted)) {
      this.toSay = this.toSay && wanted === "radio";
      this.begin(`${held}-away`);
      return;
    }
    const queued = this.next.shift();
    if (queued !== undefined) {
      this.begin(queued);
      return;
    }
    if (this.lying) {
      // Asleep until the chore ends, and for a moment at the least; then up.
      if (!sleeping && (this.act !== "sleep" || this.seconds >= DwellerActs.DREAM)) {
        this.begin("wake");
      } else if (this.act !== "sleep") {
        this.begin("sleep");
      }
      return;
    }
    if (wanted !== null && held === null) {
      this.begin(`${wanted}-out`);
      return;
    }
    if (held !== null) {
      // A phrase waits for the radio: said once, it's listened to again.
      const say = this.toSay && held === "radio";
      this.toSay = false;
      if (say) {
        this.begin("radio-talk");
      } else if (this.act !== held) {
        this.begin(held);
      }
      return;
    }
    this.toSay = false;
    const steady = DwellerActs.steady(work);
    if (this.act !== steady) {
      this.begin(steady);
    }
  }

  /** Whether an act is a device going back where it's kept. */
  private static away(act: Act): boolean {
    return act.endsWith("-away");
  }

  /** What they're at while nothing plays once: the part of the chore it has got to, the guitar,
   * or sitting. */
  private static steady(work: TentWork): Act {
    if (work.chore === "guitar") {
      return "guitar";
    }
    if (work.chore !== "melt" && work.chore !== "cook") {
      return "idle";
    }
    let part: Act = "idle";
    for (const [from, act] of DwellerActs.PARTS[work.chore]) {
      if (work.progress >= from) {
        part = act;
      }
    }
    return part;
  }

  private begin(act: Act): void {
    this.act = act;
    this.seconds = 0;
  }

  private static length(act: Act): number {
    return DwellerPose.ONCE[act] ?? 0;
  }
}
