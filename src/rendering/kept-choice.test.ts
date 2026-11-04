import { describe, expect, it } from "vitest";

import { GraphicsQuality, QualityChoice } from "./graphics-quality";
import { Zoom, ZoomChoice } from "./zoom";

/** The device's storage, as far as a choice uses it. */
class FakeStorage {
  readonly items = new Map<string, string>();

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

/** Safari in private mode: the storage is there, and refuses to keep anything. */
class RefusingStorage extends FakeStorage {
  override setItem(): void {
    throw new DOMException("QuotaExceededError");
  }
}

describe("KeptChoice", () => {
  it("remembers the choice on the device", () => {
    const storage = new FakeStorage();
    const choice = new QualityChoice(storage, false);

    choice.choose(GraphicsQuality.LOW);

    expect(choice.chosen).toBe(GraphicsQuality.LOW);
    expect(storage.items.get(QualityChoice.KEY)).toBe("low");
    expect(new QualityChoice(storage, false).chosen).toBe(GraphicsQuality.LOW);
  });

  it("keeps each choice apart: the view doesn't change the graphics", () => {
    const storage = new FakeStorage();

    new ZoomChoice(storage).choose(Zoom.FARTHEST);
    new QualityChoice(storage, false).choose(GraphicsQuality.LOW);

    expect(storage.items.get(ZoomChoice.KEY)).toBe("100");
    expect(new ZoomChoice(storage).chosen).toBe(Zoom.FARTHEST);
    expect(new QualityChoice(storage, false).chosen).toBe(GraphicsQuality.LOW);
  });

  it("ignores a stored choice it doesn't know", () => {
    const storage = new FakeStorage();
    storage.setItem(QualityChoice.KEY, "ultra");
    storage.setItem(ZoomChoice.KEY, "30");

    expect(new QualityChoice(storage, false).chosen).toBe(GraphicsQuality.HIGH);
    expect(new ZoomChoice(storage).chosen).toBe(Zoom.STANDARD);
  });

  it("works without storage, and goes on when the storage refuses", () => {
    const without = new QualityChoice(null, true);
    const refused = new ZoomChoice(new RefusingStorage());

    without.choose(GraphicsQuality.LOW);
    refused.choose(Zoom.CLOSE);

    expect(without.chosen).toBe(GraphicsQuality.LOW);
    expect(refused.chosen).toBe(Zoom.CLOSE);
  });
});
