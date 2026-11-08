import type { Walk } from "../simulation";
import { Steepness } from "./steepness";
import type { Pair, Point, Terrain, Way } from "./terrain";

/** A ladder as a level lays it and saves keep it: its ends, by how far along the ground they
 * are, `from` the one further back; and, in a save, how hard it was bouncing, if at all. */
export type LadderLayout = {
  readonly id: string;
  readonly from: number;
  readonly to: number;
  readonly bounce?: number;
};

/**
 * A ladder between two points of the ground, across a crevasse or up a wall: walking crosses on
 * it, not on the ground between its ends. A key moves a climber along it when it points more
 * along it than across: left and right on a ladder across a crevasse, up and down on one up a
 * wall, and a diagonal on either. Its way 1 is toward its end further along the ground, as
 * walking right is, and it's measured in rungs: metres from its `from` end. One across a
 * crevasse bounces under the steps on it, the longer the harder, and the bounce dies away when
 * they stop (#190).
 */
export class Ladder {
  /** Steeper than this sine, a ladder is up or down a wall, which doesn't bounce. */
  private static readonly ACROSS_SINE = 0.5;
  /** Less bounce than this, it lies still: the engine's number. */
  private static readonly STILL = 1e-4;

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
  /** How hard it bounces now. */
  private bouncing: number;

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
  }

  get id(): string {
    return this.layout.id;
  }

  save(): LadderLayout {
    const { id, from, to } = this.layout;
    return this.bouncing > 0 ? { id, from, to, bounce: this.bouncing } : { id, from, to };
  }

  /** Whether it lies across a crevasse, rather than up or down a wall. */
  get across(): boolean {
    return Math.abs(this.heading.y) < Ladder.ACROSS_SINE;
  }

  /** How hard it bounces now: nought at rest. */
  get bounce(): number {
    return this.bouncing;
  }

  /** A step of `metres` on it sets it bouncing, by `excite` for each metre of its length; one up
   * a wall doesn't. */
  shake(metres: number, excite: number): void {
    if (this.across) {
      this.bouncing += excite * this.length * Math.abs(metres);
    }
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
