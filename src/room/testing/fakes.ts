import type { ServerMessage, Step, Welcome } from "../messages";
import type { Socket } from "../room";
import type { Ticker } from "../room-host";
import type { KeyValueStorage } from "../room-storage";

/** A player's connection as a test sees it: what the room sent it, and how it closed. */
export class FakeSocket implements Socket {
  readonly sent: ServerMessage[] = [];
  closed: { code: number; reason: string } | null = null;

  send(text: string): void {
    this.sent.push(JSON.parse(text) as ServerMessage);
  }

  close(code: number, reason: string): void {
    this.closed = { code, reason };
  }

  get welcome(): Welcome {
    const found = this.sent.find((message): message is Welcome => message.type === "welcome");
    if (found === undefined) {
      throw new Error("The room sent no welcome");
    }
    return found;
  }

  get steps(): Step[] {
    return this.sent.filter((message): message is Step => message.type === "step");
  }
}

/** The object's storage as a map: what a test can read back. A write lands at once, or, held,
 * when the test lets it. */
export class MemoryStorage implements KeyValueStorage {
  readonly entries = new Map<string, unknown>();
  private held: (() => void)[] | null = null;

  get<T>(key: string): Promise<T | undefined> {
    return Promise.resolve(this.entries.get(key) as T | undefined);
  }

  list<T>({ prefix }: { readonly prefix: string }): Promise<Map<string, T>> {
    const found = [...this.entries]
      .filter(([key]) => key.startsWith(prefix))
      .sort(([first], [second]) => (first < second ? -1 : 1));
    return Promise.resolve(new Map(found as [string, T][]));
  }

  put<T>(entries: Record<string, T>): Promise<void> {
    const write = (): void => {
      for (const [key, value] of Object.entries(entries)) {
        this.entries.set(key, value);
      }
    };
    if (this.held === null) {
      write();
      return Promise.resolve();
    }
    const held = this.held;
    return new Promise((resolve) => {
      held.push(() => {
        write();
        resolve();
      });
    });
  }

  /** Holds the writes from now on, until `release`. */
  hold(): void {
    this.held = [];
  }

  /** Lets the held writes land, in the order they came. */
  release(): void {
    const held = this.held ?? [];
    this.held = null;
    for (const write of held) {
      write();
    }
  }
}

/** The object's clock as a test drives it: running or not, and the time it's told went by. */
export class FakeTicker implements Ticker {
  private tick: ((seconds: number) => void) | null = null;

  get running(): boolean {
    return this.tick !== null;
  }

  start(tick: (seconds: number) => void): void {
    this.tick ??= tick;
  }

  stop(): void {
    this.tick = null;
  }

  /** `seconds` go by, in one tick. */
  pass(seconds: number): void {
    this.tick?.(seconds);
  }
}
