import type { Texts } from "../interface/texts";

/** The names of the start's and the room's words, as content/room.json has them. */
export type RoomTextName =
  | "title"
  | "alone"
  | "start-over"
  | "together"
  | "code"
  | "join"
  | "connecting"
  | "joined"
  | "copy-link"
  | "copied"
  | "unknown"
  | "full"
  | "stale"
  | "reloading"
  | "updating"
  | "lost"
  | "back";

/** The start's and the room's words, in one language of content/room.json: a text says the
 * room's code where it has `{code}`. */
export type RoomTexts = Texts<RoomTextName>;
