import type { SherpaView } from "../agents";
import type { ClimberView } from "../physics";
import type { CoachTip } from "./coach";
import type { TextFills, Texts } from "./texts";

/** Pemba's words in content/sherpa.json. */
export type SherpaTextName = keyof (typeof import("../../content/sherpa.json"))["en"];

/** What he can say: each cue's lines are its variants in content/sherpa.json, `<cue>.<n>`. */
export type SherpaCue =
  | "set-off"
  | "first-ladder"
  | "holding"
  | "slow-ladder"
  | "good-crossing"
  | "overtaken"
  | "waiting"
  | "rescue-coming"
  | "pulling"
  | "climb-yourself"
  | "safe"
  | "going-on"
  | "slip-held"
  | "unclipped"
  | "careless"
  | "seracs"
  | "stopped-under-seracs"
  | "crack"
  | "creak"
  | "broken"
  | "crampon"
  | "lamp"
  | "floor"
  | "gust"
  | "twist"
  | "passing"
  | "popcorn"
  | "maze"
  | "football-field"
  | "upper-icefall"
  | "western-cwm"
  | "sun"
  | "fact-ladders"
  | "fact-flow"
  | "fact-2014"
  | "fact-2012"
  | "fact-camp-1"
  | "story-name"
  | "joke-tea"
  | "joke-pack"
  | "joke-crampons"
  | "joke-uncle"
  | "camp-1";

/** What his voice reads of the climb: his agent's view, his climber and the player's, where they
 * are, the part of the route the player is in, the hour, and the coach's tip on the screen, whose
 * warnings are his cues too. The page hands it the agent's, the physics', the clock's and the
 * coach's views (`SherpaClimb`). */
export interface SherpaWorld {
  sherpa(): SherpaView;
  pemba(): ClimberView;
  player(): ClimberView;
  /** How far along the ground the player is, and how far Pemba is. */
  along(): number;
  pembaAlong(): number;
  /** The part of the route the player is in, by its id in the section's file. */
  part(): string | null;
  /** Whether the player is under the seracs: in a serac's zone. */
  underSeracs(): boolean;
  /** Whether first light has come: the peaks light up before the ice warms. */
  firstLight(): boolean;
  /** The time as the HUD's clock writes it. */
  clock(): string;
  /** The coach's tip on the screen now, or none. */
  tip(): CoachTip | null;
}

/** A line he says: its cue, its text's name, its words, and whether it cuts in at once. */
export interface SherpaLine {
  readonly cue: SherpaCue;
  readonly name: SherpaTextName;
  readonly words: string;
  readonly urgent: boolean;
}

/** How soon a cue is said: at once, cutting in; as soon as the line up is read; or in a quiet
 * moment, a place's line, a fact or a story; or a joke, in a quiet moment, a minute apart. */
type When = "now" | "soon" | "quiet" | "joke";

/** A cue waiting to be said: how soon, and until when it still fits, on the voice's seconds. */
type Waiting = { readonly cue: SherpaCue; readonly when: When; readonly until: number };

/**
 * Pemba's voice (#212): a line at a time, two short sentences at most, in a bubble over him, up as
 * long as it takes to read. A warning he says at once, cutting in: careless steps, unclipped by a
 * crevasse, stopped under the seracs, a serac cracking, a ladder creaking, a gust coming and a
 * ladder twisting (#197), a slip the rope held, the player hanging, his haul and his going past
 * them on the rope, the coach's warnings his cues too, though he never names a key: the coach does.
 * What he does himself he says as soon as the line up is read: the first ladder he crosses, the
 * line he holds, a rest, a client who goes ahead. Each part of the route, and the sun
 * on the ice, gets a line once a climb in a quiet moment, and a fact or a story with it, every
 * number from the knowledge base (`SherpaFacts`); a joke comes in a quiet moment too, at most one
 * a minute and never twice. A cue's lines take turns. It holds what's on the screen and what's
 * been said, as the coach does, and nothing of the game's.
 */
export class SherpaVoice {
  /** A line's least and longest time up, in seconds of play, and its reading pace in words a
   * second over a second's glance. */
  private static readonly LEAST = 2.5;
  private static readonly LONGEST = 7;
  private static readonly WORDS_A_SECOND = 2.6;
  private static readonly GLANCE = 1.2;
  /** The quiet before a place's line, a fact or a story, and between jokes, in seconds of play. */
  private static readonly GAP = 6;
  private static readonly JOKE_EVERY = 60;
  /** How long a warning, or what he does, still fits once it's due, in seconds of play; how long
   * before the same one again; and how long the player has to stand on a ladder before he says
   * slow is fine. */
  private static readonly FRESH = 4;
  private static readonly AGAIN = 20;
  private static readonly SLOW_ON_A_LADDER = 10;
  /** How many of the first holds he speaks at, and then one hold in how many. */
  private static readonly FIRST_HOLDS = 3;
  private static readonly EVERY_HOLD = 4;
  /** How near the player Pemba is, in metres along the ground, to say he has them. */
  private static readonly NEAR = 6;
  /** How many good crossings he says so of, at most. */
  private static readonly GOOD_CROSSINGS = 2;
  /** The coach's warnings, as his cues. */
  private static readonly WARNINGS: Partial<Readonly<Record<CoachTip, SherpaCue>>> = {
    unclipped: "unclipped",
    careless: "careless",
    "stopped-under-seracs": "stopped-under-seracs",
    "serac-crack": "crack",
    "ladder-creak": "creak",
    "ladder-broken": "broken",
    "crampon-loose": "crampon",
    lamp: "lamp",
    "crevasse-floor": "floor",
    gust: "gust",
    "ladder-twist": "twist",
  };
  /** What each part of the route makes him say, and the fact or story that follows it there. */
  private static readonly PLACES: Readonly<Record<string, readonly SherpaCue[]>> = {
    popcorn: ["popcorn", "fact-ladders", "story-name"],
    maze: ["maze", "fact-flow"],
    "football-field": ["football-field"],
    "upper-icefall": ["upper-icefall", "fact-2014"],
    "western-cwm": ["western-cwm", "fact-2012", "fact-camp-1"],
  };
  private static readonly JOKES: readonly SherpaCue[] = [
    "joke-tea",
    "joke-pack",
    "joke-crampons",
    "joke-uncle",
  ];
  /** The cues said once a climb. */
  private static readonly ONCE: ReadonlySet<SherpaCue> = new Set<SherpaCue>([
    "set-off",
    "first-ladder",
    "slow-ladder",
    "overtaken",
    "seracs",
    "popcorn",
    "maze",
    "football-field",
    "upper-icefall",
    "western-cwm",
    "sun",
    "fact-ladders",
    "fact-flow",
    "fact-2014",
    "fact-2012",
    "fact-camp-1",
    "story-name",
    ...SherpaVoice.JOKES,
  ]);

  /** Each cue's lines, in their file's order. */
  private readonly lines: ReadonlyMap<SherpaCue, readonly SherpaTextName[]>;
  /** How many times each cue has been said, and when it last was, on the voice's seconds. */
  private readonly said = new Map<SherpaCue, number>();
  private readonly saidAt = new Map<SherpaCue, number>();
  private waiting: Waiting[] = [];
  private shown: SherpaLine | null = null;
  private shownFor = 0;
  private seconds = 0;
  /** The seconds of quiet since the last line went, and since the last joke. */
  private quiet = 0;
  private sinceJoke = 0;
  /** What the last frame showed of the climb, to see what changed. */
  private started = false;
  private before: {
    readonly tip: CoachTip | null;
    readonly sherpa: SherpaView;
    readonly hanging: boolean;
    readonly hauling: boolean;
    readonly falls: number;
    readonly part: string | null;
    readonly seracs: boolean;
    readonly sun: boolean;
    readonly onLadder: string | null;
    readonly pembaOnLadder: boolean;
  } | null = null;
  private holds = 0;
  private onALadderFor = 0;
  /** Whether the player slipped on the ladder Pemba holds, which spoils a good crossing. */
  private slippedOnIt = false;

  constructor(
    private readonly texts: Texts<SherpaTextName>,
    /** The numbers his lines say, from the knowledge base. */
    private readonly fills: TextFills,
  ) {
    const lines = new Map<SherpaCue, SherpaTextName[]>();
    for (const name of texts.names) {
      const dot = name.lastIndexOf(".");
      if (dot < 0) {
        continue;
      }
      const cue = name.slice(0, dot) as SherpaCue;
      lines.set(cue, [...(lines.get(cue) ?? []), name]);
    }
    this.lines = lines;
  }

  /** His name, for the bubble. */
  get name(): string {
    return this.texts.say("name");
  }

  /** The line to show after `seconds` more of the climb, or none. */
  line(world: SherpaWorld, seconds: number): SherpaLine | null {
    this.seconds += seconds;
    this.shownFor += seconds;
    this.sinceJoke += seconds;
    if (this.shown === null) {
      this.quiet += seconds;
    }
    if (world.pemba().dead) {
      this.shown = null;
      this.waiting = [];
      return null;
    }
    this.notice(world, seconds);
    this.waiting = this.waiting.filter(({ until }) => until >= this.seconds);
    const urgent = this.waiting.find(({ when }) => when === "now");
    if (this.shown !== null) {
      const read = this.shownFor >= this.readingTime(this.shown.words);
      if (urgent === undefined || this.shown.urgent) {
        if (!read) {
          return this.shown;
        }
      }
      if (read) {
        this.shown = null;
        this.quiet = 0;
      }
    }
    const next = urgent ?? this.next();
    if (next !== null) {
      this.say(next, world);
    }
    return this.shown;
  }

  /** The line he says when the player reaches the camp the climb was bound for: the arrival's. */
  arrival(): string {
    return this.texts.say(this.variant("camp-1"));
  }

  /** What changed since the last frame, and the cues it brings. */
  private notice(world: SherpaWorld, seconds: number): void {
    const view = world.sherpa();
    const player = world.player();
    const pemba = world.pemba();
    const now = {
      tip: world.tip(),
      sherpa: view,
      hanging: player.hanging,
      hauling: pemba.hauling,
      falls: player.falls.length,
      part: world.part(),
      seracs: world.underSeracs(),
      sun: world.firstLight(),
      onLadder: player.ladder,
      pembaOnLadder: pemba.ladder !== null,
    };
    const before = this.before ?? now;
    if (!this.started) {
      this.started = true;
      this.wait("set-off", "soon");
    }
    const warning = now.tip === null ? undefined : SherpaVoice.WARNINGS[now.tip];
    if (warning !== undefined && now.tip !== before.tip) {
      this.wait(warning, warning === "broken" ? "soon" : "now");
    }
    if (now.seracs && !before.seracs) {
      this.wait("seracs", "soon");
    }
    if (now.hanging && !before.hanging) {
      const near = Math.abs(world.pembaAlong() - world.along()) <= SherpaVoice.NEAR;
      this.wait(near ? "rescue-coming" : "climb-yourself", "now");
    }
    if (now.hauling && !before.hauling) {
      this.wait("pulling", "now");
    }
    if (player.falling && before.onLadder !== null) {
      this.slippedOnIt = true;
    }
    const fall = player.falls.at(-1);
    if (now.falls > before.falls && fall?.held === true && fall.pulled !== true) {
      this.wait("slip-held", "now");
    }
    if (now.pembaOnLadder && !before.pembaOnLadder) {
      this.wait("first-ladder", "soon");
    }
    this.noticeDoing(now.sherpa, before.sherpa);
    this.noticeCrossing(now.onLadder, before.onLadder, before.sherpa.ladder, player, seconds);
    if (now.part !== before.part || this.before === null) {
      for (const cue of SherpaVoice.PLACES[now.part ?? ""] ?? []) {
        this.wait(cue, "quiet", Infinity);
      }
      // A place's lines fit while the player is there.
      this.waiting = this.waiting.filter(
        ({ cue }) =>
          !Object.entries(SherpaVoice.PLACES).some(
            ([part, cues]) => part !== now.part && cues.includes(cue),
          ),
      );
    }
    if (now.sun && !before.sun) {
      this.wait("sun", "quiet", Infinity);
    }
    this.before = now;
  }

  /** What he does now, against the last frame: a rest begun and over, a client who went ahead,
   * one far behind he waits for, and a ladder's line he holds. */
  private noticeDoing(now: SherpaView, was: SherpaView): void {
    const { doing, ladder } = now;
    if (doing === "resting" && was.doing !== "resting") {
      this.wait("safe", "soon");
    }
    if (was.doing === "resting" && doing !== "resting" && doing !== "rescuing") {
      this.wait("going-on", "soon");
    }
    if (doing === "following" && was.doing === "leading") {
      this.wait("overtaken", "soon");
    }
    if (doing === "passing" && was.doing !== "passing") {
      this.wait("passing", "now");
    }
    if (doing === "waiting" && now.client !== null && was.client === null) {
      this.wait("waiting", "soon");
    }
    if (ladder !== null && ladder !== was.ladder) {
      this.holds += 1;
      this.slippedOnIt = false;
      const speaks =
        this.holds <= SherpaVoice.FIRST_HOLDS ||
        (this.holds - SherpaVoice.FIRST_HOLDS) % SherpaVoice.EVERY_HOLD === 0;
      if (speaks) {
        this.wait("holding", "soon");
      }
    }
  }

  /** The player on a ladder: slow on it a while; and off one Pemba held the line of, with no
   * slip on it. */
  private noticeCrossing(
    on: string | null,
    was: string | null,
    held: string | null,
    player: ClimberView,
    seconds: number,
  ): void {
    this.onALadderFor = on === null ? 0 : this.onALadderFor + seconds;
    if (this.onALadderFor >= SherpaVoice.SLOW_ON_A_LADDER && !player.falling) {
      this.wait("slow-ladder", "soon");
    }
    const crossed = was !== null && on === null && !player.falling && was === held;
    if (crossed && !this.slippedOnIt) {
      this.wait("good-crossing", "soon");
    }
  }

  /** Puts a cue up to be said, unless it's been said as often as it may, or too lately. */
  private wait(cue: SherpaCue, when: When, fits = SherpaVoice.FRESH): void {
    const times = this.said.get(cue) ?? 0;
    if (!this.lines.has(cue) || (SherpaVoice.ONCE.has(cue) && times > 0)) {
      return;
    }
    if (cue === "good-crossing" && times >= SherpaVoice.GOOD_CROSSINGS) {
      return;
    }
    const last = this.saidAt.get(cue);
    if (last !== undefined && this.seconds - last < SherpaVoice.AGAIN && when !== "quiet") {
      return;
    }
    if (this.waiting.some((waiting) => waiting.cue === cue)) {
      return;
    }
    this.waiting.push({ cue, when, until: this.seconds + fits });
  }

  /** The next cue to say, now nothing's up: what he does, as soon as can be; a place's line, a
   * fact or a story after a quiet moment; a joke after a quiet minute. */
  private next(): Waiting | null {
    const soon = this.waiting.find(({ when }) => when === "soon");
    if (soon !== undefined) {
      return soon;
    }
    if (this.quiet < SherpaVoice.GAP) {
      return null;
    }
    const quiet = this.waiting.find(({ when }) => when === "quiet");
    if (quiet !== undefined) {
      return quiet;
    }
    const joke = SherpaVoice.JOKES.find((cue) => (this.said.get(cue) ?? 0) === 0);
    if (joke === undefined || this.sinceJoke < SherpaVoice.JOKE_EVERY) {
      return null;
    }
    return { cue: joke, when: "joke", until: this.seconds };
  }

  /** Says a cue's next line now. */
  private say({ cue, when }: Waiting, world: SherpaWorld): void {
    const name = this.variant(cue);
    const times = this.said.get(cue) ?? 0;
    this.said.set(cue, times + 1);
    this.saidAt.set(cue, this.seconds);
    this.waiting = this.waiting.filter((waiting) => waiting.cue !== cue);
    if (when === "joke") {
      this.sinceJoke = 0;
    }
    this.shown = {
      cue,
      name,
      words: this.texts.say(name, { ...this.fills, time: world.clock() }),
      urgent: when === "now",
    };
    this.shownFor = 0;
  }

  /** The cue's line whose turn it is. */
  private variant(cue: SherpaCue): SherpaTextName {
    const lines = this.lines.get(cue) ?? [];
    const times = this.said.get(cue) ?? 0;
    const line = lines[times % Math.max(1, lines.length)];
    if (line === undefined) {
      throw new RangeError(`Pemba has no line for ${cue}`);
    }
    return line;
  }

  /** How long a line stays up: as long as it takes to read, within its least and its longest. */
  private readingTime(words: string): number {
    const count = words.split(/\s+/u).filter((word) => word !== "").length;
    const reading = SherpaVoice.GLANCE + count / SherpaVoice.WORDS_A_SECOND;
    return Math.min(SherpaVoice.LONGEST, Math.max(SherpaVoice.LEAST, reading));
  }
}
