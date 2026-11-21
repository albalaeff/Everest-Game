import { describe, expect, it } from "vitest";

import { SeededRandom } from "../simulation";
import { IceRelief } from "./ice-relief";
import type { ReliefBox, ReliefPlace } from "./ice-relief";

/** A face 6 m high, its edge at x 10 and its ice to the right, 1.5 m of it showing; the box has
 * half a metre of air to its left. */
const BOX: ReliefBox = { left: 9.5, top: 6, width: 2.5, height: 6 };
const upright = (x: number, y: number): ReliefPlace | null =>
  y > 6 || y < 0 ? null : { across: x - 10, deep: 1.5, down: 6 - y, lean: 0, up: y, bank: 0 };
/** The same face, leaning out 0.3 m in a bulge over its top 0.8 m, round under its nose. */
const bulging = (x: number, y: number): ReliefPlace | null => {
  const into = Math.min(Math.max((y - 5.2) / 0.4, 0), 1);
  const lean = 0.3 * into * into * (3 - 2 * into);
  return y > 6 || y < 0
    ? null
    : { across: x - 10 + lean, deep: 1.5 + lean, down: 6 - y, lean, up: y, bank: 0 };
};
/** The same face, with snow banked half a metre up its foot. */
const banked = (x: number, y: number): ReliefPlace | null => {
  const at = upright(x, y);
  return at === null ? null : { ...at, bank: 0.5 };
};
const relief = (seed: number, place = upright): IceRelief =>
  new IceRelief(BOX, place, SeededRandom.fromSeed(seed));
/** A bare, fluted wall: seed 9 draws little snow. */
const RELIEF = relief(9);

/** A pixel of a relief's ice at a point of the box: its colour's channels and how solid it is. */
const pixel = (
  { ice, columns }: IceRelief,
  x: number,
  y: number,
): { red: number; green: number; blue: number; solid: number } => {
  const column = Math.floor((x - BOX.left) * IceRelief.PIXELS_A_METRE);
  const row = Math.floor((BOX.top - y) * IceRelief.PIXELS_A_METRE);
  const byte = (row * columns + column) * 4;
  return {
    red: ice[byte] ?? 0,
    green: ice[byte + 1] ?? 0,
    blue: ice[byte + 2] ?? 0,
    solid: (ice[byte + 3] ?? 0) / 255,
  };
};

/** The solid pixels of a relief, each one's brightness and blueness. */
const solid = ({ ice }: IceRelief): { bright: number; blueness: number }[] => {
  const pixels: { bright: number; blueness: number }[] = [];
  for (let byte = 0; byte < ice.length; byte += 4) {
    if ((ice[byte + 3] ?? 0) > 200) {
      const [red, green, blue] = [ice[byte] ?? 0, ice[byte + 1] ?? 0, ice[byte + 2] ?? 0];
      pixels.push({ bright: (red + green + blue) / 3, blueness: blue - red });
    }
  }
  return pixels;
};

describe("IceRelief", () => {
  it("draws the face as fine as its pixels a metre, every pixel of its box", () => {
    expect(RELIEF.columns).toBe(2.5 * IceRelief.PIXELS_A_METRE);
    expect(RELIEF.rows).toBe(6 * IceRelief.PIXELS_A_METRE);
    expect(RELIEF.ice).toHaveLength(RELIEF.columns * RELIEF.rows * 4);
    expect(RELIEF.gloss).toHaveLength(RELIEF.ice.length);
  });

  it("is solid along the face's edge, clear out over the drop, and fades out where the face goes back into the glacier", () => {
    for (let y = 0.25; y < 6; y += 0.5) {
      expect(pixel(RELIEF, 10.2, y).solid).toBeGreaterThan(0.98);
      expect(pixel(RELIEF, 10 - IceRelief.PROUD - 0.06, y).solid).toBe(0);
      expect(pixel(RELIEF, 11.47, y).solid).toBeLessThan(0.25);
      expect(pixel(RELIEF, 11.9, y).solid).toBe(0);
    }
    // Half way across, it's neither whole nor gone everywhere: the line is ragged.
    const halfway = Array.from(
      { length: 24 },
      (_, step) => pixel(RELIEF, 10.95, 0.125 + step * 0.25).solid,
    );
    expect(Math.max(...halfway) - Math.min(...halfway)).toBeGreaterThan(0.1);
  });

  it("stands its lumps out past the face's edge here and there, so the wall's outline is uneven", () => {
    const proud = Array.from(
      { length: 6 * IceRelief.PIXELS_A_METRE },
      (_, row) => pixel(RELIEF, 10 - 0.03, 6 - (row + 0.5) / IceRelief.PIXELS_A_METRE).solid > 0,
    );
    expect(proud.some((out) => out)).toBe(true);
    expect(proud.some((out) => !out)).toBe(true);
  });

  it("lights the ice from above and the open side: near white where the light falls, blue in its hollows and under its tiers", () => {
    const pixels = solid(RELIEF);
    const bright = pixels.filter(({ bright: value }) => value > 225);
    const dark = pixels.filter(({ bright: value }) => value < 150);
    expect(bright.length).toBeGreaterThan(pixels.length * 0.03);
    expect(dark.length).toBeGreaterThan(pixels.length * 0.03);
    const mean = (some: readonly { blueness: number }[]): number =>
      some.reduce((sum, { blueness }) => sum + blueness, 0) / some.length;
    expect(mean(dark)).toBeGreaterThan(40);
    expect(mean(dark)).toBeGreaterThan(mean(bright) + 25);
  });

  it("throws the light back in highlights, kept apart for the night's sky and a lamp, only on its ice", () => {
    const { gloss, ice } = RELIEF;
    let shining = 0;
    for (let byte = 0; byte < gloss.length; byte += 4) {
      const strength = gloss[byte + 3] ?? 0;
      if (strength > 0) {
        expect(ice[byte + 3]).toBeGreaterThan(0);
        expect([gloss[byte], gloss[byte + 1], gloss[byte + 2]]).toEqual([255, 255, 255]);
      }
      if (strength > 120) {
        shining += 1;
      }
    }
    expect(shining).toBeGreaterThan(1000);
    expect(RELIEF.shines.length).toBeGreaterThan(5);
    for (const { x, y } of RELIEF.shines) {
      expect(pixel(RELIEF, x, y).solid).toBeGreaterThan(0.5);
    }
  });

  it("is a different wall on each seed: some bare, some fluted, some pitted, some under snow, grey or aqua", () => {
    const reliefs = Array.from({ length: 30 }, (_, seed) => relief(seed + 1));
    const characters = reliefs.map(({ character }) => character);
    const snowy = reliefs.filter(({ character }) => character.snow > 0.5);
    const bare = reliefs.filter(({ character }) => character.snow < 0.15);
    expect(snowy.length).toBeGreaterThan(3);
    expect(bare.length).toBeGreaterThan(8);
    for (const key of ["fluting", "aqua", "pitted"] as const) {
      const values = characters.map((character) => character[key]);
      expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.4);
    }
    // Snow is white and dull: a snowy wall has far more near-white on it than a bare one.
    const white = (one: IceRelief): number => {
      const pixels = solid(one);
      return (
        pixels.filter(({ bright, blueness }) => bright > 215 && blueness < 30).length /
        pixels.length
      );
    };
    const mean = (some: readonly IceRelief[]): number =>
      some.reduce((sum, one) => sum + white(one), 0) / some.length;
    expect(mean(snowy)).toBeGreaterThan(mean(bare) * 2);
    expect(mean(snowy)).toBeGreaterThan(0.35);
  });

  it("shades the underside of a bulge that leans out under the lip", () => {
    const mean = (one: IceRelief, from: number, to: number): number => {
      let sum = 0;
      let count = 0;
      for (let y = from; y < to; y += 1 / IceRelief.PIXELS_A_METRE) {
        for (let x = 10.05; x < 10.5; x += 1 / IceRelief.PIXELS_A_METRE) {
          const { red, green, blue, solid: alpha } = pixel(one, x, y);
          if (alpha > 0.9) {
            sum += (red + green + blue) / 3;
            count += 1;
          }
        }
      }
      return sum / count;
    };
    // Under the bulge's nose, where it comes back into the face, the same wall is darker with
    // it than without.
    const seeds = [3, 5, 8, 13, 21];
    const under = (place: typeof upright): number =>
      seeds.reduce((sum, seed) => sum + mean(relief(seed, place), 5.22, 5.4), 0) / seeds.length;
    expect(under(bulging)).toBeLessThan(under(upright) - 12);
    // And the bulge stands out over the drop.
    expect(pixel(relief(3, bulging), 9.85, 5.6).solid).toBeGreaterThan(0.9);
    expect(pixel(relief(3, upright), 9.85, 5.6).solid).toBe(0);
  });

  it("banks snow against the foot of the face, highest at its edge", () => {
    const white = (one: IceRelief, x: number, y: number): boolean => {
      const { red, blue, solid: alpha } = pixel(one, x, y);
      return alpha > 0.9 && red > 185 && blue - red < 45;
    };
    const share = (one: IceRelief, y: number): number => {
      const across = Array.from({ length: 20 }, (_, step) => white(one, 10.02 + step * 0.03, y));
      return across.filter(Boolean).length / across.length;
    };
    const seeds = [2, 4, 6, 9, 12];
    const mean = (place: typeof upright, y: number): number =>
      seeds.reduce((sum, seed) => sum + share(relief(seed, place), y), 0) / seeds.length;
    expect(mean(banked, 0.12)).toBeGreaterThan(0.8);
    expect(mean(banked, 0.12)).toBeGreaterThan(mean(upright, 0.12) + 0.3);
    // No higher than it's banked, but for the patches any wall has.
    expect(mean(banked, 1.5)).toBeLessThan(mean(banked, 0.12) - 0.3);
  });

  it("is the same relief on the same seed", () => {
    expect(relief(9)).toEqual(RELIEF);
    expect(relief(8).ice).not.toEqual(RELIEF.ice);
  });
});
