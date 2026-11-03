import { describe, expect, it } from "vitest";

import { PlayerToken } from "./player-token";
import type { TokenStorage } from "./player-token";

const DRAWN = "3f2b7c1e-9a4d-4e6f-8b1a-2c3d4e5f6a7b";

class MemoryDevice implements TokenStorage {
  readonly kept = new Map<string, string>();

  getItem(key: string): string | null {
    return this.kept.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.kept.set(key, value);
  }
}

/** A browser that refuses its storage, as Safari in private mode. */
class RefusingDevice implements TokenStorage {
  getItem(): string | null {
    throw new Error("SecurityError");
  }

  setItem(): void {
    throw new Error("SecurityError");
  }
}

describe("PlayerToken", () => {
  it("draws a token the first time, and keeps it on the device for the next", () => {
    const device = new MemoryDevice();

    const first = PlayerToken.kept(device, () => DRAWN);
    const next = PlayerToken.kept(device, () => "never-drawn-again");

    expect(first.text).toBe(DRAWN);
    expect(next.text).toBe(DRAWN);
    expect(device.getItem(PlayerToken.KEY)).toBe(DRAWN);
  });

  it("draws afresh over a kept token that isn't one, as an older build may have left", () => {
    const device = new MemoryDevice();
    device.setItem(PlayerToken.KEY, "x");

    expect(PlayerToken.kept(device, () => DRAWN).text).toBe(DRAWN);
  });

  it("holds for the page in a browser that keeps nothing", () => {
    expect(PlayerToken.kept(new RefusingDevice(), () => DRAWN).text).toBe(DRAWN);
    expect(PlayerToken.kept(null, () => DRAWN).text).toBe(DRAWN);
  });

  it("refuses a draw the room wouldn't take", () => {
    expect(() => PlayerToken.kept(null, () => "short")).toThrow(RangeError);
  });
});
