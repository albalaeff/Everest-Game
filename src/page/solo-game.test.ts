import { describe, expect, it } from "vitest";

import { SlopePhysics } from "../physics";
import { TestMountain } from "../physics/testing/test-mountain";
import type { ExpeditionStore } from "../saves";
import { Expedition, LetGo } from "../simulation";
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
  return {
    game: new SoloGame(expedition, queue, store, "anna"),
    expedition,
    physics,
    queue,
    store,
  };
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

  it("keeps real time on a device that draws few frames: four a second take twenty steps a second", () => {
    const { game, expedition } = aGame();

    for (let frame = 0; frame < 40; frame += 1) {
      game.advance(0.25);
    }

    expect(expedition.step).toBe(200);
  });

  it("counts a frame for a second at most: a tab back from the background goes on where it paused", () => {
    const { game, expedition } = aGame();

    game.advance(60);

    expect(expedition.step).toBe(20);
  });

  it("saves the expedition every ten seconds of play, as it stands then", () => {
    const { game, store, queue } = aGame();

    queue.send({ kind: "walk", climber: "anna", direction: "right" });
    for (let second = 0; second < 25; second += 1) {
      game.advance(1);
    }

    expect(store.stored.map((save) => save.step)).toEqual([200, 400]);
    expect(store.stored[0]?.actions).toEqual([
      {
        step: 0,
        actions: [
          ...new LetGo("anna").actions(),
          { kind: "walk", climber: "anna", direction: "right" },
        ],
      },
    ]);
  });

  it("goes on with the climber holding nothing: a climb saved mid-stride doesn't walk on alone", () => {
    const { game, expedition, queue } = aGame();
    queue.send({ kind: "walk", climber: "anna", direction: "right" });
    game.advance(1);
    const physics = new SlopePhysics(TestMountain.CALM);
    const resumed = SoloGame.resumeOrStart(expedition.save(), [physics], () => {
      throw new Error("No new climb was asked for");
    });

    new SoloGame(resumed, new ActionQueue(), new MemoryStore(), "anna").advance(1);

    expect(physics.climber("anna").walking).toBe("stop");
    expect(physics.climber("anna").x).toBeCloseTo(11, 6);
  });

  it("goes on with the climb saved on the device: the climber is where they were", () => {
    const { game, expedition, queue } = aGame();
    queue.send({ kind: "walk", climber: "anna", direction: "right" });
    game.advance(1);
    const physics = new SlopePhysics(TestMountain.CALM);

    const resumed = SoloGame.resumeOrStart(expedition.save(), [physics], () => {
      throw new Error("No new climb was asked for");
    });

    expect(resumed.step).toBe(20);
    expect(physics.climber("anna").x).toBeCloseTo(11, 6);
  });

  it("starts a new climb when the device has none", () => {
    const physics = new SlopePhysics(TestMountain.CALM);
    const layout = TestMountain.FLAT.layout([{ id: "anna", along: 10 }]);

    const started = SoloGame.resumeOrStart(null, [physics], () => TestMountain.scenario(7, layout));

    expect(started.step).toBe(0);
    expect(started.scenario.seed).toBe(7);
    expect(physics.climber("anna").x).toBe(10);
  });

  it("starts a new climb over a save this build can't go on with, as one from before a rule changed", () => {
    const { expedition } = aGame();
    const physics = new SlopePhysics(TestMountain.CALM);
    const layout = TestMountain.FLAT.layout([{ id: "anna", along: 10 }]);

    const started = SoloGame.resumeOrStart({ ...expedition.save(), rules: {} }, [physics], () =>
      TestMountain.scenario(7, layout),
    );

    expect(started.step).toBe(0);
    expect(started.scenario.seed).toBe(7);
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
