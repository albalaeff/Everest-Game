import { describe, expect, it } from "vitest";

import type { BetweenSteps } from "../rendering";
import { GameLoop } from "./game-loop";
import type { Picture, Played } from "./game-loop";

const FRAME = 1 / 60;

/** Notes what it was asked, in order, with the scene: a step every third frame, as twenty steps a
 * second are at sixty frames. */
class FakeGame implements Played {
  progress = 0;
  private frames = 0;

  constructor(private readonly order: string[]) {}

  advance(seconds: number): number {
    this.order.push(`steps ${seconds}`);
    this.frames += 1;
    this.progress = (this.frames % 3) / 3;
    return this.frames % 3 === 0 ? 1 : 0;
  }
}

class FakePicture implements Picture {
  readonly between: BetweenSteps[] = [];

  constructor(private readonly order: string[]) {}

  draw(seconds: number, between: BetweenSteps): void {
    this.order.push(`drawn ${seconds}`);
    this.between.push({ ...between });
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

  it("tells the picture how many steps the frame took, and how far the next one has come", () => {
    const order: string[] = [];
    const picture = new FakePicture(order);
    const loop = new GameLoop(new FakeGame(order), picture);

    for (let frame = 0; frame < 4; frame += 1) {
      loop.frame(FRAME);
    }

    expect(picture.between.map(({ taken }) => taken)).toEqual([0, 0, 1, 0]);
    expect(picture.between.map(({ progress }) => progress)).toEqual([1 / 3, 2 / 3, 0, 1 / 3]);
  });
});
