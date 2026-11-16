import { describe, expect, it } from "vitest";

import { Polyline } from "./polyline";
import { Ridgeline } from "./ridgeline";

describe("Ridgeline", () => {
  const through = Polyline.of(0, 500, 200, 300, 420, 360, 700, 120).points;
  const rough = { rough: 0.12, least: 14, seed: 7 };

  it("keeps every summit and saddle it was given where it is", () => {
    const ridge = new Ridgeline(through, rough);

    for (const point of through) {
      expect(ridge.points).toContainEqual(point);
    }
    expect(ridge.points[0]).toEqual(through[0]);
    expect(ridge.points.at(-1)).toEqual(through.at(-1));
  });

  it("breaks the stretches between them into a ridge's teeth", () => {
    const ridge = new Ridgeline(through, rough);
    const steps = ridge.points
      .slice(1)
      .map((point, index) => point.x - (ridge.points[index]?.x ?? 0));

    expect(ridge.points.length).toBeGreaterThan(40);
    expect(Math.min(...steps)).toBeGreaterThan(0);
    expect(Math.max(...steps)).toBeLessThan(rough.least * 1.5);
  });

  it("draws the same ridge for the same seed, and another for another", () => {
    expect(new Ridgeline(through, rough).points).toEqual(new Ridgeline(through, rough).points);
    expect(new Ridgeline(through, { ...rough, seed: 8 }).points).not.toEqual(
      new Ridgeline(through, rough).points,
    );
  });
});
