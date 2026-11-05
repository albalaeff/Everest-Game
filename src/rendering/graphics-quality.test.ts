import { describe, expect, it } from "vitest";

import { GraphicsQuality, QualityChoice } from "./graphics-quality";

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
    expect(LOW.dithered).toBe(false);
    expect(HIGH.dithered).toBe(true);
  });

  it("keeps some spindrift at every level, since it tells the wind", () => {
    const { LOW, MEDIUM, HIGH } = GraphicsQuality;

    expect(LOW.motes).toBeGreaterThan(0);
    expect(MEDIUM.motes).toBeGreaterThan(LOW.motes);
    expect(HIGH.motes).toBeGreaterThan(MEDIUM.motes);
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
});

describe("QualityChoice", () => {
  it("starts on High on a PC, and on Medium on a phone", () => {
    expect(new QualityChoice(null, false).chosen).toBe(GraphicsQuality.HIGH);
    expect(new QualityChoice(null, true).chosen).toBe(GraphicsQuality.MEDIUM);
  });
});
