import { describe, expect, it } from "vitest";

import { RoomCode } from "../room/room-code";
import { RoomServer } from "./room-server";

const code = RoomCode.parse("K7PX3");

describe("RoomServer", () => {
  it("is wrangler dev on the page's host when the build was told nothing", () => {
    const server = RoomServer.from(undefined, "192.168.1.20");

    expect(server.newRoom()).toBe("ws://192.168.1.20:8787/rooms/new");
    expect(code === null ? "" : server.room(code)).toBe("ws://192.168.1.20:8787/rooms/K7PX3");
  });

  it("is the address the build was told, over a secure socket", () => {
    const server = RoomServer.from("https://everest-room.example.workers.dev", "localhost");

    expect(server.newRoom()).toBe("wss://everest-room.example.workers.dev/rooms/new");
    expect(code === null ? "" : server.room(code)).toBe(
      "wss://everest-room.example.workers.dev/rooms/K7PX3",
    );
  });
});
