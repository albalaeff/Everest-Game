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
  /** How much of the climber's weight the rope bears here, 0 to 1 (#232): none, if not said. The
   * rope runs taut from here to each anchor above it, as far as it's loaded. */
  readonly load?: number;
  /** Whether hands pull the rope tight from here, so it runs taut both ways, to an anchor no
   * higher than they are too: a ladder's line held for a crossing. */
  readonly pulled?: boolean;
  /** How far across itself the middle of the loaded rope is drawn, in metres, either way, as it
   * quivers coming taut: not at all, if not said. */
  readonly quiver?: number;
}

/** A point the rope is held at: its place along the chain (2.5 is half way from the third point to
 * the fourth); whether it's drawn back past the rope's first anchor (-1), past its last (1) or
 * along it (0), and its order there, which put the holds in their order along the rope; which of
 * the curve's points it is, how far along the rope, how far it's drawn from where it lies, and how
 * far along the rope back and on it lifts the rope with it. */
interface Hold {
  place: number;
  end: -1 | 0 | 1;
  order: number;
  index: number;
  along: number;
  x: number;
  y: number;
  back: number;
  on: number;
  load: number;
  pulled: boolean;
  quiver: number;
}

/**
 * A rope as the picture draws it (docs/guidelines/graphics.md → Motion): a smooth curve through
 * the chain of points the physics moves, a metre apart, as drawn between the steps. Where a hand
 * holds a jumar off the rope, the rope runs through the jumar, lifted to it over a couple of metres
 * each side, less and less, and not at all at an anchor or another jumar. Where it hangs free of
 * the snow it sways on the gust, the way the wind blows, less near what holds it; on the snow it
 * lies still. It runs through what holds it in the order they're drawn along it, so where the
 * physics has a climber's jumar and second carabiner on one spot, as on a ladder, it goes from
 * the harness up to the hand and never doubles back between them (#250). Where it bears a
 * climber's weight (#232) it runs taut from the jumar or the carabiner that holds them to each
 * anchor above them, straight but where the snow or a lip is in its way, which it bends over, as
 * far as it's loaded; there it turns a corner at what holds it, slack below and taut above,
 * quivers across itself as it comes taut, and doesn't flutter. A taut stretch runs through every
 * hand and carabiner on its way, turning a corner at each, not straight past them (#250).
 * The curve is a centripetal Catmull-Rom spline, which never loops where the points
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
  /** How near its place on the chain is to be to the one nearest an anchor that a jumar's can
   * have for it to be at that anchor, as a share of the link: the sums' rounding. */
  private static readonly AT_AN_END = 1e-9;
  /** How far above what holds a climber an anchor is to bear all of their weight, in metres: one
   * level with them, or below, bears none. */
  private static readonly BEAR_METRES = 0.4;
  /** A taut rope's way over the ground: how far apart across the ground is read, the most
   * readings, and how far clear of the snow the rope runs, in metres. */
  private static readonly GROUND_STEP = 0.05;
  private static readonly MOST_READINGS = 400;
  private static readonly CLEAR_METRES = 0.03;

  private xs = new Float64Array(0);
  private ys = new Float64Array(0);
  private distances = new Float64Array(0);
  private points = 0;
  private readonly holds: Hold[] = [];
  private holding = 0;
  private pieces = new Uint8Array(0);
  private curve = new Float64Array(0);
  private count = 0;
  /** How taut the rope is at each point, 0 to 1, and how sharp a corner it turns there. */
  private tight = new Float64Array(0);
  private corner = new Float64Array(0);
  /** A taut rope's way from what holds a climber to an anchor: its corners, and how far along it
   * each is. */
  private pathX = new Float64Array(0);
  private pathY = new Float64Array(0);
  private pathAlong = new Float64Array(0);
  private path = 0;

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
    const taut = this.tighten(ground);
    const hangs = this.sway(ground, gust, elapsed);
    this.smooth();
    return hangs || taut;
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
      holds.push({
        place: 0,
        end: 0,
        order: 0,
        index: 0,
        along: 0,
        x: 0,
        y: 0,
        back: 0,
        on: 0,
        load: 0,
        pulled: false,
        quiver: 0,
      });
    }
    this.holding = links < 2 ? 0 : held.length;
    const first = RopeCurve.APART + RopeCurve.AT_AN_END;
    const last = links - 1 - first;
    for (let index = 0; index < this.holding; index += 1) {
      const hold = holds[index];
      const jumar = held[index];
      if (hold !== undefined && jumar !== undefined) {
        hold.place = RopeCurve.placeOn(chain, jumar.on);
        const ahead = RopeCurve.drawnOn(chain, hold.place, jumar.on, jumar.drawn);
        hold.end = hold.place >= last && ahead > 0 ? 1 : hold.place <= first && ahead < 0 ? -1 : 0;
        // Along the rope, the further it's drawn, the later; past an anchor, the nearer it, the
        // later from its first and the sooner from its last.
        hold.order = hold.end === 0 ? hold.place + ahead : -ahead;
        hold.x = jumar.drawn.x;
        hold.y = jumar.drawn.y;
        hold.load = Math.min(Math.max(jumar.load ?? 0, 0), 1);
        hold.pulled = jumar.pulled ?? false;
        hold.quiver = jumar.quiver ?? 0;
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

  /** The holds in the order the rope runs through them: there are only ever a few. Along the rope
   * each goes where it's drawn along it, so where the physics has a climber's jumar and second
   * carabiner on one spot, as on a ladder, the jumar in their hand goes past the carabiner at their
   * harness, and the rope never doubles back between them; none goes on the rope before one it's
   * drawn past. Past an anchor, where the rope ends, it runs out to them and back, to the furthest
   * first and back by the nearer: up to the hands of whoever holds it tight past its top anchor,
   * and down by their harness to the anchor. */
  private sortHolds(): void {
    const { holds } = this;
    for (let index = 1; index < this.holding; index += 1) {
      for (let at = index; at > 0; at -= 1) {
        const before = holds[at - 1];
        const hold = holds[at];
        if (
          before === undefined ||
          hold === undefined ||
          before.end < hold.end ||
          (before.end === hold.end && before.order <= hold.order)
        ) {
          break;
        }
        holds[at - 1] = hold;
        holds[at] = before;
      }
    }
    // Each on the rope no further back than the one before it, so they go into it in this order.
    for (let index = 1; index < this.holding; index += 1) {
      const before = holds[index - 1];
      const hold = holds[index];
      if (before !== undefined && hold !== undefined) {
        hold.place = Math.max(hold.place, before.place);
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

  /** The rope under a climber's weight (#232): from each jumar or carabiner that bears some of
   * it, taut to each anchor above it, or to both where hands pull it tight, as far as it's
   * loaded. Whether any of it is. */
  private tighten(ground: (x: number) => number): boolean {
    const { holds, ys, points } = this;
    if (this.tight.length < points) {
      this.tight = new Float64Array(points);
      this.corner = new Float64Array(points);
    }
    this.tight.fill(0, 0, points);
    this.corner.fill(0, 0, points);
    let taut = false;
    for (let index = 0; index < this.holding; index += 1) {
      const hold = holds[index];
      if (hold === undefined || !(hold.load > 0)) {
        continue;
      }
      for (const anchor of [0, points - 1]) {
        // As far as the next hold that bears weight, if there is one on the way: the rope is
        // taut from a hauler's hands to whoever hangs on it, not on past them (#239).
        const end = this.loadedBefore(hold, anchor);
        const rise = ((ys[end] ?? 0) - (ys[hold.index] ?? 0)) / RopeCurve.BEAR_METRES;
        const bear = hold.load * (hold.pulled ? 1 : RopeCurve.ease(rise));
        if (end !== hold.index && bear > 0) {
          this.pull(hold, end, bear, ground);
          taut = true;
        }
      }
    }
    return taut;
  }

  /** The point the rope runs taut to from `hold` toward the anchor at `anchor`: the nearest other
   * hold on the way that bears weight, or the anchor. */
  private loadedBefore(hold: Hold, anchor: number): number {
    let nearest = anchor;
    for (let index = 0; index < this.holding; index += 1) {
      const other = this.holds[index];
      if (other === undefined || other === hold || !(other.load > 0)) {
        continue;
      }
      const between =
        anchor > hold.index
          ? other.index > hold.index && other.index < nearest
          : other.index < hold.index && other.index > nearest;
      if (between) {
        nearest = other.index;
      }
    }
    return nearest;
  }

  /** The rope from a hold to the anchor or the hold at `end`, brought `bear` of the way to its
   * taut way: through each hand or carabiner on the rope on the way, which stay where they're
   * drawn, so it runs taut from one to the next and turns a corner at each, as a rope pulled
   * tight through them does, rather than straight past them. */
  private pull(hold: Hold, end: number, bear: number, ground: (x: number) => number): void {
    const step = end > hold.index ? 1 : -1;
    let from = hold.index;
    for (let point = from + step; ; point += step) {
      const held = this.heldAt(point);
      if (point === end || held) {
        this.pullStretch(from, point, bear, hold.quiver, ground);
        this.corner[from] = Math.max(this.corner[from] ?? 0, bear);
      }
      if (point === end) {
        return;
      }
      if (held) {
        this.tight[point] = Math.max(this.tight[point] ?? 0, bear);
        from = point;
      }
    }
  }

  /** Whether a hold is drawn at the curve's point `point`. */
  private heldAt(point: number): boolean {
    for (let index = 0; index < this.holding; index += 1) {
      if (this.holds[index]?.index === point) {
        return true;
      }
    }
    return false;
  }

  /** The rope between two of its points, nothing holding it between them, brought `bear` of the
   * way to its taut way between them, each point as far along that as it is along the rope, and
   * across it by `quiver`, most in the middle. */
  private pullStretch(
    from: number,
    to: number,
    bear: number,
    quiver: number,
    ground: (x: number) => number,
  ): void {
    const { xs, ys, distances } = this;
    const fromX = xs[from] ?? 0;
    const fromY = ys[from] ?? 0;
    const toX = xs[to] ?? 0;
    const toY = ys[to] ?? 0;
    const length = this.tautWay(fromX, fromY, toX, toY, ground);
    const rope = Math.abs((distances[to] ?? 0) - (distances[from] ?? 0));
    const straight = Math.hypot(toX - fromX, toY - fromY);
    if (!(rope > 0) || !(length > 0) || !(straight > 0)) {
      return;
    }
    const acrossX = -(toY - fromY) / straight;
    const acrossY = (toX - fromX) / straight;
    const step = to > from ? 1 : -1;
    for (let point = from + step; point !== to; point += step) {
      const share = Math.abs((distances[point] ?? 0) - (distances[from] ?? 0)) / rope;
      this.tight[point] = Math.max(this.tight[point] ?? 0, bear);
      const shaken = quiver * Math.sin(Math.PI * share);
      const x = this.onTheWay(share * length, this.pathX) + acrossX * shaken;
      const y = this.onTheWay(share * length, this.pathY) + acrossY * shaken;
      xs[point] = (xs[point] ?? 0) + (x - (xs[point] ?? 0)) * bear;
      ys[point] = (ys[point] ?? 0) + (y - (ys[point] ?? 0)) * bear;
    }
  }

  /** The taut way from one point to another over the ground, into `pathX` and `pathY`: straight,
   * but where the snow or a lip between them stands in its way, which it bends over, as a
   * string pulled tight does. How long it is. */
  private tautWay(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    ground: (x: number) => number,
  ): number {
    const { GROUND_STEP, MOST_READINGS, CLEAR_METRES } = RopeCurve;
    const forward = toX >= fromX;
    const [leftX, leftY, rightX, rightY] = forward
      ? [fromX, fromY, toX, toY]
      : [toX, toY, fromX, fromY];
    const across = rightX - leftX;
    const readings = Math.min(Math.max(Math.ceil(across / GROUND_STEP) - 1, 0), MOST_READINGS);
    const room = readings + 2;
    if (this.pathX.length < room) {
      this.pathX = new Float64Array(room);
      this.pathY = new Float64Array(room);
      this.pathAlong = new Float64Array(room);
    }
    const { pathX, pathY, pathAlong } = this;
    // The upper hull of the two ends and the ground between them, from the left.
    let count = 1;
    pathX[0] = leftX;
    pathY[0] = leftY;
    for (let reading = 1; reading <= readings + 1; reading += 1) {
      const last = reading === readings + 1;
      const x = last ? rightX : leftX + (across * reading) / (readings + 1);
      // Only ground that stands in the straight line's way bends it: the rope runs clear of it.
      const snow = last ? rightY : ground(x);
      const line = leftY + ((rightY - leftY) * (x - leftX)) / (across || 1);
      if (!last && snow <= line) {
        continue;
      }
      const y = last ? rightY : snow + CLEAR_METRES;
      while (count >= 2) {
        const overX = (pathX[count - 1] ?? 0) - (pathX[count - 2] ?? 0);
        const overY = (pathY[count - 1] ?? 0) - (pathY[count - 2] ?? 0);
        const turn = overX * (y - (pathY[count - 2] ?? 0)) - overY * (x - (pathX[count - 2] ?? 0));
        if (turn < 0) {
          break;
        }
        count -= 1;
      }
      pathX[count] = x;
      pathY[count] = y;
      count += 1;
    }
    if (!forward) {
      for (let low = 0, high = count - 1; low < high; low += 1, high -= 1) {
        const x = pathX[low] ?? 0;
        const y = pathY[low] ?? 0;
        pathX[low] = pathX[high] ?? 0;
        pathY[low] = pathY[high] ?? 0;
        pathX[high] = x;
        pathY[high] = y;
      }
    }
    let along = 0;
    pathAlong[0] = 0;
    for (let corner = 1; corner < count; corner += 1) {
      along += Math.hypot(
        (pathX[corner] ?? 0) - (pathX[corner - 1] ?? 0),
        (pathY[corner] ?? 0) - (pathY[corner - 1] ?? 0),
      );
      pathAlong[corner] = along;
    }
    this.path = count;
    return along;
  }

  /** One coordinate of the taut way's point `along` it, in metres from its start. */
  private onTheWay(along: number, of: Float64Array): number {
    const { pathAlong, path } = this;
    for (let corner = 1; corner < path; corner += 1) {
      const end = pathAlong[corner] ?? 0;
      if (along <= end || corner === path - 1) {
        const start = pathAlong[corner - 1] ?? 0;
        const share = end > start ? Math.min(Math.max((along - start) / (end - start), 0), 1) : 0;
        return (of[corner - 1] ?? 0) + ((of[corner] ?? 0) - (of[corner - 1] ?? 0)) * share;
      }
    }
    return of[0] ?? 0;
  }

  /** The rope's free lengths on the gust: blown the way the wind blows, and fluttering across the
   * rope in waves that run along it, but where it's taut. */
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
        const share = blow * hanging * loose * (1 - (this.tight[point] ?? 0));
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
      // Past its ends, the rope goes on the way it went; and so it does past what it's taut
      // from, as far as it is, turning a corner there (#232).
      const before = link > 0 ? 1 - (this.corner[link] ?? 0) : 0;
      const after = link + 2 < points ? 1 - (this.corner[link + 1] ?? 0) : 0;
      const x0 = 2 * x1 - x2 + before * ((xs[link - 1] ?? 0) - (2 * x1 - x2));
      const y0 = 2 * y1 - y2 + before * ((ys[link - 1] ?? 0) - (2 * y1 - y2));
      const x3 = 2 * x2 - x1 + after * ((xs[link + 2] ?? 0) - (2 * x2 - x1));
      const y3 = 2 * y2 - y1 + after * ((ys[link + 2] ?? 0) - (2 * y2 - y1));
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

  /** How far along the chain a hold at `place` is drawn from where it's `on` the rope, in links:
   * the way from one to the other along the link it's on. A jumar in a hand above the harness is
   * drawn further along a rope that goes up than the carabiner at the harness. */
  private static drawnOn(chain: Chain, place: number, on: Point, drawn: Point): number {
    const link = Math.min(Math.max(Math.floor(place), 0), chain.length - 2);
    const dx = chain.x(link + 1) - chain.x(link);
    const dy = chain.y(link + 1) - chain.y(link);
    const square = dx * dx + dy * dy;
    return square > 0 ? ((drawn.x - on.x) * dx + (drawn.y - on.y) * dy) / square : 0;
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
