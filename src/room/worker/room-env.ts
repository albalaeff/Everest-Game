import type { RoomObject } from "./room-object";

/** What the Worker is given (wrangler.jsonc): the rooms' objects, and the build of the game they
 * run, which every player's must be. */
export interface RoomEnv {
  readonly ROOMS: DurableObjectNamespace<RoomObject>;
  readonly GAME_VERSION: string;
}
