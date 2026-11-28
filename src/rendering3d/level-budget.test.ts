import { describe, expect, it } from "vitest";

import { FieldNoise } from "./field-noise";
import { GlacierGround } from "./glacier-ground";
import { GroundMaterial } from "./ground-material";
import { SceneLight } from "./scene-light";
import { SeracField } from "./serac-field";
import { IcefallForTests } from "./testing/icefall";

const { shape } = new IcefallForTests();

/**
 * What the level costs a graphics card. On the test laptop's built-in graphics (Intel UHD,
 * 1920×1080) a million triangles with the ground's shading drew in 6 ms (#311): the level stays
 * well under that, so a frame has the time left for the climbers, the shadows and the page.
 */
describe("the Icefall's meshes, against a laptop's budget", () => {
  const material = new GroundMaterial(new SceneLight(), {
    snow: null as never,
    ice: null as never,
    stone: null as never,
  });
  const ground = new GlacierGround(shape, material);
  const fine = new SeracField(shape, material, IcefallForTests.SEED, true);
  const coarse = new SeracField(shape, material, IcefallForTests.SEED, false);

  it("has under 600,000 triangles of ground and towers on High", () => {
    expect(ground.triangles + fine.triangles).toBeLessThan(600_000);
    expect(ground.triangles).toBeGreaterThan(200_000);
  });

  it("has fewer on Low: the same towers, cut coarser", () => {
    expect(coarse.count).toBe(fine.count);
    expect(coarse.triangles).toBeLessThan(fine.triangles * 0.7);
  });

  it("is cut into pieces up the valley, so only what's in view is drawn", () => {
    expect(ground.group.children.length).toBeGreaterThan(30);
    expect(fine.group.children.length).toBeGreaterThan(10);
  });
});

describe("the noise the level is shaped by", () => {
  it("is the same for the same seed, and another for another", () => {
    const one = new FieldNoise(7);
    const same = new FieldNoise(7);
    const other = new FieldNoise(8);
    expect(one.fractal(12.3, -4.5, 4)).toBe(same.fractal(12.3, -4.5, 4));
    expect(one.fractal(12.3, -4.5, 4)).not.toBe(other.fractal(12.3, -4.5, 4));
  });

  it("stays between 0 and 1, lumps and ridges alike", () => {
    const noise = new FieldNoise(311);
    for (let step = 0; step < 500; step += 1) {
      const x = step * 0.37 - 90;
      const z = step * 0.91 - 200;
      for (const value of [noise.at(x, z), noise.fractal(x, z, 4), noise.ridged(x, z, 4)]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it("finds each point its block, nearer its own middle than the next one's", () => {
    const noise = new FieldNoise(311);
    for (let step = 0; step < 200; step += 1) {
      const cell = noise.cell(step * 1.7, step * -2.3, 9);
      expect(cell.nearest).toBeLessThanOrEqual(cell.next);
      expect(Math.hypot(cell.towardX, cell.towardZ)).toBeCloseTo(cell.nearest, 9);
    }
  });
});
