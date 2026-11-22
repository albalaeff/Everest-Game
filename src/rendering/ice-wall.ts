import type { Point, Terrain } from "../physics";
import { SeededRandom } from "../simulation";
import type { Beam } from "./beam";
import { Cornice } from "./cornice";
import { IceRelief } from "./ice-relief";
import type { ReliefLevel } from "./ice-relief";
import { Wander } from "./wander";

/** A band of brittle ice across a face, as the picture draws it: its outline, closed, and the
 * cracks that run from it into the sound ice, each a line. */
export interface BrittleBand {
  readonly outline: readonly Point[];
  readonly cracks: readonly (readonly Point[])[];
}

/**
 * A wall of ice a ladder climbs, or a step of it the route climbs on the tools, up the route or
 * down it, as the picture draws it (#184): its face of bare ice, a band of it from the face back
 * into the glacier, and on its top a lip of snow standing out over the drop with icicles under it,
 * as the photos of the Icefall's walls show. Its ice is the Icefall's (#290, `IceRelief`): fluted,
 * lobed, hung in tiers with icicles, pitted, under snow here and there, each wall its own, lit
 * from above, and a lamp's beam makes its wet ice shine. A drift of snow lies against its foot. A
 * step climbed on the tools, with no ladder, leans out at its top in a bulge of ice under the
 * snow, and the picks and front points of the climbers before have scarred its face from its foot
 * to its lip, so it says where to climb. Laid out once by a seeded generator of the picture's own;
 * its sizes are the drawing's numbers.
 */
export class IceWall {
  /** How far back into the ice its bare face shows, from the least to the most, and how long its
   * waves are. */
  static readonly FACE = { min: 1.5, max: 2.6 };
  private static readonly FACE_EVERY = 2.2;
  /** How finely the line its bare ice shows back to follows the face, and how far it wanders, so
   * short a way down, ragged as a crevasse's lit ice (#290). */
  private static readonly DRAWN_EVERY = 0.15;
  static readonly RAGGED = { every: 0.32, most: 0.28 };
  /** Its bare ice stays in its own block of the glacier (#290): where the ground behind the face
   * drops under a point of it, a crevasse behind the wall, the ice shows no further back than
   * this far short of the drop, felt for this finely, and never less than so far. */
  static readonly BLOCK = { clear: 0.25, every: 0.125, least: 0.4, under: 0.05 };
  /** How far into the face the scars stay off its inner edge, as a share of its width there. */
  private static readonly INSIDE = 0.92;
  /** A step climbed on the tools leans out at its top (#290): how far out past its face its bulge
   * of ice stands, and how far down from the lip it comes back into the face, in metres. */
  static readonly BULGE = {
    lean: { min: 0.25, max: 0.42 },
    height: { min: 0.6, max: 1 },
  } as const;
  /** The bulge's outline, as shares of its lean out and its height down: from the lip round its
   * nose and back under it to the face. */
  private static readonly BULGE_SHAPE: readonly (readonly [out: number, down: number])[] = [
    [0.55, 0.06],
    [0.9, 0.22],
    [1, 0.42],
    [0.88, 0.64],
    [0.55, 0.84],
    [0.2, 0.96],
  ];
  /** The scars of the climbers before up a step climbed on the tools (#290): a pair of picks'
   * holes every so far up, so far apart across the face and this far into it from its edge, each
   * so big; the front points' marks this far below each pair, so long. */
  private static readonly SCAR_EVERY = { min: 0.34, max: 0.5 };
  private static readonly SCAR_PICKS = { into: 0.12, apart: 0.3, wander: 0.07 };
  private static readonly PICK_HOLE = { width: 0.06, depth: 0.045 };
  private static readonly FRONT_POINTS = { below: 0.28, length: 0.09, apart: 0.05 };
  /** How far over the foot and under the bulge or the lip the scars start and stop. */
  private static readonly SCAR_CLEAR = { foot: 0.25, top: 0.15 };
  /** The seeds of its ice and of its bulge, drift and scars, from the wall's, so its face and its
   * lip of snow keep theirs. */
  private static readonly ICE_SEED = 290;
  private static readonly STEP_SEED = 291;
  /** The drift of snow against a wall's foot (#290): how far out in front of it it starts and how
   * high up the face it lies, in metres; and in how many points it curves up. */
  static readonly APRON = {
    out: { min: 0.45, max: 1.1 },
    high: { min: 0.22, max: 0.55 },
  } as const;
  private static readonly APRON_POINTS = 8;
  /** The light a headlamp spills round itself onto the ice near it (#290): as strong as this
   * share of the lamp at the lamp, and gone so many metres from it. */
  private static readonly SPILL = { strong: 0.9, reach: 3.5 };
  /** How much air the relief's box keeps past the face's furthest edge, for its lumps. */
  private static readonly MARGIN = 0.15;
  /** How near two lengths along the ground are to be the same point. */
  private static readonly SAME_ALONG = 1e-9;
  /** A band of brittle ice's ragged edges: where across the face each jag is, as a share of the
   * way from the face into the ice at its foot and back out at its top, and how far it rises or
   * drops, in metres. */
  private static readonly BRITTLE_JAGS = {
    foot: [
      [0.3, -0.05],
      [0.65, 0.04],
    ],
    top: [
      [0.35, 0.05],
      [0.7, -0.04],
    ],
  } as const;
  /** Its cracks into the sound ice: where across the face each starts, as a share of the way
   * into it, which edge, up from the top or down from the foot, how far it runs and how far it
   * kinks aside halfway, in metres. */
  private static readonly BRITTLE_CRACKS = [
    { across: 0.4, way: 1, run: 0.3, kink: 0.06 },
    { across: 0.7, way: -1, run: 0.24, kink: -0.05 },
  ] as const;

  /** The bare ice, closed: down the face from its top to its foot, and back up inside the ice,
   * along the ragged line it shows back to. */
  readonly face: readonly Point[];
  /** The snow on its top. */
  readonly cornice: Cornice;
  /** Which way the ice is from the face: 1 to the right, a wall up the route; -1 to the left. */
  readonly into: 1 | -1;
  /** Its ice, worked out as a relief and lit (#290). */
  readonly relief: IceRelief;
  /** How high its bare ice shows from: under the lip of snow, or under the bulge (#290). */
  readonly lip: number;
  /** The points a lamp's beam makes shine: its ice's highlights, and the scars up a step climbed
   * on the tools (#290). */
  readonly shines: readonly Point[];
  /** The bulge of ice a step climbed on the tools leans out in under its lip of snow, closed: out
   * from the lip, round, and back up its face; none on a ladder's wall (#290). */
  readonly bulge: readonly Point[];
  /** The picks' holes and the front points' marks up a step climbed on the tools, each a small
   * outline, closed; none on a ladder's wall (#290). */
  readonly scars: readonly (readonly Point[])[];
  /** The drift of snow in front of its foot, closed: up from the snow to the face, where the
   * snow banked against the foot of its ice goes on (`IceRelief`); none where its foot is a lip it
   * comes up to (#290). */
  readonly apron: readonly Point[];
  /** How high the snow is banked against its foot, in metres: the drift's top. */
  private readonly bank: number;
  /** The face's line, as the ground has it, and the line its bare ice shows back to inside the
   * glacier, ragged, each from its top down to its foot. */
  private readonly line: readonly Point[];
  private readonly inner: readonly Point[];

  /** The wall a ladder climbs from `start`, its end further back along `terrain`, to `finish`;
   * or, `tools`, a step of ice the route climbs on the tools, with no ladder. */
  constructor(terrain: Terrain, start: Point, finish: Point, seed: number, tools = false) {
    const from = terrain.nearest(start).along + IceWall.SAME_ALONG;
    const to = terrain.nearest(finish).along - IceWall.SAME_ALONG;
    const between = terrain.points.flatMap(([x, y], index) => {
      const along = terrain.alongs[index] ?? from;
      return along > from && along < to ? [{ x, y }] : [];
    });
    const up = finish.y > start.y;
    const along = [start, ...between, finish];
    // From its top down to its foot.
    const face = up ? along.reverse() : along;
    const top = face[0] ?? start;
    const foot = face.at(-1) ?? finish;
    this.into = up ? 1 : -1;
    this.line = face;
    const { into } = this;
    const random = SeededRandom.fromSeed(seed);
    const wander = new Wander(random, IceWall.FACE_EVERY);
    const { FACE, RAGGED } = IceWall;
    const deep = (y: number): number => FACE.min + ((FACE.max - FACE.min) * (wander.at(y) + 1)) / 2;
    const ragged = new Wander(random, RAGGED.every);
    this.inner = IceWall.resampled(face, IceWall.DRAWN_EVERY).map(({ x, y }) => {
      const back = deep(y) + RAGGED.most * ragged.at(y + 13);
      return { x: x + into * IceWall.solid(terrain, { x, y }, into, back), y };
    });
    this.face = [...face, ...[...this.inner].reverse()];
    const step = SeededRandom.fromSeed(seed * 31 + IceWall.STEP_SEED);
    this.bulge = tools ? this.leanOut(top, step) : [];
    const bulgeFoot = this.bulge.length > 0 ? Math.min(...this.bulge.map(({ y }) => y)) : top.y;
    // The snow stands out over the bulge, where the ice leans out under it.
    this.cornice = new Cornice(top, into === 1 ? -1 : 1, (y) => this.edge(y), random);
    this.lip = Math.min(...this.cornice.outline.map(({ y }) => y), bulgeFoot);
    this.apron = this.drift(terrain, step);
    this.bank = this.apron.length > 0 ? Math.max(...this.apron.map(({ y }) => y)) - foot.y : 0;
    const xs = [...this.face, ...this.bulge].map(({ x }) => x);
    const margin = IceRelief.PROUD + IceWall.MARGIN;
    const left = Math.min(...xs) - (into === 1 ? margin : 0);
    const right = Math.max(...xs) + (into === 1 ? 0 : margin);
    this.relief = new IceRelief(
      { left, top: top.y, width: right - left, height: top.y - foot.y },
      (y) => this.level(y),
      SeededRandom.fromSeed(seed * 31 + IceWall.ICE_SEED),
      tools,
    );
    this.scars = tools ? this.scar(this.lip, foot.y, step) : [];
    this.shines = [...this.relief.shines, ...this.scars.flatMap((scar) => scar.slice(0, 1))];
  }

  /** Where `beams` make its wet ice shine, and how brightly, from `least` to 1: each of its
   * shining points a lamp lights from the open side of its face, never from inside the ice
   * (#290). */
  lit(beams: readonly Beam[], least: number): { readonly point: Point; readonly light: number }[] {
    const facing = this.facing(beams);
    if (facing.length === 0) {
      return [];
    }
    const lit: { point: Point; light: number }[] = [];
    for (const point of this.shines) {
      const light = Math.min(1, Math.max(...facing.map((beam) => beam.lights(point))));
      if (light > least) {
        lit.push({ point, light });
      }
    }
    return lit;
  }

  /** How brightly the lamps of `beams` light its face at each of `heights`, 0 to 1 (#290): a
   * beam that falls on it there, and round any lamp before it the light it spills, which lights
   * the ice near it whichever way the lamp looks. Only the lamps on the open side of its face. */
  lamplight(beams: readonly Beam[], heights: readonly number[]): number[] {
    const { SPILL } = IceWall;
    const facing = this.facing(beams);
    return heights.map((y) => {
      const point = { x: IceWall.across(this.line, y), y };
      let most = 0;
      for (const beam of facing) {
        const away = Math.hypot(point.x - beam.from.x, point.y - beam.from.y);
        const spilt = beam.strength * SPILL.strong * Math.max(0, 1 - away / SPILL.reach);
        most = Math.max(most, spilt, beam.lights(point));
      }
      return Math.min(1, most);
    });
  }

  /** The beams whose lamps are on the open side of its face, not inside its ice. */
  private facing(beams: readonly Beam[]): Beam[] {
    const { line, into } = this;
    const top = line[0]?.y ?? 0;
    const foot = line.at(-1)?.y ?? top;
    return beams.filter(({ from }) => {
      const edge = IceWall.across(line, Math.min(Math.max(from.y, foot), top));
      return (from.x - edge) * into < 0;
    });
  }

  /** A band of brittle ice across the face between heights `low` and `high`, as far as the face
   * goes: down its bare face, across into the ice as far as the face shows, back up and out again,
   * its edges across ragged; and its cracks into the sound ice above and below. None where the
   * face doesn't reach between them. */
  brittle(low: number, high: number): BrittleBand | null {
    const { line, into } = this;
    const top = Math.min(high, line[0]?.y ?? high);
    const foot = Math.max(low, line.at(-1)?.y ?? low);
    if (!(top > foot)) {
      return null;
    }
    const outer = [
      { x: IceWall.across(line, top), y: top },
      ...line.filter(({ y }) => y < top && y > foot),
      { x: IceWall.across(line, foot), y: foot },
    ];
    const inner = outer.map(({ y }) => ({ x: IceWall.across(this.inner, y), y })).reverse();
    const [outerTop, outerFoot] = [outer[0], outer.at(-1)];
    const [innerFoot, innerTop] = [inner[0], inner.at(-1)];
    if (
      outerTop === undefined ||
      outerFoot === undefined ||
      innerFoot === undefined ||
      innerTop === undefined
    ) {
      return null;
    }
    const between = (from: Point, to: Point, share: number, lift: number): Point => ({
      x: from.x + (to.x - from.x) * share,
      y: from.y + (to.y - from.y) * share + lift,
    });
    const { BRITTLE_JAGS: jags } = IceWall;
    const outline = [
      ...outer,
      ...jags.foot.map(([share, lift]) => between(outerFoot, innerFoot, share, lift)),
      ...inner,
      ...jags.top.map(([share, lift]) => between(innerTop, outerTop, share, lift)),
    ];
    const cracks = IceWall.BRITTLE_CRACKS.map(({ across, way, run, kink }) => {
      const [from, to] = way > 0 ? [outerTop, innerTop] : [outerFoot, innerFoot];
      const start = between(from, to, across, 0);
      return [
        start,
        { x: start.x + into * kink, y: start.y + (way * run) / 2 },
        { x: start.x, y: start.y + way * run },
      ];
    });
    return { outline, cracks };
  }

  /** Where the face's edge is across at height `y`: the ground's line, or the bulge's nose where
   * the ice leans out over it. */
  private edge(y: number): number {
    const { bulge, line, into } = this;
    const footOf = bulge.length > 0 ? Math.min(...bulge.map((point) => point.y)) : Infinity;
    return y >= footOf ? IceWall.outermost(bulge, y, into) : IceWall.across(line, y);
  }

  /** Where the face is at height `y`, for its relief; null above its top and below its foot. */
  private level(y: number): ReliefLevel | null {
    const { line, into } = this;
    const top = line[0]?.y ?? 0;
    const foot = line.at(-1)?.y ?? top;
    if (y > top || y < foot) {
      return null;
    }
    const edge = this.edge(y);
    return {
      edge,
      into,
      deep: (IceWall.across(this.inner, y) - edge) * into,
      down: top - y,
      lean: (IceWall.across(line, y) - edge) * into,
      up: y - foot,
      bank: this.bank,
    };
  }

  /** The drift of snow in front of the foot, on `terrain`: from the snow in front of the face, up
   * a curve to it. None where the face comes up to its foot from below, a lip and not a foot. */
  private drift(terrain: Terrain, random: SeededRandom): Point[] {
    const { APRON, APRON_POINTS } = IceWall;
    const { line, into } = this;
    const foot = line.at(-1);
    const above = line.at(-2);
    if (foot === undefined || above === undefined || above.y <= foot.y) {
      return [];
    }
    const between = (range: { readonly min: number; readonly max: number }): number =>
      range.min + random.fraction() * (range.max - range.min);
    const out = between(APRON.out);
    const high = Math.min(between(APRON.high), above.y - foot.y);
    const top = foot.y + high;
    // The face where the drift's top meets it, on the face's last segment down to the foot.
    const edge = foot.x + ((above.x - foot.x) * high) / (above.y - foot.y);
    const start = foot.x - into * out;
    const rise = Array.from({ length: APRON_POINTS + 1 }, (_, step) => {
      const share = step / APRON_POINTS;
      const x = start + (edge - start) * share;
      const ground = share < 1 ? terrain.height(x) : foot.y;
      return { x, y: ground + (top - ground) * share ** 2.2 };
    });
    const sunk = 0.05;
    return [...rise, { x: edge, y: foot.y - sunk }, { x: start, y: terrain.height(start) - sunk }];
  }

  /** The bulge of ice under the lip of snow, out over the drop from `top`. */
  private leanOut(top: Point, random: SeededRandom): Point[] {
    const { BULGE, BULGE_SHAPE } = IceWall;
    const lean = BULGE.lean.min + random.fraction() * (BULGE.lean.max - BULGE.lean.min);
    const height = BULGE.height.min + random.fraction() * (BULGE.height.max - BULGE.height.min);
    const out = -this.into;
    const edge = (y: number): number => IceWall.across(this.line, y);
    const round = BULGE_SHAPE.map(([share, down]) => {
      const y = top.y - height * down;
      return { x: edge(y) + out * lean * share, y };
    });
    const footY = top.y - height;
    const back = this.line.filter(({ y }) => y > footY && y < top.y).reverse();
    return [{ x: top.x, y: top.y }, ...round, { x: edge(footY), y: footY }, ...back];
  }

  /** The picks' holes and the front points' marks up the face, from over its foot to under `top`,
   * beside its edge where the climbers swing. */
  private scar(top: number, foot: number, random: SeededRandom): Point[][] {
    const { SCAR_EVERY, SCAR_PICKS, PICK_HOLE, FRONT_POINTS, SCAR_CLEAR } = IceWall;
    const scars: Point[][] = [];
    const highest = top - SCAR_CLEAR.top;
    for (
      let y = foot + SCAR_CLEAR.foot + FRONT_POINTS.below;
      y < highest;
      y += SCAR_EVERY.min + random.fraction() * (SCAR_EVERY.max - SCAR_EVERY.min)
    ) {
      for (const side of [0, 1]) {
        const reach =
          SCAR_PICKS.into +
          side * SCAR_PICKS.apart +
          (random.fraction() * 2 - 1) * SCAR_PICKS.wander;
        const hole = this.offEdge(y + (random.fraction() - 0.5) * 0.06, reach);
        // A pick's hole: a small sliver, its point down where the pick went in.
        scars.push([
          { x: hole.x - PICK_HOLE.width / 2, y: hole.y + PICK_HOLE.depth / 2 },
          { x: hole.x + PICK_HOLE.width / 2, y: hole.y + PICK_HOLE.depth / 2 },
          { x: hole.x + PICK_HOLE.width * 0.1, y: hole.y - PICK_HOLE.depth / 2 },
        ]);
        const kick = this.offEdge(y - FRONT_POINTS.below, reach + (random.fraction() - 0.5) * 0.05);
        if (kick.y - FRONT_POINTS.length / 2 > foot + SCAR_CLEAR.foot) {
          for (const point of [-1, 1]) {
            const x = kick.x + (point * FRONT_POINTS.apart) / 2;
            scars.push([
              { x: x - 0.008, y: kick.y + FRONT_POINTS.length / 2 },
              { x: x + 0.008, y: kick.y + FRONT_POINTS.length / 2 },
              { x, y: kick.y - FRONT_POINTS.length / 2 },
            ]);
          }
        }
      }
    }
    return scars;
  }

  /** The point `reach` metres into the face from its edge at height `y`, no deeper than its bare
   * ice shows. */
  private offEdge(y: number, reach: number): Point {
    const edge = IceWall.across(this.line, y);
    const back = IceWall.across(this.inner, y);
    const most = Math.abs(back - edge) * IceWall.INSIDE;
    return { x: edge + this.into * Math.min(reach, most), y };
  }

  /** How far the glacier is solid behind the face at `point`, up to `most`: as far as the ground
   * stays over the point's height, short of where it drops under it. */
  private static solid(terrain: Terrain, { x, y }: Point, into: 1 | -1, most: number): number {
    const { BLOCK } = IceWall;
    for (let back = BLOCK.every; back <= most; back += BLOCK.every) {
      if (terrain.height(x + into * back) < y - BLOCK.under) {
        return Math.min(most, Math.max(BLOCK.least, back - BLOCK.clear));
      }
    }
    return most;
  }

  /** `line` with a point every `every` metres or nearer down each of its segments, its own corners
   * kept. */
  private static resampled(line: readonly Point[], every: number): Point[] {
    const points: Point[] = [];
    for (const [index, a] of line.entries()) {
      points.push(a);
      const b = line[index + 1];
      if (b === undefined) {
        break;
      }
      const pieces = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / every);
      for (let piece = 1; piece < pieces; piece += 1) {
        const share = piece / pieces;
        points.push({ x: a.x + (b.x - a.x) * share, y: a.y + (b.y - a.y) * share });
      }
    }
    return points;
  }

  /** Where the face is across at height `y`, on its segment through it. */
  private static across(face: readonly Point[], y: number): number {
    for (const [index, a] of face.entries()) {
      const b = face[index + 1];
      if (b !== undefined && y <= a.y && y >= b.y) {
        return a.y === b.y ? a.x : a.x + ((b.x - a.x) * (a.y - y)) / (a.y - b.y);
      }
    }
    return face.at(-1)?.x ?? 0;
  }

  /** How far out over the drop a closed `outline` reaches at height `y`: its furthest point that
   * way on the level, `into` saying which way the ice is. */
  private static outermost(outline: readonly Point[], y: number, into: 1 | -1): number {
    let most: number | null = null;
    for (const [index, a] of outline.entries()) {
      const b = outline[(index + 1) % outline.length] ?? a;
      if ((a.y - y) * (b.y - y) <= 0 && a.y !== b.y) {
        const x = a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y);
        most = most === null || (into === 1 ? x < most : x > most) ? x : most;
      }
    }
    return most ?? IceWall.across(outline, y);
  }
}
