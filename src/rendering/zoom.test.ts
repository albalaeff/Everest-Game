import { describe, expect, it } from "vitest";

import { Zoom, ZoomChoice } from "./zoom";

describe("Zoom", () => {
  it("has four levels, from 10 m of slope on the screen to 100", () => {
    expect(Zoom.LEVELS.map((level) => level.metresHigh)).toEqual([10, 20, 50, 100]);
    expect(Zoom.LEVELS.map((level) => level.name)).toEqual(["10", "20", "50", "100"]);
  });

  it("steps farther out and closer in, a level a press", () => {
    const { CLOSE, STANDARD, FAR, FARTHEST } = Zoom;

    expect(STANDARD.towards("farther")).toBe(FAR);
    expect(FAR.towards("farther")).toBe(FARTHEST);
    expect(FARTHEST.towards("closer")).toBe(FAR);
    expect(STANDARD.towards("closer")).toBe(CLOSE);
  });

  it("stops at each end", () => {
    expect(Zoom.FARTHEST.towards("farther")).toBe(Zoom.FARTHEST);
    expect(Zoom.CLOSE.towards("closer")).toBe(Zoom.CLOSE);
  });
});

describe("ZoomChoice", () => {
  it("starts on 20 m", () => {
    expect(new ZoomChoice(null).chosen).toBe(Zoom.STANDARD);
  });
});
