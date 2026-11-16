/** How wide each picture of a figure is drawn this frame, as a share of its width: the side-on one,
 * to the right above 0 and to the left below it, and the one from the front. One of the two is
 * nought: only one picture shows at a time. */
export interface Turned {
  readonly side: number;
  readonly front: number;
}

/**
 * How far round a figure has turned (#235), as the picture draws it. A climber seen side-on turns
 * to face the viewer through a quarter turn: the side-on picture narrows as a card turned away
 * does, and from halfway the picture from the front opens in its place, to its whole width. Out
 * of that turn they come side-on the way they then face, with no flip through their edge. A
 * figure that turns round with no stop at the viewer, as one the game steers does, narrows to
 * its edge and opens the other way. It keeps only the picture's own: how far round it is.
 */
export class FacingTurn {
  /** How long the quarter turn to the viewer takes, and a turn round edge-on, in seconds. */
  static readonly TO_VIEWER_SECONDS = 0.22;
  static readonly ROUND_SECONDS = 0.16;

  /** How far round side-on: 1 facing right, -1 left. */
  private side = 1;
  /** How far towards the viewer: 0 side-on, 1 facing them. */
  private front = 0;

  /** The figure `seconds` on, its climber facing `facing` along the slope and `towardViewer` or
   * not. */
  advance(seconds: number, facing: 1 | -1, towardViewer: boolean): Turned {
    const frame = Math.max(seconds, 0);
    const turning = frame / FacingTurn.TO_VIEWER_SECONDS;
    this.front = towardViewer
      ? Math.min(this.front + turning, 1)
      : Math.max(this.front - turning, 0);
    if (this.front >= 0.5) {
      // Through the viewer: past halfway the side-on picture is out of sight, and comes back
      // the way they face now.
      this.side = facing;
    } else if (this.front <= 0) {
      const round = (2 * frame) / FacingTurn.ROUND_SECONDS;
      this.side =
        facing > this.side
          ? Math.min(this.side + round, facing)
          : Math.max(this.side - round, facing);
    }
    return this.turned;
  }

  /** How wide each picture is drawn now. */
  get turned(): Turned {
    const quarter = (this.front * Math.PI) / 2;
    if (this.front >= 0.5) {
      return { side: 0, front: Math.sin(quarter) };
    }
    // Turning round edge-on, the figure narrows to its edge and opens the other way.
    const across = Math.sin((this.side * Math.PI) / 2);
    return { side: across * Math.cos(quarter), front: 0 };
  }

  /** Which way the side-on picture faces, or last did: 1 right, -1 left. */
  get facing(): 1 | -1 {
    return this.side >= 0 ? 1 : -1;
  }
}
