/** What the loop runs each frame: the expedition as this browser plays it, alone and paced by its
 * own clock (`SoloGame`), or in a room, by the server's steps (`RoomClient`). */
export interface Played {
  /** `seconds` more have gone by since the last frame. */
  advance(seconds: number): void;
}

/** What the loop draws after the steps: the scene. */
export interface Picture {
  draw(seconds: number): void;
}

/**
 * The page's loop: each frame the game takes the steps it's owed, and then the picture is drawn.
 * The mountain never waits (docs/conventions/simulation-core.md): what paces the steps is the
 * game's, the browser's clock alone or the room's, and the loop only orders them before the frame.
 */
export class GameLoop {
  constructor(
    private readonly played: Played,
    private readonly picture: Picture,
  ) {}

  /** A frame, `seconds` after the last. */
  frame(seconds: number): void {
    this.played.advance(seconds);
    this.picture.draw(seconds);
  }
}
