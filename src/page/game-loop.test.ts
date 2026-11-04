import { describe, expect, it } from "vitest";

import { GameLoop } from "./game-loop";
import type { Picture, Played } from "./game-loop";

const FRAME = 1 / 60;

/** Notes what it was asked, in order, with the scene. */
class FakeGame implements Played {
  constructor(private readonly order: string[]) {}

  advance(seconds: number): void {
    this.order.push(`steps ${seconds}`);
  }
}

class FakePicture implements Picture {
  constructor(private readonly order: string[]) {}

  draw(seconds: number): void {
    this.order.push(`drawn ${seconds}`);
  }
}

describe("GameLoop", () => {
  it("each frame, the game takes its steps, and then the picture is drawn", () => {
    const order: string[] = [];
    const loop = new GameLoop(new FakeGame(order), new FakePicture(order));

    loop.frame(FRAME);
    loop.frame(2 * FRAME);

    expect(order).toEqual([
      `steps ${FRAME}`,
      `drawn ${FRAME}`,
      `steps ${2 * FRAME}`,
      `drawn ${2 * FRAME}`,
    ]);
  });
});
