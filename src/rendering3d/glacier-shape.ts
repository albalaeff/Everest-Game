import type { Terrain } from "../physics";
import type { PartStretch } from "../rendering/glacier";
import { FieldNoise } from "./field-noise";
import type { Spot } from "./trail";
import type { Trail } from "./trail";

/** A point of the route's line the ground is hung on: how far along the ground it is, where it
 * is in the physics' plane, and whether it's on a wall, of a block or of a crevasse. */
export interface Row {
  readonly along: number;
  readonly x: number;
  readonly y: number;
  readonly steep: boolean;
  /** How much of a wall's face the point is, 1 on it, falling to 0 a couple of metres along the
   * ground past its lip and its foot: the face's lumps carry its lip and its foot with them. */
  readonly wall: number;
  /** How far above the glacier's own surface the line is here, or below it, in metres. */
  readonly relief: number;
  /** The crevasse or the block the line crosses here, or none. */
  readonly feature: number;
}

/** A point of the ground, with how far below the glacier's surface it lies, in metres: the
 * blue of a crevasse deepens by it. */
export interface GroundPoint extends Spot {
  readonly depth: number;
}

/** A crevasse the trail crosses, or a block it climbs over, as the ground beside the trail
 * knows it: where it is up the valley, and how far it reaches to each side before it closes or
 * gives way to the next block. */
interface Feature {
  readonly kind: "crevasse" | "block";
  readonly centre: number;
  readonly half: number;
  readonly left: number;
  readonly right: number;
}

/** How broken a part of the route is: how tall its blocks stand over the glacier's surface, how
 * wide each is, and how much of the swell and the hummocks it has. */
interface Roughness {
  readonly swell: number;
  readonly size: number;
  readonly height: number;
  /** How tall its tallest towers of ice stand, in metres. */
  readonly towers: number;
}

/**
 * The shape of the glacier in 3D. On the trail the ground is the slope physics' own line, to the
 * centimetre: every wall, every crevasse and every hummock a climber's feet meet. To each side
 * that line is carried out across the glacier and let go of: a crevasse runs on for tens of
 * metres, narrowing and bending until it closes; a wall of ice gives way to the next block;
 * and past them the ground is the glacier's own, a swell broken into blocks as that part of the
 * Icefall is, small in the Popcorn and tall in the maze. Pure, and a function of the route and
 * the level's seed alone: the meshes are cut from it, and the towers stood on it.
 */
export class GlacierShape {
  /** How far apart the line's points are taken, at the most, in metres along the ground. */
  static readonly STEP = 0.5;
  /** How far to each side the route's line shapes the ground: past it, the glacier's own. */
  static readonly REACH = 40;
  /** How far the ground goes on past each end of the route, and how wide the glacier is. */
  static readonly BEFORE = 90;
  static readonly AFTER = 140;
  static readonly HALF_WIDTH = 260;
  /** Half the trodden trail's width: inside it the ground is the physics' line and nothing else. */
  private static readonly TRAIL = 1.2;
  /** How far above or below the glacier's surface the line must go to be a block or a crevasse. */
  private static readonly FEATURE = 1;
  private static readonly ROUGHNESS: Readonly<Record<string, Roughness>> = {
    moraine: { swell: 0.25, size: 4, height: 0.4, towers: 0 },
    popcorn: { swell: 0.6, size: 3.4, height: 1.5, towers: 4 },
    maze: { swell: 1, size: 9, height: 2.6, towers: 17 },
    "football-field": { swell: 0.3, size: 7, height: 0.6, towers: 5 },
    "upper-icefall": { swell: 1.15, size: 11, height: 3, towers: 22 },
    "western-cwm": { swell: 0.3, size: 14, height: 0.5, towers: 0 },
  };
  private static readonly PLAIN: Roughness = { swell: 0.3, size: 8, height: 0.5, towers: 0 };
  /** The grid the glacier's own surface is kept on, in metres up the valley. */
  private static readonly GRID = 0.5;

  readonly rows: readonly Row[];
  private readonly noise: FieldNoise;
  private readonly surface: Float64Array;
  private readonly features: readonly Feature[];
  private readonly parts: readonly {
    readonly from: number;
    readonly to: number;
    readonly id: string;
  }[];

  constructor(
    private readonly terrain: Terrain,
    private readonly trail: Trail,
    parts: readonly PartStretch[],
    /** The stretches of the ground, by how far along it, where the trail walks bare ice. */
    private readonly ice: readonly { readonly from: number; readonly to: number }[],
    seed: number,
  ) {
    this.noise = new FieldNoise(seed);
    this.parts = parts.map(({ id, from, to }) => ({
      id,
      from: terrain.point(from).x,
      to: terrain.point(to).x,
    }));
    this.surface = this.smoothed();
    const bare = this.lineRows();
    this.features = this.found(bare);
    const steepAt = bare.filter(({ steep }) => steep).map(({ along }) => along);
    this.rows = bare.map((row) => ({
      ...row,
      feature: this.featureAt(row),
      wall: GlacierShape.wallShare(row, steepAt),
    }));
  }

  /** The point of the ground `side` metres to the right of the trail on a row of the line. */
  across(row: Row, side: number): GroundPoint {
    const reach = Math.abs(side);
    const feature = this.features[row.feature];
    const off = FieldNoise.smooth(GlacierShape.TRAIL, 5, reach);
    let upValley = row.x + this.bend(row.x, side);
    let held = 1 - off;
    if (feature !== undefined) {
      const length = side < 0 ? feature.left : feature.right;
      if (feature.kind === "crevasse") {
        const closing = FieldNoise.smooth(0.35 * length, length, reach);
        const fromCentre = Math.min(Math.max(row.x - feature.centre, -feature.half), feature.half);
        upValley -= 0.8 * closing * fromCentre;
        held = 1 - FieldNoise.smooth(0.5 * length, length, reach);
      } else {
        held = 1 - FieldNoise.smooth(0.45 * length, length, reach);
      }
    }
    const x = this.trail.aside(row.x) + side;
    if (row.wall > 0) {
      // A face of ice is broken into facets, each leaning its own way.
      const facet = this.noise.cell(x, row.y * 1.3, 2.4, 40);
      const lean = (facet.id - 0.5) * 0.9 + facet.towardX * 0.5 + facet.towardZ * 0.3;
      const lumps = this.noise.fractal(x / 5, row.y / 4, 2, 41) - 0.5;
      upValley += (lean + 1.6 * lumps) * off * row.wall * Math.min(held * 4, 1);
    }
    const floor = this.floor(x, -upValley);
    const relief = row.relief * held;
    return {
      x,
      y: floor.y + relief,
      z: -upValley,
      depth: floor.depth + Math.max(-relief, 0),
    };
  }

  /** How tall the towers of ice stand at their tallest, `upValley` metres up it, in metres: none
   * on the moraine and the Cwm's open snow, the tallest in the maze and the Upper Icefall. */
  towers(upValley: number): number {
    return this.roughness(upValley).towers;
  }

  /** Whether one of the crevasses the trail crosses runs under a point of the world, or within
   * `margin` metres of it: nothing stands there. */
  crevassed(x: number, z: number, margin: number): boolean {
    const upValley = -z;
    return this.features.some(({ kind, centre, half, left, right }) => {
      const side = x - this.trail.aside(centre);
      const length = side < 0 ? left : right;
      return (
        kind === "crevasse" &&
        Math.abs(side) < length + margin &&
        Math.abs(upValley - centre - this.bend(centre, side)) < half + margin
      );
    });
  }

  /** How far to the right of the valley's axis the trail's centre is, `upValley` metres up it. */
  asideOf(upValley: number): number {
    return this.trail.aside(upValley);
  }

  /** What the ground is made of at a row's point `side` metres off the trail: 0 for the
   * glacier's snow, up to 1 where the trail walks bare ice, and up to 2 on the moraine's rubble. */
  kind(row: Row, side: number): number {
    const bare = this.ice.some(({ from, to }) => row.along >= from - 0.5 && row.along <= to + 0.5);
    const onIce = bare ? 1 - FieldNoise.smooth(2.5, 7, Math.abs(side)) : 0;
    return Math.max(onIce, this.rubble(row.x, this.trail.aside(row.x) + side));
  }

  /** How much of the ground is the moraine's rubble at a point of the world, 0 to 2: all of it
   * below Crampon Point, where the ice begins. */
  rubble(upValley: number, x: number): number {
    const moraine = this.parts.find(({ id }) => id === "moraine");
    const end = moraine?.to ?? 0;
    const ragged = (this.noise.fractal(x / 9, upValley / 9, 2, 50) - 0.5) * 10;
    return 2 * (1 - FieldNoise.smooth(end - 4, end + 5, upValley + ragged));
  }

  /** The glacier's own ground at a point of the world, away from the route's line: its surface,
   * and on it the swell, the hummocks and the blocks of the part of the route it's level with. */
  floor(x: number, z: number): GroundPoint {
    const upValley = -z;
    const side = x - this.trail.aside(upValley);
    const reach = Math.abs(side);
    const { swell, size, height } = this.roughness(upValley);
    const off = FieldNoise.smooth(GlacierShape.TRAIL, 9, reach);
    const edge = 1 - 0.7 * FieldNoise.smooth(170, 230, Math.abs(x));
    const rough = off * edge;
    const lumps = (this.noise.fractal(x / 26, z / 26, 3, 1) - 0.5) * 5;
    const hummocks = (this.noise.ridged(x / 7, z / 7, 3, 2) - 0.4) * 0.7;
    const cell = this.noise.cell(x, z, size, 3);
    const turn = cell.id * 2 * Math.PI * 7;
    const tilt = (cell.towardX * Math.cos(turn) + cell.towardZ * Math.sin(turn)) * 0.6;
    const crack = FieldNoise.smooth(0.1, 0.02, cell.next - cell.nearest);
    const block = (Math.pow(cell.id, 1.3) + tilt - 0.4) * height;
    const apron = Math.max(Math.abs(x) - 170, 0);
    return {
      x,
      y:
        this.surfaceAt(upValley) +
        rough * (swell * (lumps + hummocks) + block - crack * height * 0.8) +
        apron * apron * 0.004,
      z,
      depth: rough * crack * height * 0.8,
    };
  }

  /** The glacier's own surface `x` metres up the valley: the route's line with its crevasses
   * filled and its blocks taken off, and smoothed. */
  surfaceAt(x: number): number {
    const { surface } = this;
    const at = (x + GlacierShape.BEFORE) / GlacierShape.GRID;
    const index = Math.min(Math.max(Math.floor(at), 0), surface.length - 2);
    const share = Math.min(Math.max(at - index, 0), 1);
    const low = surface[index] ?? 0;
    return low + ((surface[index + 1] ?? low) - low) * share;
  }

  /** How far a row's point is carried up or down the valley `side` metres from the trail: the
   * crevasses and the walls don't cross the glacier square to the route. */
  private bend(x: number, side: number): number {
    const reach = Math.max(Math.abs(side) - GlacierShape.TRAIL, 0);
    const skew = (this.noise.fractal(x / 45, 0.37, 2, 20) - 0.5) * 0.56;
    const wander = (this.noise.fractal(x / 30, side / 14, 2, 21) - 0.5) * 3;
    const far = 22 * Math.tanh(reach / 22);
    return Math.sign(side) * far * skew + wander * Math.min(reach / 6, 1);
  }

  /** How broken the ground is `x` metres up the valley, eased from one part into the next. */
  private roughness(x: number): Roughness {
    const blend = 8;
    let swell = 0;
    let size = 0;
    let height = 0;
    let towers = 0;
    let total = 0;
    for (const { id, from, to } of this.parts) {
      const inside = Math.min(x - from, to - x);
      if (inside <= -blend) {
        continue;
      }
      const weight = FieldNoise.smooth(-blend, blend, inside);
      const part = GlacierShape.ROUGHNESS[id] ?? GlacierShape.PLAIN;
      swell += part.swell * weight;
      size += part.size * weight;
      height += part.height * weight;
      towers += part.towers * weight;
      total += weight;
    }
    return total > 0
      ? { swell: swell / total, size: size / total, height: height / total, towers: towers / total }
      : GlacierShape.PLAIN;
  }

  /** How much of a wall a row is: all of one on a face, and less by how far along the ground
   * the nearest face is, to none 2 m off. `faces` are the faces' points, in order. */
  private static wallShare(row: Row, faces: readonly number[]): number {
    if (row.steep) {
      return 1;
    }
    let low = 0;
    let high = faces.length - 1;
    while (low < high) {
      const middle = (low + high) >> 1;
      if ((faces[middle] ?? 0) < row.along) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    const nearest = Math.min(
      Math.abs((faces[low] ?? Infinity) - row.along),
      Math.abs((faces[low - 1] ?? Infinity) - row.along),
    );
    return 1 - FieldNoise.smooth(0, 2, nearest);
  }

  /** The crevasse or the block a row is in, or −1. */
  private featureAt(row: Row): number {
    if (Math.abs(row.relief) < GlacierShape.FEATURE && !row.steep) {
      return -1;
    }
    return this.features.findIndex(
      ({ centre, half, kind }) =>
        Math.abs(row.x - centre) <= half + 1e-6 && (kind === "crevasse") === row.relief < 0,
    );
  }

  /** The crevasses and the blocks along the line: each stretch of it that stays under the
   * glacier's surface, or over it, with how far it reaches to each side, by the level's seed. */
  private found(rows: readonly Row[]): readonly Feature[] {
    const features: Feature[] = [];
    let from: Row | null = null;
    let last: Row | null = null;
    let deepest = 0;
    const close = (): void => {
      if (from !== null && last !== null && Math.abs(deepest) >= 2 * GlacierShape.FEATURE) {
        const crevasse = deepest < 0;
        const number = features.length;
        const [near, far] = crevasse ? [20, 16] : [6, 9];
        features.push({
          kind: crevasse ? "crevasse" : "block",
          centre: (from.x + last.x) / 2,
          half: (last.x - from.x) / 2,
          left: near + far * this.noise.corner(number, 0, 30),
          right: near + far * this.noise.corner(number, 1, 30),
        });
      }
      from = null;
      deepest = 0;
    };
    for (const row of rows) {
      const side = Math.abs(row.relief) < GlacierShape.FEATURE ? 0 : Math.sign(row.relief);
      if (from !== null && side !== Math.sign(deepest)) {
        close();
      }
      if (side !== 0) {
        from ??= row;
        last = row;
        deepest = side * Math.max(Math.abs(deepest), Math.abs(row.relief));
      }
    }
    close();
    return features;
  }

  /** The line's points, every corner of it and points between them a step apart, and flat
   * ground on past each end. */
  private lineRows(): Row[] {
    const { terrain } = this;
    const { STEP, BEFORE, AFTER } = GlacierShape;
    const rows: Row[] = [];
    const push = (along: number, x: number, y: number, steep: boolean): void => {
      rows.push({ along, x, y, steep, wall: 0, relief: y - this.surfaceAt(x), feature: -1 });
    };
    const [first] = terrain.points;
    const last = terrain.points.at(-1);
    if (first === undefined || last === undefined) {
      return rows;
    }
    for (let back = BEFORE; back > 0; back -= 2 * STEP) {
      push(-back, first[0] - back, first[1], false);
    }
    for (const [index, [x, y]] of terrain.points.entries()) {
      const along = terrain.alongs[index] ?? 0;
      const next = terrain.points[index + 1];
      const before = terrain.points[index - 1];
      const steepTo = (other: readonly [number, number] | undefined): boolean =>
        other !== undefined && Math.abs(other[1] - y) > 2 * Math.abs(other[0] - x);
      push(along, x, y, steepTo(next) || steepTo(before));
      if (next === undefined) {
        continue;
      }
      const length = (terrain.alongs[index + 1] ?? along) - along;
      const pieces = Math.ceil(length / STEP);
      for (let piece = 1; piece < pieces; piece += 1) {
        const share = piece / pieces;
        push(
          along + length * share,
          x + (next[0] - x) * share,
          y + (next[1] - y) * share,
          steepTo(next),
        );
      }
    }
    for (let on = 2 * STEP; on <= AFTER; on += 2 * STEP) {
      push(terrain.length + on, last[0] + on, last[1], false);
    }
    return rows;
  }

  /** The glacier's own surface on its grid: the line's height, its crevasses closed over and
   * its blocks cut off, then smoothed; past the route's ends it lies level a while, then falls
   * away down the valley and climbs on up it. */
  private smoothed(): Float64Array {
    const { terrain } = this;
    const { GRID, BEFORE, AFTER } = GlacierShape;
    const [first] = terrain.points;
    const last = terrain.points.at(-1);
    const span = last?.[0] ?? 0;
    const count = Math.ceil((BEFORE + span + AFTER) / GRID) + 1;
    const level = 30;
    const line = Float64Array.from({ length: count }, (_, index) => {
      const x = index * GRID - BEFORE;
      if (x < 0) {
        return (first?.[1] ?? 0) + Math.min(x + level, 0) * 0.04;
      }
      if (x > span) {
        return (last?.[1] ?? 0) + Math.max(x - span - level, 0) * 0.05;
      }
      return terrain.height(x);
    });
    const spread = (values: Float64Array, metres: number, pick: (a: number, b: number) => number) =>
      Float64Array.from(values, (_, index) => {
        const reach = Math.round(metres / GRID);
        let picked = values[index] ?? 0;
        for (let off = -reach; off <= reach; off += 1) {
          picked = pick(picked, values[Math.min(Math.max(index + off, 0), count - 1)] ?? picked);
        }
        return picked;
      });
    const closed = spread(spread(line, 5, Math.max), 5, Math.min);
    const opened = spread(spread(closed, 7, Math.min), 7, Math.max);
    const sigma = 5 / GRID;
    const reach = Math.round(3 * sigma);
    return Float64Array.from(opened, (_, index) => {
      let sum = 0;
      let weight = 0;
      for (let off = -reach; off <= reach; off += 1) {
        const bell = Math.exp(-(off * off) / (2 * sigma * sigma));
        sum += bell * (opened[Math.min(Math.max(index + off, 0), count - 1)] ?? 0);
        weight += bell;
      }
      return sum / weight;
    });
  }
}
