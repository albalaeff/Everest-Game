import { RoomCode } from "./room-code";

/** What a request to the room server asks for. */
export type RouteKind = "health" | "new-room" | "room" | "not-found";

/**
 * A request's path, as the room server reads it: `/` says it's up, `/rooms/new` opens a new room
 * and `/rooms/<code>` the room of a code, both as WebSockets. A room's path whose code can't be
 * one is a room that doesn't exist, which the browser hears as such, not as a page that isn't
 * there.
 */
export class RoomRoute {
  static readonly NEW = "new";

  private constructor(
    readonly kind: RouteKind,
    /** On a room's path, its code, or null for one that can't be a code. */
    readonly code: RoomCode | null,
  ) {}

  static of(url: URL): RoomRoute {
    if (url.pathname === "/") {
      return new RoomRoute("health", null);
    }
    const [first, rooms, name, ...rest] = url.pathname.split("/");
    if (first !== "" || rooms !== "rooms" || name === undefined || name === "" || rest.length > 0) {
      return new RoomRoute("not-found", null);
    }
    if (name === RoomRoute.NEW) {
      return new RoomRoute("new-room", null);
    }
    return new RoomRoute("room", RoomCode.parse(name));
  }
}
