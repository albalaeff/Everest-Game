import type { RoomObject } from "./room-object";

/** What the Worker is given (wrangler.jsonc): the rooms' objects, the build of the game they
 * run, which every player's must be, and a weather its rooms' climbs hold, if any: the stories'
 * clear (#272), so they never meet a storm by chance; otherwise a climb's weather turns from its
 * seed. */
export interface RoomEnv {
  readonly ROOMS: DurableObjectNamespace<RoomObject>;
  readonly GAME_VERSION: string;
  readonly WEATHER?: string;
}
