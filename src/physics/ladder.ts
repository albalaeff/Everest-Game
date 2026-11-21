import type { ClimberId, Walk } from "../simulation";
import { Steepness } from "./steepness";
import type { Pair, Point, Terrain, Way } from "./terrain";

/** A ladder as a level lays it and saves keep it: its ends, by how far along the ground they
 * are, `from` the one further back; and, in a save, how hard it was bouncing, if at all. A ladder
 * staged to break for training (#209) has the rung it `breaks` at, in metres from `from`, and the
 * climbers it's staged for, its `trainees`, the players (#212): only a step of theirs sets it
 * creaking, anyone's if none are named. A save keeps the step it began `creaking` on, the step it
 * `broke` on, the end that tore `free`, its start, at `from`, or its finish, how far it's been
 * hauled back up, `raised`, from 0 hanging to 1 across (#228), and whether it `slid` off its lip
 * under two, rather than breaking where it was staged to (#256). */
export type LadderLayout = {
  readonly id: string;
  readonly from: number;
  readonly to: number;
  readonly bounce?: number;
  readonly breaks?: number;
  readonly trainees?: readonly ClimberId[];
  readonly creaking?: number;
  readonly broke?: number;
  readonly free?: "start" | "finish";
  readonly raised?: number;
  readonly slid?: boolean;
};

/** A ladder's condition: whole, creaking before it breaks, or broken, until it's hauled back. */
export type LadderCondition = "whole" | "creaking" | "broken";

/**
 * A ladder between two points of the ground, across a crevasse or up a wall: walking crosses on
 * it, not on the ground between its ends. A key moves a climber along it when it points more
 * along it than across: left and right on a ladder across a crevasse, up and down on one up a
 * wall, and a diagonal on either. Its way 1 is toward its end further along the ground, as
 * walking right is, and it's measured in rungs: metres from its `from` end. One across a
 * crevasse bounces under the steps on it, the longer the harder, and the bounce dies away when
 * they stop (#190), and less while someone holds its rope taut from an end (#212). One staged to
 * break (#209) creaks once one of its trainees steps past the rung it breaks at, then breaks: the
 * end behind them tears free and it swings down into the crevasse, and there it hangs, nobody
 * walking onto it, until climbers at its lips haul it back up by its ropes and lash it across
 * (#228): no Icefall Doctors come. It breaks once. One across a crevasse may slide off its lip
 * instead, as a climber steps onto it with someone already on it (#256): it creaks and falls the
 * same way, the end they stepped on from torn free.
 */
export class Ladder {
  /** Steeper than this sine, a ladder is up or down a wall, which doesn't bounce. */
  private static readonly ACROSS_SINE = 0.5;
  /** Less bounce than this, it lies still: the engine's number. */
  private static readonly STILL = 1e-4;
  /** Hauled back this near all the way, it's across: the sums' rounding. */
  private static readonly ACROSS = 1e-9;

  /** Each walking direction as a way on the screen: across, and up. */
  private static readonly KEYS: Readonly<Record<Walk["direction"], Pair>> = {
    right: [1, 0],
    left: [-1, 0],
    up: [0, 1],
    down: [0, -1],
    "up-right": [1, 1],
    "up-left": [-1, 1],
    "down-right": [1, -1],
    "down-left": [-1, -1],
    stop: [0, 0],
  };

  readonly length: number;
  /** Its ends, at `from` and at `to`. */
  private readonly start: Point;
  private readonly finish: Point;
  /** Its way 1, a length of 1. */
  private readonly heading: Point;
  /** How hard it bounces now; and the share of it a step sets going this step, less while its rope
   * is held taut (#212), which the slope sets each step and no save keeps. */
  private bouncing: number;
  private steadiness = 1;
  /** The rung it breaks at, if it's staged to; the steps it began creaking and broke on; the end
   * that tore free. */
  private breaks: number | null;
  private creaking: number | null;
  private broke: number | null;
  private free: "start" | "finish" | null;
  /** How far it's been hauled back up since it broke, 0 to 1 (#228). */
  private raised: number;
  /** Whether it creaks or broke for sliding off its lip under two (#256). */
  private slid: boolean;

  /** A ladder laid on the ground: its ends on it, `from` further back than `to`. */
  constructor(
    private readonly layout: LadderLayout,
    terrain: Terrain,
  ) {
    const { id, from, to } = layout;
    if (!(from < to)) {
      throw new RangeError(`The ladder ${id} goes back along the ground, or has no length`);
    }
    this.start = terrain.point(from);
    this.finish = terrain.point(to);
    const x = this.finish.x - this.start.x;
    const y = this.finish.y - this.start.y;
    this.length = Math.sqrt(x * x + y * y);
    this.heading = { x: x / this.length, y: y / this.length };
    this.bouncing = layout.bounce ?? 0;
    this.breaks = layout.breaks ?? null;
    this.creaking = layout.creaking ?? null;
    this.broke = layout.broke ?? null;
    this.free = layout.free ?? null;
    this.raised = layout.raised ?? 0;
    this.slid = layout.slid ?? false;
  }

  get id(): string {
    return this.layout.id;
  }

  save(): LadderLayout {
    const { id, from, to, trainees } = this.layout;
    return {
      id,
      from,
      to,
      ...(this.bouncing > 0 ? { bounce: this.bouncing } : {}),
      ...(this.breaks === null ? {} : { breaks: this.breaks }),
      ...(this.breaks === null || trainees === undefined ? {} : { trainees }),
      ...(this.creaking === null ? {} : { creaking: this.creaking }),
      ...(this.broke === null ? {} : { broke: this.broke }),
      ...(this.free === null ? {} : { free: this.free }),
      ...(this.raised > 0 ? { raised: this.raised } : {}),
      ...(this.slid ? { slid: true } : {}),
    };
  }

  /** Whether it's whole, creaking or broken. */
  get condition(): LadderCondition {
    return this.broke !== null ? "broken" : this.creaking !== null ? "creaking" : "whole";
  }

  /** The end that tore free when it broke: the other still holds it. */
  get torn(): "start" | "finish" | null {
    return this.free;
  }

  /** Where along the ground the lip it tore free of is: behind the climber who set it creaking,
   * where they came from; none while it's whole. */
  get tornLip(): number | null {
    return this.free === null ? null : this.free === "start" ? this.layout.from : this.layout.to;
  }

  /** A step of `climber`'s from `rung` to `next` on `step`: past the rung it breaks at, a trainee's
   * sets it creaking, and the end behind them is the one that will tear free. */
  passed(rung: number, next: number, step: number, climber: ClimberId): void {
    const { breaks } = this;
    const { trainees } = this.layout;
    if (breaks === null || this.creaking !== null || this.broke !== null || next === rung) {
      return;
    }
    if (trainees !== undefined && !trainees.includes(climber)) {
      return;
    }
    if ((rung - breaks) * (next - breaks) <= 0) {
      this.creaking = step;
      this.free = next > rung ? "start" : "finish";
    }
  }

  /** Whether it could slide off its lip now (#256): whole, across a crevasse, not creaking. */
  get slidable(): boolean {
    return this.across && this.creaking === null && this.broke === null;
  }

  /** Whether it creaks, or broke, for sliding off its lip under two rather than where it was staged
   * to break (#256). */
  get slipped(): boolean {
    return this.slid;
  }

  /** Slides off its lip at its `end` from `step` (#256), a climber having stepped onto it from
   * there with someone already on it: it creaks, then breaks as a staged ladder does, that end
   * torn free. Nothing for one that can't slide now. */
  slideOff(step: number, end: "start" | "finish"): void {
    if (!this.slidable) {
      return;
    }
    this.creaking = step;
    this.free = end;
    this.slid = true;
  }

  /** On `step`, a ladder that has creaked `creak` steps breaks: whether it broke just now. */
  snap(step: number, creak: number): boolean {
    if (this.creaking === null || step - this.creaking < creak) {
      return false;
    }
    this.creaking = null;
    this.broke = step;
    return true;
  }

  /** How far a broken ladder has been hauled back up by its ropes (#228), from 0, hanging where it
   * fell, to 1, across; nought while it's whole. */
  get hauledBack(): number {
    return this.broke === null ? 0 : this.raised;
  }

  /** A broken ladder hauled `share` of the way further back up (#228): all the way, it's laid
   * across and lashed again, whole, and holds from then on. Nothing for a whole one. */
  raise(share: number): void {
    if (this.broke === null || !(share > 0)) {
      return;
    }
    this.raised = Math.min(1, this.raised + share);
    if (this.raised >= 1 - Ladder.ACROSS) {
      this.broke = null;
      this.breaks = null;
      this.free = null;
      this.raised = 0;
      this.slid = false;
    }
  }

  /** Its end on the ground nearer `point`: where along it, and the point. */
  nearerEnd(point: Point): { readonly along: number; readonly point: Point } {
    const away = (end: Point): number =>
      (end.x - point.x) * (end.x - point.x) + (end.y - point.y) * (end.y - point.y);
    return away(this.start) <= away(this.finish)
      ? { along: this.layout.from, point: this.start }
      : { along: this.layout.to, point: this.finish };
  }

  /** Whether it lies across a crevasse, rather than up or down a wall. */
  get across(): boolean {
    return Math.abs(this.heading.y) < Ladder.ACROSS_SINE;
  }

  /** How hard it bounces now: nought at rest. */
  get bounce(): number {
    return this.bouncing;
  }

  /** A step of `metres` on it sets it bouncing, by `excite` for each metre of its length, times
   * how steady it's held this step; one up a wall doesn't. */
  shake(metres: number, excite: number): void {
    if (this.across) {
      this.bouncing += excite * this.steadiness * this.length * Math.abs(metres);
    }
  }

  /** The share of its bounce the steps set going this step: 1, or less while someone holds its
   * rope taut from an end (#212). */
  steady(share: number): void {
    this.steadiness = share;
  }

  /** Its bounce dies away by `damp` a second, over `seconds`: in straight steps, which round the
   * same everywhere, and to nought once it's too little to feel. */
  settle(seconds: number, damp: number): void {
    this.bouncing *= Math.max(0, 1 - damp * seconds);
    if (this.bouncing < Ladder.STILL) {
      this.bouncing = 0;
    }
  }

  /** The point `rung` metres along it: its very ends where the ground has them. */
  point(rung: number): Point {
    if (rung >= this.length) {
      return this.finish;
    }
    return { x: this.start.x + this.heading.x * rung, y: this.start.y + this.heading.y * rung };
  }

  /** Which way a key moves a climber on it: 1, −1, or 0 for one that points more across it. */
  way(direction: Walk["direction"]): Way | 0 {
    const [x, y] = Ladder.KEYS[direction];
    const along = x * this.heading.x + y * this.heading.y;
    const across = x * this.heading.y - y * this.heading.x;
    if (along === 0 || Math.abs(along) < Math.abs(across)) {
      return 0;
    }
    return along > 0 ? 1 : -1;
  }

  /** Which way a climber on the ground at `along` goes onto it: 1 at its `from` end, −1 at its
   * `to` end, and 0 anywhere else. */
  into(along: number): Way | 0 {
    return along === this.layout.from ? 1 : along === this.layout.to ? -1 : 0;
  }

  /** The rung at its end `way`, and where along the ground that end is. */
  end(way: Way): { readonly rung: number; readonly along: number } {
    const { from, to } = this.layout;
    return way > 0 ? { rung: this.length, along: to } : { rung: 0, along: from };
  }

  /** The rung at its end that's `along` the ground: 0 at `from`, and its length at `to`. */
  rungAt(along: number): number {
    return along === this.layout.to ? this.length : 0;
  }

  /** Where along the ground its ends are, for walking to stop at. */
  get ends(): readonly number[] {
    return [this.layout.from, this.layout.to];
  }

  /** Where it lies: its two ends, for the rendering. */
  get shape(): readonly Point[] {
    return [this.start, this.finish];
  }

  /** Its way `way`, a length of 1. */
  ahead(way: Way): Point {
    return { x: this.heading.x * way, y: this.heading.y * way };
  }

  steepness(way: Way): Steepness {
    const { x, y } = this.ahead(way);
    return Steepness.ofWay(x, y);
  }
}
