import type { ExpeditionSave } from "../simulation";
import type { ExpeditionStore } from "./expedition-store";

/**
 * The solo expedition in the browser's IndexedDB: one slot, the climb in progress, saved by the
 * page as it goes and resumed when the player comes back, so nobody starts the ascent over for
 * having closed the tab (#28). A browser that refuses the database, as Safari in private mode can,
 * keeps nothing: the game then starts anew each visit, and never fails for it. The camps' saves,
 * the history and the settings come with #60.
 */
export class IndexedDbStore implements ExpeditionStore {
  static readonly DATABASE = "everest";
  static readonly STORE = "expeditions";
  static readonly SLOT = "solo";
  /** The god mode's climb, beside the player's own, which it never touches (#245). */
  static readonly GOD = "god";
  private static readonly VERSION = 1;

  /** The climb in `slot`: the player's own, or the god mode's. */
  constructor(
    private readonly factory: IDBFactory | undefined,
    private readonly slot: string = IndexedDbStore.SLOT,
  ) {}

  async load(): Promise<ExpeditionSave | null> {
    try {
      const database = await this.open();
      const expeditions = database
        .transaction(IndexedDbStore.STORE, "readonly")
        .objectStore(IndexedDbStore.STORE);
      const found: unknown = await IndexedDbStore.done(expeditions.get(this.slot));
      database.close();
      return (found as ExpeditionSave | undefined) ?? null;
    } catch {
      return null;
    }
  }

  async store(save: ExpeditionSave): Promise<void> {
    try {
      const database = await this.open();
      const transaction = database.transaction(IndexedDbStore.STORE, "readwrite");
      transaction.objectStore(IndexedDbStore.STORE).put(save, this.slot);
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => {
          resolve();
        };
        transaction.onerror = () => {
          reject(transaction.error ?? new Error("The save failed"));
        };
        transaction.onabort = () => {
          reject(transaction.error ?? new Error("The save was abandoned"));
        };
      });
      database.close();
    } catch {
      // A browser that keeps nothing: the climb goes on, unsaved.
    }
  }

  private async open(): Promise<IDBDatabase> {
    if (this.factory === undefined) {
      throw new Error("This browser has no IndexedDB");
    }
    const request = this.factory.open(IndexedDbStore.DATABASE, IndexedDbStore.VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(IndexedDbStore.STORE);
    };
    return IndexedDbStore.done(request);
  }

  private static done<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        reject(request.error ?? new Error("IndexedDB refused"));
      };
    });
  }
}
