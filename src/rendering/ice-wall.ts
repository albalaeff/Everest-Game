import type { Point, Terrain } from "../physics";
import { SeededRandom } from "../simulation";
import { Cornice } from "./cornice";
import { Wander } from "./wander";

/** A band of brittle ice across a face, as the picture draws it: its outline, closed, and the
 * cracks that run from it into the sound ice, each a line. */
export interface BrittleBand {
  readonly outline: readonly Point[];
  readonly cracks: readonly (readonly Point[])[];
}

/**
 * A wall of ice a ladder climbs, or a step of it the route climbs on the tools, up the route or
 * down it, as the picture draws it (#184): its face of bare blue ice, a band of it from the face
 * back into the glacier, streaked down where meltwater ran, and on its top a lip of snow standing
 * out over the drop with icicles under it, as the photos of the Icefall's walls show. Laid out
 * once by a seeded generator of the picture's own; its sizes are the drawing's numbers.
 */
export class IceWall {
  /** How far back into the ice its bare face shows, from the least to the most, and how long its
   * waves are. */
  static readonly FACE = { min: 0.45, max: 1 };
  private static readonly FACE_EVERY = 2.2;
  /** A streak every so many metres across the face, at this chance, down so much of its height. */
  static readonly STREAK_EVERY = 0.12;
  static readonly STREAK_CHANCE = 0.55;
  static readonly STREAK_DOWN = { min: 0.3, max: 0.95 };
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

  /** The bare ice, closed: down the face from its top to its foot, and back up inside the ice. */
  readonly face: readonly Point[];
  /** Its streaks, each a line down the face from its top. */
  readonly streaks: readonly (readonly Point[])[];
  /** The snow on its top. */
  readonly cornice: Cornice;
  /** Which way the ice is from the face: 1 to the right, a wall up the route; -1 to the left. */
  readonly into: 1 | -1;
  /** The face's line, and the line its bare ice shows back to inside the glacier, each from its
   * top down to its foot. */
  private readonly line: readonly Point[];
  private readonly inner: readonly Point[];

  /** The wall a ladder climbs from `start`, its end further back along `terrain`, to `finish`. */
  constructor(terrain: Terrain, start: Point, finish: Point, seed: number) {
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
    const { FACE } = IceWall;
    const deep = (y: number): number => FACE.min + ((FACE.max - FACE.min) * (wander.at(y) + 1)) / 2;
    const inside = face.map(({ x, y }) => ({ x: x + into * deep(y), y }));
    this.inner = inside;
    this.face = [...face, ...[...inside].reverse()];
    const height = top.y - foot.y;
    const streaks: Point[][] = [];
    for (let across = IceWall.STREAK_EVERY / 2; across < FACE.min; across += IceWall.STREAK_EVERY) {
      if (!random.chance(IceWall.STREAK_CHANCE)) {
        continue;
      }
      const down =
        IceWall.STREAK_DOWN.min +
        random.fraction() * (IceWall.STREAK_DOWN.max - IceWall.STREAK_DOWN.min);
      const end = top.y - height * down;
      const line = face
        .filter(({ y }) => y < top.y && y > end)
        .map(({ x, y }) => ({ x: x + into * across, y }));
      streaks.push([
        { x: top.x + into * across, y: top.y },
        ...line,
        { x: IceWall.across(face, end) + into * across, y: end },
      ]);
    }
    this.streaks = streaks;
    this.cornice = new Cornice(top, into === 1 ? -1 : 1, (y) => IceWall.across(face, y), random);
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
}
