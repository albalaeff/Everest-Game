import type { Point } from "../physics";
import type { Camera } from "./camera";

/**
 * The climbers on the screen at once, and whether they're a crowd (#87): four or more, the
 * player's among them, as in the queues on the ridge (#40). In a crowd the player's own climber
 * is marked (`PlayerMark`), since the brighter suit alone no longer finds it in a second
 * (docs/guidelines/graphics.md → Readable first); with fewer the suit at the camera's anchor
 * does, and a mark would only clutter the picture. A frozen value for one frame.
 */
export class Crowd {
  /** How many climbers on the screen at once make a crowd. */
  static readonly LEAST = 4;

  /** How many of the climbers are on the screen. */
  readonly onScreen: number;

  /** The climbers drawn `at` these points, on the screen the camera shows. */
  constructor(camera: Camera, at: readonly Point[]) {
    this.onScreen = at.filter((point) => camera.shows(point)).length;
  }

  /** Whether they're a crowd, and the player's climber is marked. */
  get marked(): boolean {
    return this.onScreen >= Crowd.LEAST;
  }
}
