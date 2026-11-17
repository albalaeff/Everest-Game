import { describe, expect, it } from "vitest";

import { Face } from "./face";
import { PictureRandom } from "./picture-random";
import { Polyline } from "./polyline";

describe("Face", () => {
  /** A face like a mountain's: a triangle, its top at 100 across and 0 down. */
  const face = new Face("peak", Polyline.of(0, 200, 100, 0, 200, 200));
  const lie = { angle: 90, spread: 5, lengths: [20, 40], widths: [3, 6] } as const;

  it("knows what's on it and what's in the sky beside it", () => {
    expect(face.contains({ x: 100, y: 100 })).toBe(true);
    expect(face.contains({ x: 20, y: 20 })).toBe(false);
    expect(face.path).toBe("M0 200L100 0L200 200Z");
  });

  it("has parts, which are on it and inside their own outline", () => {
    const foot = face.between(150, 200);
    const left = face.part("left", Polyline.of(0, 0, 100, 0, 100, 200, 0, 200));

    expect(foot.contains({ x: 100, y: 180 })).toBe(true);
    expect(foot.contains({ x: 100, y: 100 })).toBe(false);
    expect(left.contains({ x: 80, y: 150 })).toBe(true);
    expect(left.contains({ x: 120, y: 150 })).toBe(false);
    expect(left.contains({ x: 10, y: 10 })).toBe(false);
  });

  it("follows a bed of rock that dips to the left", () => {
    const bed = face.bed(100, 120, 0.1, 100);

    expect(bed.contains({ x: 100, y: 110 })).toBe(true);
    expect(bed.contains({ x: 60, y: 122 })).toBe(true);
    expect(bed.contains({ x: 140, y: 122 })).toBe(false);
  });

  it("leaves out what a face in front of it covers", () => {
    const front = new Face("front", Polyline.of(0, 200, 100, 100, 200, 200));
    const behind = face.without("behind", front);

    expect(behind.contains({ x: 100, y: 50 })).toBe(true);
    expect(behind.contains({ x: 100, y: 150 })).toBe(false);
    expect(behind.path).toBe(face.path);
  });

  it("scatters places on itself only, more of them near its top when asked", () => {
    const even = face.scatter(200, new PictureRandom(3));
    const high = face.scatter(200, new PictureRandom(3), 2);
    const mean = (points: readonly { y: number }[]): number =>
      points.reduce((sum, { y }) => sum + y, 0) / points.length;

    expect(even).toHaveLength(200);
    for (const point of [...even, ...high]) {
      expect(face.contains(point)).toBe(true);
    }
    expect(mean(high)).toBeLessThan(mean(even));
  });

  it("draws a rib from each place it's given, the same for the same seed", () => {
    const starts = Polyline.of(60, 100, 100, 40, 140, 100).points;
    const ribs = face.ribs(starts, lie, new PictureRandom(5));

    expect(ribs.match(/M/g)).toHaveLength(3);
    expect(ribs.match(/Z/g)).toHaveLength(3);
    expect(face.ribs(starts, lie, new PictureRandom(5))).toBe(ribs);
    expect(face.ribs(starts, lie, new PictureRandom(6))).not.toBe(ribs);
  });

  it("scatters ledges across itself", () => {
    const ledges = face.ledges(12, { ...lie, angle: 0 }, new PictureRandom(5));

    expect(ledges.match(/Z/g)).toHaveLength(12);
  });
});
