import type { Joint } from "./climber-pose";

/** Which ice tool: the ice axe every climber carries, or the technical tool a second pick is. */
export type ToolKind = "axe" | "tool";

/** A pick in the ice as the figure reads it: which swing put it there, a number that goes up with
 * each, where its point is, and the way into the ice there, a length of 1, from the climber's
 * point in the figure's metres. */
export interface PickIn {
  readonly swing: number;
  readonly at: Joint;
  readonly into: Joint;
}

/** What the tools are told of the climber each frame: their picks in the ice, the one they hang
 * from first; whether it bites poorly; how many tools they carry; whether they're upright, on
 * their feet or on the ice, rather than falling or dead; and whether the hands are free to keep a
 * tool, not needed on a ladder's lines or rungs. */
export interface ToolsState {
  readonly picks: readonly PickIn[];
  readonly poor: boolean;
  readonly carried: number;
  readonly upright: boolean;
  readonly free: boolean;
}

/** The figure the tools are placed on this frame, in its frame: the shoulder each arm hangs from,
 * the near one first, the pelvis and the spine's lean, which the pack hangs from, how far an arm
 * reaches, where each hand would be with no tool in it, and how a point or a way from the
 * climber's point is turned into the figure's frame. */
export interface ToolBody {
  readonly roots: readonly [Joint, Joint];
  readonly pelvis: Joint;
  readonly lean: number;
  readonly reach: number;
  readonly hands: readonly [Joint, Joint];
  readonly inside: (point: Joint) => Joint;
  readonly turned: (way: Joint) => Joint;
}

/** An ice tool as it's drawn: which, where its grip is, the point of the shaft a hand closes
 * round, and the way its shaft points from there to its head, in radians from the way they face;
 * and the hand it's in, the near one 0 or the far one 1, or none, strapped to the pack. */
export interface DrawnTool {
  readonly kind: ToolKind;
  readonly grip: Joint;
  readonly angle: number;
  readonly hand: 0 | 1 | null;
}

/** A pick going into the ice this frame: where, the way into the ice, in the figure's frame, and
 * whether it bites poorly, which shatters more of the ice. */
export interface Strike {
  readonly at: Joint;
  readonly into: Joint;
  readonly poor: boolean;
}

/** The tools this frame: each one carried, where each hand holds its tool, or none, and the picks
 * that went in; and how far beyond its arm's reach, below its shoulder, the grip of a tool in the
 * ice is, at most, which the climber sinks towards: below 0, how far within it. */
export interface HeldTools {
  readonly tools: readonly DrawnTool[];
  readonly hands: readonly [Joint | null, Joint | null];
  readonly strikes: readonly Strike[];
  readonly short: number;
}

/** What a tool's moves go through: the hand up and back over the shoulder to the pack for it, the
 * tool drawn off it; levered and pulled out of the ice; cocked behind the head, struck in, biting
 * and taking the weight; carried in the hand; lifted back over the shoulder, strapped on, and let
 * go of. */
type Phase =
  | "raise"
  | "reach"
  | "draw"
  | "lever"
  | "pull"
  | "cock"
  | "strike"
  | "bite"
  | "settle"
  | "carry"
  | "lift"
  | "stow"
  | "let-go";

/** A phase of a move, and how long it takes. */
interface Step {
  readonly phase: Phase;
  readonly seconds: number;
}

/** Where a tool is: strapped to the pack, in the hand, or in the ice. */
type Where = "pack" | "hand" | "ice";

/** A tool's place as its moves key it: its grip, where the hand holds it, from the shoulder the
 * arm hangs from, and the way its shaft points. */
interface Key {
  readonly hand: Joint;
  readonly angle: number;
}

/** A move under way: its steps, how long it has run, the key it began from, where the tool ends
 * up, and the pick it comes out of, if any. */
interface Move {
  readonly steps: readonly Step[];
  time: number;
  start: Key | null;
  readonly ends: Where;
  readonly leaving: PickIn | null;
}

/** A tool this frame, as the pair gathers it: drawn, where its hand is, the pick it struck in, and
 * how far beyond the arm's reach its grip is in the ice below the shoulder, if it's in. */
interface Placed {
  readonly drawn: DrawnTool;
  readonly hand: Joint | null;
  readonly strike: Strike | null;
  readonly short: number | null;
}

/**
 * One of a climber's ice tools, as the picture moves it: strapped head down to the pack, drawn off
 * it over the shoulder, swung into the ice, levered out of it, carried, and strapped on again. It
 * stays in one hand, the axe in the near one and a second tool in the far one. Each move is a run
 * of phases keyed on the figure as it is each frame, so a tool on its way into a pick lands on it
 * however the climber moves meanwhile; a move cut short goes on from where the tool was. It keeps
 * only the picture's own: where the tool is, the pick it's in, its move, and how it was drawn.
 */
class HeldTool {
  /** How long each phase takes, unless a move says otherwise. */
  private static readonly SECONDS: Readonly<Record<Phase, number>> = {
    raise: 0.12,
    reach: 0.12,
    draw: 0.2,
    lever: 0.07,
    pull: 0.09,
    cock: 0.18,
    strike: 0.13,
    bite: 0.16,
    settle: 0.14,
    carry: 0.25,
    lift: 0.2,
    stow: 0.22,
    "let-go": 0.2,
  };
  /** The cock after a draw off the pack, which comes up over the shoulder most of the way. */
  private static readonly QUICK_COCK = 0.1;
  /** The phases in which the tool is still on the pack, and only the hand moves. */
  private static readonly STRAPPED_PHASES: ReadonlySet<Phase> = new Set<Phase>([
    "raise",
    "reach",
    "let-go",
  ]);
  /** Where the hand goes from its shoulder: up in front of the face, to reach back over the
   * shoulder for the pack; and over it, drawing the tool off the pack or lifting it to strap on. */
  private static readonly RAISED: Joint = { x: 0.08, y: 0.25 };
  private static readonly OVER: Joint = { x: -0.02, y: 0.36 };
  /** Cocked to swing: the hand up over the head, the elbow high, the tool's head dropped back
   * behind the neck. */
  private static readonly COCKED: Key = { hand: { x: -0.035, y: 0.35 }, angle: 3.95 };
  /** The way the shaft points coming off the pack over the shoulder, its head trailing down
   * behind, and going back over it to be strapped on, its head going back. */
  private static readonly DRAWN_ANGLE = 4.45;
  private static readonly LIFTED_ANGLE = 2.8;
  /** Out of the ice: the hand pushes the grip up and in, levering the pick out along its curve,
   * and pulls it back, the head swinging away from the ice. */
  private static readonly LEVER = { hand: { x: 0.02, y: 0.05 }, turn: 0.12 };
  private static readonly PULL = { hand: { x: -0.08, y: 0.03 }, turn: 0.45 };
  /** In the ice: how far the shaft leans out from the ice at its grip, and how much of that a
   * pick that bites poorly keeps; how far a sound pick's point goes into the ice, and a poor
   * one's. */
  private static readonly LEAN_OUT = 0.08;
  private static readonly POOR_LEAN = 0.3;
  private static readonly DEEP = 0.02;
  private static readonly SHALLOW = 0.004;
  /** In the hand off the ice, the shaft points this far round from the arm: forward of an arm
   * hanging down, its head a little up. */
  private static readonly CARRY_TURN = Math.PI / 2 + 0.25;
  /** The shaft's shudder as the pick strikes: how far, how many times a second, how fast it dies,
   * turning round the pick's point in the ice. */
  private static readonly SHUDDER = { radians: 0.05, hz: 17, seconds: 0.05 };
  /** How long a tool stays in the hand off the ice before it's strapped back on. */
  private static readonly STOW_AFTER = 1.2;
  /** How the strike's hand and shaft go: the hand's way slowing to its end, the shaft's turn
   * gathering speed, so the head whips through as the wrist flicks. */
  private static readonly WHIP = 3.4;
  /** The angles a key's shaft can point at, from here round a whole turn: so a turn from one key
   * to the next goes the way the tool swings, not round the short way. */
  private static readonly FROM_ANGLE = -1.5;

  private where: Where = "pack";
  /** The swing of the pick it's in or going into, and that pick as last seen. */
  private pick: number | null = null;
  private seen: PickIn | null = null;
  private move: Move | null = null;
  /** How it was keyed last frame, from its shoulder: where a move that cuts in begins. */
  private last: Key | null = null;
  /** How long it has been in the hand off the ice. */
  private idle = 0;
  /** Whether its pick went in this frame. */
  private struck = false;
  private load = 0;

  constructor(
    readonly kind: ToolKind,
    readonly hand: 0 | 1,
    /** Where its pick's point is, in its own frame: the grip at the origin, the shaft along +x and
     * the pick towards -y. */
    private readonly tip: Joint,
    /** Strapped to the pack: its grip in the pack's frame, and the way its shaft points there. */
    private readonly strapped: { readonly grip: Joint; readonly angle: number },
  ) {}

  /** Whether its hand is busy with it: holding it, or going to the pack for it or from it. */
  get busy(): boolean {
    return this.where !== "pack" || this.move !== null;
  }

  /** How far the climber's weight is coming onto it as it settles in the ice, 0 to 1. */
  get loading(): number {
    return this.load;
  }

  /** Whether it's in the ice now, in the pick `swing`, or on its way into it. */
  isIn(swing: number): boolean {
    return this.pick === swing;
  }

  /** Swung into `pick`: off the pack, out of the pick it was in, or from the hand. A swing on its
   * way that hasn't struck yet goes on to the new pick. */
  swingTo(pick: PickIn): void {
    const { move } = this;
    const striking = move?.steps.findIndex(({ phase }) => phase === "strike") ?? -1;
    const goingIn = move !== null && move.ends === "ice" && striking >= 0;
    if (goingIn && move.time < HeldTool.until(move.steps, striking)) {
      this.pick = pick.swing;
      this.seen = pick;
      return;
    }
    const phases: Step[] = [];
    let leaving: PickIn | null = null;
    if (this.onThePack()) {
      phases.push(HeldTool.step("raise"), HeldTool.step("reach"), HeldTool.step("draw"), {
        phase: "cock",
        seconds: HeldTool.QUICK_COCK,
      });
    } else if (this.isPlanted()) {
      leaving = this.seen;
      phases.push(HeldTool.step("lever"), HeldTool.step("pull"), HeldTool.step("cock"));
    } else {
      phases.push(HeldTool.step("cock"));
    }
    phases.push(HeldTool.step("strike"), HeldTool.step("bite"), HeldTool.step("settle"));
    this.begin(phases, "ice", leaving);
    this.pick = pick.swing;
    this.seen = pick;
  }

  /** `seconds` on, with the climber in `state`: out of the ice if its pick has gone from it, back
   * on the pack after a while in the hand, at once if the hands are needed, and its move run on. */
  advance(seconds: number, state: ToolsState): void {
    const { pick } = this;
    const now = pick === null ? null : (state.picks.find(({ swing }) => swing === pick) ?? null);
    if (pick !== null && now === null) {
      this.release(state);
    } else if (now !== null) {
      this.seen = now;
    }
    this.struck = false;
    const { move } = this;
    if (move !== null) {
      const before = move.time;
      move.time += seconds;
      const striking = move.steps.findIndex(({ phase }) => phase === "strike");
      if (striking >= 0) {
        const hit = HeldTool.until(move.steps, striking);
        this.struck = before < hit && move.time >= hit;
      }
      if (move.time >= HeldTool.until(move.steps, move.steps.length - 1)) {
        this.where = move.ends;
        this.move = null;
        this.idle = 0;
      }
    }
    if (this.move === null && this.where === "hand" && state.upright) {
      this.idle += seconds;
      if (!state.free || this.idle >= HeldTool.STOW_AFTER) {
        this.begin([HeldTool.step("lift"), HeldTool.step("stow"), HeldTool.step("let-go")], "pack");
      }
    }
  }

  /** Where it's drawn this frame on `body`, the climber's picks `picks`, the one they hang from
   * biting poorly if `poor`: its hand, and the strike if its pick went in. */
  place(body: ToolBody, picks: readonly PickIn[], poor: boolean): Placed {
    const root = body.roots[this.hand];
    const { move } = this;
    let key: Key;
    let held: boolean;
    this.load = 0;
    if (move === null) {
      key = this.rest(body, picks, poor);
      held = this.where !== "pack";
    } else {
      const { index, share, into } = HeldTool.phaseAt(move);
      const step = move.steps[index] ?? HeldTool.step("settle");
      const start = move.start ?? this.last ?? this.rest(body, picks, poor);
      move.start = start;
      const previous = move.steps[index - 1];
      const from = previous === undefined ? start : this.keyOf(previous.phase, body, picks, poor);
      const shudder =
        step.phase === "bite"
          ? HeldTool.SHUDDER.radians *
            Math.exp(-into / HeldTool.SHUDDER.seconds) *
            Math.sin(2 * Math.PI * HeldTool.SHUDDER.hz * into)
          : 0;
      const to = this.keyOf(step.phase, body, picks, poor, shudder);
      key = step.phase === "bite" ? to : HeldTool.mix(from, to, share, step.phase);
      held = !HeldTool.STRAPPED_PHASES.has(step.phase);
      if (step.phase === "bite") {
        this.load = HeldTool.smooth(share);
      } else if (step.phase === "settle") {
        this.load = 1 - HeldTool.smooth(share);
      }
    }
    this.last = key;
    const hand: Joint = { x: root.x + key.hand.x, y: root.y + key.hand.y };
    const drawn: DrawnTool = held
      ? { kind: this.kind, grip: hand, angle: key.angle, hand: this.hand }
      : { ...this.onPack(body), hand: null };
    const target = this.struck ? this.target(picks) : null;
    // In the ice, a grip below the shoulder and out of reach is one the climber sinks towards.
    const planted = move === null ? this.where === "ice" : this.isPlanted();
    const below = planted && key.hand.y < 0;
    return {
      drawn,
      hand: move === null && this.where === "pack" ? null : hand,
      short: below ? Math.hypot(key.hand.x, key.hand.y) - body.reach : null,
      strike:
        target === null
          ? null
          : {
              at: body.inside(target.at),
              into: body.turned(target.into),
              poor: poor && picks[0]?.swing === target.swing,
            },
    };
  }

  /** Out of the ice its pick has gone from: levered out if it's in, and carried in the hand, or
   * strapped straight back on if the hands are needed. A tool not yet off the pack stays on it. */
  private release(state: ToolsState): void {
    const leaving = this.isPlanted() ? this.seen : null;
    this.pick = null;
    if (this.onThePack()) {
      this.begin([HeldTool.step("let-go")], "pack");
      return;
    }
    const phases: Step[] = leaving === null ? [] : [HeldTool.step("lever"), HeldTool.step("pull")];
    if (state.upright && !state.free) {
      phases.push(HeldTool.step("lift"), HeldTool.step("stow"), HeldTool.step("let-go"));
      this.begin(phases, "pack", leaving);
    } else {
      phases.push(HeldTool.step("carry"));
      this.begin(phases, "hand", leaving);
    }
  }

  /** A move of `phases` from where the tool is, to end `ends`. */
  private begin(phases: readonly Step[], ends: Where, leaving: PickIn | null = null): void {
    this.move = { steps: phases, time: 0, start: this.last, ends, leaving };
    this.idle = 0;
  }

  /** Whether it's on the pack: strapped on, or with the hand going to it or leaving it. */
  private onThePack(): boolean {
    const { move } = this;
    if (move === null) {
      return this.where === "pack";
    }
    const step = move.steps[HeldTool.phaseAt(move).index];
    return step !== undefined && HeldTool.STRAPPED_PHASES.has(step.phase);
  }

  /** Whether its pick is in the ice: at rest there, biting, or taking the weight. */
  private isPlanted(): boolean {
    const { move } = this;
    if (move === null) {
      return this.where === "ice";
    }
    const phase = move.steps[HeldTool.phaseAt(move).index]?.phase;
    return phase === "bite" || phase === "settle";
  }

  /** The pick it's going into, or in: as the physics has it now, or as last seen. */
  private target(picks: readonly PickIn[]): PickIn | null {
    const { pick } = this;
    return picks.find(({ swing }) => swing === pick) ?? this.seen;
  }

  /** Its key at rest where it is: strapped on, in the hand, or in its pick. */
  private rest(body: ToolBody, picks: readonly PickIn[], poor: boolean): Key {
    if (this.where === "pack") {
      return this.keyOf("let-go", body, picks, poor);
    }
    return this.keyOf(this.where === "hand" ? "carry" : "settle", body, picks, poor);
  }

  /** Where `phase` brings the tool on `body`, keyed from the shoulder its arm hangs from; in the
   * ice, turned `shudder` more round the pick's point. */
  private keyOf(
    phase: Phase,
    body: ToolBody,
    picks: readonly PickIn[],
    poor: boolean,
    shudder = 0,
  ): Key {
    const root = body.roots[this.hand];
    const fromRoot = (point: Joint): Joint => ({ x: point.x - root.x, y: point.y - root.y });
    switch (phase) {
      case "raise":
        return { hand: HeldTool.RAISED, angle: this.onPack(body).angle };
      case "reach":
      case "stow": {
        const { grip, angle } = this.onPack(body);
        return { hand: fromRoot(grip), angle };
      }
      case "draw":
        return { hand: HeldTool.OVER, angle: HeldTool.DRAWN_ANGLE };
      case "lift":
        return { hand: HeldTool.OVER, angle: HeldTool.LIFTED_ANGLE };
      case "cock":
        return HeldTool.COCKED;
      case "lever":
      case "pull": {
        const leaving = this.move?.leaving ?? this.seen;
        const from = leaving === null ? null : this.plantedIn(body, leaving, false, 0);
        if (from === null) {
          return HeldTool.COCKED;
        }
        const { hand, turn } = phase === "lever" ? HeldTool.LEVER : HeldTool.PULL;
        return {
          hand: { x: from.x - root.x + hand.x, y: from.y - root.y + hand.y },
          angle: from.angle + turn,
        };
      }
      case "strike":
      case "bite":
      case "settle": {
        const target = this.target(picks);
        if (target === null) {
          return HeldTool.COCKED;
        }
        const hanging = poor && picks[0]?.swing === target.swing;
        const at = this.plantedIn(body, target, hanging, shudder);
        return { hand: fromRoot(at), angle: at.angle };
      }
      case "carry": {
        const hand = fromRoot(body.hands[this.hand]);
        const along = Math.atan2(hand.y, hand.x);
        return { hand, angle: HeldTool.ranged(along + HeldTool.CARRY_TURN) };
      }
      case "let-go":
        return {
          hand: fromRoot(body.hands[this.hand]),
          angle: this.onPack(body).angle,
        };
    }
  }

  /** Its grip and its shaft's way in the pick `pick` on `body`: the shaft along the ice, leaning
   * out at its grip, the pick's point into the ice, shallow where it bites poorly; turned
   * `shudder` round that point. */
  private plantedIn(
    body: ToolBody,
    pick: PickIn,
    poor: boolean,
    shudder: number,
  ): Joint & { readonly angle: number } {
    const at = body.inside(pick.at);
    const into = body.turned(pick.into);
    const lean = HeldTool.LEAN_OUT * (poor ? HeldTool.POOR_LEAN : 1);
    const angle = HeldTool.ranged(Math.atan2(into.x, -into.y) - lean + shudder);
    const depth = poor ? HeldTool.SHALLOW : HeldTool.DEEP;
    const point = { x: at.x + into.x * depth, y: at.y + into.y * depth };
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const { tip } = this;
    return {
      x: point.x - (tip.x * cos - tip.y * sin),
      y: point.y - (tip.x * sin + tip.y * cos),
      angle,
    };
  }

  /** Strapped to the pack on `body`: its grip in the figure's frame, and its shaft's way. */
  private onPack(body: ToolBody): { readonly kind: ToolKind; grip: Joint; angle: number } {
    const { grip, angle } = this.strapped;
    const turn = -body.lean;
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    return {
      kind: this.kind,
      grip: {
        x: body.pelvis.x + grip.x * cos - grip.y * sin,
        y: body.pelvis.y + grip.x * sin + grip.y * cos,
      },
      angle: angle + turn,
    };
  }

  /** A key `share` of the way from one to the next in `phase`: the hand round its shoulder, in an
   * arc, and the shaft turning. A strike's hand slows into its end as the shaft's turn speeds up,
   * so the head whips through last. */
  private static mix(from: Key, to: Key, share: number, phase: Phase): Key {
    const striking = phase === "strike";
    const eased = HeldTool.smooth(share);
    const handShare = striking ? 1 - (1 - share) * (1 - share) : eased;
    const turnShare = striking ? Math.pow(share, HeldTool.WHIP) : eased;
    const near = Math.hypot(from.hand.x, from.hand.y);
    const far = Math.hypot(to.hand.x, to.hand.y);
    const start = Math.atan2(from.hand.y, from.hand.x);
    let round = Math.atan2(to.hand.y, to.hand.x) - start;
    round -= 2 * Math.PI * Math.round(round / (2 * Math.PI));
    const reach = near + (far - near) * handShare;
    const angle = start + round * handShare;
    return {
      hand: { x: reach * Math.cos(angle), y: reach * Math.sin(angle) },
      angle: from.angle + (to.angle - from.angle) * turnShare,
    };
  }

  /** Which step a move is in, how far into it as a share, and how many seconds. */
  private static phaseAt(move: Move): { index: number; share: number; into: number } {
    let start = 0;
    for (const [index, { seconds }] of move.steps.entries()) {
      if (move.time < start + seconds) {
        const into = move.time - start;
        return { index, share: into / seconds, into };
      }
      start += seconds;
    }
    const lastStep = move.steps.at(-1);
    return {
      index: move.steps.length - 1,
      share: 1,
      into: lastStep === undefined ? 0 : lastStep.seconds,
    };
  }

  /** How long a move's steps take, to the end of the one at `index`. */
  private static until(steps: readonly Step[], index: number): number {
    let total = 0;
    for (const [at, { seconds }] of steps.entries()) {
      total += seconds;
      if (at === index) {
        break;
      }
    }
    return total;
  }

  private static step(phase: Phase): Step {
    return { phase, seconds: HeldTool.SECONDS[phase] };
  }

  /** `angle` moved by whole turns into the turn from `FROM_ANGLE`. */
  private static ranged(angle: number): number {
    const turn = 2 * Math.PI;
    return angle - turn * Math.floor((angle - HeldTool.FROM_ANGLE) / turn);
  }

  /** 0 to 1 with an easy start and end. */
  private static smooth(share: number): number {
    const t = Math.min(Math.max(share, 0), 1);
    return t * t * (3 - 2 * t);
  }
}

/**
 * A climber's ice tools as the picture moves them (docs/guidelines/graphics.md → The animation
 * shows the body's state): the ice axe in the near hand and a second tool, if they carry one, in
 * the far one, each keeping to its hand. A new pick in the ice is the tool that's free swung into
 * it, as a climber places a tool: on the axe alone it comes out of the pick it hung from, on two
 * the lower one comes out and goes in above; off the pack for the first, drawn up over the
 * shoulder, cocked behind the head, and struck in with a flick of the wrist, the head whipping
 * through last, the shaft shuddering as it bites and the weight coming onto it. Off the ice, a
 * tool comes out and back onto the pack, at once for a ladder's rungs; in a fall it stays in the
 * hand. It keeps only the picture's own: each tool's place and move, and the last swing seen.
 */
export class IceTools {
  /** The tools' shapes as the moves need them, in each tool's frame: where its pick's point is.
   * The ice axe is a mountaineer's, 0.62 m from its spike to its head; the second tool a
   * technical one, 0.5 m, its shaft bent (`FigureShapes`). */
  static readonly TIPS: Readonly<Record<ToolKind, Joint>> = {
    axe: { x: 0.466, y: -0.177 },
    tool: { x: 0.404, y: -0.172 },
  };
  /** Strapped head down to the pack, as on a pack's tool loops: the grip by the lid, in the pack's
   * frame, from the pelvis up the spine, and the way the shaft points down from it, its foot a
   * little back. */
  static readonly STRAPPED: Readonly<Record<ToolKind, { grip: Joint; angle: number }>> = {
    axe: { grip: { x: -0.335, y: 0.5 }, angle: 4.663 },
    tool: { grip: { x: -0.3, y: 0.47 }, angle: 4.73 },
  };

  private readonly tools: readonly [HeldTool, HeldTool] = [
    new HeldTool("axe", 0, IceTools.TIPS.axe, IceTools.STRAPPED.axe),
    new HeldTool("tool", 1, IceTools.TIPS.tool, IceTools.STRAPPED.tool),
  ];
  private swung = 0;
  private carried = 0;
  private picks: readonly PickIn[] = [];
  private poor = false;

  /** Where the point of `tool`'s pick is, as it's drawn. */
  static tip(tool: DrawnTool): Joint {
    const { x, y } = IceTools.TIPS[tool.kind];
    const cos = Math.cos(tool.angle);
    const sin = Math.sin(tool.angle);
    return { x: tool.grip.x + x * cos - y * sin, y: tool.grip.y + x * sin + y * cos };
  }

  /** Which hands hold no tool, and aren't going for one or leaving one: the near one first. */
  get handsFree(): readonly [boolean, boolean] {
    const [axe, tool] = this.tools;
    return [!(this.carried >= 1 && axe.busy), !(this.carried >= 2 && tool.busy)];
  }

  /** How far the climber's weight is coming onto a pick that went in, 0 to 1. */
  get loading(): number {
    return Math.max(...this.tools.map(({ loading }) => loading));
  }

  /** `seconds` after the last frame, for the climber in `state`: a new pick is the free tool swung
   * into it, and a tool whose pick is gone comes out. */
  advance(seconds: number, state: ToolsState): void {
    const frame = Math.max(seconds, 0);
    this.carried = Math.min(Math.max(Math.floor(state.carried), 0), this.tools.length);
    this.picks = state.picks;
    this.poor = state.poor;
    const newest = state.picks[0];
    if (newest !== undefined && newest.swing > this.swung && this.carried > 0) {
      this.swung = newest.swing;
      this.swinger(state.picks).swingTo(newest);
    }
    for (const tool of this.tools.slice(0, this.carried)) {
      tool.advance(frame, state);
    }
  }

  /** The tools on `body` this frame. */
  place(body: ToolBody): HeldTools {
    const placed = this.tools
      .slice(0, this.carried)
      .map((tool) => tool.place(body, this.picks, this.poor));
    const shorts = placed.flatMap(({ short }) => (short === null ? [] : [short]));
    return {
      tools: placed.map(({ drawn }) => drawn),
      hands: [placed[0]?.hand ?? null, placed[1]?.hand ?? null],
      strikes: placed.flatMap(({ strike }) => (strike === null ? [] : [strike])),
      short: shorts.length === 0 ? -Infinity : Math.max(...shorts),
    };
  }

  /** The tool that swings into the newest of `picks`: the axe alone, or on two the one not in
   * the pick they hung from before, the axe first. */
  private swinger(picks: readonly PickIn[]): HeldTool {
    const [axe, tool] = this.tools;
    if (this.carried < 2) {
      return axe;
    }
    const before = picks[1];
    if (before !== undefined && axe.isIn(before.swing)) {
      return tool;
    }
    if (before !== undefined && tool.isIn(before.swing)) {
      return axe;
    }
    return axe.busy && !tool.busy ? tool : axe;
  }
}
