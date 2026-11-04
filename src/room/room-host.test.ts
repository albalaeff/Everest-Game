import { describe, expect, it } from "vitest";

import hazards from "../../content/facts/hazards.json";
import time from "../../content/facts/time.json";
import { KnowledgeBase } from "../content/knowledge-base";
import { Mountain } from "../content/mountain";
import { Expedition } from "../simulation";
import { CloseCode } from "./messages";
import type { RoomSave } from "./room";
import { RoomHost } from "./room-host";
import { RoomStorage } from "./room-storage";
import { FakeSocket, FakeTicker, MemoryStorage } from "./testing/fakes";

const VERSION = "f06f24b";
const mountain = new Mountain(new KnowledgeBase([time, hazards]));

function aHost(memory = new MemoryStorage()): {
  host: RoomHost;
  memory: MemoryStorage;
  ticker: FakeTicker;
} {
  const ticker = new FakeTicker();
  return { host: new RoomHost(new RoomStorage(memory), mountain, VERSION, ticker), memory, ticker };
}

function join(host: RoomHost, token: string, version = VERSION): FakeSocket {
  const socket = new FakeSocket();
  host.connect(socket);
  host.hear(socket, JSON.stringify({ type: "hello", token, version }));
  return socket;
}

function walk(host: RoomHost, socket: FakeSocket): void {
  host.hear(
    socket,
    JSON.stringify({ type: "actions", actions: [{ kind: "walk", direction: "right" }] }),
  );
}

/** The room as the storage holds it, without its log. */
function stored(memory: MemoryStorage): RoomSave | undefined {
  return memory.entries.get(RoomStorage.ROOM) as RoomSave | undefined;
}

describe("RoomHost", () => {
  it("makes a room on a code nobody has, and refuses a code that's taken", () => {
    const { host } = aHost();

    expect(host.create("K7PX3", 1)).toBe(true);
    expect(host.create("K7PX3", 2)).toBe(false);
    expect(join(host, "anna-token").welcome).toMatchObject({ code: "K7PX3", climber: "player" });
  });

  it("turns a socket away from a room that doesn't exist", () => {
    const { host, memory } = aHost();

    const socket = new FakeSocket();
    host.connect(socket);

    expect(socket.closed?.code).toBe(CloseCode.UNKNOWN.code);
    expect(memory.entries.size).toBe(0);
  });

  it("stores the room as soon as a player takes a seat, so a room with someone in it is never lost", () => {
    const { host, memory } = aHost();
    host.create("K7PX3", 1);

    join(host, "anna-token");

    expect(stored(memory)).toMatchObject({ code: "K7PX3", seats: [["anna-token", "player"]] });
  });

  it("never stores a room nobody took a seat in", () => {
    const { host, memory, ticker } = aHost();
    host.create("K7PX3", 1);

    const old = join(host, "anna-token", "0ld0000");

    expect(old.closed?.code).toBe(CloseCode.RELOAD.code);
    expect(memory.entries.size).toBe(0);
    expect(ticker.running).toBe(false);
  });

  it("runs the clock while anyone's in, and stores the room every ten seconds of play", () => {
    const { host, memory, ticker } = aHost();
    host.create("K7PX3", 1);
    const anna = join(host, "anna-token");

    walk(host, anna);
    for (let second = 0; second < 9; second += 1) {
      ticker.pass(1);
    }
    expect(stored(memory)?.expedition.step).toBe(0);
    ticker.pass(1);

    expect(ticker.running).toBe(true);
    expect(stored(memory)?.expedition.step).toBe(RoomHost.SAVE_EVERY_STEPS);
    expect(anna.steps).toHaveLength(RoomHost.SAVE_EVERY_STEPS);
  });

  it("pauses when the last player leaves: the clock stops, and the room is stored as it stands", () => {
    const { host, memory, ticker } = aHost();
    host.create("K7PX3", 1);
    const anna = join(host, "anna-token");
    const boris = join(host, "boris-token");
    ticker.pass(1);

    host.leave(anna);
    expect(ticker.running).toBe(true);
    host.leave(boris);

    expect(ticker.running).toBe(false);
    expect(stored(memory)?.expedition.step).toBe(20);
  });

  it("stops the clock when the last player is closed for a message that isn't the room's", () => {
    const { host, memory, ticker } = aHost();
    host.create("K7PX3", 1);
    const anna = join(host, "anna-token");
    ticker.pass(1);

    host.hear(anna, "not a message");

    expect(anna.closed?.code).toBe(CloseCode.BAD_MESSAGE.code);
    expect(ticker.running).toBe(false);
    expect(stored(memory)?.expedition.step).toBe(20);
  });

  it("goes on from the room stored: a player who comes back finds their climber where it was", async () => {
    const memory = new MemoryStorage();
    const before = aHost(memory);
    before.host.create("K7PX3", 1);
    const anna = join(before.host, "anna-token");
    walk(before.host, anna);
    before.ticker.pass(1);
    before.host.leave(anna);

    const { host, ticker } = aHost(memory);
    await host.load();
    const annaAgain = join(host, "anna-token");
    ticker.pass(0.05);
    const rules = mountain.rules();
    Expedition.resume(annaAgain.welcome.save, rules.all);

    expect(host.create("K7PX3", 2)).toBe(false);
    expect(annaAgain.welcome.climber).toBe("player");
    expect(annaAgain.welcome.save.step).toBe(20);
    expect(rules.physics.climber("player").x).toBeGreaterThan(10);
    expect(annaAgain.steps[0]?.step).toBe(20);
  });

  it("keeps a room this build can't go on with as it is, and says so to whoever comes", async () => {
    const memory = new MemoryStorage();
    const started = Expedition.start(mountain.scenario(1), mountain.rules().all);
    const old: RoomSave = {
      code: "K7PX3",
      seats: [["anna-token", "player"]],
      queued: [],
      expedition: { ...started.save(), rules: {} },
    };
    await new RoomStorage(memory).store(old);
    const { host, ticker } = aHost(memory);

    await host.load();
    const anna = join(host, "anna-token");

    expect(anna.closed?.code).toBe(CloseCode.STALE.code);
    expect(host.create("K7PX3", 1)).toBe(false);
    expect(stored(memory)).toEqual({ ...old, expedition: { ...old.expedition, actions: [] } });
    expect(ticker.running).toBe(false);
  });
});
