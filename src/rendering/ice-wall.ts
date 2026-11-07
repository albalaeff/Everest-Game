import type { Point, Terrain } from "../physics";
import { SeededRandom } from "../simulation";
import { Cornice } from "./cornice";
import { Wander } from "./wander";

/**
 * A wall of ice a ladder climbs, up the route or down it, as the picture draws it (#184): its
 * face of bare blue ice, a band of it from the face back into the glacier, streaked down where
 * meltwater ran, and on its top a lip of snow standing out over the drop with icicles under it, as
 * the photos of the Icefall's walls show. Laid out once by a seeded generator of the picture's own;
 * its sizes are the drawing's numbers.
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

  /** The bare ice, closed: down the face from its top to its foot, and back up inside the ice. */
  readonly face: readonly Point[];
  /** Its streaks, each a line down the face from its top. */
  readonly streaks: readonly (readonly Point[])[];
  /** The snow on its top. */
  readonly cornice: Cornice;
  /** Which way the ice is from the face: 1 to the right, a wall up the route; -1 to the left. */
  readonly into: 1 | -1;

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
    const { into } = this;
    const random = SeededRandom.fromSeed(seed);
    const wander = new Wander(random, IceWall.FACE_EVERY);
    const { FACE } = IceWall;
    const deep = (y: number): number => FACE.min + ((FACE.max - FACE.min) * (wander.at(y) + 1)) / 2;
    const inside = face.map(({ x, y }) => ({ x: x + into * deep(y), y }));
    this.face = [...face, ...inside.reverse()];
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
