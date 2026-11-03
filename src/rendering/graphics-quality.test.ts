import { describe, expect, it } from "vitest";

import { GraphicsQuality, QualityChoice } from "./graphics-quality";

/** The device's storage, as far as the choice uses it. */
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

describe("GraphicsQuality", () => {
  it("has three levels, each with more of the picture than the one below", () => {
    const { LOW, MEDIUM, HIGH } = GraphicsQuality;

    expect(GraphicsQuality.LEVELS.map((level) => level.name)).toEqual(["low", "medium", "high"]);
    expect(LOW.flakes).toBe(0);
    expect(MEDIUM.flakes).toBeGreaterThan(0);
    expect(HIGH.flakes).toBeGreaterThan(MEDIUM.flakes);
    expect(LOW.layers).toEqual({ farRanges: false, nearRidge: false, foreground: false });
    expect(MEDIUM.layers).toEqual({ farRanges: false, nearRidge: false, foreground: true });
    expect(HIGH.layers).toEqual({ farRanges: true, nearRidge: true, foreground: true });
  });

  it("steps through the levels, and round again", () => {
    const { LOW, MEDIUM, HIGH } = GraphicsQuality;

    expect(LOW.next).toBe(MEDIUM);
    expect(MEDIUM.next).toBe(HIGH);
    expect(HIGH.next).toBe(LOW);
  });

  it("caps the sharpness: 1× on Low, 1.5× on Medium, the screen's own on High", () => {
    const { LOW, MEDIUM, HIGH } = GraphicsQuality;

    expect(LOW.resolution(3)).toBe(1);
    expect(MEDIUM.resolution(3)).toBe(1.5);
    expect(MEDIUM.resolution(1)).toBe(1);
    expect(HIGH.resolution(3)).toBe(3);
  });

  it("is found by its name", () => {
    expect(GraphicsQuality.named("medium")).toBe(GraphicsQuality.MEDIUM);
    expect(GraphicsQuality.named("ultra")).toBeUndefined();
  });
});

describe("QualityChoice", () => {
  it("starts on High on a PC, and on Medium on a phone", () => {
    expect(new QualityChoice(new FakeStorage(), false).quality).toBe(GraphicsQuality.HIGH);
    expect(new QualityChoice(new FakeStorage(), true).quality).toBe(GraphicsQuality.MEDIUM);
  });

  it("remembers the choice on the device", () => {
    const storage = new FakeStorage();
    const choice = new QualityChoice(storage, false);

    choice.choose(GraphicsQuality.LOW);

    expect(choice.quality).toBe(GraphicsQuality.LOW);
    expect(storage.items.get(QualityChoice.KEY)).toBe("low");
    expect(new QualityChoice(storage, false).quality).toBe(GraphicsQuality.LOW);
  });

  it("ignores a stored choice it doesn't know", () => {
    const storage = new FakeStorage();
    storage.setItem(QualityChoice.KEY, "ultra");

    expect(new QualityChoice(storage, false).quality).toBe(GraphicsQuality.HIGH);
  });

  it("works without storage, and goes on when the storage refuses", () => {
    const without = new QualityChoice(null, true);
    const refused = new QualityChoice(new RefusingStorage(), false);

    without.choose(GraphicsQuality.LOW);
    refused.choose(GraphicsQuality.MEDIUM);

    expect(without.quality).toBe(GraphicsQuality.LOW);
    expect(refused.quality).toBe(GraphicsQuality.MEDIUM);
  });
});
