import { describe, expect, it } from "vitest";

import { HeardActions } from "../input/testing/fakes";
import { ActionQueue, EverySink } from "./action-queue";

describe("ActionQueue", () => {
  it("keeps the player's actions for the next step, then starts afresh", () => {
    const queue = new ActionQueue();

    queue.send({ kind: "pace", climber: "anna", pace: "faster" });
    queue.send({ kind: "walk", climber: "anna", direction: "right" });
    const taken = queue.take();
    queue.send({ kind: "walk", climber: "anna", direction: "stop" });

    expect(taken).toEqual([
      { kind: "pace", climber: "anna", pace: "faster" },
      { kind: "walk", climber: "anna", direction: "right" },
    ]);
    expect(queue.take()).toEqual([{ kind: "walk", climber: "anna", direction: "stop" }]);
    expect(queue.take()).toEqual([]);
  });

  it("doesn't queue a panel request: that's the page's, not the game's", () => {
    const queue = new ActionQueue();

    queue.send({ kind: "panel", panel: "radio" });

    expect(queue.take()).toEqual([]);
  });
});

describe("EverySink", () => {
  it("tells every listener what the player did", () => {
    const game = new HeardActions();
    const list = new HeardActions();

    new EverySink([game, list]).send({ kind: "check-self", climber: "anna" });

    expect(game.actions).toEqual([{ kind: "check-self", climber: "anna" }]);
    expect(list.actions).toEqual([{ kind: "check-self", climber: "anna" }]);
  });
});
