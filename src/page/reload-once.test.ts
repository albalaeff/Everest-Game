import { describe, expect, it } from "vitest";

import { ReloadOnce } from "./reload-once";
import type { TabStorage } from "./reload-once";

class MemoryTab implements TabStorage {
  readonly kept = new Map<string, string>();

  getItem(key: string): string | null {
    return this.kept.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.kept.set(key, value);
  }

  removeItem(key: string): void {
    this.kept.delete(key);
  }
}

describe("ReloadOnce", () => {
  it("reloads the first time the room asks, and remembers it in the tab", () => {
    const tab = new MemoryTab();
    let reloads = 0;
    const guard = new ReloadOnce(tab, () => {
      reloads += 1;
    });

    expect(guard.attempt()).toBe(true);

    expect(reloads).toBe(1);
    expect(tab.getItem(ReloadOnce.KEY)).toBe("1");
  });

  it("doesn't reload a page that reloaded for this already, and lets the next time try again", () => {
    const tab = new MemoryTab();
    let reloads = 0;
    const afterTheReload = new ReloadOnce(tab, () => {
      reloads += 1;
    });
    tab.setItem(ReloadOnce.KEY, "1");

    expect(afterTheReload.attempt()).toBe(false);
    expect(reloads).toBe(0);
    expect(afterTheReload.attempt()).toBe(true);
    expect(reloads).toBe(1);
  });

  it("forgets the reload once the game is in, so a later one is the first again", () => {
    const tab = new MemoryTab();
    const guard = new ReloadOnce(tab, () => undefined);
    guard.attempt();

    guard.forget();

    expect(tab.getItem(ReloadOnce.KEY)).toBeNull();
    expect(guard.attempt()).toBe(true);
  });

  it("never reloads in a tab that refuses to keep the mark, which would reload it in a loop", () => {
    const refusing = new MemoryTab();
    refusing.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    let reloads = 0;
    const guard = new ReloadOnce(refusing, () => {
      reloads += 1;
    });

    expect(guard.attempt()).toBe(false);
    expect(reloads).toBe(0);
  });

  it("never reloads by itself in a tab that keeps nothing", () => {
    let reloads = 0;
    const guard = new ReloadOnce(null, () => {
      reloads += 1;
    });

    expect(guard.attempt()).toBe(false);
    expect(reloads).toBe(0);
  });
});
