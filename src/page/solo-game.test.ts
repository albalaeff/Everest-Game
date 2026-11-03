import { describe, expect, it } from "vitest";

import { SlopePhysics } from "../physics";
import { TestMountain } from "../physics/testing/test-mountain";
import type { ExpeditionStore } from "../saves";
import { Expedition } from "../simulation";
import type { ExpeditionSave } from "../simulation";
import { ActionQueue } from "./action-queue";
import { SoloGame } from "./solo-game";

const FRAME = 1 / 60;

/** The device's storage as a test sees it: each save as it came. */
class MemoryStore implements ExpeditionStore {
  readonly stored: ExpeditionSave[] = [];

  load(): Promise<ExpeditionSave | null> {
    return Promise.resolve(this.stored.at(-1) ?? null);
  }

  store(save: ExpeditionSave): Promise<void> {
    this.stored.push(save);
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.stored.length = 0;
    return Promise.resolve();
  }
}

function aGame(): {
  game: SoloGame;
  expedition: Expedition;
  physics: SlopePhysics;
  queue: ActionQueue;
  store: MemoryStore;
} {
  const physics = new SlopePhysics(TestMountain.CALM);
  const layout = TestMountain.FLAT.layout([{ id: "anna", along: 10 }]);
  const expedition = Expedition.start(TestMountain.scenario(1, layout), [physics]);
  const queue = new ActionQueue();
  const store = new MemoryStore();
  return { game: new SoloGame(expedition, queue, store), expedition, physics, queue, store };
}

describe("SoloGame", () => {
  it("turns a second of frames into twenty steps", () => {
    const { game, expedition } = aGame();

    for (let frame = 0; frame < 60; frame += 1) {
      game.advance(FRAME);
    }

    expect(expedition.step).toBe(20);
  });

  it("sends what the player did with the next step: the climber walks", () => {
    const { game, physics, queue } = aGame();

    queue.send({ kind: "walk", climber: "anna", direction: "right" });
    for (let frame = 0; frame < 60; frame += 1) {
      game.advance(FRAME);
    }

    expect(physics.climber("anna").x).toBeCloseTo(11, 6);
    expect(queue.take()).toEqual([]);
  });

  it("takes at most a hundred steps in one frame, so a phone back from a call doesn't freeze", () => {
    const { game, expedition } = aGame();

    game.advance(60);

    expect(expedition.step).toBe(SoloGame.MAX_STEPS_A_FRAME);
  });

  it("saves the expedition every ten seconds of play, as it stands then", () => {
    const { game, store, queue } = aGame();

    queue.send({ kind: "walk", climber: "anna", direction: "right" });
    for (let second = 0; second < 25; second += 1) {
      game.advance(1);
    }

    expect(store.stored.map((save) => save.step)).toEqual([200, 400]);
    expect(store.stored[0]?.actions).toEqual([
      { step: 0, actions: [{ kind: "walk", climber: "anna", direction: "right" }] },
    ]);
  });

  it("saves at once when asked, and counts the ten seconds from there", () => {
    const { game, store } = aGame();

    for (let second = 0; second < 7; second += 1) {
      game.advance(1);
    }
    game.save();
    for (let second = 0; second < 9; second += 1) {
      game.advance(1);
    }

    expect(store.stored.map((save) => save.step)).toEqual([140]);
  });
});
