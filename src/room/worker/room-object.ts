import { DurableObject } from "cloudflare:workers";

import { KnowledgeBase } from "../../content/knowledge-base";
import { KNOWLEDGE_FILES } from "../../content/knowledge-files";
import { Mountain } from "../../content/mountain";
import { SimulationClock } from "../../simulation";
import type { Socket } from "../room";
import { RoomHost } from "../room-host";
import type { Ticker } from "../room-host";
import { RoomStorage } from "../room-storage";
import type { RoomEnv } from "./room-env";

/** A WebSocket of the object's, as the room uses it: one that's gone takes nothing more. */
class ObjectSocket implements Socket {
  constructor(private readonly socket: WebSocket) {}

  send(text: string): void {
    try {
      this.socket.send(text);
    } catch {
      // Closed already: its close event takes the player out.
    }
  }

  close(code: number, reason: string): void {
    try {
      this.socket.close(code, reason);
    } catch {
      // Closed already.
    }
  }
}

/** The object's clock: an interval of a step's time, measured by the real clock between ticks. */
class IntervalTicker implements Ticker {
  private interval: ReturnType<typeof setInterval> | null = null;
  private last = 0;

  start(tick: (seconds: number) => void): void {
    if (this.interval !== null) {
      return;
    }
    this.last = Date.now();
    this.interval = setInterval(() => {
      const now = Date.now();
      tick((now - this.last) / 1000);
      this.last = now;
    }, SimulationClock.STEP_SECONDS * 1000);
  }

  stop(): void {
    if (this.interval !== null) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

/**
 * One room: a Durable Object named by its code, which runs the room's expedition and keeps it in
 * its storage (docs/conventions/room-server.md). It holds the sockets with the standard WebSocket
 * API, not the hibernating one: the room steps twenty times a second while anyone's in, so it
 * never sleeps then, and with nobody in there's no socket to keep. Everything it decides is
 * `RoomHost`'s.
 */
export class RoomObject extends DurableObject<RoomEnv> {
  private readonly host: RoomHost;

  constructor(ctx: DurableObjectState, env: RoomEnv) {
    super(ctx, env);
    const mountain = new Mountain(new KnowledgeBase(KNOWLEDGE_FILES));
    const storage = new RoomStorage(ctx.storage);
    this.host = new RoomHost(storage, mountain, env.GAME_VERSION, new IntervalTicker());
    void ctx.blockConcurrencyWhile(() => this.host.load());
  }

  /** The worker's call for a new room on the code it drew: false when the code is taken. */
  create(code: string, seed: number): boolean {
    return this.host.create(code, seed);
  }

  /** A player's WebSocket, for the room to welcome, hear and pace. */
  override fetch(request: Request): Response {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("A room takes a WebSocket", { status: 426 });
    }
    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    server.accept();
    const socket = new ObjectSocket(server);
    server.addEventListener("message", (event) => {
      this.host.hear(socket, typeof event.data === "string" ? event.data : "");
    });
    server.addEventListener("close", () => {
      this.host.leave(socket);
    });
    server.addEventListener("error", () => {
      this.host.leave(socket);
    });
    this.host.connect(socket);
    return new Response(null, { status: 101, webSocket: client });
  }
}
