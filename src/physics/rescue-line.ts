import type { ClimberId } from "../simulation";
import type { Point, Terrain, Way } from "./terrain";

/** A rescue line as saves keep it: where along the ground its anchor and its foot are, how far
 * its anchor has been built, 0 to 1, and who built it. */
export type RescueLineSave = {
  readonly id: string;
  readonly top: number;
  readonly foot: number;
  readonly built: number;
  readonly by: ClimberId;
};

/** A rescue line as the picture and the agents see it: its anchor, its foot, the ground's line it
 * hangs down between them, and how far its anchor has been built. */
export interface RescueLineView {
  readonly id: string;
  readonly top: number;
  readonly foot: number;
  readonly shape: readonly Point[];
  readonly built: number;
}

/**
 * A rescue line (#241): the rope a rescuer anchors at the edge over a climber who lies where the
 * route doesn't reach, a crevasse's floor or a ledge down its wall, from their rescue kit: two
 * ice screws equalised at the lip and a rope down the ice to the climber. It hangs down the
 * ground's own line, from its anchor (`top`) to where the climber lay when it was thrown (`foot`).
 * Once built, a climber goes down it and back up it, held by it all the way, and a casualty
 * clipped to it is hauled up it. It's no fixed rope of the route: the ground at its foot stays
 * the dead end it was.
 */
export class RescueLine {
  constructor(
    readonly id: string,
    /** Where along the ground its anchor is, at the lip, and where its foot is, below. */
    readonly top: number,
    readonly foot: number,
    readonly by: ClimberId,
    private built = 0,
  ) {}

  static load(save: RescueLineSave): RescueLine {
    return new RescueLine(save.id, save.top, save.foot, save.by, save.built);
  }

  save(): RescueLineSave {
    return { id: this.id, top: this.top, foot: this.foot, built: this.built, by: this.by };
  }

  /** Whether its anchor is in and its rope is down: it holds a climber. */
  get ready(): boolean {
    return this.built >= 1;
  }

  /** How far its anchor has been built, 0 to 1. */
  get progress(): number {
    return Math.min(1, this.built);
  }

  /** `share` more of the anchor's work done. Whether that finished it. */
  build(share: number): boolean {
    if (this.ready) {
      return false;
    }
    const built = this.built + share;
    this.built = built >= 1 - 1e-9 ? 1 : built;
    return this.ready;
  }

  /** The way along the ground from its anchor down to its foot. */
  get down(): Way {
    return this.foot >= this.top ? 1 : -1;
  }

  /** Whether a point of the ground `along` it is on its line, its ends included. */
  holds(along: number): boolean {
    return along >= Math.min(this.top, this.foot) && along <= Math.max(this.top, this.foot);
  }

  /** The ground's line it hangs down, from its anchor to its foot, corner by corner. */
  shape(terrain: Terrain): readonly Point[] {
    const points: Point[] = [terrain.point(this.top)];
    let at = this.top;
    for (;;) {
      const corner = terrain.cornerAhead(at, this.down);
      const past = this.down > 0 ? corner >= this.foot : corner <= this.foot;
      if (past || corner === at) {
        break;
      }
      points.push(terrain.point(corner));
      at = corner;
    }
    points.push(terrain.point(this.foot));
    return points;
  }

  view(terrain: Terrain): RescueLineView {
    const { id, top, foot } = this;
    return { id, top, foot, shape: this.shape(terrain), built: this.progress };
  }
}
