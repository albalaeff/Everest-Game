import { describe, expect, it } from "vitest";

import time from "../../content/facts/time.json";
import { KnowledgeBase } from "../content/knowledge-base";
import { Mountain } from "../content/mountain";
import type { ExpeditionRules } from "../content/mountain";
import { CloseCode } from "../room/messages";
import type { ClientMessage, Refusal, Welcome } from "../room/messages";
import { Expedition } from "../simulation";
import type { ExpeditionSave } from "../simulation";
import { RoomClient } from "./room-client";
import type { Browser, ClientSocket, RoomListener, SocketEvents } from "./room-client";

const URL = "ws://localhost:8787/rooms/K7PX3";
const TOKEN = "3f2b7c1e-9a4d-4e6f-8b1a-2c3d4e5f6a7b";
const VERSION = "f06f24b";
const mountain = new Mountain(new KnowledgeBase([time]));

/** A socket as a test drives it: what the client sent, and what the room would. */
class FakeSocket implements ClientSocket {
  readonly sent: ClientMessage[] = [];
  closed = false;
  private events: SocketEvents | null = null;

  constructor(readonly url: string) {}

  send(text: string): void {
    this.sent.push(JSON.parse(text) as ClientMessage);
  }

  close(): void {
    this.closed = true;
  }

  listen(events: SocketEvents): void {
    this.events = events;
  }

  open(): void {
    this.events?.opened();
  }

  receive(message: unknown): void {
    this.events?.heard(JSON.stringify(message));
  }

  drop(code: number): void {
    this.events?.closed(code);
  }
}

/** The browser around the client: the sockets it opened, and the waits it was asked for. */
class FakeBrowser implements Browser {
  readonly sockets: FakeSocket[] = [];
  readonly waits: { seconds: number; then: () => void }[] = [];

  connect(url: string): ClientSocket {
    const socket = new FakeSocket(url);
    this.sockets.push(socket);
    return socket;
  }

  after(seconds: number, then: () => void): void {
    this.waits.push({ seconds, then });
  }

  /** The time of the first wait goes by. */
  elapse(): void {
    this.waits.shift()?.then();
  }

  /** The socket opened last. */
  get socket(): FakeSocket {
    const last = this.sockets.at(-1);
    if (last === undefined) {
      throw new Error("No socket was opened");
    }
    return last;
  }
}

class Heard implements RoomListener {
  readonly welcomes: { welcome: Welcome; again: boolean }[] = [];
  readonly refusals: Refusal[] = [];
  lost = 0;

  welcomed(welcome: Welcome, again: boolean): void {
    this.welcomes.push({ welcome, again });
  }

  refused(refusal: Refusal): void {
    this.refusals.push(refusal);
  }
}

/** The room's save at a step, as a welcome carries it: without the log. */
function saveAt(step: number): ExpeditionSave {
  const expedition = Expedition.start(mountain.scenario(1), mountain.rules().all);
  for (let taken = 0; taken < step; taken += 1) {
    expedition.advance();
  }
  return { ...expedition.save(), actions: [] };
}

function welcome(step: number): Welcome {
  return { type: "welcome", code: "K7PX3", climber: "player", save: saveAt(step) };
}

interface Made {
  client: RoomClient;
  browser: FakeBrowser;
  heard: Heard;
  rules: ExpeditionRules;
}

function aClient(): Made {
  const browser = new FakeBrowser();
  const heard = new Heard();
  const rules = mountain.rules();
  const client = new RoomClient(URL, TOKEN, VERSION, rules.all, browser, heard);
  return { client, browser, heard, rules };
}

/** A client the room has welcomed at a step. */
function joined(step = 0): Made {
  const made = aClient();
  made.client.join();
  made.browser.socket.open();
  made.browser.socket.receive(welcome(step));
  return made;
}

describe("RoomClient", () => {
  it("says hello with its token and the game's version, and takes the expedition the room welcomes it with", () => {
    const { client, browser, heard } = aClient();

    client.join();
    browser.socket.open();
    browser.socket.receive(welcome(30));

    expect(browser.socket.url).toBe(URL);
    expect(browser.socket.sent).toEqual([{ type: "hello", token: TOKEN, version: VERSION }]);
    expect(heard.welcomes).toEqual([{ welcome: welcome(30), again: false }]);
    expect(client.expedition?.step).toBe(30);
  });

  it("takes the room's steps in order, each with its actions, so the climber walks here as there", () => {
    const { client, browser, rules } = joined();

    browser.socket.receive({
      type: "step",
      step: 0,
      actions: [{ kind: "walk", climber: "player", direction: "right" }],
    });
    browser.socket.receive({ type: "step", step: 1, actions: [] });
    client.advance();

    expect(client.expedition?.step).toBe(2);
    expect(rules.physics.climber("player").walking).toBe("right");
    expect(rules.physics.climber("player").x).toBeGreaterThan(10);
  });

  it("sends what the player did with the next frame, and never runs it here first", () => {
    const { client, browser, rules } = joined();

    client.send({ kind: "walk", climber: "player", direction: "right" });
    client.send({ kind: "panel", panel: "radio" });
    client.advance();
    client.advance();

    expect(browser.socket.sent).toEqual([
      { type: "hello", token: TOKEN, version: VERSION },
      { type: "actions", actions: [{ kind: "walk", climber: "player", direction: "right" }] },
    ]);
    expect(rules.physics.climber("player").walking).toBe("stop");
  });

  it("tries again two seconds after a connection lost, with the same token, and goes on from the fresh save", () => {
    const { client, browser, heard } = joined(10);

    browser.socket.drop(1006);
    expect(heard.lost).toBe(1);
    expect(browser.waits.map((wait) => wait.seconds)).toEqual([RoomClient.RETRY_SECONDS]);
    browser.elapse();
    browser.socket.open();
    browser.socket.receive(welcome(50));

    expect(browser.sockets).toHaveLength(2);
    expect(browser.socket.sent).toEqual([{ type: "hello", token: TOKEN, version: VERSION }]);
    expect(heard.welcomes.at(-1)).toEqual({ welcome: welcome(50), again: true });
    expect(client.expedition?.step).toBe(50);
  });

  it("stops at a refusal, and says which", () => {
    const { client, browser, heard } = aClient();
    client.join();

    browser.socket.drop(CloseCode.FULL.code);

    expect(heard.refusals).toEqual(["full"]);
    expect(heard.lost).toBe(0);
    expect(browser.waits).toEqual([]);
  });

  it("drops the connection for a fresh save on a step it can't follow", () => {
    const { client, browser, heard } = joined();

    browser.socket.receive({ type: "step", step: 5, actions: [] });
    client.advance();

    expect(browser.socket.closed).toBe(true);
    expect(heard.lost).toBe(1);
    expect(browser.waits).toHaveLength(1);
    expect(client.expedition?.step).toBe(0);
  });

  it("drops it too on a message that isn't the room's", () => {
    const { browser, heard } = joined();

    browser.socket.receive({ type: "surprise" });

    expect(browser.socket.closed).toBe(true);
    expect(heard.lost).toBe(1);
  });

  it("leaves: closes the socket, and tries no more", () => {
    const { client, browser, heard } = joined();

    client.leave();
    browser.socket.drop(1000);
    browser.elapse();

    expect(browser.socket.closed).toBe(true);
    expect(browser.sockets).toHaveLength(1);
    expect(heard.lost).toBe(0);
  });
});
