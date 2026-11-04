/** The device's storage, as far as a choice uses it: `localStorage`, or none. */
export interface ChoiceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** A level of a setting, as the device keeps it: by its name. */
export interface Named {
  readonly name: string;
}

/**
 * One of a setting's frozen levels, as this device plays on it: the one chosen last, kept in the
 * storage under the setting's key until the saves take the settings (#60), or the level it starts
 * on. Each setting is a subclass, with its key, its levels and where it starts.
 */
export abstract class KeptChoice<Level extends Named> {
  private current: Level;

  protected constructor(
    private readonly storage: ChoiceStorage | null,
    private readonly key: string,
    levels: readonly Level[],
    start: Level,
  ) {
    this.current = KeptChoice.read(storage, key, levels) ?? start;
  }

  get chosen(): Level {
    return this.current;
  }

  choose(level: Level): void {
    this.current = level;
    try {
      this.storage?.setItem(this.key, level.name);
    } catch {
      // A browser that keeps nothing, as Safari in private mode: the choice holds for the page.
    }
  }

  private static read<Level extends Named>(
    storage: ChoiceStorage | null,
    key: string,
    levels: readonly Level[],
  ): Level | undefined {
    try {
      const name = storage?.getItem(key);
      return levels.find((level) => level.name === name);
    } catch {
      return undefined;
    }
  }
}
