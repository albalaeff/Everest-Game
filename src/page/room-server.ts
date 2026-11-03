import type { RoomCode } from "../room/room-code";

/**
 * Where the room server is: the address the build was told (`VITE_ROOM_SERVER`, ci.yml →
 * preview), or `wrangler dev` on the page's own host, as `npm run room` serves it, so a phone on
 * the network that opens the page on this machine finds the room server beside it.
 */
export class RoomServer {
  /** The port `wrangler dev` listens on (wrangler.jsonc → dev). */
  static readonly DEFAULT_PORT = 8787;

  private readonly base: URL;

  constructor(address: string) {
    this.base = new URL(address);
  }

  static from(configured: string | undefined, hostname: string): RoomServer {
    return new RoomServer(configured ?? `http://${hostname}:${RoomServer.DEFAULT_PORT}`);
  }

  /** The socket that opens a new room. */
  newRoom(): string {
    return this.socket("/rooms/new");
  }

  /** The socket that joins the room with a code. */
  room(code: RoomCode): string {
    return this.socket(`/rooms/${code.text}`);
  }

  private socket(path: string): string {
    const url = new URL(path, this.base);
    url.protocol = this.base.protocol === "https:" ? "wss:" : "ws:";
    return url.href;
  }
}
