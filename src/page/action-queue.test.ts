import { describe, expect, it } from "vitest";

import { HeardActions } from "../input/testing/fakes";
import { Camera } from "../rendering/camera";
import { Zoom, ZoomChoice } from "../rendering/zoom";
import { ZoomControl } from "../rendering/zoom-control";
import { ActionQueue, EverySink, ZoomSink } from "./action-queue";

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

  it("doesn't queue a panel or a view: they're the page's, not the game's", () => {
    const queue = new ActionQueue();

    queue.send({ kind: "panel", panel: "radio" });
    queue.send({ kind: "view", change: "farther" });

    expect(queue.take()).toEqual([]);
  });
});

describe("ZoomSink", () => {
  it("hands the player's view to the zoom, and nothing else", () => {
    const choice = new ZoomChoice(null);
    const camera = new Camera(
      { climber: { x: 10, y: 2, first: null, second: null } },
      640,
      360,
      choice.chosen,
    );
    const readout = { textContent: "" as string | null };
    const sink = new ZoomSink(new ZoomControl(choice, camera, readout, "m"));

    sink.send({ kind: "view", change: "farther" });
    sink.send({ kind: "oxygen", climber: "anna", change: "up" });
    sink.send({ kind: "panel", panel: "radio" });

    expect(camera.zoom).toBe(Zoom.FAR);
    expect(readout.textContent).toBe("50 m");
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
