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

/** The start's and the room's words, in one language of content/room.json. */
export class RoomTexts {
  private static readonly CODE = "{code}";

  constructor(private readonly texts: Readonly<Record<RoomTextName, string>>) {}

  /** A text, with the room's code where it says `{code}`. */
  say(name: RoomTextName, code = ""): string {
    return this.texts[name].replaceAll(RoomTexts.CODE, code);
  }
}
