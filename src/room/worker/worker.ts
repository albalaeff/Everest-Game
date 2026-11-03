import { WorkerEntrypoint } from "cloudflare:workers";

import { CloseCode } from "../messages";
import { RoomCode } from "../room-code";
import { RoomRoute } from "../room-route";
import type { RoomEnv } from "./room-env";

export { RoomObject } from "./room-object";

/**
 * The room server's Worker (docs/conventions/room-server.md): it finds the room a WebSocket asks
 * for, the object named by its code, and hands the socket over. A new room gets a code drawn
 * here, tried again on the rare one that's taken. A code that can't be one is answered on the
 * socket, closed as a room that doesn't exist, so the browser can say so.
 */
export default class RoomWorker extends WorkerEntrypoint<RoomEnv> {
  /** How many codes a new room draws before giving up: one in 33 million is taken per room. */
  private static readonly TRIES = 5;

  override async fetch(request: Request): Promise<Response> {
    const route = RoomRoute.of(new URL(request.url));
    if (route.kind === "health") {
      return new Response("Everest room server\n");
    }
    if (route.kind === "not-found") {
      return new Response("Not found\n", { status: 404 });
    }
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("A room takes a WebSocket\n", { status: 426 });
    }
    if (route.kind === "new-room") {
      return this.newRoom(request);
    }
    return route.code === null
      ? RoomWorker.refusal(CloseCode.UNKNOWN, "No such room")
      : this.env.ROOMS.getByName(route.code.text).fetch(request);
  }

  private async newRoom(request: Request): Promise<Response> {
    for (let tried = 0; tried < RoomWorker.TRIES; tried += 1) {
      const code = RoomCode.drawn(crypto.getRandomValues(new Uint8Array(RoomCode.LENGTH)));
      const [seed = 0] = crypto.getRandomValues(new Uint32Array(1));
      const room = this.env.ROOMS.getByName(code.text);
      if (await room.create(code.text, seed)) {
        return room.fetch(request);
      }
    }
    return new Response("No free room code: try again\n", { status: 503 });
  }

  /** A socket turned away as it opens, so the browser hears why in its close code. */
  private static refusal(close: CloseCode, reason: string): Response {
    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    server.accept();
    server.close(close.code, reason);
    return new Response(null, { status: 101, webSocket: client });
  }
}
