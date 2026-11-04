import { describe, expect, it } from "vitest";

import type { LoggedStep } from "../simulation";
import type { RoomSave } from "./room";
import { RoomStorage } from "./room-storage";
import { MemoryStorage } from "./testing/fakes";

const logged = (step: number): LoggedStep => ({
  step,
  actions: [{ kind: "check-self", climber: "anna" }],
});

function aSave(step: number, actions: readonly LoggedStep[]): RoomSave {
  return {
    code: "K7PX3",
    seats: [["anna-token", "anna"]],
    queued: [],
    expedition: {
      scenario: { seed: 1, climbers: ["anna"], start: {} },
      step,
      random: [1, 2, 3, 4],
      rules: {},
      actions,
    },
  };
}

describe("RoomStorage", () => {
  it("stores the room without its log, and the log in chunks of what's new since the last save", async () => {
    const memory = new MemoryStorage();
    const storage = new RoomStorage(memory);

    await storage.store(aSave(10, [logged(0), logged(3)]));
    await storage.store(aSave(20, [logged(0), logged(3), logged(15)]));

    expect(memory.entries.get("room")).toEqual(aSave(20, []));
    expect(memory.entries.get("log:00000000")).toEqual([logged(0), logged(3)]);
    expect(memory.entries.get("log:00000001")).toEqual([logged(15)]);
    expect(memory.entries.size).toBe(3);
  });

  it("stores no chunk for a stretch with nothing logged", async () => {
    const memory = new MemoryStorage();
    const storage = new RoomStorage(memory);

    await storage.store(aSave(10, []));
    await storage.store(aSave(20, []));
    await storage.store(aSave(30, [logged(25)]));

    expect([...memory.entries.keys()]).toEqual(["room", "log:00000000"]);
    expect(memory.entries.get("log:00000000")).toEqual([logged(25)]);
  });

  it("loads the room back with its whole log, and goes on storing after it", async () => {
    const memory = new MemoryStorage();
    const before = new RoomStorage(memory);
    await before.store(aSave(10, [logged(0), logged(3)]));
    await before.store(aSave(20, [logged(0), logged(3), logged(15)]));

    const storage = new RoomStorage(memory);
    const loaded = await storage.load();
    await storage.store(aSave(40, [logged(0), logged(3), logged(15), logged(19), logged(33)]));

    expect(loaded).toEqual(aSave(20, [logged(0), logged(3), logged(15)]));
    expect(memory.entries.get("log:00000002")).toEqual([logged(33)]);
    expect(await new RoomStorage(memory).load()).toEqual(
      aSave(40, [logged(0), logged(3), logged(15), logged(33)]),
    );
  });

  it("gives each of two stores in flight a chunk of its own, so neither loses the other's steps", async () => {
    const memory = new MemoryStorage();
    const storage = new RoomStorage(memory);
    memory.hold();

    const first = storage.store(aSave(10, [logged(3)]));
    const second = storage.store(aSave(20, [logged(3), logged(15)]));
    memory.release();
    await Promise.all([first, second]);

    expect(memory.entries.get("log:00000000")).toEqual([logged(3)]);
    expect(memory.entries.get("log:00000001")).toEqual([logged(15)]);
    expect(await new RoomStorage(memory).load()).toEqual(aSave(20, [logged(3), logged(15)]));
  });

  it("loads nothing from a storage no room was ever stored in", async () => {
    expect(await new RoomStorage(new MemoryStorage()).load()).toBeNull();
  });
});
