import { describe, expect, it } from "vitest";

import { RoomCode } from "../room/room-code";
import { RoomLink } from "./room-link";

const PAGE = "https://albalaeff.github.io/Everest-Game/";

describe("RoomLink", () => {
  it("reads a room's code from the page's link, typed in any case", () => {
    expect(new RoomLink(`${PAGE}?room=k7px3`).code?.text).toBe("K7PX3");
  });

  it("reads none from a link without a room, or with one that can't be a code", () => {
    expect(new RoomLink(PAGE).code).toBeNull();
    expect(new RoomLink(`${PAGE}?room=K7PX0`).code).toBeNull();
  });

  it("writes the room's code into the link to share, and keeps the rest of it", () => {
    const code = RoomCode.parse("K7PX3");

    expect(code === null ? "" : new RoomLink(`${PAGE}?lang=ru`).to(code).href).toBe(
      `${PAGE}?lang=ru&room=K7PX3`,
    );
  });

  it("takes the room out of the link, for the way back to the start", () => {
    expect(new RoomLink(`${PAGE}?room=K7PX3`).without().href).toBe(PAGE);
  });
});
