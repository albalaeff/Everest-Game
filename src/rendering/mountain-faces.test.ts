import { describe, expect, it } from "vitest";

import { MountainFaces } from "./mountain-faces";
import type { FacesOptions } from "./mountain-faces";

const options = (over: Partial<FacesOptions> = {}): FacesOptions => ({
  from: -100,
  to: 300,
  step: 4,
  massifs: [
    { name: "Pumori", summit: 0, halfWidth: 60, height: 20, shape: 0.9, bands: [0.5] },
    { name: "Lingtren", summit: 150, halfWidth: 50, height: 12, shape: 1.3, bands: [] },
  ],
  low: 2,
  high: 5,
  base: () => 0,
  seed: 7,
  ...over,
});

describe("MountainFaces", () => {
  it("runs from one end to the other, and rises over each massif to its summit", () => {
    const faces = new MountainFaces(options());
    const { outline } = faces;

    expect(outline[0]?.x).toBeLessThanOrEqual(-100);
    expect(outline.at(-1)?.x).toBeGreaterThanOrEqual(300);
    expect(faces.massifs(0)).toBe(20);
    expect(faces.massifs(150)).toBe(12);
    expect(faces.massifs(75)).toBeLessThan(5);
    expect(faces.massifs(-61)).toBe(0);
    expect(faces.top(0)).toBeGreaterThanOrEqual(22);
    expect(faces.top(0)).toBeLessThanOrEqual(25);
    const highest = Math.max(...outline.map(({ y }) => y));
    expect(outline.find(({ y }) => y === highest)?.x).toBeGreaterThan(-8);
    expect(outline.find(({ y }) => y === highest)?.x).toBeLessThan(8);
  });

  it("follows its base, so the faces stay over the ground at their depth", () => {
    const faces = new MountainFaces(options({ base: (x) => x / 10, massifs: [] }));

    for (const { x, y } of faces.outline) {
      expect(y - x / 10).toBeGreaterThanOrEqual(2 - 1e-9);
      expect(y - x / 10).toBeLessThanOrEqual(5 + 1e-9);
    }
  });

  it("runs flutings down each face from its skyline, splayed away from the summit", () => {
    const faces = new MountainFaces(options());

    expect(faces.flutings.length).toBeGreaterThan(20);
    for (const { top, foot } of faces.flutings) {
      expect(top.y).toBeCloseTo(faces.top(top.x), 6);
      expect(foot.y).toBeLessThan(top.y);
      expect(foot.y).toBeGreaterThanOrEqual(0);
      if (Math.abs(top.x) < 50) {
        expect(Math.sign(foot.x - top.x)).toBe(Math.sign(top.x));
      }
    }
  });

  it("lays a rock band across a massif at its share of the height, under the skyline", () => {
    const faces = new MountainFaces(options());
    const [band] = faces.bands;

    expect(faces.bands).toHaveLength(1);
    expect(band).toBeDefined();
    expect(band?.length).toBeGreaterThan(8);
    for (const { x, y } of band ?? []) {
      expect(y).toBeLessThan(faces.top(x));
      expect(y).toBeGreaterThan(0);
      expect(Math.abs(y - faces.massifs(x) * 0.5)).toBeLessThanOrEqual(0.5 + 1e-9);
    }
  });

  it("lights the crests: a band under the skyline where a massif stands high enough", () => {
    const faces = new MountainFaces(options());
    const crests = faces.crests(2, 0.6);

    expect(crests).toHaveLength(2);
    for (const [index, crest] of crests.entries()) {
      const massif = options().massifs[index];
      expect(crest.length).toBeGreaterThan(4);
      for (const { x, y } of crest) {
        expect(y).toBeLessThanOrEqual(faces.top(x) + 1e-9);
        expect(y).toBeGreaterThanOrEqual(faces.top(x) - 2 - 1e-9);
        expect(faces.massifs(x)).toBeGreaterThanOrEqual((massif?.height ?? 0) * 0.6);
      }
    }
    expect(faces.crests(2, 1.1)).toHaveLength(0);
  });

  it("is the same on the same seed, and another on another", () => {
    expect(new MountainFaces(options()).outline).toEqual(new MountainFaces(options()).outline);
    expect(new MountainFaces(options({ seed: 8 })).outline).not.toEqual(
      new MountainFaces(options()).outline,
    );
  });
});
