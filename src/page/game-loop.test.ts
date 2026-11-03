import { describe, expect, it } from "vitest";

import { SlopePhysics } from "../physics";
import { TestMountain } from "../physics/testing/test-mountain";
import { Expedition } from "../simulation";
import { ActionQueue } from "./action-queue";
import { GameLoop } from "./game-loop";
import type { Picture } from "./game-loop";

const FRAME = 1 / 60;

/** The scene, as far as the loop cares: it notes each frame's seconds. */
class FakePicture implements Picture {
  readonly drawn: number[] = [];

  draw(seconds: number): void {
    this.drawn.push(seconds);
  }
}

function aLoop(): {
  loop: GameLoop;
  expedition: Expedition;
  physics: SlopePhysics;
  queue: ActionQueue;
  picture: FakePicture;
} {
  const physics = new SlopePhysics(TestMountain.CALM);
  const layout = TestMountain.FLAT.layout([{ id: "anna", along: 10 }]);
  const expedition = Expedition.start(TestMountain.scenario(1, layout), [physics]);
  const queue = new ActionQueue();
  const picture = new FakePicture();
  return { loop: new GameLoop(expedition, queue, picture), expedition, physics, queue, picture };
}

describe("GameLoop", () => {
  it("turns a second of frames into twenty steps, and draws every frame", () => {
    const { loop, expedition, picture } = aLoop();

    for (let frame = 0; frame < 60; frame += 1) {
      loop.frame(FRAME);
    }

    expect(expedition.step).toBe(20);
    expect(picture.drawn).toHaveLength(60);
    expect(picture.drawn[0]).toBe(FRAME);
  });

  it("sends what the player did with the next step: the climber walks", () => {
    const { loop, physics, queue } = aLoop();

    queue.send({ kind: "walk", climber: "anna", direction: "right" });
    for (let frame = 0; frame < 60; frame += 1) {
      loop.frame(FRAME);
    }

    expect(physics.climber("anna").x).toBeCloseTo(11, 6);
    expect(queue.take()).toEqual([]);
  });

  it("takes at most a hundred steps in one frame, so a phone back from a call doesn't freeze", () => {
    const { loop, expedition } = aLoop();

    loop.frame(60);

    expect(expedition.step).toBe(GameLoop.MAX_STEPS_A_FRAME);
  });
});
