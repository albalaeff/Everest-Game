import type { Point } from "../physics";
import { SeededRandom } from "../simulation";

/** A puff of what a serac's fall raises, the snow off its top or the ice dust of the fall, as the
 * picture draws it: its middle and its radius, in the layer's metres, and how much of it shows, 0
 * to 1. */
export interface DustPuff {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly shows: number;
}

/** A piece of a serac's fall, placed: a chip off its crack, a block of its top, with the snow
 * that lay on it if any did, or a shard or a chunk of a block that has landed. */
export interface FallingPiece {
  readonly kind: "chip" | "block" | "shard" | "chunk";
  readonly corners: readonly Point[];
  readonly snow?: readonly Point[];
}

/** A serac as it stands when it breaks: its outline, whole or a stump; the snow on its top, if
 * it has any still; which way it leans out along x; and how high the ice about its foot is. */
export interface StandingSerac {
  readonly outline: readonly Point[];
  readonly snow: readonly Point[] | null;
  readonly turned: 1 | -1;
  readonly base: number;
}

/** A serac's fall at a moment, as the picture draws it (#229). */
export interface SeracFallFrame {
  /** The crack across it, back to front, as far as it has run, while its top stands; none after. */
  readonly crack: readonly Point[];
  /** How far the crack has opened, 0 to 1. */
  readonly open: number;
  /** How far its top leans out on the crack, in radians about `pivot`, until it breaks off; none
   * after. */
  readonly lean: number | null;
  /** What's coming down, and what's still moving of what came down. */
  readonly pieces: readonly FallingPiece[];
  /** The snow sloughing off it, and the ice dust of the fall. */
  readonly dust: readonly DustPuff[];
  /** How hard the picture shakes, 0 to about 1. */
  readonly shake: number;
}

/** How long it cracks and how long its ice falls, in seconds of play. */
export interface SeracTiming {
  readonly crack: number;
  readonly fall: number;
}

/** A block of its top: its corners about its middle, the snow on it, and its middle as it stood,
 * upright; how
 * wide it is; when it lets go of the rest of the top, in seconds after the break, and its middle,
 * its turn and how fast it goes then; how fast it turns as it falls; when it lands, and where. */
interface Block {
  readonly corners: readonly Point[];
  readonly snow: readonly Point[] | null;
  readonly middle: Point;
  readonly size: number;
  readonly goes: number;
  readonly from: Point;
  readonly turn: number;
  readonly velocity: Point;
  readonly spin: number;
  readonly lands: number;
  readonly landing: Point;
}

/** A block as it's planned before its fall is timed: its corners and its middle, upright; where
 * it lands along x; how far below its middle it reaches as it lands, and turned how far then; how
 * long after the first it lets go. */
interface Planned {
  readonly corners: readonly Point[];
  readonly snow: readonly Point[] | null;
  readonly middle: Point;
  readonly target: number;
  readonly reach: number;
  readonly landsTurned: number;
  readonly after: number;
}

/** A shard or a chunk of a block that landed: its corners about its middle; where it leaves the
 * landing and when, in seconds after the crack began; how long it moves, a shard hopping and a
 * chunk sliding; how fast a shard hops up; where it comes to rest, and how far it turns a second. */
interface Fragment {
  readonly kind: "shard" | "chunk";
  readonly corners: readonly Point[];
  readonly from: Point;
  readonly starts: number;
  readonly moves: number;
  readonly hop: number;
  readonly rest: Point;
  readonly spin: number;
}

/** A chip off the crack: when it breaks off, in seconds after the crack began, from where, its
 * corners, and how fast it drifts out along x as it falls. */
interface Chip {
  readonly born: number;
  readonly from: Point;
  readonly corners: readonly Point[];
  readonly drift: number;
}

/** A puff, from its birth, in seconds after the crack began: where it starts, how fast it bursts
 * out, how soon the air stops it, how fast it rises; its radius at birth and at its widest and how
 * soon it grows; how much of it shows at most, and how soon it fades. */
interface Puff {
  readonly born: number;
  readonly from: Point;
  readonly out: Point;
  readonly drag: number;
  readonly rise: number;
  readonly radius: { readonly from: number; readonly to: number; readonly grows: number };
  readonly shows: number;
  readonly fades: number;
}

/** Where an outline crosses a height: on the edge from its corner `index`, going up or down. */
interface Crossing {
  readonly index: number;
  readonly point: Point;
  readonly rising: boolean;
}

/**
 * A serac's fall (#229), as it happens, for the picture alone: where each piece of it is, from the
 * serac's outline as it stands, the way it leans, the ground of the route under it, the seconds its
 * crack runs and its ice falls, where its ice may land, and a seed of its own; no game state. A
 * crack runs across it, back to front, at a height the seed picks, a few chips falling off it and
 * snow sloughing off its top as it leans out on the crack. Then its top breaks off in blocks, the
 * front one first, which fall and tumble, life size, the first landing as the hazard comes down;
 * each shatters as it lands, its shards hopping and its chunks sliding to rest across the route,
 * and a cloud of ice dust billows up and rolls away on the wind. What it leaves: its stump, the
 * fresh break along the stump's top, and the rubble, drawn from draws of their own, so that they
 * are the same whatever the seconds and a reload builds them again from the strike.
 */
export class SeracFall {
  /** How high up it breaks, as a share of how tall it stands over the ice about its foot: low
   * enough for the view to show the crack over the climbers' heads; how jagged the crack is, in
   * metres, and in how many pieces; and how far its top leans out before it goes, in radians. */
  private static readonly BREAK = { least: 0.25, most: 0.45 };
  private static readonly JAG = 0.35;
  private static readonly CRACK_PIECES = 8;
  private static readonly LEAN = 0.05;
  /** How deep the fresh break shows down the stump's top, in metres. */
  private static readonly FACE = 0.5;
  /** How wide and how tall a block is, about, in metres; the fewest and the most blocks across,
   * and the most up. */
  private static readonly BLOCK_WIDTH = 2.6;
  private static readonly BLOCK_HEIGHT = 3.5;
  private static readonly COLUMNS = { fewest: 2, most: 3 };
  private static readonly ROWS = 3;
  /** How long after the one before each block lets go, in seconds, front to back; and how fast
   * its top tips over its front edge till they do: half its turn's speeding up, in radians a
   * second squared. */
  private static readonly LETS_GO = { least: 0.06, most: 0.18 };
  private static readonly TIP = 0.3;
  /** How far out its blocks land, in metres along x past its front at the crack, and how much
   * further a block goes for each row up it was; how many quarter turns each tumbles over as it
   * falls, and how far off a whole quarter it lands, in radians. */
  private static readonly THROWN = 6;
  private static readonly UPPER_FURTHER = { least: 0.5, most: 1.5 };
  private static readonly QUARTERS = { fewest: 1, most: 3 };
  private static readonly TUMBLE_JITTER = { least: -0.25, most: 0.25 };
  /** Gravity, for what hops off the route and the chips off the crack. */
  private static readonly GRAVITY = 9.81;
  /** The shards a block shatters into, a few more for a bigger block; their size as a share of
   * the block's, and how fast they hop up and fly out, in m/s. */
  private static readonly SHARDS = { least: 5, aMetre: 1.5, most: 10 };
  private static readonly SHARD_SIZE = { least: 0.08, most: 0.2 };
  private static readonly HOP = { least: 1.5, most: 4.5 };
  private static readonly FLIES = 3;
  /** Its chunks: how many, a third for a block bigger than 3 m; their size as a share of the
   * block's; how fast they slide off, in m/s, and how hard the snow stops them, in m/s². */
  private static readonly CHUNKS = 2;
  private static readonly BIG_BLOCK = 3;
  private static readonly CHUNK_SIZE = { least: 0.32, most: 0.5 };
  private static readonly SLIDE = { least: 0.8, most: 2.6 };
  private static readonly FRICTION = 4;
  /** How deep in the snow a piece rests: its middle above the ground, as a share of its size. */
  private static readonly SUNK = 0.3;
  /** The chips off the crack: so many a second of crack, the fewest and the most; how big, in
   * metres, and how fast they drift out. */
  private static readonly CHIPS = { aSecond: 2, fewest: 1, most: 8 };
  private static readonly CHIP_SIZE = { least: 0.08, most: 0.22 };
  private static readonly CHIP_DRIFT = { least: 0.1, most: 0.6 };
  /** The snow that sloughs off its top as it cracks: so many puffs a second of crack, the fewest
   * and the most; how fast it falls down the face, in m/s, how big it grows, and how soon it
   * fades. */
  private static readonly SLOUGH = { aSecond: 3, fewest: 3, most: 10, falls: 2.5 };
  private static readonly SLOUGH_RADIUS = 0.8;
  private static readonly SLOUGH_FADES = 1.1;
  /** The dust a block trails as it falls: a puff every so many seconds, how big it grows, how much
   * shows, and how soon it fades. */
  private static readonly TRAIL = { every: 0.1, radius: 0.9, shows: 0.22, fades: 0.8 };
  /** The cloud a block raises as it lands: so many puffs, a few more for a bigger block; how fast
   * they burst out, in m/s, flatter than they're thrown; how soon the air stops them and how fast
   * they rise after; how big they grow, as a share of the block's size, and how soon; how much
   * shows, and how soon it fades, in seconds. */
  private static readonly CLOUD = {
    least: 6,
    aMetre: 1.5,
    most: 12,
    burst: { least: 2.5, most: 6 },
    flat: 0.5,
    drag: 0.45,
    rise: { least: 0.4, most: 0.9 },
    radius: { least: 0.5, most: 0.9 },
    grows: 1.2,
    shows: { least: 0.25, most: 0.45 },
    fades: { least: 1.8, most: 3 },
  };
  /** How fast the wind carries the dust at its full gust, in m/s, along x as the blown snow goes. */
  private static readonly WIND = 4;
  /** How hard the picture shakes as it cracks, as its ice falls and as each block lands, and how
   * soon that dies, in seconds. */
  private static readonly SHAKE = { crack: 0.25, falling: 0.35, landing: 1.2, dies: 0.45 };
  /** Less of a puff than this isn't drawn; a puff shows in full this soon after its birth. */
  private static readonly FAINT = 0.01;
  private static readonly SHOWS_IN = 0.15;

  /** Its outline below the crack, the fresh break along that's top, and its rubble, at rest. */
  readonly stump: readonly Point[];
  readonly face: readonly Point[];
  readonly rubble: readonly (readonly Point[])[];
  /** Its top above the crack, upright; the height the crack runs across, about; where the top
   * turns as it leans out: the crack's front end. */
  readonly top: readonly Point[];
  readonly cut: number;
  readonly pivot: Point;
  /** When all its pieces lie still, and when its dust has gone too, in seconds after the crack
   * began. */
  readonly rests: number;
  readonly ends: number;
  private readonly crack: number;
  private readonly fall: number;
  private readonly crackLine: readonly Point[];
  private readonly blocks: readonly Block[];
  private readonly fragments: readonly Fragment[];
  private readonly chips: readonly Chip[];
  private readonly puffs: readonly Puff[];
  /** How fast its blocks fall, so the first lands as the hazard comes down, in m/s². */
  private readonly gravity: number;

  /** Which way it leans out along x. */
  private readonly turned: 1 | -1;

  /**
   * A serac `standing` over the route's `ground`, its crack running and its ice falling for
   * `timing`, its ice landing from `landing.from` to `landing.to` along x, from the draws of
   * `seed`.
   */
  constructor(
    standing: StandingSerac,
    private readonly ground: (x: number) => number,
    timing: SeracTiming,
    landing: { readonly from: number; readonly to: number },
    seed: number,
  ) {
    // The ice from one chance, the air from another: the stump and the rubble are the same
    // whatever the seconds.
    const shape = SeededRandom.fromSeed(seed);
    const air = SeededRandom.fromSeed(seed ^ 0x5bd1e995);
    const { outline, snow, turned, base } = standing;
    this.turned = turned;
    this.crack = Math.max(timing.crack, 0);
    this.fall = Math.max(timing.fall, 0);
    const high = Math.max(...outline.map(({ y }) => y));
    this.cut = base + (high - base) * SeracFall.span(shape, SeracFall.BREAK);
    const { top, stump, line } = SeracFall.cutAcross(outline, this.cut, turned, shape);
    this.top = top;
    this.stump = stump;
    this.crackLine = line;
    this.pivot = line.at(-1) ?? { x: 0, y: this.cut };
    this.face = SeracFall.faceOf(stump, line);
    const { blocks, gravity } = this.breakUp(landing, snow, shape);
    this.blocks = blocks;
    this.gravity = gravity;
    this.fragments = blocks.flatMap((block) => this.shatter(block, shape));
    this.rubble = this.fragments.map(({ corners, rest, spin, moves }) =>
      SeracFall.placed(corners, rest, spin * moves),
    );
    this.chips = this.chipsOff(air);
    this.puffs = [
      ...this.slough(air),
      ...blocks.flatMap((block) => this.trail(block)),
      ...blocks.flatMap((block) => this.cloud(block, air)),
    ];
    this.rests = Math.max(
      this.crack,
      ...blocks.map(({ lands }) => this.crack + lands),
      ...this.fragments.map(({ starts, moves }) => starts + moves),
    );
    this.ends = Math.max(
      this.rests,
      ...this.puffs.map(
        ({ born, shows, fades }) => born + fades * Math.log(Math.max(shows / SeracFall.FAINT, 1)),
      ),
    );
  }

  /** The fall `seconds` after its crack began, in a wind of `wind`, 0 to 1. */
  at(seconds: number, wind: number): SeracFallFrame {
    const dust = this.dust(seconds, wind);
    const pieces = this.chipsAt(seconds);
    if (seconds < this.crack) {
      const run = SeracFall.smooth(seconds / this.crack);
      return {
        crack: this.ran(run),
        open: run,
        lean: -this.turned * SeracFall.LEAN * run * run,
        pieces,
        dust,
        shake: SeracFall.SHAKE.crack * (0.5 + 0.5 * run),
      };
    }
    const after = seconds - this.crack;
    let shake = this.blocks.length > 0 && after < this.fall ? SeracFall.SHAKE.falling : 0;
    for (const block of this.blocks) {
      if (after < block.lands) {
        pieces.push(this.flying(block, after));
      } else {
        const since = after - block.lands;
        shake = Math.max(shake, SeracFall.SHAKE.landing * Math.exp(-since / SeracFall.SHAKE.dies));
      }
    }
    if (seconds < this.rests) {
      for (const fragment of this.fragments) {
        if (seconds >= fragment.starts) {
          pieces.push({
            kind: fragment.kind,
            corners: this.moving(fragment, seconds - fragment.starts),
          });
        }
      }
    }
    return { crack: [], open: 1, lean: null, pieces, dust, shake };
  }

  /** `points` leaned out `lean` radians on the crack: turned about its front end. */
  leaned(points: readonly Point[], lean: number): Point[] {
    const { pivot } = this;
    const cos = Math.cos(lean);
    const sin = Math.sin(lean);
    return points.map(({ x, y }) => ({
      x: pivot.x + (x - pivot.x) * cos - (y - pivot.y) * sin,
      y: pivot.y + (x - pivot.x) * sin + (y - pivot.y) * cos,
    }));
  }

  /** Its top in blocks, as it breaks off leaned out: in columns, and in two rows if it's tall,
   * the front one letting go first; each falling to its own place across where its ice lands,
   * the nearer the front the further out, the first landing as the hazard comes down. */
  private breakUp(
    landing: { readonly from: number; readonly to: number },
    snow: readonly Point[] | null,
    random: SeededRandom,
  ): { readonly blocks: readonly Block[]; readonly gravity: number } {
    const { top, turned } = this;
    if (top.length < 3) {
      return { blocks: [], gravity: SeracFall.GRAVITY };
    }
    const xs = top.map(({ x }) => x);
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const high = Math.max(...top.map(({ y }) => y));
    const columns = Math.min(
      Math.max(Math.round((right - left) / SeracFall.BLOCK_WIDTH), SeracFall.COLUMNS.fewest),
      SeracFall.COLUMNS.most,
    );
    const rows = Math.min(
      Math.max(Math.round((high - this.cut) / SeracFall.BLOCK_HEIGHT), 1),
      SeracFall.ROWS,
    );
    // Where it splits up, each a little off an even share.
    const splits = [
      -Infinity,
      ...Array.from({ length: rows - 1 }, (_, row) => {
        const jitter = SeracFall.span(random, { least: -0.15, most: 0.15 });
        return this.cut + ((high - this.cut) * (row + 1 + jitter)) / rows;
      }),
      Infinity,
    ];
    const pieces: {
      readonly polygon: Point[];
      readonly snow: Point[];
      readonly column: number;
      readonly row: number;
    }[] = [];
    let from = left;
    for (let column = 0; column < columns; column += 1) {
      const jitter = SeracFall.span(random, { least: -0.2, most: 0.2 });
      const to =
        column === columns - 1 ? right : left + ((right - left) * (column + 1 + jitter)) / columns;
      const strip = SeracFall.slab(top, "x", from, to);
      const snowed = snow === null ? [] : SeracFall.slab(snow, "x", from, to);
      for (let row = 0; row < rows; row += 1) {
        const [low = -Infinity, up = Infinity] = [splits[row], splits[row + 1]];
        const polygon = SeracFall.slab(strip, "y", low, up);
        if (polygon.length >= 3) {
          pieces.push({ polygon, snow: SeracFall.slab(snowed, "y", low, up), column, row });
        }
      }
      from = to;
    }
    if (pieces.length === 0) {
      return { blocks: [], gravity: SeracFall.GRAVITY };
    }
    // Front to back, the lower before the upper: the order they let go in.
    const order = [...pieces].sort((a, b) => turned * (b.column - a.column) || a.row - b.row);
    const lean = -turned * SeracFall.LEAN;
    const back = turned > 0 ? left : right;
    const out = this.pivot.x + turned * SeracFall.THROWN;
    let lo = Math.max(landing.from, Math.min(back, out));
    let hi = Math.min(landing.to, Math.max(back, out));
    if (!(hi - lo >= 1)) {
      [lo, hi] = landing.to > landing.from ? [landing.from, landing.to] : [left, right];
    }
    // Across where it lands, in their order along x.
    const along = [...pieces].sort(
      (a, b) => SeracFall.centre(a.polygon).x - SeracFall.centre(b.polygon).x,
    );
    let after = 0;
    const plans: Planned[] = order.map((piece) => {
      const middle = SeracFall.centre(piece.polygon);
      const about = ({ x, y }: Point): Point => ({ x: x - middle.x, y: y - middle.y });
      const corners = piece.polygon.map(about);
      const snowOn = piece.snow.length >= 3 ? piece.snow.map(about) : null;
      const place = along.indexOf(piece);
      const further = piece.row * turned * SeracFall.span(random, SeracFall.UPPER_FURTHER);
      const spread =
        (place + 0.5 + SeracFall.span(random, { least: -0.3, most: 0.3 })) / along.length;
      const target = Math.min(Math.max(lo + (hi - lo) * spread + further, lo), hi);
      // It tumbles over the way it leans, a quarter turn to three, and lands on a side, give or
      // take: its lowest corner touches the route as it lands.
      const quarters = random.between(SeracFall.QUARTERS.fewest, SeracFall.QUARTERS.most);
      const tumble =
        -turned * (quarters * (Math.PI / 2) + SeracFall.span(random, SeracFall.TUMBLE_JITTER));
      const landed = SeracFall.placed(corners, { x: 0, y: 0 }, lean + tumble);
      const reach = -Math.min(...landed.map(({ y }) => y));
      const plan = {
        corners,
        snow: snowOn,
        middle,
        target,
        reach,
        landsTurned: lean + tumble,
        after,
      };
      after += SeracFall.span(random, SeracFall.LETS_GO);
      return plan;
    });
    // It tips over its front edge till its blocks let go, and they fall at the world's gravity,
    // the first landing as the hazard comes down; one so high it would land later even letting go
    // at once falls faster.
    const first = (tip: number, gravity: number): number =>
      Math.min(...plans.map((plan) => this.timed(plan, tip, gravity).lands));
    const { GRAVITY } = SeracFall;
    let tip = 0;
    let gravity = GRAVITY;
    if (first(0, GRAVITY) < this.fall) {
      tip = SeracFall.solve(0, this.fall, (tried) => first(tried, GRAVITY) < this.fall);
    } else {
      gravity = SeracFall.solve(GRAVITY, GRAVITY * 400, (tried) => first(0, tried) > this.fall);
    }
    const blocks = plans.map((plan) => {
      const { goes, turn, from, up, falling, lands } = this.timed(plan, tip, gravity);
      return {
        corners: plan.corners,
        snow: plan.snow,
        middle: plan.middle,
        size: SeracFall.across(plan.corners),
        goes,
        from,
        turn,
        velocity: { x: (plan.target - from.x) / falling, y: up },
        spin: (plan.landsTurned - turn) / falling,
        lands,
        landing: { x: plan.target, y: this.ground(plan.target) },
      };
    });
    return { blocks, gravity };
  }

  /** A planned block's fall, its top tipping over for `tip` seconds after the break and its
   * blocks falling at `gravity`: when it lets go, turned how far, from where, how fast it goes up
   * then as the top tips; how long it falls, and when it lands. */
  private timed(
    plan: Planned,
    tip: number,
    gravity: number,
  ): {
    readonly goes: number;
    readonly turn: number;
    readonly from: Point;
    readonly up: number;
    readonly falling: number;
    readonly lands: number;
  } {
    const goes = tip + plan.after;
    const turn = this.tipped(goes);
    const [from = plan.middle] = this.leaned([plan.middle], turn);
    // Turning about its front edge, what's behind it rises and what's before it sinks.
    const up = this.tipping(goes) * (from.x - this.pivot.x);
    const height = Math.max(from.y - plan.reach - this.ground(plan.target), 0.05);
    const falling = (up + Math.sqrt(up * up + 2 * gravity * height)) / gravity;
    return { goes, turn, from, up, falling, lands: goes + falling };
  }

  /** How far its top has turned `after` seconds after the break, tipping over its front edge,
   * faster and faster; and how fast it turns then, in radians a second. */
  private tipped(after: number): number {
    return -this.turned * (SeracFall.LEAN + SeracFall.TIP * after * after);
  }

  private tipping(after: number): number {
    return -this.turned * 2 * SeracFall.TIP * after;
  }

  /** A block `after` seconds after the break, and the snow on it: tipping over with the rest of
   * the top till it lets go, then falling and turning, faster and faster. */
  private flying(block: Block, after: number): FallingPiece {
    const { middle, turn } = this.pose(block, after);
    const corners = SeracFall.placed(block.corners, middle, turn);
    return block.snow === null
      ? { kind: "block", corners }
      : { kind: "block", corners, snow: SeracFall.placed(block.snow, middle, turn) };
  }

  /** Where a block's middle is `after` seconds after the break, and how far it's turned. */
  private pose(block: Block, after: number): { readonly middle: Point; readonly turn: number } {
    if (after < block.goes) {
      const turn = this.tipped(after);
      const [middle = block.middle] = this.leaned([block.middle], turn);
      return { middle, turn };
    }
    const falling = after - block.goes;
    const { from, velocity } = block;
    return {
      middle: {
        x: from.x + velocity.x * falling,
        y: from.y + velocity.y * falling - (this.gravity * falling * falling) / 2,
      },
      turn: block.turn + block.spin * falling,
    };
  }

  /** A block's shards and chunks as it lands: the shards hop up and out and come down on the
   * route, the chunks slide on, and they all lie where they stop. */
  private shatter(block: Block, random: SeededRandom): readonly Fragment[] {
    const { SHARDS, CHUNKS, SUNK, GRAVITY, FRICTION } = SeracFall;
    const { turned } = this;
    const starts = this.crack + block.lands;
    const shards = Math.min(SHARDS.least + Math.round(block.size * SHARDS.aMetre), SHARDS.most);
    const chunks = CHUNKS + (block.size > SeracFall.BIG_BLOCK ? 1 : 0);
    const fragments: Fragment[] = [];
    for (let index = 0; index < shards + chunks; index += 1) {
      const chunk = index >= shards;
      const size =
        block.size * SeracFall.span(random, chunk ? SeracFall.CHUNK_SIZE : SeracFall.SHARD_SIZE);
      const corners = SeracFall.rock(size, random);
      const x =
        block.landing.x +
        (chunk ? SeracFall.span(random, { least: -0.3, most: 0.3 }) * block.size : 0);
      if (chunk) {
        const speed = SeracFall.span(random, SeracFall.SLIDE);
        const way = random.chance(0.75) ? turned : -turned;
        const moves = speed / FRICTION;
        const restX = x + (way * speed * speed) / (2 * FRICTION);
        fragments.push({
          kind: "chunk",
          corners,
          from: { x, y: this.ground(x) + size * SUNK },
          starts,
          moves,
          hop: 0,
          rest: { x: restX, y: this.ground(restX) + size * SUNK },
          spin: (way * SeracFall.span(random, { least: 0.5, most: 2 })) / Math.max(size, 0.2),
        });
      } else {
        const hop = SeracFall.span(random, SeracFall.HOP);
        const moves = (2 * hop) / GRAVITY;
        const out =
          turned * SeracFall.span(random, { least: 0, most: SeracFall.FLIES }) +
          SeracFall.span(random, { least: -1.5, most: 1.5 });
        const restX = x + out * moves;
        fragments.push({
          kind: "shard",
          corners,
          from: { x, y: block.landing.y + size * 0.5 },
          starts,
          moves,
          hop,
          rest: { x: restX, y: this.ground(restX) + size * SUNK },
          spin: SeracFall.span(random, { least: -8, most: 8 }),
        });
      }
    }
    return fragments;
  }

  /** A shard or a chunk `moving` seconds after it leaves the landing: a shard hopping across, a
   * chunk sliding on the ground and slowing, each at rest where it stops. */
  private moving(fragment: Fragment, moving: number): readonly Point[] {
    const { from, rest, moves, spin, corners } = fragment;
    if (moving >= moves) {
      return SeracFall.placed(corners, rest, spin * moves);
    }
    if (fragment.kind === "chunk") {
      const share = moving / moves;
      const gone = 1 - (1 - share) * (1 - share);
      const x = from.x + (rest.x - from.x) * gone;
      const lift = rest.y - this.ground(rest.x);
      return SeracFall.placed(corners, { x, y: this.ground(x) + lift }, spin * moves * gone);
    }
    const share = moving / moves;
    const middle = {
      x: from.x + (rest.x - from.x) * share,
      y:
        from.y +
        (rest.y - from.y) * share +
        fragment.hop * moving -
        (SeracFall.GRAVITY * moving * moving) / 2,
    };
    return SeracFall.placed(corners, middle, spin * moving);
  }

  /** The chips off the crack: each from somewhere along as much of it as has run, falling. */
  private chipsOff(random: SeededRandom): readonly Chip[] {
    if (this.crack <= 0 || this.crackLine.length < 2) {
      return [];
    }
    const { CHIPS } = SeracFall;
    const count = Math.min(
      Math.max(Math.round(this.crack * CHIPS.aSecond), CHIPS.fewest),
      CHIPS.most,
    );
    return Array.from({ length: count }, () => {
      const born = this.crack * SeracFall.span(random, { least: 0.2, most: 1 });
      const ran = this.ran(SeracFall.smooth(born / this.crack));
      const from = ran[Math.floor(random.fraction() * ran.length)] ?? this.pivot;
      return {
        born,
        from,
        corners: SeracFall.rock(SeracFall.span(random, SeracFall.CHIP_SIZE), random),
        drift: this.turned * SeracFall.span(random, SeracFall.CHIP_DRIFT),
      };
    });
  }

  /** The chips falling `seconds` after the crack began, till they reach the route. */
  private chipsAt(seconds: number): FallingPiece[] {
    const pieces: FallingPiece[] = [];
    for (const { born, from, corners, drift } of this.chips) {
      const falling = seconds - born;
      if (falling < 0) {
        continue;
      }
      const x = from.x + drift * falling;
      const y = from.y - (SeracFall.GRAVITY * falling * falling) / 2;
      if (y > this.ground(x)) {
        pieces.push({ kind: "chip", corners: SeracFall.placed(corners, { x, y }, falling * 5) });
      }
    }
    return pieces;
  }

  /** The snow that sloughs off its top as the crack runs: puffs off its highest corners, falling
   * down its face. */
  private slough(random: SeededRandom): readonly Puff[] {
    if (this.crack <= 0 || this.top.length === 0) {
      return [];
    }
    const { SLOUGH } = SeracFall;
    const count = Math.min(
      Math.max(Math.round(this.crack * SLOUGH.aSecond), SLOUGH.fewest),
      SLOUGH.most,
    );
    const highest = [...this.top].sort((a, b) => b.y - a.y).slice(0, 4);
    return Array.from({ length: count }, (_, index) => ({
      born: this.crack * SeracFall.span(random, { least: 0.15, most: 0.95 }),
      from: highest[index % highest.length] ?? this.pivot,
      out: { x: this.turned * 0.3, y: -SLOUGH.falls },
      drag: 10,
      rise: 0,
      radius: { from: 0.2, to: SeracFall.SLOUGH_RADIUS, grows: 0.8 },
      shows: 0.5,
      fades: SeracFall.SLOUGH_FADES,
    }));
  }

  /** The dust a block trails as it falls: a puff every so often from where it is. */
  private trail(block: Block): readonly Puff[] {
    const { TRAIL } = SeracFall;
    const puffs: Puff[] = [];
    for (let after = block.goes + TRAIL.every; after < block.lands; after += TRAIL.every) {
      puffs.push({
        born: this.crack + after,
        from: this.pose(block, after).middle,
        out: { x: 0, y: 0.2 },
        drag: 1,
        rise: 0.2,
        radius: { from: 0.3, to: TRAIL.radius, grows: 0.6 },
        shows: TRAIL.shows,
        fades: TRAIL.fades,
      });
    }
    return puffs;
  }

  /** The cloud a block raises as it lands: puffs bursting up and out from where it lands, flatter
   * than they're thrown, rising and growing as the air stops them, and fading slowly. */
  private cloud(block: Block, random: SeededRandom): readonly Puff[] {
    const { CLOUD } = SeracFall;
    const count = Math.min(CLOUD.least + Math.round(block.size * CLOUD.aMetre), CLOUD.most);
    const from = { x: block.landing.x, y: block.landing.y + 0.3 };
    return Array.from({ length: count }, () => {
      const angle = SeracFall.span(random, { least: 0.15, most: Math.PI - 0.15 });
      const speed = SeracFall.span(random, CLOUD.burst);
      return {
        born: this.crack + block.lands,
        from,
        out: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed * CLOUD.flat },
        drag: CLOUD.drag,
        rise: SeracFall.span(random, CLOUD.rise),
        radius: {
          from: 0.5,
          to: block.size * SeracFall.span(random, CLOUD.radius),
          grows: CLOUD.grows,
        },
        shows: SeracFall.span(random, CLOUD.shows),
        fades: SeracFall.span(random, CLOUD.fades),
      };
    });
  }

  /** The puffs that show `seconds` after the crack began, carried along by `wind`. */
  private dust(seconds: number, wind: number): readonly DustPuff[] {
    const shown: DustPuff[] = [];
    for (const puff of this.puffs) {
      const age = seconds - puff.born;
      if (age < 0) {
        continue;
      }
      const shows =
        puff.shows * Math.min(age / SeracFall.SHOWS_IN, 1) * Math.exp(-age / puff.fades);
      if (shows < SeracFall.FAINT) {
        continue;
      }
      const stopped = puff.drag * (1 - Math.exp(-age / puff.drag));
      const { radius } = puff;
      shown.push({
        x: puff.from.x + puff.out.x * stopped + wind * SeracFall.WIND * age,
        y: puff.from.y + puff.out.y * stopped + puff.rise * age,
        radius: radius.from + (radius.to - radius.from) * (1 - Math.exp(-age / radius.grows)),
        shows,
      });
    }
    return shown;
  }

  /** The crack as far as it has run, `run` of the way from its back to its front. */
  private ran(run: number): readonly Point[] {
    const line = this.crackLine;
    const reach = Math.min(Math.max(run, 0), 1) * (line.length - 1);
    const whole = Math.floor(reach);
    const points = line.slice(0, whole + 1);
    const from = line[whole];
    const to = line[whole + 1];
    if (from !== undefined && to !== undefined && reach > whole) {
      const share = reach - whole;
      points.push({ x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share });
    }
    return points;
  }

  /** The outline cut across at `at` by a jagged crack, from its back to its front: its top above,
   * its stump below, and the crack, back to front. An outline it doesn't cross twice stands whole. */
  private static cutAcross(
    outline: readonly Point[],
    at: number,
    turned: 1 | -1,
    random: SeededRandom,
  ): { readonly top: Point[]; readonly stump: Point[]; readonly line: Point[] } {
    const crossings = SeracFall.crossings(outline, at);
    const up = crossings.find(({ rising }) => rising);
    const down = crossings.find(({ rising }) => !rising);
    if (up === undefined || down === undefined) {
      return { top: [], stump: [...outline], line: [] };
    }
    const upAtBack = up.point.x < down.point.x === turned > 0;
    const [back, front] = upAtBack ? [up.point, down.point] : [down.point, up.point];
    const inner: Point[] = [];
    for (let piece = 1; piece < SeracFall.CRACK_PIECES; piece += 1) {
      const share = piece / SeracFall.CRACK_PIECES;
      const jag =
        (piece % 2 === 0 ? 1 : -1) *
        SeracFall.JAG *
        SeracFall.span(random, { least: 0.4, most: 1 });
      inner.push({ x: back.x + (front.x - back.x) * share, y: at + jag });
    }
    const line = [back, ...inner, front];
    const count = outline.length;
    const round = (from: number, to: number): Point[] => {
      const points: Point[] = [];
      for (let index = (from + 1) % count; ; index = (index + 1) % count) {
        const point = outline[index];
        if (point !== undefined) {
          points.push(point);
        }
        if (index === to) {
          return points;
        }
      }
    };
    // The top: up its side where the outline crosses going up, over, down where it crosses going
    // down, and back along the crack; the stump: the rest of the way round, and the crack the other
    // way.
    const downToUp = upAtBack ? [...inner].reverse() : inner;
    const upToDown = upAtBack ? inner : [...inner].reverse();
    const top = [up.point, ...round(up.index, down.index), down.point, ...downToUp];
    const stump = [down.point, ...round(down.index, up.index), up.point, ...upToDown];
    return { top, stump, line };
  }

  /** The fresh break down the stump's top: from the crack to as deep as it shows, kept inside the
   * stump's sides. */
  private static faceOf(stump: readonly Point[], line: readonly Point[]): readonly Point[] {
    if (line.length < 2) {
      return [];
    }
    const low = Math.min(...line.map(({ y }) => y)) - SeracFall.FACE;
    const sides = SeracFall.crossings(stump, low).map(({ point }) => point.x);
    const [least, most] =
      sides.length >= 2
        ? [Math.min(...sides), Math.max(...sides)]
        : [Math.min(...line.map(({ x }) => x)), Math.max(...line.map(({ x }) => x))];
    const lower = line
      .map(({ x, y }) => ({ x: Math.min(Math.max(x, least), most), y: y - SeracFall.FACE }))
      .reverse();
    return [...line, ...lower];
  }

  /** Where an outline crosses the height `at`, in its order. */
  private static crossings(outline: readonly Point[], at: number): readonly Crossing[] {
    const found: Crossing[] = [];
    for (let index = 0; index < outline.length; index += 1) {
      const a = outline[index];
      const b = outline[(index + 1) % outline.length];
      if (a === undefined || b === undefined || (a.y - at) * (b.y - at) >= 0) {
        continue;
      }
      const point = { x: a.x + ((at - a.y) / (b.y - a.y)) * (b.x - a.x), y: at };
      found.push({ index, point, rising: b.y > a.y });
    }
    return found;
  }

  /** The value from `low` to `high` where `early` turns false, halved down to a hair: what makes
   * the first block land as the hazard comes down. */
  private static solve(low: number, high: number, early: (value: number) => boolean): number {
    let [from, to] = [low, high];
    for (let halving = 0; halving < 48; halving += 1) {
      const middle = (from + to) / 2;
      if (early(middle)) {
        from = middle;
      } else {
        to = middle;
      }
    }
    return (from + to) / 2;
  }

  /** The part of `polygon` from `from` to `to` along `axis` (Sutherland and Hodgman's clip). */
  static slab(polygon: readonly Point[], axis: "x" | "y", from: number, to: number): Point[] {
    const clip = (
      points: readonly Point[],
      edge: number,
      keep: (value: number) => boolean,
    ): Point[] => {
      if (!Number.isFinite(edge)) {
        return [...points];
      }
      const kept: Point[] = [];
      for (let index = 0; index < points.length; index += 1) {
        const a = points[index];
        const b = points[(index + 1) % points.length];
        if (a === undefined || b === undefined) {
          continue;
        }
        if (keep(a[axis])) {
          kept.push(a);
        }
        if (keep(a[axis]) !== keep(b[axis])) {
          const share = (edge - a[axis]) / (b[axis] - a[axis]);
          kept.push({ x: a.x + (b.x - a.x) * share, y: a.y + (b.y - a.y) * share });
        }
      }
      return kept;
    };
    return clip(
      clip(polygon, from, (value) => value >= from),
      to,
      (value) => value <= to,
    );
  }

  /** A polygon's middle: the mean of its corners. */
  private static centre(polygon: readonly Point[]): Point {
    const count = Math.max(polygon.length, 1);
    return {
      x: polygon.reduce((sum, { x }) => sum + x, 0) / count,
      y: polygon.reduce((sum, { y }) => sum + y, 0) / count,
    };
  }

  /** How far across a shape's corners reach about its middle, on average, both ways. */
  private static across(corners: readonly Point[]): number {
    const total = corners.reduce((sum, { x, y }) => sum + Math.sqrt(x * x + y * y), 0);
    return (2 * total) / Math.max(corners.length, 1);
  }

  /** A rock of ice about `size` across: five corners round its middle, each its own way out. */
  private static rock(size: number, random: SeededRandom): readonly Point[] {
    return Array.from({ length: 5 }, (_, index) => {
      const angle = ((index + random.fraction() * 0.6) / 5) * 2 * Math.PI;
      const reach = (size / 2) * (0.6 + 0.6 * random.fraction());
      return { x: Math.cos(angle) * reach, y: Math.sin(angle) * reach };
    });
  }

  /** `corners` about a middle, turned `turn` and placed at `middle`. */
  private static placed(corners: readonly Point[], middle: Point, turn: number): readonly Point[] {
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    return corners.map(({ x, y }) => ({
      x: middle.x + x * cos - y * sin,
      y: middle.y + x * sin + y * cos,
    }));
  }

  private static span(
    random: SeededRandom,
    { least, most }: { readonly least: number; readonly most: number },
  ): number {
    return least + random.fraction() * (most - least);
  }

  private static smooth(share: number): number {
    const t = Math.min(Math.max(share, 0), 1);
    return t * t * (3 - 2 * t);
  }
}
