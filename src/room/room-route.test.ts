import { describe, expect, it } from "vitest";

import { RoomRoute } from "./room-route";

function route(path: string): RoomRoute {
  return RoomRoute.of(new URL(path, "https://everest-room.example.workers.dev"));
}

describe("RoomRoute", () => {
  it("answers at the root, so a test or a person can see the server is up", () => {
    expect(route("/")).toEqual({ kind: "health", code: null });
  });

  it("opens a new room, or the room of a code, in any case", () => {
    expect(route("/rooms/new")).toEqual({ kind: "new-room", code: null });
    expect(route("/rooms/K7PX3")).toMatchObject({ kind: "room", code: { text: "K7PX3" } });
    expect(route("/rooms/k7px3")).toMatchObject({ kind: "room", code: { text: "K7PX3" } });
  });

  it("knows a path for a room whose code can't be one: that room doesn't exist", () => {
    expect(route("/rooms/K7PX0")).toEqual({ kind: "room", code: null });
    expect(route("/rooms/K7")).toEqual({ kind: "room", code: null });
  });

  it("finds nothing anywhere else", () => {
    expect(route("/rooms")).toEqual({ kind: "not-found", code: null });
    expect(route("/rooms/")).toEqual({ kind: "not-found", code: null });
    expect(route("/rooms/K7PX3/more")).toEqual({ kind: "not-found", code: null });
    expect(route("/favicon.ico")).toEqual({ kind: "not-found", code: null });
  });
});
