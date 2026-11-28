import { describe, expect, it } from "vitest";

import { Sharpness } from "./sharpness";

describe("how sharp the 3D picture is drawn", () => {
  it("fills a laptop's full-HD screen pixel for pixel on High", () => {
    expect(new Sharpness("high").ratio(1920, 1080, 1)).toBe(1);
  });

  it("draws a denser screen softer, to the same budget of pixels", () => {
    const ratio = new Sharpness("high").ratio(1280, 720, 3);
    expect(ratio).toBeLessThan(3);
    expect(1280 * 720 * ratio * ratio).toBeCloseTo(Sharpness.BUDGET.high, -2);
  });

  it("never draws more pixels than the screen has", () => {
    expect(new Sharpness("high").ratio(640, 360, 1)).toBe(1);
  });

  it("spends fewer pixels on Low than on Medium, and on Medium than on High", () => {
    const ratio = (quality: "low" | "medium" | "high"): number =>
      new Sharpness(quality).ratio(1920, 1080, 2);
    expect(ratio("low")).toBeLessThan(ratio("medium"));
    expect(ratio("medium")).toBeLessThan(ratio("high"));
  });

  it("holds its sharpness while the frames come on time", () => {
    const sharpness = new Sharpness("high");
    for (let frame = 0; frame < 600; frame += 1) {
      expect(sharpness.frame(1 / 60)).toBe(false);
    }
    expect(sharpness.ratio(1920, 1080, 1)).toBe(1);
  });

  it("shrugs off a long frame now and then", () => {
    const sharpness = new Sharpness("high");
    for (let frame = 0; frame < 600; frame += 1) {
      sharpness.frame(frame % 20 === 0 ? 1 / 20 : 1 / 60);
    }
    expect(sharpness.ratio(1920, 1080, 1)).toBe(1);
  });

  it("draws a step softer when frames run long, and softer again while they do, to a floor", () => {
    const sharpness = new Sharpness("high");
    let steps = 0;
    for (let frame = 0; frame < 40; frame += 1) {
      steps += sharpness.frame(1 / 30) ? 1 : 0;
    }
    expect(steps).toBe(1);
    expect(sharpness.ratio(1920, 1080, 1)).toBeCloseTo(0.9, 9);
    for (let frame = 0; frame < 4000; frame += 1) {
      sharpness.frame(1 / 30);
    }
    expect(sharpness.ratio(1920, 1080, 1)).toBeCloseTo(0.6, 9);
  });
});
