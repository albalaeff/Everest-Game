import { RoomCode } from "../room/room-code";

/**
 * The page's link, with a room in it or not: `…/?room=K7PX3` is what a player sends to share the
 * room, and what opens it, skipping the start's choice. A value: each change gives a new URL.
 */
export class RoomLink {
  static readonly PARAMETER = "room";

  private readonly url: URL;

  constructor(href: string) {
    this.url = new URL(href);
  }

  /** The room the link opens, or null for a link without one, or with one that can't be a code. */
  get code(): RoomCode | null {
    return RoomCode.parse(this.url.searchParams.get(RoomLink.PARAMETER) ?? "");
  }

  /** The link to the room, the rest of the page's link kept. */
  to(code: RoomCode): URL {
    const link = new URL(this.url);
    link.searchParams.set(RoomLink.PARAMETER, code.text);
    return link;
  }

  /** The page's link without the room: the way back to the start. */
  without(): URL {
    const link = new URL(this.url);
    link.searchParams.delete(RoomLink.PARAMETER);
    return link;
  }
}
