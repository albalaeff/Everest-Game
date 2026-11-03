import { Particle } from "./particle";
import type { ParticleSave } from "./particle";
import type { Pair, Point, Terrain } from "./terrain";

/** A rope as saves keep it: its anchors, its length, and each point between them. */
export type RopeSave = {
  readonly id: string;
  readonly from: Pair;
  readonly to: Pair;
  readonly length: number;
  readonly points: readonly ParticleSave[];
  /** Whether it lay still through the last step it moved in. */
  readonly still: boolean;
};

/** Where a carabiner is on a rope: metres along it from its first anchor. */
export type Slide = number;

/** Two points of the chain that may be no further apart than a link. */
interface Link {
  readonly from: Particle;
  readonly to: Particle;
  /** How much of a correction each end takes: an anchor takes none. */
  readonly fromShare: number;
  readonly toShare: number;
}

/** A point of the chain, and the anchor it may be no further from than the rope between them. */
interface Tether {
  readonly point: Particle;
  readonly anchor: Particle;
  readonly reach: number;
}

/**
 * A fixed rope between two anchors: a chain of points under Verlet integration, each link no
 * longer than its share of the rope, so it sags, lies on the ground and swings, and never
 * stretches. Each point is also tethered to both anchors by the rope between them, so a long
 * chain holds in a few iterations.
 *
 * A cowstail runs on it through a carabiner, which slides. A climber is held where the rope's
 * length lets them be: no further from its two anchors together than the rope and two cowstails,
 * an ellipse around them. That holds them as a rope does, and it can't give under a heavy climber
 * as a chain of light points would. Each climber is held as if alone on it. A jumar that grips
 * the rope holds them the same way, by the rope on each side of it: a circle around each anchor.
 */
export class Rope {
  /** The links' length, about: the engine's number, not the mountain's. */
  static readonly LINK_METRES = 1;

  private readonly chain: readonly Particle[];
  private readonly links: readonly Link[];
  private readonly tethers: readonly Tether[];
  /** Each link's length, its share of the rope. */
  private readonly link: number;

  private constructor(
    readonly id: string,
    private readonly from: Particle,
    private readonly to: Particle,
    readonly length: number,
    private readonly points: readonly Particle[],
    private still: boolean,
  ) {
    const between = Math.sqrt(
      (to.x - from.x) * (to.x - from.x) + (to.y - from.y) * (to.y - from.y),
    );
    if (!(length >= between)) {
      throw new RangeError(`The rope ${id} is shorter than the way between its anchors`);
    }
    this.chain = [from, ...points, to];
    this.link = length / (points.length + 1);
    this.links = this.chain.slice(1).map((end, index) => ({
      from: this.point(index),
      to: end,
      fromShare: index === 0 ? 0 : 1,
      toShare: index === points.length ? 0 : 1,
    }));
    this.tethers = points.flatMap((point, index) => [
      { point, anchor: from, reach: (index + 1) * this.link },
      { point, anchor: to, reach: (points.length - index) * this.link },
    ]);
  }

  /** A rope laid straight from one anchor to the other, out of the ground: it falls into place. */
  static laid(id: string, from: Point, to: Point, length: number, terrain: Terrain): Rope {
    const links = Math.max(1, Math.round(length / Rope.LINK_METRES));
    const points = Array.from({ length: links - 1 }, (_, index) => {
      const share = (index + 1) / links;
      const point = { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share };
      const placed = terrain.holds(point) ? terrain.nearest(point) : point;
      return new Particle(placed.x, placed.y);
    });
    const [start, end] = [new Particle(from.x, from.y), new Particle(to.x, to.y)];
    return new Rope(id, start, end, length, points, false);
  }

  static load(save: RopeSave): Rope {
    const [fromX, fromY] = save.from;
    const [toX, toY] = save.to;
    const [from, to] = [new Particle(fromX, fromY), new Particle(toX, toY)];
    const points = save.points.map((point) => Particle.load(point));
    return new Rope(save.id, from, to, save.length, points, save.still);
  }

  save(): RopeSave {
    return {
      id: this.id,
      from: [this.from.x, this.from.y],
      to: [this.to.x, this.to.y],
      length: this.length,
      points: this.points.map((point) => point.save()),
      still: this.still,
    };
  }

  /** Where it is: its anchors and every point between, for the rendering. */
  get shape(): readonly Point[] {
    return this.chain.map(({ x, y }) => ({ x, y }));
  }

  /** Whether it lay still through the last step it moved in: then it waits for a climber. */
  get resting(): boolean {
    return this.still;
  }

  /** After a step it moved in, notes whether any of its points went further than `metres`. */
  rest(metres: number): void {
    this.still = this.points.every((point) => point.moved() <= metres);
  }

  integrate(gravity: number, seconds: number): void {
    for (const point of this.points) {
      point.integrate(gravity, seconds);
    }
  }

  /** Gives back what a link has stretched, then keeps each point within its tethers. */
  relax(): void {
    for (const { from, to, fromShare, toShare } of this.links) {
      const x = to.x - from.x;
      const y = to.y - from.y;
      const distance = Math.sqrt(x * x + y * y);
      if (distance > this.link) {
        const pull = (distance - this.link) / distance / (fromShare + toShare);
        from.shift(x * pull * fromShare, y * pull * fromShare);
        to.shift(-x * pull * toShare, -y * pull * toShare);
      }
    }
    for (const { point, anchor, reach } of this.tethers) {
      Rope.within(point, anchor, reach);
    }
  }

  land(terrain: Terrain, friction: number): void {
    for (const point of this.points) {
      point.land(terrain, friction);
    }
  }

  /** Where on it a carabiner would be nearest a point, and how far that is from the point. */
  nearest(point: Point): { readonly slide: Slide; readonly distance: number } {
    let best = { slide: 0, distance: Infinity };
    for (const [index, link] of this.links.entries()) {
      const share = Rope.share(link, point);
      const distance = Rope.distance(Rope.along(link, share), point);
      if (distance < best.distance) {
        best = { slide: (index + share) * this.link, distance };
      }
    }
    return best;
  }

  /** Slides a carabiner from where it is to the point of the rope nearest a climber, link by
   * link: it runs along the rope, and can't jump across a loop of it. */
  slideToward(slide: Slide, point: Point): Slide {
    let index = this.linkAt(slide);
    let share = Rope.share(this.linkOf(index), point);
    let distance = Rope.distance(Rope.along(this.linkOf(index), share), point);
    for (const step of [-1, 1]) {
      for (let next = index + step; next >= 0 && next < this.links.length; next += step) {
        const nextShare = Rope.share(this.linkOf(next), point);
        const nextDistance = Rope.distance(Rope.along(this.linkOf(next), nextShare), point);
        if (nextDistance >= distance) {
          break;
        }
        index = next;
        share = nextShare;
        distance = nextDistance;
      }
    }
    return (index + share) * this.link;
  }

  /** Whether the rope lets a climber clipped to it be at a point, with a cowstail of `reach`. */
  lets(point: Point, reach: number): boolean {
    return this.overReach(point, reach) <= 0;
  }

  /** Puts a falling climber back where the rope lets them be, if they've gone past it. */
  hold(body: Particle, reach: number): void {
    const over = this.overReach(body, reach);
    if (over <= 0) {
      return;
    }
    const fromX = body.x - this.from.x;
    const fromY = body.y - this.from.y;
    const toX = body.x - this.to.x;
    const toY = body.y - this.to.y;
    const fromDistance = Math.sqrt(fromX * fromX + fromY * fromY);
    const toDistance = Math.sqrt(toX * toX + toY * toY);
    // The way the sum of the two distances grows fastest, out across the ellipse.
    const outX = fromX / fromDistance + toX / toDistance;
    const outY = fromY / fromDistance + toY / toDistance;
    const out = outX * outX + outY * outY;
    if (out > 0) {
      body.shift((-over * outX) / out, (-over * outY) / out);
    }
  }

  /** Whether the rope lets a climber be at a point when their jumar grips it at `slide`: no
   * further from each anchor than the rope on that side of the jumar and a cowstail of `reach`. */
  letsAt(slide: Slide, point: Point, reach: number): boolean {
    return (
      Rope.distance(point, this.from) <= slide + reach &&
      Rope.distance(point, this.to) <= this.length - slide + reach
    );
  }

  /** Puts a falling climber whose jumar grips the rope at `slide` back where the rope lets them
   * be, if they've gone past it. */
  holdAt(slide: Slide, body: Particle, reach: number): void {
    Rope.within(body, this.from, slide + reach);
    Rope.within(body, this.to, this.length - slide + reach);
  }

  /** Pulls the point of the rope nearest a carabiner to within a cowstail of its climber. */
  follow(slide: Slide, climber: Point, reach: number): void {
    if (this.points.length > 0) {
      const index = Math.min(Math.max(Math.round(slide / this.link), 1), this.points.length);
      Rope.within(this.point(index), climber, reach);
    }
  }

  /** How much further a point is from the two anchors together than the rope lets it be. */
  private overReach(point: Point, reach: number): number {
    return (
      Rope.distance(point, this.from) + Rope.distance(point, this.to) - this.length - 2 * reach
    );
  }

  private linkAt(slide: Slide): number {
    return Math.min(Math.max(Math.floor(slide / this.link), 0), this.links.length - 1);
  }

  private linkOf(index: number): Link {
    const link = this.links[index];
    if (link === undefined) {
      throw new RangeError(`The rope ${this.id} has no link ${index}`);
    }
    return link;
  }

  private point(index: number): Particle {
    const point = this.chain[index];
    if (point === undefined) {
      throw new RangeError(`The rope ${this.id} has no point ${index}`);
    }
    return point;
  }

  /** Moves a point toward `toward` until it's no further from it than `reach`. */
  private static within(point: Particle, toward: Point, reach: number): void {
    const x = toward.x - point.x;
    const y = toward.y - point.y;
    const distance = Math.sqrt(x * x + y * y);
    if (distance > reach) {
      const pull = (distance - reach) / distance;
      point.shift(x * pull, y * pull);
    }
  }

  /** How far along a link, from 0 to 1, its point nearest `point` is. */
  private static share(link: Link, point: Point): number {
    const x = link.to.x - link.from.x;
    const y = link.to.y - link.from.y;
    const squared = x * x + y * y;
    if (squared === 0) {
      return 0;
    }
    const projected = ((point.x - link.from.x) * x + (point.y - link.from.y) * y) / squared;
    return Math.min(Math.max(projected, 0), 1);
  }

  private static along(link: Link, share: number): Point {
    return {
      x: link.from.x + (link.to.x - link.from.x) * share,
      y: link.from.y + (link.to.y - link.from.y) * share,
    };
  }

  private static distance(from: Point, to: Point): number {
    const x = to.x - from.x;
    const y = to.y - from.y;
    return Math.sqrt(x * x + y * y);
  }
}
