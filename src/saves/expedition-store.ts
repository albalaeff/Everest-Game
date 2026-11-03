import type { ExpeditionSave } from "../simulation";

/** Where the browser keeps the solo expedition between visits (docs/conventions.md → Modules:
 * Saves): IndexedDB, or a test's memory. */
export interface ExpeditionStore {
  /** The expedition saved last, or null for none. */
  load(): Promise<ExpeditionSave | null>;
  store(save: ExpeditionSave): Promise<void>;
  clear(): Promise<void>;
}
