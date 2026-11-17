import { describe, expect, it } from "vitest";

import { CloseCode, Protocol } from "./messages";

const protocol = new Protocol();
const TOKEN = "anna-token";

function client(message: unknown): ReturnType<Protocol["fromClient"]> {
  return protocol.fromClient(JSON.stringify(message));
}

function server(message: unknown): ReturnType<Protocol["fromServer"]> {
  return protocol.fromServer(JSON.stringify(message));
}

describe("Protocol, from a browser", () => {
  it("reads a hello: the player's token and the game's version", () => {
    expect(client({ type: "hello", token: TOKEN, version: "f06f24b" })).toEqual({
      type: "hello",
      token: TOKEN,
      version: "f06f24b",
    });
  });

  it("refuses a hello without a token of the right shape or a version", () => {
    expect(client({ type: "hello", token: "short", version: "f06f24b" })).toBeNull();
    expect(client({ type: "hello", token: TOKEN, version: "" })).toBeNull();
    expect(client({ type: "hello", token: TOKEN })).toBeNull();
    expect(client({ type: "hello", token: 42, version: "f06f24b" })).toBeNull();
    expect(client({ type: "hello", token: TOKEN, version: "x".repeat(201) })).toBeNull();
  });

  it("reads actions in the shapes the rules know, and leaves the climber out", () => {
    const actions = [
      { kind: "walk", climber: "anna", direction: "up-right" },
      { kind: "pace", pace: "faster" },
      { kind: "clip", cowstail: "first" },
      { kind: "unclip", cowstail: "second" },
      { kind: "jumar", held: true },
      { kind: "tool", tool: "ice-axe", x: 20.37, y: 4.78 },
      { kind: "oxygen", change: "down" },
      { kind: "check-self" },
      { kind: "radio", channel: "base-camp", phrase: "Turning back" },
      { kind: "tent", climber: "boris", go: "in" },
      { kind: "chore", climber: "boris", chore: "melt" },
    ];

    expect(client({ type: "actions", actions })).toEqual({
      type: "actions",
      actions: [
        { kind: "walk", direction: "up-right" },
        { kind: "pace", pace: "faster" },
        { kind: "clip", cowstail: "first" },
        { kind: "unclip", cowstail: "second" },
        { kind: "jumar", held: true },
        { kind: "tool", tool: "ice-axe", x: 20.37, y: 4.78 },
        { kind: "oxygen", change: "down" },
        { kind: "check-self" },
        { kind: "radio", channel: "base-camp", phrase: "Turning back" },
        { kind: "tent", go: "in" },
        { kind: "chore", chore: "melt" },
      ],
    });
    expect(client({ type: "actions", actions: [] })).toEqual({ type: "actions", actions: [] });
  });

  it("refuses an action of another shape, so no browser in the room runs it", () => {
    const refused = (action: unknown) => client({ type: "actions", actions: [action] });

    expect(refused({ kind: "walk", direction: "sideways" })).toBeNull();
    expect(refused({ kind: "walk" })).toBeNull();
    expect(refused({ kind: "walk", direction: "up", speed: 3 })).toBeNull();
    expect(refused({ kind: "jumar", held: "yes" })).toBeNull();
    expect(refused({ kind: "tool", tool: "crampons", x: "7", y: 1 })).toBeNull();
    expect(refused({ kind: "tool", tool: "crampons", x: Number.NaN, y: 1 })).toBeNull();
    expect(refused({ kind: "radio", channel: "group", phrase: "x".repeat(201) })).toBeNull();
    expect(refused({ kind: "fly" })).toBeNull();
    expect(refused({ kind: "constructor" })).toBeNull();
    expect(refused("walk")).toBeNull();
    expect(refused(null)).toBeNull();
  });

  it("refuses what isn't a message at all", () => {
    expect(protocol.fromClient("not json")).toBeNull();
    expect(protocol.fromClient("[]")).toBeNull();
    expect(protocol.fromClient("null")).toBeNull();
    expect(client({ type: "fly" })).toBeNull();
    expect(client({ actions: [] })).toBeNull();
    expect(client({ type: "actions", actions: {} })).toBeNull();
    expect(
      client({
        type: "actions",
        actions: Array.from({ length: Protocol.MAX_ACTIONS + 1 }, () => ({ kind: "check-self" })),
      }),
    ).toBeNull();
  });
});

describe("Protocol, from the room", () => {
  it("reads a welcome and a step", () => {
    const save = { scenario: { seed: 1, climbers: ["anna"], start: {} }, step: 3, random: {} };
    const welcome = { type: "welcome", code: "K7PX3", climber: "anna", save };
    const step = { type: "step", step: 3, actions: [{ kind: "check-self", climber: "anna" }] };

    expect(server(welcome)).toEqual(welcome);
    expect(server(step)).toEqual(step);
  });

  it("refuses anything else", () => {
    expect(protocol.fromServer("{")).toBeNull();
    expect(server({ type: "welcome", code: "K7PX3", climber: "anna" })).toBeNull();
    expect(server({ type: "welcome", code: "K7PX3", climber: "anna", save: "no" })).toBeNull();
    expect(server({ type: "step", step: "3", actions: [] })).toBeNull();
    expect(server({ type: "step", step: 3.5, actions: [] })).toBeNull();
    expect(server({ type: "step", step: 3 })).toBeNull();
    expect(server({ type: "hello" })).toBeNull();
  });
});

describe("CloseCode", () => {
  it("names the refusals, and nothing else", () => {
    expect(CloseCode.refusalOf(CloseCode.UNKNOWN.code)).toBe("unknown");
    expect(CloseCode.refusalOf(CloseCode.FULL.code)).toBe("full");
    expect(CloseCode.refusalOf(CloseCode.RELOAD.code)).toBe("reload");
    expect(CloseCode.refusalOf(CloseCode.STALE.code)).toBe("stale");
    expect(CloseCode.refusalOf(CloseCode.BAD_MESSAGE.code)).toBeNull();
    expect(CloseCode.refusalOf(1006)).toBeNull();
    expect(CloseCode.refusalOf(1000)).toBeNull();
  });

  it("keeps its codes in the range the WebSocket standard leaves to applications", () => {
    const closes = [
      CloseCode.UNKNOWN,
      CloseCode.FULL,
      CloseCode.RELOAD,
      CloseCode.STALE,
      CloseCode.BAD_MESSAGE,
    ];
    for (const close of closes) {
      expect(close.code).toBeGreaterThanOrEqual(4000);
      expect(close.code).toBeLessThanOrEqual(4999);
    }
  });
});
