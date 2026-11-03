import type { LoggedStep } from "../simulation";
import type { RoomSave } from "./room";

/** The object's storage, as far as the room uses it: keys and values, listed by prefix. The
 * Durable Object's is one; a test's map is another. */
export interface KeyValueStorage {
  get<T>(key: string): Promise<T | undefined>;
  /** The entries whose keys start with the prefix, in the keys' order. */
  list<T>(options: { readonly prefix: string }): Promise<Map<string, T>>;
  /** Puts every entry, in one go. */
  put<T>(entries: Record<string, T>): Promise<void>;
}

/**
 * A room's state in its object's storage: the expedition without its log under one key, and the
 * log in chunks, each the steps logged since the last save. A value in the storage has a size
 * limit, and the log of a long climb grows past it; a chunk never does, and the log read back
 * in the keys' order is the whole replay (docs/conventions/simulation-core.md).
 */
export class RoomStorage {
  static readonly ROOM = "room";
  static readonly LOG = "log:";
  /** Chunk numbers are padded, so the keys list in the order they were stored. */
  private static readonly DIGITS = 8;

  private chunks = 0;
  /** The last step whose actions are in the log stored, or -1 for none yet. */
  private loggedThrough = -1;

  constructor(private readonly storage: KeyValueStorage) {}

  /** The room stored, with its whole log, or null for a room never stored. */
  async load(): Promise<RoomSave | null> {
    const room = await this.storage.get<RoomSave>(RoomStorage.ROOM);
    if (room === undefined) {
      return null;
    }
    const chunks = await this.storage.list<readonly LoggedStep[]>({ prefix: RoomStorage.LOG });
    const actions = [...chunks.values()].flat();
    this.chunks = chunks.size;
    this.loggedThrough = room.expedition.step - 1;
    return { ...room, expedition: { ...room.expedition, actions } };
  }

  /** Stores the room: its state, and what the log has gained since the last time. The chunk and
   * the steps it holds are this store's before the write goes out, so a store that starts while
   * another is in flight takes the next chunk and only the steps after. */
  async store(save: RoomSave): Promise<void> {
    const { expedition } = save;
    const fresh = expedition.actions.filter((logged) => logged.step > this.loggedThrough);
    const entries: Record<string, unknown> = {
      [RoomStorage.ROOM]: { ...save, expedition: { ...expedition, actions: [] } },
    };
    if (fresh.length > 0) {
      entries[RoomStorage.LOG + String(this.chunks).padStart(RoomStorage.DIGITS, "0")] = fresh;
      this.chunks += 1;
    }
    this.loggedThrough = expedition.step - 1;
    await this.storage.put(entries);
  }
}
