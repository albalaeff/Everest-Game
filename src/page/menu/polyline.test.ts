import { describe, expect, it } from "vitest";

import { PictureRandom } from "./picture-random";
import { Polyline } from "./polyline";

describe("Polyline", () => {
  const line = Polyline.of(0, 0, 30, 40, 30, 100);

  it("reads its points from the picture's numbers, x then y", () => {
    expect(line.points).toEqual([
      { x: 0, y: 0 },
      { x: 30, y: 40 },
      { x: 30, y: 100 },
    ]);
  });

  it("writes itself as path data to a tenth of a pixel, closed when asked", () => {
    expect(Polyline.of(0.04, 1.26, 10, 20).path()).toBe("M0 1.3L10 20");
    expect(line.path(true)).toBe("M0 0L30 40L30 100Z");
  });

  it("says how far along it each of its points is", () => {
    expect(line.length).toBe(110);
    expect(line.shares()).toEqual([0, 50 / 110, 1]);
    expect(line.at(25)).toEqual({ x: 15, y: 20 });
    expect(line.at(80)).toEqual({ x: 30, y: 70 });
  });

  it("joins other lines on, a point that repeats its last left out", () => {
    const joined = line.joined(Polyline.of(30, 100, 60, 100), Polyline.of(90, 90));

    expect(joined.points).toHaveLength(5);
    expect(joined.points.at(-1)).toEqual({ x: 90, y: 90 });
  });

  it("draws a smooth line through every one of its points", () => {
    const smooth = line.smooth();

    expect(smooth.startsWith("M0 0C")).toBe(true);
    expect(smooth).toContain(" 30 40C");
    expect(smooth.endsWith(" 30 100")).toBe(true);
  });

  it("finds places along it about a step apart, the same for the same seed", () => {
    const places = line.along(10, new PictureRandom(4));

    expect(places.length).toBeGreaterThan(7);
    expect(places.length).toBeLessThan(16);
    expect(line.along(10, new PictureRandom(4))).toEqual(places);
  });

  it("lowers and reverses without changing itself", () => {
    expect(line.lowered(5).points[0]).toEqual({ x: 0, y: 5 });
    expect(line.reversed().points[0]).toEqual({ x: 30, y: 100 });
    expect(line.points[0]).toEqual({ x: 0, y: 0 });
  });
});
