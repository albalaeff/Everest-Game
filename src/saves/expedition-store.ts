import type { ExpeditionSave } from "../simulation";

/** Where the browser keeps the solo expedition between visits (docs/conventions.md → Modules:
 * Saves): IndexedDB, or a test's memory. */
export interface ExpeditionStore {
  /** The expedition saved last, or null for none. */
  load(): Promise<ExpeditionSave | null>;
  /** Keeps `save` in place of the one before: a climb started over overwrites the old. */
  store(save: ExpeditionSave): Promise<void>;
}
