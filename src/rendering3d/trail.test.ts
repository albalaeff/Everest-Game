import { describe, expect, it } from "vitest";

import { Trail } from "./trail";

describe("the trail the route's line is bent into", () => {
  const trail = new Trail(280);

  it("carries a point of the physics' plane up the valley, at the height the physics gave it", () => {
    const spot = trail.place({ x: 120, y: 17.5 });
    expect(spot.y).toBe(17.5);
    expect(spot.z).toBe(-120);
    expect(spot.x).toBeCloseTo(trail.aside(120), 12);
  });

  it("lies straight at the camps, and winds between them", () => {
    expect(trail.aside(0)).toBe(0);
    expect(trail.aside(280)).toBeCloseTo(0, 12);
    const swings = Array.from({ length: 280 }, (_, x) => Math.abs(trail.aside(x)));
    expect(Math.max(...swings)).toBeGreaterThan(3);
  });

  it("never turns more than 25° off the valley's line", () => {
    for (let x = 0; x <= 280; x += 0.5) {
      expect(Math.abs(trail.drift(x))).toBeLessThan(Math.tan((25 * Math.PI) / 180));
    }
  });

  it("puts a point to the side to the climber's right going up", () => {
    const centre = trail.place({ x: 60, y: 0 });
    const right = trail.place({ x: 60, y: 0 }, 2);
    expect(right.x - centre.x).toBeCloseTo(2, 12);
    expect(right.z).toBe(centre.z);
  });

  it("heads up the valley where it runs straight, and to the side it drifts to", () => {
    expect(trail.heading(0)).toBeCloseTo(0, 2);
    const x = 100;
    const heading = trail.heading(x);
    // A camera turned by `heading` looks along (−sin, −cos): the trail's own way.
    expect(-Math.sin(heading) / Math.cos(heading)).toBeCloseTo(trail.drift(x), 6);
  });
});
