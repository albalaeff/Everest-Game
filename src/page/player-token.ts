import { Protocol } from "../room/messages";

/** The device's storage, as far as the token uses it: `localStorage`, or none. */
export interface TokenStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Who this browser is to a room, across reloads, lost connections and visits: a random token it
 * makes once and keeps on the device. The room gives the same token the same climber back. It
 * names nobody: no account, no name, nothing to guess a person from. A browser that keeps nothing
 * is somebody new each visit, and takes a free seat if there is one.
 */
export class PlayerToken {
  static readonly KEY = "everest.player";

  private constructor(readonly text: string) {}

  /** The token kept on the device, or a fresh one from `draw`, kept from now on. */
  static kept(storage: TokenStorage | null, draw: () => string): PlayerToken {
    const stored = PlayerToken.read(storage);
    if (stored !== null) {
      return new PlayerToken(stored);
    }
    const fresh = draw();
    if (!Protocol.isToken(fresh)) {
      throw new RangeError(`${fresh} isn't a token the room takes`);
    }
    try {
      storage?.setItem(PlayerToken.KEY, fresh);
    } catch {
      // A browser that keeps nothing: the token holds for the page.
    }
    return new PlayerToken(fresh);
  }

  private static read(storage: TokenStorage | null): string | null {
    try {
      const stored = storage?.getItem(PlayerToken.KEY) ?? null;
      return stored !== null && Protocol.isToken(stored) ? stored : null;
    } catch {
      return null;
    }
  }
}
