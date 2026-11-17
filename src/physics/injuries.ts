/** The limb a hard landing hurts: a leg, landing feet first, or an arm, thrown onto steep ice. */
export type InjuryPart = "leg" | "arm";

/** How badly: a sprain, a bone broken under the skin, or one broken through it, which bleeds. */
export type InjuryKind = "sprain" | "fracture" | "open-fracture";

/** An injury a landing left, and what first aid has done for it since: plain data, as saves keep
 * it. */
export type Injury = {
  readonly part: InjuryPart;
  readonly kind: InjuryKind;
  /** The step of the landing that did it. */
  readonly step: number;
  /** Whether a tourniquet is on it: an open fracture bleeds until one is. */
  readonly tourniquet: boolean;
  /** Whether it's immobilised: a fracture splinted, a sprain wrapped. */
  readonly splinted: boolean;
  /** The seconds of first aid given so far on what it's due next. */
  readonly aid: number;
};

/**
 * How a landing injures (#241), handed to the physics with its other numbers: the speeds into the
 * ground, in m/s at life size, from which a landing can sprain, break a bone and break it open,
 * below the one that kills; the chance a climber walks away from one unhurt, at the slowest that
 * hurts and just short of the one that kills, a straight line between; the share of the hurt
 * landings that hurt a leg, coming down on ground they could stand on, feet first, and thrown onto
 * a face of ice; and the share of their stride a sprained leg leaves them, and of their hands'
 * work a sprained arm, until it's wrapped and once it is.
 */
export interface InjurySettings {
  readonly sprain: number;
  readonly fracture: number;
  readonly open: number;
  readonly unhurt: { readonly soft: number; readonly hard: number };
  readonly leg: { readonly flat: number; readonly steep: number };
  readonly sore: number;
  readonly wrapped: number;
}

/** How long each piece of first aid takes a rescuer at a whole stride, in seconds of play: the
 * tourniquet on a limb that bleeds, the splint on a fracture, and the wrap on a sprain. */
export interface AidSeconds {
  readonly tourniquet: number;
  readonly splint: number;
  readonly wrap: number;
}

/** What first aid an injury is due next, and how far it has come, 0 to 1. */
export type AidDue = {
  readonly what: "tourniquet" | "splint" | "wrap";
  readonly part: InjuryPart;
  readonly progress: number;
};

/**
 * A climber's injuries (#241): what their hard landings have left them, a limb at a time, and
 * what first aid has done for each. A landing's speed says how bad it can be, and how they came
 * down, which chance draws once, says whether it hurt at all and which limb took it: feet first
 * on ground they could stand on, mostly a leg; thrown onto a face of ice, mostly an arm. A sprain
 * slows them; a fracture ends their climb where they lie, and they aren't moved until what bleeds
 * has a tourniquet on and what's broken is splinted. Its state is plain data, which a save keeps.
 */
export class Injuries {
  /** How bad each kind is, to keep the worse of two on one limb. */
  private static readonly WORSE: Readonly<Record<InjuryKind, number>> = {
    sprain: 1,
    fracture: 2,
    "open-fracture": 3,
  };

  private list: Injury[];

  constructor(list: readonly Injury[] = []) {
    this.list = [...list];
  }

  /** Every injury they have, in the order they came. */
  get all(): readonly Injury[] {
    return this.list;
  }

  /**
   * A landing at `speed` into the ground, on a face of ice (`steep`) or on ground they could
   * stand on, as `drawn`, a fraction from 0 up to 1, has them come down: unhurt, the likelier the
   * slower it was; or hurt, in a leg or an arm, a sprain below the speed that breaks a bone, a
   * fracture from it and an open one from the speed that breaks it open. The same limb hurt again
   * keeps the worse of the two. A landing slower than any that hurts, or one that kills, hurts
   * nothing here. Returns what it did, or none.
   */
  land(
    speed: number,
    steep: boolean,
    drawn: number,
    step: number,
    settings: InjurySettings,
    lethal: number,
  ): Injury | null {
    if (!(speed >= settings.sprain) || speed >= lethal) {
      return null;
    }
    const { soft, hard } = settings.unhurt;
    const span = lethal - settings.sprain;
    const share = span > 0 ? (speed - settings.sprain) / span : 1;
    const unhurt = soft + (hard - soft) * share;
    if (drawn < unhurt) {
      return null;
    }
    // The rest of the draw says how they came down: the lower of it, on their legs.
    const how = unhurt < 1 ? (drawn - unhurt) / (1 - unhurt) : 0;
    const part: InjuryPart = how < (steep ? settings.leg.steep : settings.leg.flat) ? "leg" : "arm";
    const kind: InjuryKind =
      speed >= settings.open ? "open-fracture" : speed >= settings.fracture ? "fracture" : "sprain";
    const injury: Injury = { part, kind, step, tourniquet: false, splinted: false, aid: 0 };
    const before = this.list.find((had) => had.part === part);
    if (before === undefined) {
      this.list.push(injury);
      return injury;
    }
    if (Injuries.WORSE[kind] <= Injuries.WORSE[before.kind]) {
      return null;
    }
    this.list = this.list.map((had) => (had === before ? injury : had));
    return injury;
  }

  /** Whether a bone is broken: they can't go on, and lie where they are until they're carried. */
  get broken(): boolean {
    return this.list.some(({ kind }) => kind !== "sprain");
  }

  /** Whether an open fracture bleeds still, no tourniquet on it. */
  get bleeding(): boolean {
    return this.list.some(({ kind, tourniquet }) => kind === "open-fracture" && !tourniquet);
  }

  /** Whether they can be moved: nothing bleeds, and every fracture is splinted. */
  get movable(): boolean {
    return (
      !this.bleeding && this.list.every(({ kind, splinted }) => kind === "sprain" || splinted)
    );
  }

  /** The share of their stride their legs leave them: all of it unhurt, less on a sprain, and a
   * little more of it back once it's wrapped. */
  legs(settings: InjurySettings): number {
    return this.share("leg", settings);
  }

  /** The share of their hands' work their arms leave them: on a rope, the tools and a haul. */
  grip(settings: InjurySettings): number {
    return this.share("arm", settings);
  }

  /** Whether an arm is broken: no rope climbed, no pick swung, nobody hauled. */
  get noGrip(): boolean {
    return this.list.some(({ part, kind }) => part === "arm" && kind !== "sprain");
  }

  /** What first aid is due next, the most pressing first: the tourniquet on what bleeds, then
   * the splint on what's broken, then the wrap on a sprain; none once all is done. */
  due(seconds: AidSeconds): AidDue | null {
    const next = this.next();
    if (next === null) {
      return null;
    }
    const what = Injuries.dueOn(next);
    const takes = seconds[what];
    return { what, part: next.part, progress: takes > 0 ? Math.min(1, next.aid / takes) : 1 };
  }

  /** `given` seconds more of first aid on what's due next: once it has had what it takes, the
   * tourniquet is on, or the splint, or the wrap. Whether anything was left to treat. */
  treat(given: number, seconds: AidSeconds): boolean {
    const next = this.next();
    if (next === null) {
      return false;
    }
    const what = Injuries.dueOn(next);
    const aid = next.aid + given;
    const done = aid >= seconds[what] - 1e-9;
    const treated: Injury = !done
      ? { ...next, aid }
      : what === "tourniquet"
        ? { ...next, tourniquet: true, aid: 0 }
        : { ...next, splinted: true, aid: 0 };
    this.list = this.list.map((had) => (had === next ? treated : had));
    return true;
  }

  /** The injury first aid goes to next, or none. */
  private next(): Injury | null {
    const bleeding = this.list.find(
      ({ kind, tourniquet }) => kind === "open-fracture" && !tourniquet,
    );
    const broken = this.list.find(({ kind, splinted }) => kind !== "sprain" && !splinted);
    const sprained = this.list.find(({ kind, splinted }) => kind === "sprain" && !splinted);
    return bleeding ?? broken ?? sprained ?? null;
  }

  private static dueOn(injury: Injury): AidDue["what"] {
    if (injury.kind === "open-fracture" && !injury.tourniquet) {
      return "tourniquet";
    }
    return injury.kind === "sprain" ? "wrap" : "splint";
  }

  private share(part: InjuryPart, settings: InjurySettings): number {
    const hurt = this.list.find((had) => had.part === part);
    if (hurt === undefined) {
      return 1;
    }
    return hurt.splinted ? settings.wrapped : settings.sore;
  }
}
