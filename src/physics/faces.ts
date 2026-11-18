import { Steepness } from "./steepness";
import type { Terrain, Way } from "./terrain";
import type { Walking } from "./walking";

/** A corner of a face: how far along the ground it is, and how high. */
interface FaceCorner {
  readonly along: number;
  readonly y: number;
}

/**
 * A face of ice: a stretch of the ground too steep to walk, a wall or a crevasse's side, all of
 * it rising the same way along the ground, or all of it falling. Nobody walks it: a ladder stands
 * on it, or a climber goes up and down it on their ice tools and front points (`OnIce`). Its foot
 * is its lower end and its top the higher, wherever along the ground they are.
 */
export class Face {
  constructor(private readonly corners: readonly FaceCorner[]) {
    if (corners.length < 2) {
      throw new RangeError("A face needs two corners at least");
    }
  }

  /** Where along the ground it starts and ends. */
  get from(): number {
    return this.first.along;
  }

  get to(): number {
    return this.last.along;
  }

  /** The way along the ground that climbs it: 1 where it rises with the ground, −1 where it
   * drops. */
  get up(): Way {
    return this.last.y > this.first.y ? 1 : -1;
  }

  /** Its lower end and its higher, along the ground. */
  get foot(): number {
    return this.up > 0 ? this.from : this.to;
  }

  get top(): number {
    return this.up > 0 ? this.to : this.from;
  }

  /** How high its foot and its top are. */
  get footHeight(): number {
    return Math.min(this.first.y, this.last.y);
  }

  get topHeight(): number {
    return Math.max(this.first.y, this.last.y);
  }

  /** Whether a point of the ground `along` it is on it, its ends included. */
  holds(along: number): boolean {
    return along >= this.from && along <= this.to;
  }

  /** Where along the ground it's `height` high: its foot below it, its top above. */
  alongAt(height: number): number {
    if (height <= this.footHeight) {
      return this.foot;
    }
    if (height >= this.topHeight) {
      return this.top;
    }
    for (const [index, corner] of this.corners.entries()) {
      const next = this.corners[index + 1];
      if (next === undefined) {
        break;
      }
      const [low, high] = corner.y <= next.y ? [corner, next] : [next, corner];
      if (height >= low.y && height <= high.y && high.y > low.y) {
        const share = (height - low.y) / (high.y - low.y);
        return low.along + (high.along - low.along) * share;
      }
    }
    return this.top;
  }

  private get first(): FaceCorner {
    return this.corners[0] as FaceCorner;
  }

  private get last(): FaceCorner {
    return this.corners.at(-1) as FaceCorner;
  }
}

/** A stretch of the ground a climber walks from end to end, between the faces that stop them. */
interface Run {
  readonly from: number;
  readonly to: number;
}

/**
 * The ground as a climber can and can't walk it: its faces, each too steep to walk, and the runs
 * of walkable ground between them. A run the route doesn't reach, a ledge down a crevasse's wall
 * or the snow plugging its foot, is a dead end: nobody walks out of it, so a climber held by
 * their rope there still hangs on it, and one without a rope climbs out on their tools or waits
 * for a partner.
 */
export class Faces {
  /** How near a mark of the route is to a run's end to be on it: the engine's number. */
  private static readonly NEAR = 1e-6;

  private readonly faces: readonly Face[];
  private readonly runs: readonly Run[];
  /** The runs the route reaches: those a ladder's end, a rope's anchor or the section's ends are
   * on. */
  private readonly open: ReadonlySet<Run>;

  /** The faces and runs of `terrain` as `walking` takes it, the route's `marks` (its ladders'
   * ends and its ropes' anchors, along the ground) saying which runs it reaches. */
  constructor(terrain: Terrain, walking: Walking, marks: readonly number[]) {
    const faces: Face[] = [];
    const runs: Run[] = [];
    let corners: FaceCorner[] = [];
    let run: { from: number; to: number } | null = null;
    const closeFace = (): void => {
      if (corners.length >= 2) {
        faces.push(new Face(corners));
      }
      corners = [];
    };
    const closeRun = (): void => {
      if (run !== null) {
        runs.push(run);
      }
      run = null;
    };
    const { points, alongs } = terrain;
    for (let index = 1; index < points.length; index += 1) {
      const [fromX, fromY] = points[index - 1] as readonly [number, number];
      const [toX, toY] = points[index] as readonly [number, number];
      const from = alongs[index - 1] as number;
      const to = alongs[index] as number;
      const length = Math.sqrt((toX - fromX) * (toX - fromX) + (toY - fromY) * (toY - fromY));
      const steepness = Steepness.ofWay((toX - fromX) / length, (toY - fromY) / length);
      if (walking.steeperUp(steepness) || walking.steeperDown(steepness)) {
        closeRun();
        const before = corners.at(-2);
        const last = corners.at(-1);
        const turns =
          before !== undefined && last !== undefined && last.y > before.y !== toY > fromY;
        if (turns) {
          closeFace();
        }
        if (corners.length === 0) {
          corners.push({ along: from, y: fromY });
        }
        corners.push({ along: to, y: toY });
      } else {
        closeFace();
        run = run === null ? { from, to } : { from: run.from, to };
      }
    }
    closeFace();
    closeRun();
    this.faces = faces;
    this.runs = runs;
    const ends = [0, terrain.length, ...marks];
    this.open = new Set(
      runs.filter(({ from, to }) =>
        ends.some((mark) => mark >= from - Faces.NEAR && mark <= to + Faces.NEAR),
      ),
    );
  }

  /** Every face, in order along the ground. */
  get all(): readonly Face[] {
    return this.faces;
  }

  /** The face a point of the ground `along` it is on, or none: at a corner two faces share, the
   * one further along. */
  at(along: number): Face | null {
    let found: Face | null = null;
    for (const face of this.faces) {
      if (face.holds(along)) {
        found = face;
      }
    }
    return found;
  }

  /** The face whose foot is within `reach` metres along the ground of `along`, or none: the one
   * a climber standing there starts up. */
  above(along: number, reach: number): Face | null {
    return this.nearest(along, reach, (face) => face.foot);
  }

  /** The face whose top is within `reach` metres along the ground of `along`, or none: the one a
   * climber standing at its lip starts down, and the one a pick planted over the lip is on. */
  below(along: number, reach: number): Face | null {
    return this.nearest(along, reach, (face) => face.top);
  }

  /** Whether the ground at `along` is a dead end: walkable, but on a run the route doesn't
   * reach, with no ladder, no rope and no way to walk out. */
  deadEnd(along: number): boolean {
    const run = this.runs.find(({ from, to }) => along >= from && along <= to);
    return run !== undefined && !this.open.has(run);
  }

  /** Where the route's ground begins again `way` along the ground from a dead end at `along`
   * (#241): the nearer end of the first run the route reaches that way, the lip a rescuer stands
   * at over a climber who lies in the dead end. None from ground that's no dead end, or where the
   * ground ends first. */
  wayOut(along: number, way: Way): number | null {
    const index = this.runs.findIndex(({ from, to }) => along >= from && along <= to);
    const run = this.runs[index];
    if (run === undefined || this.open.has(run)) {
      return null;
    }
    for (let next = index + way; next >= 0 && next < this.runs.length; next += way) {
      const other = this.runs[next];
      if (other !== undefined && this.open.has(other)) {
        return way > 0 ? other.from : other.to;
      }
    }
    return null;
  }

  private nearest(along: number, reach: number, end: (face: Face) => number): Face | null {
    let found: Face | null = null;
    let away = reach;
    for (const face of this.faces) {
      const distance = Math.abs(end(face) - along);
      if (distance <= away) {
        found = face;
        away = distance;
      }
    }
    return found;
  }
}
