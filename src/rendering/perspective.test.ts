import { describe, expect, it } from "vitest";

import { Perspective } from "./perspective";
import { Zoom } from "./zoom";

describe("Perspective", () => {
  it("leaves every layer as it is at the standard view of 20 m", () => {
    for (const depth of [0.1, 0.25, 0.5]) {
      const perspective = new Perspective(depth);

      expect(perspective.share(Zoom.STANDARD.metresHigh)).toBeCloseTo(depth, 9);
      expect(perspective.scale(Zoom.STANDARD.metresHigh)).toBeCloseTo(1, 9);
    }
  });

  it("moves a far layer more of the slope's way as the camera pulls back, and a near one most", () => {
    expect(new Perspective(0.1).share(100)).toBeCloseTo(100 / 280, 9);
    expect(new Perspective(0.25).share(100)).toBeCloseTo(100 / 160, 9);
    expect(new Perspective(0.5).share(100)).toBeCloseTo(100 / 120, 9);
    expect(new Perspective(0.25).share(10)).toBeCloseTo(10 / 70, 9);
  });

  it("keeps a far range near its size on the screen while the slope shrinks to a fifth", () => {
    // The size on the screen is the scale against the standard view, over the metres shown.
    const onScreen = (depth: number, metresHigh: number): number =>
      new Perspective(depth).scale(metresHigh) / metresHigh;

    const far = onScreen(0.1, 100) / onScreen(0.1, 20);
    const peaks = onScreen(0.25, 100) / onScreen(0.25, 20);
    const seracs = onScreen(0.5, 100) / onScreen(0.5, 20);

    expect(far).toBeCloseTo(200 / 280, 9);
    expect(peaks).toBeCloseTo(0.5, 9);
    expect(seracs).toBeCloseTo(1 / 3, 9);
    expect(far).toBeGreaterThan(peaks);
    expect(peaks).toBeGreaterThan(seracs);
    expect(seracs).toBeGreaterThan(1 / 5);
  });

  it("grows a layer less than the slope as the camera comes closer", () => {
    const onScreen = (depth: number, metresHigh: number): number =>
      new Perspective(depth).scale(metresHigh) / metresHigh;

    expect(onScreen(0.1, 10) / onScreen(0.1, 20)).toBeCloseTo(200 / 190, 9);
    expect(onScreen(0.25, 10) / onScreen(0.25, 20)).toBeCloseTo(80 / 70, 9);
  });

  it("leaves the slope, what's in front of it and what stays on the screen as they are", () => {
    for (const depth of [0, 1, 1.5]) {
      for (const zoom of Zoom.LEVELS) {
        const perspective = new Perspective(depth);

        expect(perspective.share(zoom.metresHigh)).toBe(depth);
        expect(perspective.scale(zoom.metresHigh)).toBe(1);
      }
    }
  });
});
