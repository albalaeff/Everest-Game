import { describe, expect, it } from "vitest";

import { KnowledgeBase } from "../content/knowledge-base";
import { Mountain } from "../content/mountain";
import { KNOWLEDGE_FILES } from "../content/knowledge-files";
import type { ExpeditionRules } from "../content/mountain";
import { CloseCode } from "./messages";
import { Room } from "./room";
import type { Socket } from "./room";
import { FakeSocket } from "./testing/fakes";

const VERSION = "f06f24b";
const mountain = new Mountain(new KnowledgeBase(KNOWLEDGE_FILES));

function aRoom(): { room: Room; rules: ExpeditionRules } {
  const rules = mountain.rules();
  return { room: Room.create("K7PX3", mountain.scenario(1), rules.all, VERSION), rules };
}

function join(room: Room, token: string, version = VERSION): FakeSocket {
  const socket = new FakeSocket();
  room.connect(socket);
  room.hear(socket, JSON.stringify({ type: "hello", token, version }));
  return socket;
}

function act(room: Room, socket: Socket, ...actions: readonly unknown[]): void {
  room.hear(socket, JSON.stringify({ type: "actions", actions }));
}

describe("Room", () => {
  it("seats the players on the scenario's climbers as they join, and welcomes each with the expedition", () => {
    const { room } = aRoom();

    const anna = join(room, "anna-token");
    const boris = join(room, "boris-token");

    expect(anna.welcome).toMatchObject({ code: "K7PX3", climber: "player" });
    expect(boris.welcome).toMatchObject({ code: "K7PX3", climber: "teammate" });
    expect(anna.welcome.save).toMatchObject({ step: 0, actions: [] });
    expect(anna.welcome.save.scenario.climbers).toEqual(["player", "teammate"]);
    expect(room.players).toBe(2);
  });

  it("gives a player their climber back when they come back with their token", () => {
    const { room } = aRoom();
    const anna = join(room, "anna-token");
    room.leave(anna);

    const boris = join(room, "boris-token");
    const annaAgain = join(room, "anna-token");

    expect(boris.welcome.climber).toBe("teammate");
    expect(annaAgain.welcome.climber).toBe("player");
    expect(room.players).toBe(2);
    expect(room.seated).toBe(2);
  });

  it("counts the seats taken apart from the players in: a seat stays taken while its player is away", () => {
    const { room } = aRoom();

    const anna = join(room, "anna-token");
    room.leave(anna);

    expect(room.players).toBe(0);
    expect(room.seated).toBe(1);
  });

  it("turns a third player away: the room is full", () => {
    const { room } = aRoom();
    join(room, "anna-token");
    join(room, "boris-token");

    const vera = join(room, "vera-token");

    expect(vera.closed?.code).toBe(CloseCode.FULL.code);
    expect(vera.sent).toEqual([]);
    expect(room.players).toBe(2);
  });

  it("asks a browser on another build of the game to reload, and seats nobody on it", () => {
    const { room } = aRoom();

    const old = join(room, "anna-token", "0ld0000");

    expect(old.closed?.code).toBe(CloseCode.RELOAD.code);
    expect(old.sent).toEqual([]);
    expect(join(room, "boris-token").welcome.climber).toBe("player");
  });

  it("takes the steps the real time owes, and sends each to every player with the actions in it", () => {
    const { room, rules } = aRoom();
    const anna = join(room, "anna-token");
    const boris = join(room, "boris-token");

    act(room, anna, { kind: "walk", direction: "right" });
    const taken = room.tick(0.1);

    expect(taken).toBe(2);
    expect(room.step).toBe(2);
    expect(anna.steps).toEqual([
      { type: "step", step: 0, actions: [{ kind: "walk", direction: "right", climber: "player" }] },
      { type: "step", step: 1, actions: [] },
    ]);
    expect(boris.steps).toEqual(anna.steps);
    expect(rules.physics.climber("player").x).toBeGreaterThan(10);
  });

  it("ties an action to the sender's climber, whatever climber the message names", () => {
    const { room, rules } = aRoom();
    const anna = join(room, "anna-token");
    join(room, "boris-token");

    act(room, anna, { kind: "walk", direction: "right", climber: "teammate" });
    room.tick(0.05);

    expect(anna.steps[0]?.actions).toEqual([
      { kind: "walk", direction: "right", climber: "player" },
    ]);
    expect(rules.physics.climber("teammate").walking).toBe("stop");
    expect(rules.physics.climber("player").walking).toBe("right");
  });

  it("pauses while nobody is in, and goes on when someone comes back", () => {
    const { room } = aRoom();

    expect(room.tick(1)).toBe(0);
    const anna = join(room, "anna-token");
    expect(room.tick(0.05)).toBe(1);
    room.leave(anna);
    expect(room.tick(1)).toBe(0);
    expect(room.step).toBe(1);
    join(room, "anna-token");
    expect(room.tick(0.05)).toBe(1);

    expect(room.step).toBe(2);
  });

  it("stops the climber of a player who left mid-stride: nobody steers them, so they hold nothing", () => {
    const { room, rules } = aRoom();
    const anna = join(room, "anna-token");
    join(room, "boris-token");
    act(room, anna, { kind: "walk", direction: "right" });
    room.tick(0.5);

    room.leave(anna);
    room.tick(0.05);
    const stopped = rules.physics.climber("player");
    room.tick(1);

    expect(stopped.walking).toBe("stop");
    expect(rules.physics.climber("player").x).toBe(stopped.x);
  });

  it("keeps the stop of the last player out with the room's save: the climber stands after the pause", () => {
    const { room } = aRoom();
    const anna = join(room, "anna-token");
    act(room, anna, { kind: "walk", direction: "right" });
    room.tick(0.5);
    room.leave(anna);

    const laterRules = mountain.rules();
    const later = Room.resume(room.save(), laterRules.all, VERSION);
    join(later, "anna-token");
    later.tick(0.05);
    const stopped = laterRules.physics.climber("player");
    later.tick(1);

    expect(stopped.walking).toBe("stop");
    expect(laterRules.physics.climber("player").x).toBe(stopped.x);
  });

  it("lets go of nothing for a player still in on another connection, as after a reconnection", () => {
    const { room, rules } = aRoom();
    const before = join(room, "anna-token");
    const again = join(room, "anna-token");
    act(room, again, { kind: "walk", direction: "right" });
    room.tick(0.05);

    room.leave(before);
    room.tick(0.5);

    expect(rules.physics.climber("player").walking).toBe("right");
  });

  it("counts a tick as a second at most: a stalled server doesn't race to catch up", () => {
    const { room } = aRoom();
    join(room, "anna-token");

    expect(room.tick(7)).toBe(20);
    expect(room.tick(0.05)).toBe(1);
  });

  it("closes a socket that speaks before hello, or not the protocol", () => {
    const { room } = aRoom();
    const early = new FakeSocket();
    room.connect(early);

    act(room, early, { kind: "check-self" });
    const anna = join(room, "anna-token");
    room.hear(anna, "not a message");

    expect(early.closed?.code).toBe(CloseCode.BAD_MESSAGE.code);
    expect(anna.closed?.code).toBe(CloseCode.BAD_MESSAGE.code);
    expect(room.players).toBe(0);
  });

  it("saves and resumes: the seats and the expedition go on from where they were", () => {
    const { room, rules } = aRoom();
    const anna = join(room, "anna-token");
    join(room, "boris-token");
    act(room, anna, { kind: "walk", direction: "right" });
    room.tick(0.5);

    const save = room.save();
    const laterRules = mountain.rules();
    const later = Room.resume(save, laterRules.all, VERSION);
    const resumedAt = laterRules.physics.climber("player");
    const boris = join(later, "boris-token");
    later.tick(0.05);

    expect(save.seats).toEqual([
      ["anna-token", "player"],
      ["boris-token", "teammate"],
    ]);
    expect(save.expedition.actions).toEqual([
      { step: 0, actions: [{ kind: "walk", direction: "right", climber: "player" }] },
    ]);
    expect(boris.welcome.climber).toBe("teammate");
    expect(boris.welcome.save.step).toBe(10);
    expect(resumedAt).toEqual(rules.physics.climber("player"));
    expect(boris.steps[0]?.step).toBe(10);
    expect(later.step).toBe(11);
  });
});
