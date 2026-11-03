/** The tab's storage, as far as the guard uses it: `sessionStorage`, or none. */
export interface TabStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * The reload a room asks of an old game, once: the new build is usually published already, and
 * the reload gets it. A page that reloaded and is still old is waiting for the publish to finish,
 * and says so rather than reloading in a loop; the next time the room asks, it may reload again.
 * A tab whose storage is refused never reloads by itself: a loop would be worse than a message.
 */
export class ReloadOnce {
  static readonly KEY = "everest.reloaded";

  constructor(
    private readonly storage: TabStorage | null,
    private readonly reload: () => void,
  ) {}

  /** Reloads and says so, or false when the page has reloaded for this already. */
  attempt(): boolean {
    if (this.storage === null || this.read() !== null) {
      this.forget();
      return false;
    }
    this.storage.setItem(ReloadOnce.KEY, "1");
    this.reload();
    return true;
  }

  /** The game is in a room: whatever reload came before is over. */
  forget(): void {
    try {
      this.storage?.removeItem(ReloadOnce.KEY);
    } catch {
      // A tab that keeps nothing has nothing to forget.
    }
  }

  private read(): string | null {
    try {
      return this.storage?.getItem(ReloadOnce.KEY) ?? null;
    } catch {
      return null;
    }
  }
}
