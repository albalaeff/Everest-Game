import type { ClimberView, LadderCondition, Point } from "../physics";
import type { HazardKind, HazardZone, JoltKind } from "../simulation";

/** What the coach can say: the tutorial's tips, each said once where the route first needs it,
 * and the warnings, said whenever they matter. */
export type CoachTip =
  | "walk"
  | "clip"
  | "anchor"
  | "jumar"
  | "ladder-up"
  | "ladder-down"
  | "crossing"
  | "ice"
  | "seracs"
  | "hanging"
  | "hanging-carabiner"
  | "hanging-no-jumar"
  | "crevasse-floor"
  | "pick-poor"
  | "ice-wall"
  | "on-ice"
  | "ice-down"
  | "rappel"
  | "careless"
  | "unclipped"
  | "stopped-under-seracs"
  | "crampon-loose"
  | "lamp"
  | "serac-crack"
  | "ladder-creak"
  | "ladder-broken"
  | "haul"
  | "gust"
  | "ladder-twist"
  | "passing"
  | "ladder-bounced"
  | "front-points";

/** What the coach reads of the climb: the player's climber, the route's ropes, ladders, blue ice
 * and hazards, and whether the player is in the dark. The page hands it the physics', the
 * hazards' and the lamps' views of them. */
export interface CoachWorld {
  player(): ClimberView;
  /** Whether the player's headlamp has died before first light (#196). */
  inTheDark(): boolean;
  /** The hazard going over where the player stands, a crack or a roar, or none (#209). */
  warning(): HazardKind | null;
  /** The jolt on its way to the player, a gust or their lashed ladder twisting, or none (#197). */
  jolt(): JoltKind | null;
  /** Whether someone is coming past the player on their rope (#197). */
  passing(): boolean;
  /** Whether a ladder is whole, creaking or broken (#209). */
  ladderCondition(id: string): LadderCondition;
  /** Whether someone else hangs on the rope (#209), for the player to pull out. */
  partnerHangs(): boolean;
  /** How far along the ground the player is. */
  along(): number;
  /** The wall of ice with no ladder the player stands at: at its foot, to climb on their tools;
   * at its lip, to climb down, or to lower themselves down the fixed rope that runs down it
   * (`rope`); or none. */
  iceWall(): "foot" | "lip" | "rope" | null;
  /** Whether the player is on ground nobody walks out of: a ledge down a crevasse, or its foot. */
  inADeadEnd(): boolean;
  /** The rope a clip of the player's would take now, or none. */
  ropeWithin(): string | null;
  readonly ropes: readonly string[];
  rope(id: string): readonly Point[];
  readonly ladders: readonly string[];
  ladder(id: string): readonly Point[];
  readonly ice: readonly { readonly from: number; readonly to: number }[];
  readonly zones: readonly HazardZone[];
}

/** Where the coach keeps what's been learnt: the device's storage, or none. */
export interface CoachStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * The coach (#192): a tip at a time, the one that matters most where the player is, by what they
 * do, never by a clock of its own (docs/guidelines/usability.md → Teaching: one thing at a time,
 * where it's needed, then watched). The tutorial teaches each control where the route first needs
 * it, the walk at the start, the clip at the first rope, the changeover at the first anchor, the
 * ladders, the crossings and the ice, and lets it go once the player has done it, which the
 * device keeps, and the same for the ice tools: the first pick at a wall of ice with no ladder,
 * the next ones on it, and the step down onto one from its lip; and the rope down one, where the
 * fixed rope runs down it. The warnings come whenever they
 * matter: hanging on the rope, with what gets them out of it (the jumar on the rope, the jumar
 * to clip on, or the tools), down in a crevasse off the rope, a pick that bites poorly, careless steps on
 * blue ice or a ladder (#208), unclipped where a slip is a fall, stopped under the seracs, a crampon come loose and the
 * headlamp dead in the dark, a check skipped before setting off catching up with the player
 * (#196), and the training events (#209): a serac cracking ahead, the ladder creaking under them,
 * a partner hanging to pull out; and a ladder fallen into its crevasse, to haul back up with a
 * partner (#228); and what jolts them (#197): a gust
 * coming, their lashed ladder twisting, someone passing them on their rope, their ladder bouncing
 * under someone else's steps, and a stand on the front points held too long. It holds the
 * screen's own state alone, as the rendering does: what's been learnt, and what it shows.
 */
export class Coach {
  /** Where the device keeps what's been learnt. */
  static readonly KEY = "everest.coach";
  /** How long a tip stays up at the least, so it can be read, unless a warning comes. */
  static readonly LEAST_SECONDS = 3;
  /** How long a climber may stand still under the seracs before the coach says so. */
  static readonly STOPPED_SECONDS = 4;
  /** How long the coach says the headlamp has died, once the dark comes. */
  static readonly DARK_SECONDS = 6;
  /** How long a player stands still on their front points before the coach says so: longer than
   * the pause before each pick (#197). */
  static readonly STANCE_SECONDS = 2;
  /** How far a climber walks before the walk is learnt; how near a ladder's end, an anchor and
   * the ice ahead have to be for their tips; how far from a crevasse's ladder an unclipped
   * climber is warned; and the chance a metre of slipping past which their steps are careless. */
  private static readonly WALKED = 3;
  private static readonly NEAR_LADDER = 1.5;
  private static readonly NEAR_ANCHOR = 1.2;
  private static readonly ICE_AHEAD = 5;
  private static readonly BY_A_CREVASSE = 3;
  private static readonly CARELESS = 0.025;
  /** The tips, most pressing first: the warnings, then the tutorial in the route's order. */
  private static readonly ORDER: readonly CoachTip[] = [
    "hanging",
    "hanging-carabiner",
    "hanging-no-jumar",
    "crevasse-floor",
    "pick-poor",
    "serac-crack",
    "ladder-creak",
    "ladder-twist",
    "gust",
    "haul",
    "passing",
    "stopped-under-seracs",
    "unclipped",
    "ladder-bounced",
    "front-points",
    "careless",
    "crampon-loose",
    "lamp",
    "ladder-broken",
    "on-ice",
    "ice-wall",
    "ice-down",
    "rappel",
    "anchor",
    "clip",
    "jumar",
    "crossing",
    "ladder-up",
    "ladder-down",
    "ice",
    "seracs",
    "walk",
  ];
  private static readonly WARNINGS: ReadonlySet<CoachTip> = new Set([
    "hanging",
    "hanging-carabiner",
    "hanging-no-jumar",
    "crevasse-floor",
    "pick-poor",
    "serac-crack",
    "ladder-creak",
    "ladder-twist",
    "gust",
    "haul",
    "passing",
    "stopped-under-seracs",
    "unclipped",
    "ladder-bounced",
    "front-points",
    "careless",
    "crampon-loose",
    "lamp",
  ]);

  private readonly done: Set<CoachTip>;
  private shown: CoachTip | null = null;
  private shownFor = 0;
  /** Where the player stood when the coach first saw them, for the walk. */
  private start: number | null = null;
  /** The rope whose end the changeover was shown at; the ice the player has been on. */
  private anchorRope: string | null = null;
  private onIce = false;
  /** Whether the player was on their tools last frame; and the wall of ice with no ladder they
   * stood at last on their feet, which says how they got onto the ice. */
  private onTools = false;
  private wallBefore: "foot" | "lip" | "rope" | null = null;
  /** How long the player has stood still under the seracs, been in the dark, and stood still on
   * their front points, nothing holding them. */
  private still = 0;
  private dark = 0;
  private stance = 0;

  constructor(private readonly storage: CoachStorage | null) {
    this.done = new Set(Coach.kept(storage));
  }

  /** Whether a tip is a warning, said whenever it matters, and not one of the tutorial's. */
  static isWarning(tip: CoachTip): boolean {
    return Coach.WARNINGS.has(tip);
  }

  /** The tip to show after `seconds` more of the climb, or none. */
  tip(world: CoachWorld, seconds: number): CoachTip | null {
    this.shownFor += seconds;
    const view = world.player();
    if (view.dead) {
      this.shown = null;
      return null;
    }
    const along = world.along();
    this.start ??= along;
    this.watch(world, view, along, seconds);
    const wanted = Coach.ORDER.find((tip) => this.wants(tip, world, view, along)) ?? null;
    const held =
      this.shown !== null &&
      wanted !== this.shown &&
      this.shownFor < Coach.LEAST_SECONDS &&
      !(wanted !== null && Coach.WARNINGS.has(wanted));
    if (held) {
      return this.shown;
    }
    if (wanted !== this.shown) {
      this.shown = wanted;
      this.shownFor = 0;
    }
    if (wanted !== null && wanted === this.shown && wanted === "seracs") {
      this.learn("seracs");
    }
    return this.shown;
  }

  /** What the player did since the last frame: each tutorial tip whose job is done is learnt. */
  private watch(world: CoachWorld, view: ClimberView, along: number, seconds: number): void {
    if (Math.abs(along - (this.start ?? along)) >= Coach.WALKED) {
      this.learn("walk");
    }
    if (view.first !== null || view.second !== null) {
      this.learn("clip");
    }
    if (view.first !== null && view.jumarHeld) {
      this.learn("jumar");
    }
    const anchorRope = this.anchorRope;
    if (
      anchorRope !== null &&
      [view.first, view.second].some((rope) => rope !== null && rope !== anchorRope)
    ) {
      this.learn("anchor");
    }
    if (view.ladder !== null) {
      const kind = this.kindOf(world, view.ladder);
      this.learn(kind === "across" ? "crossing" : kind === "up" ? "ladder-up" : "ladder-down");
    }
    if (view.onIce) {
      // Onto the ice from its lip, they've stepped down onto it; from anywhere else, climbed it.
      this.learn(this.wallBefore === "lip" || this.wallBefore === "rope" ? "ice-down" : "ice-wall");
    }
    if (view.lowering) {
      this.learn("rappel");
    }
    if (!view.onIce && !view.lowering) {
      this.wallBefore = world.iceWall();
    }
    // Off the ice on their feet, not in a fall: they've climbed it.
    if (this.onTools && !view.onIce && !view.falling) {
      this.learn("on-ice");
    }
    this.onTools = view.onIce;
    const iceNow = world.ice.some(({ from, to }) => along >= from && along <= to);
    if (this.onIce && !iceNow) {
      this.learn("ice");
    }
    this.onIce = iceNow;
    const underSeracs = this.inZone(world, along, "serac");
    this.still = underSeracs && !view.moving && !view.falling ? this.still + seconds : 0;
    this.dark = world.inTheDark() ? this.dark + seconds : 0;
    const hard = view.stillChance > 0 && view.ladder === null && !view.falling;
    this.stance = hard ? this.stance + seconds : 0;
  }

  /** Whether a tip is wanted where the player is now. */
  private wants(tip: CoachTip, world: CoachWorld, view: ClimberView, along: number): boolean {
    if (!Coach.WARNINGS.has(tip) && this.done.has(tip)) {
      return false;
    }
    const clipped = view.first !== null || view.second !== null;
    switch (tip) {
      case "hanging":
        return view.hanging && view.first !== null && view.gear.jumar;
      case "hanging-carabiner":
        return view.hanging && view.first === null && view.gear.jumar;
      case "hanging-no-jumar":
        return view.hanging && !view.gear.jumar;
      case "crevasse-floor":
        return !view.falling && !view.onIce && world.inADeadEnd();
      case "pick-poor":
        return view.onIce && view.pickPoor;
      case "on-ice":
        return view.onIce;
      case "ice-wall":
        return !view.falling && !view.onIce && world.iceWall() === "foot";
      case "ice-down":
        return !view.falling && !view.onIce && !view.lowering && world.iceWall() === "lip";
      case "rappel":
        return !view.falling && !view.onIce && !view.lowering && world.iceWall() === "rope";
      case "stopped-under-seracs":
        return this.still >= Coach.STOPPED_SECONDS;
      case "unclipped":
        return (
          !clipped &&
          !view.falling &&
          world.ropeWithin() !== null &&
          this.byACrevasse(world, view, along)
        );
      case "careless":
        return (
          view.moving &&
          !view.falling &&
          view.slipChance >= Coach.CARELESS &&
          (view.ladder !== null || world.ice.some(({ from, to }) => along >= from && along <= to))
        );
      case "crampon-loose":
        return view.cramponLoose && !view.refitting && !view.falling;
      case "lamp":
        return world.inTheDark() && this.dark < Coach.DARK_SECONDS;
      case "serac-crack":
        return !view.falling && world.warning() === "serac";
      case "ladder-creak":
        return view.ladder !== null && world.ladderCondition(view.ladder) === "creaking";
      case "ladder-twist":
        return view.ladder !== null && !view.falling && world.jolt() === "twist";
      case "gust":
        return !view.falling && world.jolt() === "gust";
      case "passing":
        return !view.falling && world.passing();
      case "ladder-bounced":
        return view.ladder !== null && !view.falling && view.stillChance > 0;
      case "front-points":
        return this.stance >= Coach.STANCE_SECONDS;
      case "haul":
        return !view.falling && !view.hauling && world.partnerHangs();
      case "ladder-broken":
        return !view.falling && this.byABrokenLadder(world, view);
      case "anchor":
        return !view.falling && this.atAnAnchor(world, view);
      case "clip":
        return !clipped && !view.falling && world.ropeWithin() !== null;
      case "jumar":
        return view.first !== null && !view.jumarHeld && !view.moving && view.walking !== "stop";
      case "crossing":
        return this.atLadder(world, view, "across");
      case "ladder-up":
        return this.atLadder(world, view, "up");
      case "ladder-down":
        return this.atLadder(world, view, "down");
      case "ice":
        return world.ice.some(({ from, to }) => along < to && along >= from - Coach.ICE_AHEAD);
      case "seracs":
        return this.inZone(world, along, "serac");
      case "walk":
        return Math.abs(along - (this.start ?? along)) < Coach.WALKED;
    }
  }

  /** Whether the player stands at a rope's end where the next one begins, clipped to the first:
   * the changeover's place. The rope is kept, so the tip goes once they're on the next one. */
  private atAnAnchor(world: CoachWorld, view: ClimberView): boolean {
    for (const id of [view.first, view.second]) {
      if (id === null) {
        continue;
      }
      const shape = world.rope(id);
      const end = shape.at(-1);
      if (end === undefined || Math.hypot(end.x - view.x, end.y - view.y) > Coach.NEAR_ANCHOR) {
        continue;
      }
      const next = world.ropes.some((other) => {
        const start = world.rope(other)[0];
        return (
          other !== id && start !== undefined && Math.hypot(start.x - end.x, start.y - end.y) < 0.1
        );
      });
      if (next) {
        this.anchorRope = id;
        return true;
      }
    }
    return false;
  }

  /** Whether the player stands at the end of a ladder of `kind` they'd go onto: a crossing's
   * either end, a wall's foot to go up it, and its top to go down. */
  private atLadder(world: CoachWorld, view: ClimberView, kind: "across" | "up" | "down"): boolean {
    if (view.ladder !== null || view.falling) {
      return false;
    }
    return world.ladders.some((id) => {
      const [start, end] = world.ladder(id);
      if (start === undefined || end === undefined || this.kindOf(world, id) !== kind) {
        return false;
      }
      const near = (point: Point): boolean =>
        Math.hypot(point.x - view.x, point.y - view.y) <= Coach.NEAR_LADDER;
      // A ladder's `from` end is its first point: the foot of one up a wall, the top of one down.
      return kind === "across" ? near(start) || near(end) : near(start);
    });
  }

  /** Whether an unclipped climber is where a slip is a fall: on blue ice, or by a crevasse's
   * ladder. */
  private byACrevasse(world: CoachWorld, view: ClimberView, along: number): boolean {
    if (world.ice.some(({ from, to }) => along >= from && along <= to)) {
      return true;
    }
    return world.ladders.some((id) => {
      const [start, end] = world.ladder(id);
      if (start === undefined || end === undefined || this.kindOf(world, id) !== "across") {
        return false;
      }
      const near = (point: Point): boolean =>
        Math.hypot(point.x - view.x, point.y - view.y) <= Coach.BY_A_CREVASSE;
      return view.ladder === id || near(start) || near(end);
    });
  }

  /** Whether the player stands at an end of a ladder that's broken, to haul back up (#228). */
  private byABrokenLadder(world: CoachWorld, view: ClimberView): boolean {
    return world.ladders.some((id) => {
      if (world.ladderCondition(id) !== "broken") {
        return false;
      }
      const near = (point: Point | undefined): boolean =>
        point !== undefined && Math.hypot(point.x - view.x, point.y - view.y) <= Coach.NEAR_LADDER;
      const [start, end] = world.ladder(id);
      return near(start) || near(end);
    });
  }

  /** Whether `along` is in a hazard zone of `kind`. */
  private inZone(world: CoachWorld, along: number, kind: HazardZone["kind"]): boolean {
    return world.zones.some((zone) => zone.kind === kind && along >= zone.from && along <= zone.to);
  }

  /** A ladder across a crevasse, up a wall or down one. */
  private kindOf(world: CoachWorld, id: string): "across" | "up" | "down" {
    const [start, end] = world.ladder(id);
    if (start === undefined || end === undefined) {
      return "across";
    }
    const rise = end.y - start.y;
    if (Math.abs(rise) < Math.abs(end.x - start.x)) {
      return "across";
    }
    return rise > 0 ? "up" : "down";
  }

  /** Learns a tutorial tip, on the device too. */
  private learn(tip: CoachTip): void {
    if (this.done.has(tip)) {
      return;
    }
    this.done.add(tip);
    try {
      this.storage?.setItem(Coach.KEY, JSON.stringify([...this.done]));
    } catch {
      // A device that refuses to keep it teaches it again next time.
    }
  }

  /** The tips the device has kept as learnt. */
  private static kept(storage: CoachStorage | null): CoachTip[] {
    try {
      const kept: unknown = JSON.parse(storage?.getItem(Coach.KEY) ?? "[]");
      return Array.isArray(kept)
        ? kept.filter((tip): tip is CoachTip => Coach.ORDER.includes(tip as CoachTip))
        : [];
    } catch {
      return [];
    }
  }
}
