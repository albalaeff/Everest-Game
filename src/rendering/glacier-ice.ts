import type { Point } from "../physics";
import { SeededRandom } from "../simulation";
import type { IceBody } from "./ice-body";
import type { IceSurface } from "./ice-surface";
import { Noise } from "./noise";
import { Palette } from "./palette";
import { Wander } from "./wander";

/** A stretch across, in the layer's metres. */
export interface Across {
  readonly left: number;
  readonly right: number;
}

/** A band of the glacier under its surface: from `from` to `to` metres down, worked out `fine`
 * pixels a metre both ways, its foot fading out over its last `fade` metres into what's under it. */
export interface GlacierBand {
  readonly from: number;
  readonly to: number;
  readonly fine: number;
  readonly fade: number;
}

/** Where a strip of the glacier's ice goes: from `left` to `right` across, through `band`. */
export interface GlacierPiece {
  readonly left: number;
  readonly right: number;
  readonly band: GlacierBand;
}

/** A piece of the glacier's ice worked out: `columns` across from `left` to `right`, each hanging
 * from the surface at its x, and `rows` down through its band; its day colours, four bytes a
 * pixel, red, green, blue and how solid, row by row from the top left. */
export interface IceStrip {
  readonly left: number;
  readonly right: number;
  readonly band: GlacierBand;
  readonly columns: number;
  readonly rows: number;
  readonly pixels: Uint8ClampedArray;
}

/** A strip as a mesh hangs it from the surface: its corners in the layer's metres, two numbers
 * each, where each comes on its picture, and the triangles between them, three corners each. */
export interface StripMesh {
  readonly vertices: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
}

/** A line down through the ice, from its top `x` across at `y`, going `long` metres down and
 * `lean` metres aside for each metre, so wide, and wandering up to `wander` metres aside as it
 * goes: a seam where two blocks part, clear ice frozen in a healed crack, a white fracture, or a
 * hairline crack down from the top of bare ice. */
export interface IceCrack {
  readonly kind: "seam" | "vein" | "fracture" | "hairline";
  readonly x: number;
  readonly y: number;
  readonly long: number;
  readonly lean: number;
  readonly wide: number;
  readonly wander: number;
}

/** A column of the glacier at one x: its surface; how bare its ice is, 1 on the route's blue ice;
 * how far down its snow's foot and its firn's are; how far into the run of layers its surface
 * lies, so `run + depth` is the layer at a depth; the hollow of the sun cup it's under on bare
 * ice, and how far from the cup's middle to its rim; and the cracks that reach it. */
export interface IceColumn {
  readonly top: number;
  readonly bare: number;
  readonly snow: number;
  readonly firn: number;
  readonly run: number;
  readonly hollow: number;
  readonly rim: number;
  readonly cracks: readonly IceCrack[];
}

/** A block of the glacier between two joints: its layers lie along a line through `y` at `x`,
 * rising `slope` a metre, folded by up to `fold` metres, and its top lies `offset` metres into the
 * run of layers; the cracks across it. */
interface Block {
  readonly left: number;
  readonly right: number;
  readonly x: number;
  readonly y: number;
  readonly slope: number;
  readonly fold: number;
  readonly offset: number;
  readonly cracks: readonly IceCrack[];
}

/** A sun cup in a stretch of bare blue ice: so deep in its middle, `x`, and `half` as wide. */
interface Cup {
  readonly x: number;
  readonly half: number;
  readonly deep: number;
}

/** A run of values a step apart, and their running sum, so the average over any stretch of it is
 * quick: what a pixel as tall as the stretch shows of thinner layers, never one picked at random
 * (which would flicker in stripes). */
class Run {
  private readonly sums: Float64Array;
  private readonly smoothed = new Map<number, Smoothed>();

  constructor(
    private readonly from: number,
    private readonly step: number,
    values: Float32Array,
  ) {
    this.sums = new Float64Array(values.length + 1);
    for (let index = 0; index < values.length; index += 1) {
      this.sums[index + 1] = (this.sums[index] ?? 0) + (values[index] ?? 0);
    }
  }

  /** The average from `at - wide / 2` to `at + wide / 2`. */
  average(at: number, wide: number): number {
    const half = Math.max(wide, this.step) / 2;
    const low = this.sum(at - half);
    const high = this.sum(at + half);
    return (high - low) / ((2 * half) / this.step);
  }

  /** The averages over stretches `wide` long, one at each step, so a strip as fine as that looks
   * each up at once: worked out once for each width. */
  over(wide: number): Smoothed {
    let smoothed = this.smoothed.get(wide);
    if (smoothed === undefined) {
      const values = new Float32Array(this.sums.length - 1);
      for (let index = 0; index < values.length; index += 1) {
        values[index] = this.average(this.from + (index + 0.5) * this.step, wide);
      }
      smoothed = new Smoothed(this.from, this.step, values);
      this.smoothed.set(wide, smoothed);
    }
    return smoothed;
  }

  /** The running sum up to `at`, between the steps. */
  private sum(at: number): number {
    const place = Math.min(Math.max((at - this.from) / this.step, 0), this.sums.length - 1);
    const below = Math.floor(place);
    const before = this.sums[below] ?? 0;
    return before + ((this.sums[below + 1] ?? before) - before) * (place - below);
  }
}

/** Values worked out every `every` pixels of a strip, `across` of them in a row, eased to any
 * pixel between them: what changes slowly over the face, worked out at a few of its pixels. */
class Grid {
  constructor(
    private readonly values: Float32Array,
    private readonly across: number,
    private readonly every: number,
  ) {}

  /** The value at a pixel of the strip, between the four worked out round it. */
  at(column: number, row: number): number {
    const x = column / this.every;
    const y = row / this.every;
    const left = Math.floor(x);
    const top = Math.floor(y);
    const right = x - left;
    const down = y - top;
    const index = top * this.across + left;
    const { values } = this;
    const a = values[index] ?? 0;
    const b = values[index + 1] ?? a;
    const c = values[index + this.across] ?? a;
    const d = values[index + this.across + 1] ?? c;
    const upper = a + (b - a) * right;
    return upper + (c + (d - c) * right - upper) * down;
  }
}

/** A `Run` averaged over one width, a value at each of its steps. */
class Smoothed {
  constructor(
    private readonly from: number,
    private readonly step: number,
    private readonly values: Float32Array,
  ) {}

  /** The average about `at`. */
  at(at: number): number {
    const index = Math.round((at - this.from) / this.step - 0.5);
    return this.values[Math.min(Math.max(index, 0), this.values.length - 1)] ?? 0;
  }
}

/**
 * The glacier under the route as a cut through it shows it, worked out pixel by pixel and lit, as
 * the photos of the Icefall's crevasses show their walls: under the surface its snow, white, a
 * crust or two in it and greying to its foot; under the snow its firn, grey-white with fine layers;
 * and under the firn its ice, in layers that lie along each block of the glacier, tilted with the
 * block whatever its snow does, so they meet the snow at a slant: packets of whiter, bubbly ice and
 * bluer, clear ice, finer layers in them fading in and out along their length, a line of dust here
 * and there, bubbles in the white, and the cracks across them: healed ones, clear ice frozen in
 * them, and white fractures. The light comes down through it, so the ice is near white just under
 * the firn, turquoise, then blue, then navy as it goes down. Where the blocks part, under a wall's
 * foot and a crevasse's floor and now and then along a long stretch, the layers break off and start
 * again, a seam of clear ice between. Its face swells and dips a little, lit from above and the
 * picture's left. Where the route's ice is bare (#190) there's no snow and no firn: the clear ice
 * comes up to the surface under a glaze that throws back the sky, hollowed into sun cups along its
 * top, with hairline cracks down from it.
 *
 * Pure: day colours for the hour to tint, in strips that hang from the surface, each band as fine
 * as it needs, so the layer draws each strip on a mesh along the surface. Laid out once by a seeded
 * generator of the picture's own; its sizes are the drawing's numbers.
 */
export class GlacierIce {
  /** The bands it's worked out in: near the surface, fine enough for the snow's crusts, the firn's
   * layers and the bubbles; under it, coarser, as the light fades. Each fades out at its foot into
   * the one under it, and the last into the glacier's flat colour. */
  static readonly BANDS: readonly GlacierBand[] = [
    { from: 0, to: 3, fine: 32, fade: 0.6 },
    { from: 2.4, to: 18, fine: 10, fade: 3 },
  ];
  /** The most pixels a strip has: few enough to work out within a frame, one a frame. */
  static readonly MOST_PIXELS = 40_000;
  /** How far it fades out at its right end, past the section's, into the flat glacier. */
  static readonly FADE_OUT = 30;
  /** How deep the light comes down through the ice: it falls to a third every so many metres. */
  private static readonly LIGHT_DEPTH = 7;
  /** The firn under the snow, from its thinnest to its thickest, and how long its waves are. */
  private static readonly FIRN = { min: 0.5, max: 1.4, every: 9 };
  /** How the ice's layers are laid out down their run: from the shallowest a block's top lies to
   * the deepest a band reaches, so finely; its packets, so thick, from the bluest to the whitest;
   * the layers in a packet, so thick, so much whiter or bluer than it; now and then a thin white
   * line; and a thin dusty layer so often, so dusty. */
  private static readonly LAYERS = {
    from: -60,
    to: 120,
    step: 0.002,
    packets: { thick: { min: 0.25, max: 1.8 }, white: { min: 0.04, max: 0.88 }, edge: 0.12 },
    layers: { thick: { min: 0.012, max: 0.11 }, by: 0.32 },
    lines: { chance: 0.06, white: 0.55 },
    dust: { chance: 0.02, min: 0.25, max: 0.6 },
  };
  /** The firn's layers down from its top: a line every so far, so thick, so dark at the most, and
   * now and then a lens of glassy ice instead. */
  private static readonly LAMINAE = {
    apart: { min: 0.05, max: 0.18 },
    thick: { min: 0.012, max: 0.035 },
    lens: 0.15,
  };
  /** The blocks: a joint every so far across a long stretch with no wall or crevasse to part it;
   * each block's layers tilted up to so steeply past its own slope and folded by up to so much; its
   * healed cracks, up to so many, so long, so wide, leaning so far; and its white fractures. */
  private static readonly BLOCKS = {
    apart: { min: 16, max: 38 },
    tilt: 0.12,
    fold: { min: 0.15, max: 0.6, every: 12 },
    veins: { most: 2, long: { min: 2.5, max: 10 }, wide: { min: 0.025, max: 0.06 }, lean: 0.4 },
    fractures: { most: 4, long: { min: 0.4, max: 2.6 }, wide: { min: 0.008, max: 0.022 } },
  };
  /** The seam where two blocks part: so wide, wandering so far aside, as deep as the bands go. */
  private static readonly SEAM = { wide: 0.05, wander: 0.15, every: 1.7 };
  /** A wall: how tall a corner of the surface rises, and how steeply, to part two blocks. */
  private static readonly WALL = { high: 0.8, steep: 3 };
  /** The bare blue ice: how far the snow runs out onto it at its ends; its sun cups, so wide and so
   * deep, from the least to the most; and its hairline cracks down from its top, one every so far,
   * so long, leaning so far. */
  private static readonly BARE = {
    runout: 0.6,
    cups: { half: { min: 0.09, max: 0.24 }, deep: { min: 0.012, max: 0.038 } },
    hairlines: { apart: { min: 0.25, max: 0.9 }, long: { min: 0.06, max: 0.4 }, lean: 0.45 },
    wide: 0.012,
  };

  /** How finely the bare ice's sheen follows its sun cups: so many points a metre. */
  private static readonly SHEEN = { fine: 40 };

  /** How white the ice is down its run of layers: its packets, the layers in them, and the dust. */
  readonly packets: Run;
  readonly layers: Run;
  readonly dust: Run;
  /** The firn's layers down from its top: how dark each line is, and its lenses of glassy ice. */
  readonly laminae: Run;
  readonly lenses: Run;
  readonly noise: Noise;
  /** How far a seam wanders aside as it goes down. */
  readonly seam: Wander;
  private readonly firnWander: Wander;
  private readonly folds: Wander;
  private readonly blocks: readonly Block[];
  /** Where the blocks part, across. */
  private readonly joints: readonly number[];
  private readonly bare: readonly Across[];
  private readonly cups: readonly Cup[];

  /** The glacier under `surface`, its snow as deep as `body` lays it and its ice bare over `bare`,
   * worked out across `reach`. */
  constructor(
    private readonly surface: IceSurface,
    private readonly body: IceBody,
    bare: readonly Across[],
    readonly reach: Across,
    seed: number,
  ) {
    const random = SeededRandom.fromSeed(seed);
    const { FIRN, BLOCKS, SEAM, LAYERS } = GlacierIce;
    this.noise = new Noise(random);
    this.firnWander = new Wander(random, FIRN.every);
    this.folds = new Wander(random, BLOCKS.fold.every);
    this.seam = new Wander(random, SEAM.every);
    const [packets, layers, dust] = GlacierIce.layered(random);
    this.packets = new Run(LAYERS.from, LAYERS.step, packets);
    this.layers = new Run(LAYERS.from, LAYERS.step, layers);
    this.dust = new Run(LAYERS.from, LAYERS.step, dust);
    const [laminae, lenses] = GlacierIce.laminated(random);
    this.laminae = new Run(0, LAYERS.step, laminae);
    this.lenses = new Run(0, LAYERS.step, lenses);
    this.bare = bare;
    this.joints = this.parted(random);
    this.blocks = this.blocked(random);
    this.cups = GlacierIce.cupped(bare, random);
  }

  /** How much of the light from above comes down `depth` metres into the ice. */
  static light(depth: number): number {
    return Math.exp(-Math.max(depth, 0) / GlacierIce.LIGHT_DEPTH);
  }

  /** The strips it's worked out in, band by band, each of no more than `MOST_PIXELS`, left to
   * right: where each goes, not yet worked out. */
  pieces(): GlacierPiece[] {
    const { left, right } = this.reach;
    const pieces: GlacierPiece[] = [];
    for (const band of GlacierIce.BANDS) {
      const rows = Math.round((band.to - band.from) * band.fine);
      const wide = Math.floor(GlacierIce.MOST_PIXELS / rows) / band.fine;
      for (let from = left; from < right; from += wide) {
        pieces.push({ left: from, right: Math.min(from + wide, right), band });
      }
    }
    return pieces;
  }

  /** All of it, worked out. */
  strips(): IceStrip[] {
    return this.pieces().map(({ left, right, band }) => this.strip(left, right, band));
  }

  /** One band of it from `left` to `right` across. */
  strip(left: number, right: number, band: GlacierBand): IceStrip {
    const { fine } = band;
    const columns = Math.max(1, Math.round((right - left) * fine));
    const rows = Math.max(1, Math.round((band.to - band.from) * fine));
    const pixels = new StripLayout(this, left, band, columns, rows).pixels();
    return { left, right: left + columns / fine, band, columns, rows, pixels };
  }

  /** The surface's height at `x`: the line between a crevasse's lips over it. */
  top(x: number): number {
    return this.surface.height(x);
  }

  /** Where a strip hangs in the layer's metres, as a mesh takes it: two corners, at its band's top
   * and foot under the surface, at each end of it and at each corner of the surface between, a wall
   * twice; where each comes on its picture, 0 to 1 across and down; and the triangles between. */
  hang(strip: IceStrip): StripMesh {
    const { left, right, band } = strip;
    const tops = [
      { x: left, y: this.surface.height(left) },
      ...this.surface.points.filter(({ x }) => x > left && x < right),
      { x: right, y: this.surface.height(right) },
    ];
    const vertices = new Float32Array(tops.length * 4);
    const uvs = new Float32Array(tops.length * 4);
    const indices = new Uint32Array((tops.length - 1) * 6);
    for (const [index, { x, y }] of tops.entries()) {
      const across = (x - left) / (right - left);
      vertices.set([x, y - band.from, x, y - band.to], index * 4);
      uvs.set([across, 0, across, 1], index * 4);
      if (index > 0) {
        const [top, foot] = [index * 2 - 2, index * 2 - 1];
        indices.set([top, top + 2, foot, top + 2, foot + 2, foot], (index - 1) * 6);
      }
    }
    return { vertices, uvs, indices };
  }

  /** The bare ice's top as it throws back the sky, stretch by stretch, left to right: a line along
   * it that dips into each sun cup, so many points a metre. */
  sheen(): Point[][] {
    const { SHEEN } = GlacierIce;
    return this.bare.map(({ left, right }) => {
      const points: Point[] = [];
      for (let x = left; x <= right; x += 1 / SHEEN.fine) {
        points.push({ x, y: this.surface.height(x) - this.column(x).hollow });
      }
      return points;
    });
  }

  /** Where a headlamp's beam makes the bare ice shine: the rim between each two of its sun cups,
   * well onto the ice. */
  shines(): Point[] {
    const points: Point[] = [];
    for (const cup of this.cups) {
      const x = cup.x + cup.half;
      if (this.bareAt(x) >= 1) {
        points.push({ x, y: this.surface.height(x) });
      }
    }
    return points;
  }

  /** The column of it at `x`, and the cracks that reach it, from within `reach` across. */
  column(x: number): IceColumn {
    const { FIRN } = GlacierIce;
    const top = this.surface.height(x);
    const bare = this.bareAt(x);
    const snow = this.body.capAt(x) * (1 - bare);
    const firnDeep = FIRN.min + ((FIRN.max - FIRN.min) * (this.firnWander.at(x) + 1)) / 2;
    const block = this.blocks[this.blockAt(x)];
    const run =
      block === undefined
        ? 0
        : block.y +
          block.slope * (x - block.x) +
          block.fold * this.folds.at(x + block.offset * 7.3) +
          block.offset -
          top;
    let hollow = 0;
    let rim = 0;
    if (bare > 0) {
      for (const cup of this.cups) {
        const off = Math.abs(x - cup.x);
        if (off < cup.half) {
          const share = off / cup.half;
          hollow = cup.deep * (1 - share * share) * bare;
          rim = share;
          break;
        }
      }
    }
    const cracks = (block?.cracks ?? []).filter(
      (crack) =>
        Math.abs(x - crack.x) <
        Math.abs(crack.lean) * crack.long + crack.wander + crack.wide + 0.1,
    );
    return { top, bare, snow, firn: snow + firnDeep * (1 - bare), run, hollow, rim, cracks };
  }

  /** How bare the ice is at `x`: 1 on the route's blue ice, the snow running out onto it at its
   * ends, 0 elsewhere. */
  bareAt(x: number): number {
    const { runout } = GlacierIce.BARE;
    let most = 0;
    for (const { left, right } of this.bare) {
      const inside = Math.min(x - left, right - x) / runout + 0.5;
      most = Math.max(most, Math.min(Math.max(inside, 0), 1));
    }
    return most * most * (3 - 2 * most);
  }

  /** The block of the glacier at `x`, by its index from the left. */
  blockAt(x: number): number {
    let low = 0;
    let high = this.joints.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if ((this.joints[middle] ?? Infinity) <= x) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    return low;
  }

  /** The ice's layers down their run: packets of whiter and bluer ice with soft edges, thinner
   * layers in them, whiter or bluer than the packet, now and then a thin white line, and the dust
   * a thin layer carries now and then. */
  private static layered(random: SeededRandom): [Float32Array, Float32Array, Float32Array] {
    const { LAYERS } = GlacierIce;
    const { packets: packet, layers: layer, lines, dust: dusty } = LAYERS;
    const count = Math.ceil((LAYERS.to - LAYERS.from) / LAYERS.step) + 1;
    const between = (range: { readonly min: number; readonly max: number }): number =>
      range.min + random.fraction() * (range.max - range.min);
    const packets = new Float32Array(count);
    let at = 0;
    let before = between(packet.white);
    const edge = Math.max(1, Math.round(packet.edge / LAYERS.step));
    while (at < count) {
      const length = Math.max(1, Math.round(between(packet.thick) / LAYERS.step));
      const white = between(packet.white);
      for (let index = 0; index < length && at + index < count; index += 1) {
        const share = Math.min(1, index / edge);
        packets[at + index] = before + (white - before) * share * share * (3 - 2 * share);
      }
      at += length;
      before = white;
    }
    const layers = new Float32Array(count);
    const dust = new Float32Array(count);
    at = 0;
    while (at < count) {
      const length = Math.max(1, Math.round(between(layer.thick) / LAYERS.step));
      const line = random.chance(lines.chance);
      const value = line ? lines.white : (random.fraction() * 2 - 1) * layer.by;
      const dirty = random.chance(dusty.chance) ? between(dusty) : 0;
      for (let index = 0; index < length && at + index < count; index += 1) {
        layers[at + index] = value;
        dust[at + index] = dirty;
      }
      at += line ? Math.max(1, Math.round(length / 3)) : length;
    }
    return [packets, layers, dust];
  }

  /** The firn's layers down from its top: a darker line every few centimetres, and now and then a
   * lens of glassy ice. */
  private static laminated(random: SeededRandom): [Float32Array, Float32Array] {
    const { LAMINAE, LAYERS } = GlacierIce;
    const deepest = 3;
    const count = Math.ceil(deepest / LAYERS.step) + 1;
    const dark = new Float32Array(count);
    const lens = new Float32Array(count);
    const between = (range: { readonly min: number; readonly max: number }): number =>
      range.min + random.fraction() * (range.max - range.min);
    let at = between(LAMINAE.apart);
    while (at < deepest) {
      const thick = between(LAMINAE.thick);
      const glassy = random.chance(LAMINAE.lens);
      const strength = 0.45 + 0.55 * random.fraction();
      const first = Math.round(at / LAYERS.step);
      const last = Math.round((at + thick) / LAYERS.step);
      for (let index = first; index <= last && index < count; index += 1) {
        if (glassy) {
          lens[index] = strength;
        } else {
          dark[index] = strength;
        }
      }
      at += thick + between(LAMINAE.apart);
    }
    return [dark, lens];
  }

  /** Where the blocks part, across: at each wall the surface climbs or drops, in the middle of each
   * crevasse, and every so far along a long stretch between them. */
  private parted(random: SeededRandom): number[] {
    const { WALL, BLOCKS } = GlacierIce;
    const { left, right } = this.reach;
    const walls: number[] = [];
    const points = this.surface.points;
    for (const [index, point] of points.entries()) {
      const next = points[index + 1];
      if (next === undefined) {
        continue;
      }
      const rise = Math.abs(next.y - point.y);
      if (rise >= WALL.high && rise >= WALL.steep * Math.abs(next.x - point.x)) {
        walls.push((point.x + next.x) / 2);
      }
    }
    for (const gap of this.surface.gaps) {
      walls.push((gap.left + gap.right) / 2);
    }
    walls.sort((one, other) => one - other);
    const apart = (): number =>
      BLOCKS.apart.min + random.fraction() * (BLOCKS.apart.max - BLOCKS.apart.min);
    const joints: number[] = [];
    let last = left;
    for (const wall of [...walls.filter((x) => x > left && x < right), right]) {
      for (let x = last + apart(); x < wall - BLOCKS.apart.min / 2; x += apart()) {
        joints.push(x);
      }
      if (wall < right) {
        joints.push(wall);
      }
      last = wall;
    }
    return joints;
  }

  /** Each block between two joints: its layers along the line its surface follows, tilted past it
   * a little, folded, and starting somewhere of their own along the run; the seam at its right
   * edge, its healed cracks and its white fractures. */
  private blocked(random: SeededRandom): Block[] {
    const { BLOCKS, SEAM, BANDS } = GlacierIce;
    const { left: from, right: to } = this.reach;
    const edges = [from - 50, ...this.joints, to + 50];
    const deepest = BANDS.at(-1)?.to ?? 0;
    const between = (range: { readonly min: number; readonly max: number }): number =>
      range.min + random.fraction() * (range.max - range.min);
    const blocks: Block[] = [];
    for (let index = 0; index + 1 < edges.length; index += 1) {
      const left = edges[index] ?? from;
      const right = edges[index + 1] ?? to;
      // The line the surface follows across the block, fitted to it.
      let count = 0;
      let sumX = 0;
      let sumY = 0;
      let sumXX = 0;
      let sumXY = 0;
      for (let x = left; x <= right; x += 0.5) {
        const y = this.surface.height(x);
        count += 1;
        sumX += x;
        sumY += y;
        sumXX += x * x;
        sumXY += x * y;
      }
      const meanX = sumX / Math.max(count, 1);
      const meanY = sumY / Math.max(count, 1);
      const spread = sumXX / Math.max(count, 1) - meanX * meanX;
      const fitted = spread > 1e-6 ? (sumXY / Math.max(count, 1) - meanX * meanY) / spread : 0;
      const cracks: IceCrack[] = [];
      const wide = right - left;
      for (const joint of [left, right]) {
        cracks.push({
          kind: "seam",
          x: joint,
          y: this.surface.height(joint) + 1,
          long: deepest + 2,
          lean: 0,
          wide: SEAM.wide,
          wander: SEAM.wander,
        });
      }
      const veins = Math.floor(random.fraction() * (BLOCKS.veins.most + 1) * Math.min(1, wide / 12));
      for (let vein = 0; vein < veins; vein += 1) {
        const x = left + random.fraction() * wide;
        cracks.push({
          kind: "vein",
          x,
          y: this.surface.height(x) - 0.3 - random.fraction() * 2.5,
          long: between(BLOCKS.veins.long),
          lean: (random.fraction() * 2 - 1) * BLOCKS.veins.lean,
          wide: between(BLOCKS.veins.wide),
          wander: 0,
        });
      }
      const fractures = Math.floor(
        random.fraction() * (BLOCKS.fractures.most + 1) * Math.min(1, wide / 12),
      );
      for (let fracture = 0; fracture < fractures; fracture += 1) {
        const x = left + random.fraction() * wide;
        const angle = (random.fraction() * 2 - 1) * 1.2;
        const long = between(BLOCKS.fractures.long);
        cracks.push({
          kind: "fracture",
          x,
          y: this.surface.height(x) - 0.5 - random.fraction() * 6,
          long: long * Math.cos(angle),
          lean: Math.tan(angle),
          wide: between(BLOCKS.fractures.wide),
          wander: 0,
        });
      }
      blocks.push({
        left,
        right,
        x: meanX,
        y: meanY,
        slope: fitted + (random.fraction() * 2 - 1) * BLOCKS.tilt,
        fold: between(BLOCKS.fold),
        offset: random.fraction() * 50,
        cracks,
      });
    }
    // The hairline cracks down from the top of bare ice, in the blocks they're in.
    const { BARE } = GlacierIce;
    for (const { left, right } of this.bare) {
      for (let x = left + between(BARE.hairlines.apart); x < right; x += between(BARE.hairlines.apart)) {
        const block = blocks[this.blockAt(x)];
        (block?.cracks as IceCrack[] | undefined)?.push({
          kind: "hairline",
          x,
          y: this.surface.height(x),
          long: between(BARE.hairlines.long),
          lean: (random.fraction() * 2 - 1) * BARE.hairlines.lean,
          wide: BARE.wide,
          wander: 0,
        });
      }
    }
    return blocks;
  }

  /** The sun cups along each stretch of bare ice, one after another. */
  private static cupped(bare: readonly Across[], random: SeededRandom): Cup[] {
    const { BARE } = GlacierIce;
    const between = (range: { readonly min: number; readonly max: number }): number =>
      range.min + random.fraction() * (range.max - range.min);
    const cups: Cup[] = [];
    for (const { left, right } of bare) {
      for (let x = left - BARE.runout; x < right + BARE.runout; ) {
        const half = between(BARE.cups.half);
        cups.push({ x: x + half, half, deep: between(BARE.cups.deep) });
        x += 2 * half;
      }
    }
    return cups;
  }
}

/** How a strip of `GlacierIce` is worked out: what each pixel is made of and how high its face
 * stands, then each lit. Kept apart from the glacier, which holds only its layout. What's the same
 * down a column, across a row or over a few pixels is worked out once, not at each pixel. */
class StripLayout {
  /** The crusts in the snow: how far down its depth each lies, how far it wanders, how thick and
   * how dark. */
  private static readonly CRUSTS = { at: [0.34, 0.71], wander: 0.08, thick: 0.02, dark: 0.08 };
  /** How much darker a firn's line is, and how glassy a lens in it; how much of the light the firn
   * keeps from the ice under it. */
  private static readonly FIRN = { dark: 0.16, glassy: 0.45, keeps: 0.1 };
  /** How the layers in a packet fade in and out along their length: over so many metres across,
   * so many down the run, down to so little of them. */
  private static readonly LENSES = { across: 0.11, down: 0.9, least: 0.15 };
  /** A crack: how dark a seam's or a vein's clear ice is, how white its edge, and how white a
   * fracture and a hairline are. */
  private static readonly CRACKS = { dark: 0.32, edge: 0.3, fracture: 0.42, hairline: 0.5 };
  /** The bubbles in the ice: how many a pixel at the most in white ice and in clear, and how much
   * whiter each is. */
  private static readonly BUBBLES = { white: 0.045, clear: 0.005, bright: 0.35 };
  /** The face's swells: so many across a metre, so high; worked out every so many pixels. */
  private static readonly SWELLS = { across: 0.75, high: 0.07, every: 4 };
  /** The light: where it comes from, from the picture's left, from above, and from in front; how
   * much the sky lights what faces away from it; and how much the swells brighten and darken. */
  private static readonly LIGHT = { right: -0.5, down: -0.62, out: 0.6 };
  private static readonly SKY = 0.35;
  private static readonly SHADING = 0.6;
  /** The bare ice's glaze: how far down it reaches and how much it whitens the ice there; the
   * light on its cups' rims, so thick; and how much clearer the bare ice is. */
  private static readonly GLAZE = {
    deep: 0.1,
    whitens: 0.4,
    rim: 0.022,
    rimLight: 0.7,
    clearer: 0.55,
    darker: 0.36,
    under: 1.6,
  };
  /** How many steps of light a colour is worked out for: a byte's. */
  private static readonly STEPS = 256;
  private static shadesCache: {
    snow: Uint8Array;
    firn: Uint8Array;
    clear: Uint8Array;
    bubbly: Uint8Array;
  } | null = null;

  constructor(
    private readonly glacier: GlacierIce,
    private readonly left: number,
    private readonly band: GlacierBand,
    private readonly columns: number,
    private readonly rows: number,
  ) {}

  /** Its day colours, four bytes a pixel. */
  pixels(): Uint8ClampedArray {
    const { glacier, left, band, columns, rows } = this;
    const { fine } = band;
    const { CRUSTS, FIRN, LENSES, CRACKS, BUBBLES, GLAZE, STEPS } = StripLayout;
    const shades = StripLayout.shades();
    const pixel = 1 / fine;
    const pixels = new Uint8ClampedArray(columns * rows * 4);
    const depths = Float32Array.from({ length: rows }, (_, row) => band.from + (row + 0.5) * pixel);
    const lights = depths.map((depth) => GlacierIce.light(depth));
    const solids = depths.map((depth) => {
      const share = Math.min(1, Math.max(0, (band.to - depth) / band.fade));
      return share * share * (3 - 2 * share);
    });
    // Under the snow and the firn, or the bare ice's glaze, how much their light still counts.
    const nears = depths.map((depth) => Math.exp(-depth / GLAZE.under));
    const packets = glacier.packets.over(pixel);
    const layers = glacier.layers.over(pixel);
    const dusts = glacier.dust.over(pixel);
    const laminae = glacier.laminae.over(pixel);
    const lenses = glacier.lenses.over(pixel);
    const { snow: snowShades, firn: firnShades, clear, bubbly } = shades;
    const shading = this.shading();
    // How much of the fine detail this band is fine enough to show.
    const detail = Math.min(1, Math.max(0, (fine - 10) / 18));
    const reach = glacier.reach;
    const lensGrid = this.lensGrid();
    const dust = Palette.channels(Palette.ICE_DUST);
    const glaze = Palette.channels(Palette.GLAZE);
    for (let column = 0; column < columns; column += 1) {
      const x = left + (column + 0.5) * pixel;
      const at = glacier.column(x);
      const { top, bare, snow, firn, run, hollow, rim, cracks } = at;
      const outside = Math.min(1, Math.max(0, (x - (reach.right - GlacierIce.FADE_OUT)) / GlacierIce.FADE_OUT));
      const across = 1 - outside * outside * (3 - 2 * outside);
      const crusts = CRUSTS.at.map(
        (share, index) =>
          snow * (share + CRUSTS.wander * (glacier.noise.at(x * 0.43 + index * 13.7, 1.3) * 2 - 1)),
      );
      const keeps = 1 - FIRN.keeps * Math.min(1, (firn - snow) / 1.4);
      for (let row = 0; row < rows; row += 1) {
        const depth = depths[row] ?? 0;
        if (depth < hollow) {
          continue;
        }
        const index = row * columns + column;
        const y = top - depth;
        const lit = shading.at(column, row);
        let red: number;
        let green: number;
        let blue: number;
        let glazed = 0;
        if (depth < snow) {
          let crust = 0;
          for (const crustDepth of crusts) {
            const off = Math.abs(depth - crustDepth);
            crust = Math.max(crust, Math.min(1, (CRUSTS.thick / 2 - off) / pixel + 0.5));
          }
          const share = depth / Math.max(snow, 1e-3);
          const tone = (1 - 0.5 * share ** 1.4 - CRUSTS.dark * Math.max(crust, 0)) * (0.9 + 0.1 * lit);
          const step = Math.round(Math.min(Math.max(tone, 0), 1) * (STEPS - 1)) * 3;
          red = snowShades[step] ?? 0;
          green = snowShades[step + 1] ?? 0;
          blue = snowShades[step + 2] ?? 0;
        } else if (depth < firn) {
          const down = depth - snow;
          const share = down / Math.max(firn - snow, 1e-3);
          const wobble = 0.015 * (glacier.noise.at(x * 1.9, 3.3) - 0.5);
          const line = laminae.at(down + wobble) * detail;
          const lens = lenses.at(down + wobble) * detail;
          const tone = (0.96 - 0.42 * share - FIRN.dark * line) * (0.85 + 0.15 * lit);
          const step = Math.round(Math.min(Math.max(tone, 0), 1) * (STEPS - 1)) * 3;
          red = firnShades[step] ?? 0;
          green = firnShades[step + 1] ?? 0;
          blue = firnShades[step + 2] ?? 0;
          glazed = FIRN.glassy * lens;
        } else {
          const runAt = run + depth;
          const lensAt = lensGrid.at(column, row);
          const fineness = LENSES.least + (1 - LENSES.least) * lensAt;
          let white = Math.min(1, Math.max(0, packets.at(runAt) + layers.at(runAt) * fineness));
          let dirt = dusts.at(runAt);
          const near = nears[row] ?? 0;
          let light = (lights[row] ?? 0) * (1 - (1 - keeps) * near);
          if (bare > 0) {
            // Clear ice up to the surface is blue, not white: what makes the ice under the snow
            // pale is the snow's and the firn's light, and bubbles. Deeper down the ice is the
            // glacier's, whatever lies on top.
            light *= 1 - GLAZE.darker * bare * near;
            white *= 1 - GLAZE.clearer * bare * near;
            const under = depth - hollow;
            const share = Math.max(0, 1 - under / GLAZE.deep);
            glazed = GLAZE.whitens * bare * share * share;
            if (under < GLAZE.rim) {
              glazed = Math.max(glazed, GLAZE.rimLight * bare * (0.35 + 0.65 * rim));
            }
          }
          // The cracks: a seam's or a vein's clear, dark ice with a white edge; a white fracture.
          let dark = 0;
          let mark = 0;
          for (const crack of cracks) {
            const amount = StripLayout.onCrack(glacier, crack, x, y, pixel);
            if (amount <= 0) {
              continue;
            }
            if (crack.kind === "seam" || crack.kind === "vein") {
              dark = Math.max(dark, amount);
            } else {
              const white = crack.kind === "fracture" ? CRACKS.fracture : CRACKS.hairline;
              const fading = crack.kind === "hairline" ? 1 - (top - y) / crack.long : 1;
              mark = Math.max(mark, white * amount * fading);
            }
          }
          if (dark > 0) {
            white *= 1 - dark;
            dirt *= 1 - dark;
            light *= 1 - CRACKS.dark * dark;
            mark = Math.max(mark, CRACKS.edge * dark * (1 - dark) * 4 * detail * 0.5);
          }
          // Bubbles, more in the white ice.
          const chance = (BUBBLES.clear + (BUBBLES.white - BUBBLES.clear) * white) * detail;
          if (chance > 0 && StripLayout.hash(Math.round(x * fine), Math.round(depth * fine)) < chance) {
            mark = Math.max(mark, BUBBLES.bright);
          }
          const tone = Math.min(1, light * lit);
          const step = Math.round(Math.min(Math.max(tone, 0), 1) * (STEPS - 1)) * 3;
          red = (clear[step] ?? 0) + ((bubbly[step] ?? 0) - (clear[step] ?? 0)) * white;
          green = (clear[step + 1] ?? 0) + ((bubbly[step + 1] ?? 0) - (clear[step + 1] ?? 0)) * white;
          blue = (clear[step + 2] ?? 0) + ((bubbly[step + 2] ?? 0) - (clear[step + 2] ?? 0)) * white;
          const dusty = dirt * (0.4 + 0.6 * tone);
          red += (dust.red - red) * dusty;
          green += (dust.green - green) * dusty;
          blue += (dust.blue - blue) * dusty;
          red += (255 - red) * mark;
          green += (255 - green) * mark;
          blue += (255 - blue) * mark;
        }
        if (glazed > 0) {
          red += (glaze.red - red) * glazed;
          green += (glaze.green - green) * glazed;
          blue += (glaze.blue - blue) * glazed;
        }
        const byte = index * 4;
        pixels[byte] = red;
        pixels[byte + 1] = green;
        pixels[byte + 2] = blue;
        pixels[byte + 3] = (solids[row] ?? 0) * across * 255;
      }
    }
    return pixels;
  }

  /** How much of a pixel `x` across at `y`, so big, lies on a crack, 0 to 1, its ends tapering. */
  private static onCrack(glacier: GlacierIce, crack: IceCrack, x: number, y: number, pixel: number): number {
    const down = crack.y - y;
    if (down < 0 || down > crack.long) {
      return 0;
    }
    const wandered =
      crack.wander === 0 ? 0 : crack.wander * glacier.seam.at(y * 1.3 + crack.x * 3.1);
    // Across a leaning crack the distance is shorter than straight across.
    const off = Math.abs(x - (crack.x + crack.lean * down + wandered)) / Math.sqrt(1 + crack.lean * crack.lean);
    const taper = crack.kind === "seam" ? 1 : Math.min(1, Math.min(down, crack.long - down) / (0.25 * crack.long + 0.05));
    const half = (crack.wide * taper) / 2;
    const covered = Math.min(1, Math.max(0, (half - off) / pixel + 0.5));
    return covered * Math.min(1, (2 * half) / pixel + 0.25);
  }

  /** How brightly each pixel's face is lit by its swells, as a share of a flat face's light: worked
   * out every few pixels and eased between. */
  private shading(): Grid {
    const { glacier, left, band, columns, rows } = this;
    const { SWELLS, LIGHT, SKY, SHADING } = StripLayout;
    const every = SWELLS.every;
    const pixel = 1 / band.fine;
    const across = Math.ceil(columns / every) + 2;
    const down = Math.ceil(rows / every) + 2;
    const heights = new Float32Array(across * down);
    for (let gridColumn = 0; gridColumn < across; gridColumn += 1) {
      const x = left + gridColumn * every * pixel;
      const top = glacier.top(x);
      for (let gridRow = 0; gridRow < down; gridRow += 1) {
        const y = top - (band.from + gridRow * every * pixel);
        heights[gridRow * across + gridColumn] =
          SWELLS.high * (glacier.noise.fractal(x * SWELLS.across + 3.1, y * SWELLS.across + 5.7, 2) - 0.5);
      }
    }
    const length = Math.hypot(LIGHT.right, LIGHT.down, LIGHT.out);
    const [lightRight, lightDown, lightOut] = [LIGHT.right / length, LIGHT.down / length, LIGHT.out / length];
    const flat = SKY + (1 - SKY) * lightOut;
    const lit = new Float32Array(across * down);
    const step = every * pixel;
    for (let gridRow = 0; gridRow < down; gridRow += 1) {
      for (let gridColumn = 0; gridColumn < across; gridColumn += 1) {
        const index = gridRow * across + gridColumn;
        const here = heights[index] ?? 0;
        const right = gridColumn + 1 < across ? (heights[index + 1] ?? here) : here;
        const leftOf = gridColumn > 0 ? (heights[index - 1] ?? here) : here;
        const under = gridRow + 1 < down ? (heights[index + across] ?? here) : here;
        const over = gridRow > 0 ? (heights[index - across] ?? here) : here;
        const tiltRight = -(right - leftOf) / (2 * step);
        const tiltDown = -(under - over) / (2 * step);
        const size = Math.sqrt(tiltRight * tiltRight + tiltDown * tiltDown + 1);
        const facing = Math.max(0, (tiltRight * lightRight + tiltDown * lightDown + lightOut) / size);
        lit[index] = 1 + SHADING * ((SKY + (1 - SKY) * facing) / flat - 1);
      }
    }
    return new Grid(lit, across, every);
  }

  /** How much of a packet's fine layers show at each few pixels: they fade in and out along their
   * length. */
  private lensGrid(): Grid {
    const { glacier, left, band, columns, rows } = this;
    const { LENSES, SWELLS } = StripLayout;
    const every = SWELLS.every;
    const pixel = 1 / band.fine;
    const across = Math.ceil(columns / every) + 2;
    const down = Math.ceil(rows / every) + 2;
    const values = new Float32Array(across * down);
    for (let gridColumn = 0; gridColumn < across; gridColumn += 1) {
      const x = left + gridColumn * every * pixel;
      const { run } = glacier.column(x);
      for (let gridRow = 0; gridRow < down; gridRow += 1) {
        const depth = band.from + gridRow * every * pixel;
        values[gridRow * across + gridColumn] = glacier.noise.at(
          x * LENSES.across + 41.3,
          (run + depth) * LENSES.down + 7.7,
        );
      }
    }
    return new Grid(values, across, every);
  }

  /** The colours of the snow, the firn, the clear ice and the bubbly ice at each step of light,
   * worked out once. */
  private static shades(): { snow: Uint8Array; firn: Uint8Array; clear: Uint8Array; bubbly: Uint8Array } {
    if (StripLayout.shadesCache === null) {
      const of = (stops: readonly (readonly [number, number])[]): Uint8Array => {
        const { STEPS } = StripLayout;
        const shades = new Uint8Array(STEPS * 3);
        for (let step = 0; step < STEPS; step += 1) {
          const { red, green, blue } = Palette.channels(Palette.along(stops, step / (STEPS - 1)));
          shades.set([red, green, blue], step * 3);
        }
        return shades;
      };
      StripLayout.shadesCache = {
        snow: of(Palette.GLACIER_SNOW),
        firn: of(Palette.GLACIER_FIRN),
        clear: of(Palette.CLEAR_ICE),
        bubbly: of(Palette.BUBBLY_ICE),
      };
    }
    return StripLayout.shadesCache;
  }

  /** A pixel's chance, 0 to 1, the same wherever a strip starts. */
  private static hash(x: number, y: number): number {
    let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 0x100000000;
  }
}
