import type { BetweenSteps } from "../rendering";

/** What the loop runs each frame: the expedition as this browser plays it, alone and paced by its
 * own clock (`SoloGame`), or in a room, by the server's steps (`RoomClient`). */
export interface Played {
  /** `seconds` more have gone by since the last frame: the steps it takes, how many. */
  advance(seconds: number): number;
  /** How far the next step has come since the last, from 0 up to 1. */
  readonly progress: number;
}

/** What the loop draws after the steps: the scene, between the last two of them. */
export interface Picture {
  draw(seconds: number, between: BetweenSteps): void;
}

/**
 * The page's loop: each frame the game takes the steps it's owed, and then the picture is drawn,
 * told how many the frame took and how far the next has come, so it draws what moves between the
 * last two (docs/guidelines/graphics.md → Motion). The mountain never waits
 * (docs/conventions/simulation-core.md): what paces the steps is the game's, the browser's clock
 * alone or the room's, and the loop only orders them before the frame.
 */
export class GameLoop {
  /** Where the frame falls among the steps, filled again each frame. */
  private readonly between = { taken: 0, progress: 0 };

  constructor(
    private readonly played: Played,
    private readonly picture: Picture,
  ) {}

  /** A frame, `seconds` after the last. */
  frame(seconds: number): void {
    const { between } = this;
    between.taken = this.played.advance(seconds);
    between.progress = this.played.progress;
    this.picture.draw(seconds, between);
  }
}
