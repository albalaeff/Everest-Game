import type { Point } from "../physics";

/** A rope's chain of points as drawn this frame: `SteppedPoints`. */
export interface Chain {
  readonly length: number;
  x(index: number): number;
  y(index: number): number;
}

/** A jumar held off the rope: where the physics has its carabiner `on` the rope, and where it's
 * `drawn`, in the hand that holds it. The rope runs through it. */
export interface Held {
  readonly on: Point;
  readonly drawn: Point;
}

/** A point the rope is held at: its place along the chain (2.5 is half way from the third point to
 * the fourth), which of the curve's points it is, how far along the rope, how far it's drawn from
 * where it lies, and how far along the rope back and on it lifts the rope with it. */
interface Hold {
  place: number;
  index: number;
  along: number;
  x: number;
  y: number;
  back: number;
  on: number;
}

/**
 * A rope as the picture draws it (docs/guidelines/graphics.md → Motion): a smooth curve through
 * the chain of points the physics moves, a metre apart, as drawn between the steps. Where a hand
 * holds a jumar off the rope, the rope runs through the jumar, lifted to it over a couple of metres
 * each side, less and less, and not at all at an anchor or another jumar. Where it hangs free of
 * the snow it sways on the gust, the way the wind blows, less near what holds it; on the snow it
 * lies still. The curve is a centripetal Catmull-Rom spline, which never loops where the points
 * are uneven, in a few pieces a link. It keeps only the picture's own: the curve, in arrays it
 * reuses.
 */
export class RopeCurve {
  /** How far the rope turns, at most, for each piece of curve along a link it turns at the end of,
   * in radians, and the most pieces a link. */
  private static readonly TURN_A_PIECE = Math.PI / 36;
  private static readonly MOST_PIECES = 16;
  /** How far along the rope a jumar held off it lifts it, back and on. */
  static readonly LIFT_METRES = 2.5;
  /** How far over the snow the rope starts to hang free, and how far there the full gust blows it
   * downwind and makes it flutter across, each way. */
  static readonly FREE_METRES = 0.15;
  static readonly BLOWN_METRES = 0.05;
  static readonly SWAY_METRES = 0.06;
  /** How often the sway comes and goes, how far along the rope a wave of it runs, and over how
   * much rope from an anchor or a jumar it grows. */
  private static readonly SWAY_HZ = 0.6;
  private static readonly SWAY_WAVE = 0.8;
  private static readonly HELD_METRES = 1.5;
  /** How near one of the chain's points a jumar's goes, as a share of the link. */
  private static readonly APART = 0.02;

  private xs = new Float64Array(0);
  private ys = new Float64Array(0);
  private distances = new Float64Array(0);
  private points = 0;
  private readonly holds: Hold[] = [];
  private holding = 0;
  private pieces = new Uint8Array(0);
  private curve = new Float64Array(0);
  private count = 0;

  /** How many points the curve has. */
  get length(): number {
    return this.count;
  }

  x(index: number): number {
    return this.curve[2 * index] ?? Number.NaN;
  }

  y(index: number): number {
    return this.curve[2 * index + 1] ?? Number.NaN;
  }

  /** The curve through `chain` as drawn this frame, run through each jumar `held`, over the ground
   * `ground` gives the height of, on a gust of `gust`, 0 to 1, at `elapsed` seconds of picture.
   * Whether it hangs free of the snow anywhere, a calm or not: one that does sways while the wind
   * blows, and one that doesn't, and hasn't moved, needn't be drawn again. */
  shape(
    chain: Chain,
    held: readonly Held[],
    ground: (x: number) => number,
    gust: number,
    elapsed: number,
  ): boolean {
    this.lay(chain, held);
    this.lift();
    const hangs = this.sway(ground, gust, elapsed);
    this.smooth();
    return hangs;
  }

  /** The chain's points, with a point put in for each jumar where its carabiner is on the rope. */
  private lay(chain: Chain, held: readonly Held[]): void {
    const links = chain.length;
    const room = links + held.length;
    if (this.xs.length < room) {
      this.xs = new Float64Array(room);
      this.ys = new Float64Array(room);
      this.distances = new Float64Array(room);
    }
    const { holds, xs, ys, distances } = this;
    while (holds.length < held.length) {
      holds.push({ place: 0, index: 0, along: 0, x: 0, y: 0, back: 0, on: 0 });
    }
    this.holding = links < 2 ? 0 : held.length;
    for (let index = 0; index < this.holding; index += 1) {
      const hold = holds[index];
      const jumar = held[index];
      if (hold !== undefined && jumar !== undefined) {
        hold.place = RopeCurve.placeOn(chain, jumar.on);
        hold.x = jumar.drawn.x;
        hold.y = jumar.drawn.y;
      }
    }
    this.sortHolds();
    let out = 0;
    let next = 0;
    for (let link = 0; link < links; link += 1) {
      const x = chain.x(link);
      const y = chain.y(link);
      xs[out] = x;
      ys[out] = y;
      out += 1;
      for (let hold = holds[next]; next < this.holding && hold !== undefined; hold = holds[next]) {
        if (hold.place >= link + 1) {
          break;
        }
        const share = hold.place - link;
        xs[out] = x + (chain.x(link + 1) - x) * share;
        ys[out] = y + (chain.y(link + 1) - y) * share;
        hold.index = out;
        out += 1;
        next += 1;
      }
    }
    this.points = out;
    let along = 0;
    for (let index = 0; index < out; index += 1) {
      if (index > 0) {
        along += Math.hypot(
          (xs[index] ?? 0) - (xs[index - 1] ?? 0),
          (ys[index] ?? 0) - (ys[index - 1] ?? 0),
        );
      }
      distances[index] = along;
    }
    for (let index = 0; index < this.holding; index += 1) {
      const hold = holds[index];
      if (hold !== undefined) {
        hold.along = distances[hold.index] ?? 0;
      }
    }
  }

  /** The holds in order along the rope: there are only ever a few. */
  private sortHolds(): void {
    const { holds } = this;
    for (let index = 1; index < this.holding; index += 1) {
      for (let at = index; at > 0; at -= 1) {
        const before = holds[at - 1];
        const hold = holds[at];
        if (before === undefined || hold === undefined || before.place <= hold.place) {
          break;
        }
        holds[at - 1] = hold;
        holds[at] = before;
      }
    }
  }

  /** Each jumar's point brought to where it's drawn, the rope back and on with it less and less, to
   * nothing at the next jumar or an anchor: between two jumars, the rope goes from one's lift to
   * the other's. */
  private lift(): void {
    const { holds, xs, ys, distances } = this;
    const total = distances[this.points - 1] ?? 0;
    for (let index = 0; index < this.holding; index += 1) {
      const hold = holds[index];
      if (hold !== undefined) {
        const before = holds[index - 1]?.along ?? 0;
        const after = index + 1 < this.holding ? (holds[index + 1]?.along ?? total) : total;
        hold.back = Math.min(RopeCurve.LIFT_METRES, hold.along - before);
        hold.on = Math.min(RopeCurve.LIFT_METRES, after - hold.along);
        hold.x -= xs[hold.index] ?? 0;
        hold.y -= ys[hold.index] ?? 0;
      }
    }
    // A jumar's own point goes where it's drawn; the rest of the rope by the lifts it's within.
    let own = 0;
    for (let point = 0; point < this.points; point += 1) {
      const mine = holds[own];
      let dx = 0;
      let dy = 0;
      if (own < this.holding && mine !== undefined && mine.index === point) {
        dx = mine.x;
        dy = mine.y;
        own += 1;
      } else {
        const along = distances[point] ?? 0;
        for (let index = 0; index < this.holding; index += 1) {
          const hold = holds[index];
          const away = along - (hold?.along ?? 0);
          const reach = (away < 0 ? hold?.back : hold?.on) ?? 0;
          if (hold !== undefined && Math.abs(away) < reach) {
            const share = (1 + Math.cos((Math.PI * away) / reach)) / 2;
            dx += hold.x * share;
            dy += hold.y * share;
          }
        }
      }
      xs[point] = (xs[point] ?? 0) + dx;
      ys[point] = (ys[point] ?? 0) + dy;
    }
  }

  /** The rope's free lengths on the gust: blown the way the wind blows, and fluttering across the
   * rope in waves that run along it. */
  private sway(ground: (x: number) => number, gust: number, elapsed: number): boolean {
    const { holds, xs, ys, distances } = this;
    const total = distances[this.points - 1] ?? 0;
    const free = RopeCurve.FREE_METRES;
    const held = RopeCurve.HELD_METRES;
    const blow = Math.max(gust, 0);
    let hangs = false;
    let lastX = xs[0] ?? 0;
    let lastY = ys[0] ?? 0;
    for (let point = 1; point < this.points - 1; point += 1) {
      const x = xs[point] ?? 0;
      const y = ys[point] ?? 0;
      const hanging = RopeCurve.ease((y - ground(x) - free) / free);
      const along = distances[point] ?? 0;
      let loose = Math.min(1, along / held, (total - along) / held);
      for (let index = 0; index < this.holding; index += 1) {
        loose = Math.min(loose, Math.abs(along - (holds[index]?.along ?? Infinity)) / held);
      }
      if (hanging > 0 && loose > 0) {
        const wave = RopeCurve.SWAY_HZ * elapsed - along / RopeCurve.SWAY_WAVE;
        const flutter = RopeCurve.SWAY_METRES * Math.sin(2 * Math.PI * wave);
        const acrossX = (xs[point + 1] ?? x) - lastX;
        const acrossY = (ys[point + 1] ?? y) - lastY;
        const length = Math.hypot(acrossX, acrossY) || 1;
        const share = blow * hanging * loose;
        xs[point] = x + share * (RopeCurve.BLOWN_METRES - (flutter * acrossY) / length);
        ys[point] = y + (share * flutter * acrossX) / length;
        hangs = true;
      }
      lastX = x;
      lastY = y;
    }
    return hangs;
  }

  /** The curve through the points: a centripetal Catmull-Rom spline, in one piece along a link
   * where it runs straight, and more the sharper it turns at either end. */
  private smooth(): void {
    const { points, xs, ys } = this;
    if (this.pieces.length < points) {
      this.pieces = new Uint8Array(points);
    }
    let count = points < 2 ? points : 1;
    let turned = this.turnAt(0);
    for (let link = 0; link < points - 1; link += 1) {
      const turning = this.turnAt(link + 1);
      const pieces = 1 + Math.ceil(Math.max(turned, turning) / RopeCurve.TURN_A_PIECE);
      this.pieces[link] = Math.min(pieces, RopeCurve.MOST_PIECES);
      count += this.pieces[link] ?? 1;
      turned = turning;
    }
    this.count = count;
    if (this.curve.length < 2 * count) {
      this.curve = new Float64Array(2 * count);
    }
    const { curve } = this;
    let out = 0;
    for (let link = 0; link < points - 1; link += 1) {
      const pieces = this.pieces[link] ?? 1;
      const x1 = xs[link] ?? 0;
      const y1 = ys[link] ?? 0;
      const x2 = xs[link + 1] ?? 0;
      const y2 = ys[link + 1] ?? 0;
      // Past its ends, the rope goes on the way it went.
      const x0 = link > 0 ? (xs[link - 1] ?? 0) : 2 * x1 - x2;
      const y0 = link > 0 ? (ys[link - 1] ?? 0) : 2 * y1 - y2;
      const x3 = link + 2 < points ? (xs[link + 2] ?? 0) : 2 * x2 - x1;
      const y3 = link + 2 < points ? (ys[link + 2] ?? 0) : 2 * y2 - y1;
      const t1 = RopeCurve.knot(x0, y0, x1, y1);
      const t2 = t1 + RopeCurve.knot(x1, y1, x2, y2);
      const t3 = t2 + RopeCurve.knot(x2, y2, x3, y3);
      for (let piece = 0; piece < pieces; piece += 1) {
        // Barry and Goldman's pyramid, with the knots at 0, t1, t2 and t3.
        const t = t1 + ((t2 - t1) * piece) / pieces;
        const ax1 = ((t1 - t) * x0 + t * x1) / t1;
        const ay1 = ((t1 - t) * y0 + t * y1) / t1;
        const ax2 = ((t2 - t) * x1 + (t - t1) * x2) / (t2 - t1);
        const ay2 = ((t2 - t) * y1 + (t - t1) * y2) / (t2 - t1);
        const ax3 = ((t3 - t) * x2 + (t - t2) * x3) / (t3 - t2);
        const ay3 = ((t3 - t) * y2 + (t - t2) * y3) / (t3 - t2);
        const bx1 = ((t2 - t) * ax1 + t * ax2) / t2;
        const by1 = ((t2 - t) * ay1 + t * ay2) / t2;
        const bx2 = ((t3 - t) * ax2 + (t - t1) * ax3) / (t3 - t1);
        const by2 = ((t3 - t) * ay2 + (t - t1) * ay3) / (t3 - t1);
        curve[out] = ((t2 - t) * bx1 + (t - t1) * bx2) / (t2 - t1);
        curve[out + 1] = ((t2 - t) * by1 + (t - t1) * by2) / (t2 - t1);
        out += 2;
      }
    }
    if (points > 0) {
      curve[out] = xs[points - 1] ?? 0;
      curve[out + 1] = ys[points - 1] ?? 0;
    }
  }

  /** How far the rope turns at a point, in radians: not at all at its ends. */
  private turnAt(point: number): number {
    if (point <= 0 || point >= this.points - 1) {
      return 0;
    }
    const { xs, ys } = this;
    const x = xs[point] ?? 0;
    const y = ys[point] ?? 0;
    const inX = x - (xs[point - 1] ?? 0);
    const inY = y - (ys[point - 1] ?? 0);
    const outX = (xs[point + 1] ?? 0) - x;
    const outY = (ys[point + 1] ?? 0) - y;
    return Math.abs(Math.atan2(inX * outY - inY * outX, inX * outX + inY * outY));
  }

  /** Where on the chain a point is nearest: the link, and how far along it. Never quite at one of
   * the chain's points, so a jumar's point goes in between two. */
  private static placeOn(chain: Chain, point: Point): number {
    let place = 0;
    let nearest = Infinity;
    for (let link = 0; link < chain.length - 1; link += 1) {
      const x = chain.x(link);
      const y = chain.y(link);
      const dx = chain.x(link + 1) - x;
      const dy = chain.y(link + 1) - y;
      const square = dx * dx + dy * dy;
      const share = square > 0 ? ((point.x - x) * dx + (point.y - y) * dy) / square : 0;
      const on = Math.min(Math.max(share, RopeCurve.APART), 1 - RopeCurve.APART);
      const away = Math.hypot(x + dx * on - point.x, y + dy * on - point.y);
      if (away < nearest) {
        nearest = away;
        place = link + on;
      }
    }
    return place;
  }

  /** The knot interval of a centripetal spline between two points: the square root of how far
   * apart they are, and never nothing. */
  private static knot(x0: number, y0: number, x1: number, y1: number): number {
    return Math.max(Math.sqrt(Math.hypot(x1 - x0, y1 - y0)), 1e-6);
  }

  /** 0 to 1, easing in and out. */
  private static ease(share: number): number {
    const t = Math.min(Math.max(share, 0), 1);
    return t * t * (3 - 2 * t);
  }
}
