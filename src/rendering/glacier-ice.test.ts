import { describe, expect, it } from "vitest";

import { Terrain } from "../physics";
import { GlacierIce } from "./glacier-ice";
import type { GlacierBand, IceStrip } from "./glacier-ice";
import { IceBody } from "./ice-body";
import { IceSurface } from "./ice-surface";

/** Snowy ground, then bare blue ice from 8 to 14 m across, snow again, a wall 3 m up at 20 m, and
 * snowy ground on its top. */
const TERRAIN = new Terrain([
  [0, 0],
  [20, 0],
  [20, 3],
  [40, 3],
]);
const SURFACE = new IceSurface(TERRAIN, []);
const BODY = new IceBody(SURFACE, 3);
const BARE = [{ left: 8, right: 14 }];
const REACH = { left: 0, right: 40 };
const GLACIER = new GlacierIce(SURFACE, BODY, BARE, REACH, 5);
const [NEAR, DEEP] = GlacierIce.BANDS as [GlacierBand, GlacierBand];

/** A pixel of a strip at `x` across and `depth` under the surface: red, green, blue and alpha. */
function pixel(strip: IceStrip, x: number, depth: number): [number, number, number, number] {
  const { fine } = strip.band;
  const column = Math.floor((x - strip.left) * fine);
  const row = Math.floor((depth - strip.band.from) * fine);
  const byte = (row * strip.columns + column) * 4;
  const { pixels } = strip;
  return [pixels[byte] ?? 0, pixels[byte + 1] ?? 0, pixels[byte + 2] ?? 0, pixels[byte + 3] ?? 0];
}

/** How bright a pixel is, 0 to 255. */
function brightness([red, green, blue]: readonly number[]): number {
  return ((red ?? 0) + (green ?? 0) + (blue ?? 0)) / 3;
}

/** The average of a strip's pixels at `depth`, from `left` to `right` across. */
function average(strip: IceStrip, left: number, right: number, depth: number): number[] {
  const sums = [0, 0, 0];
  let count = 0;
  for (let x = left; x < right; x += 1 / strip.band.fine) {
    const [red, green, blue] = pixel(strip, x, depth);
    sums[0] = (sums[0] ?? 0) + red;
    sums[1] = (sums[1] ?? 0) + green;
    sums[2] = (sums[2] ?? 0) + blue;
    count += 1;
  }
  return sums.map((sum) => sum / count);
}

describe("GlacierIce", () => {
  const near = GLACIER.strip(0, 40, NEAR);
  const deep = GLACIER.strip(0, 40, DEEP);

  it("is snow under a snowy surface, firn under the snow and ice under the firn, the ice bluer", () => {
    const x = 3.4;
    const { snow, firn } = GLACIER.column(x);
    const inSnow = pixel(near, x, snow / 2);
    const inFirn = pixel(near, x, (snow + firn) / 2);
    const inIce = average(near, x - 0.5, x + 0.5, firn + 0.6);

    expect(snow).toBeGreaterThanOrEqual(IceBody.CAP.min);
    expect(firn).toBeGreaterThan(snow);
    expect(Math.min(...inSnow.slice(0, 3))).toBeGreaterThan(225);
    expect(brightness(inFirn)).toBeLessThan(brightness(inSnow));
    const [red = 0, , blue = 0] = inIce;
    expect(blue - red).toBeGreaterThan(30);
  });

  it("is clear blue ice up to the surface on the route's blue ice: no snow, and bluer than the snow", () => {
    const { snow, firn, bare } = GLACIER.column(11);
    const onIce = average(near, 10, 12, 0.25);
    const onSnow = average(near, 2, 4, 0.25);

    expect(bare).toBe(1);
    expect(snow).toBe(0);
    expect(firn).toBe(0);
    expect((onIce[2] ?? 0) - (onIce[0] ?? 0)).toBeGreaterThan(60);
    expect(onIce[0] ?? 0).toBeLessThan((onSnow[0] ?? 0) - 60);
  });

  it("runs the snow out onto the blue ice at its ends, rather than stopping it dead", () => {
    const capped = [7.6, 7.9, 8.1, 8.4].map((x) => GLACIER.column(x).snow);

    for (const [index, cap] of capped.entries()) {
      expect(cap).toBeLessThanOrEqual(capped[index - 1] ?? Infinity);
    }
    expect(capped[0] ?? 0).toBeGreaterThan(0);
    expect(capped.at(-1)).toBe(0);
  });

  it("darkens as it goes down, as the light through the ice fades, near white to navy", () => {
    const at = (depth: number): number => brightness(average(deep, 24, 36, depth));

    expect(at(4)).toBeGreaterThan(at(8));
    expect(at(8)).toBeGreaterThan(at(14));
    expect(GlacierIce.light(0)).toBe(1);
    expect(GlacierIce.light(10)).toBeLessThan(0.3);
  });

  it("fades out at each band's foot into what's under it, and is solid above", () => {
    expect(pixel(near, 4, 1)[3]).toBe(255);
    expect(pixel(near, 4, NEAR.to - 0.01)[3]).toBeLessThan(20);
    expect(pixel(deep, 4, 6)[3]).toBe(255);
    expect(pixel(deep, 4, DEEP.to - 0.05)[3]).toBeLessThan(20);
  });

  it("fades out over its last few tens of metres, past the section's end, into the flat glacier", () => {
    const solidity = [5, REACH.right - GlacierIce.FADE_OUT / 2, REACH.right - 0.05].map(
      (x) => pixel(deep, x, 6)[3],
    );

    expect(solidity[0]).toBe(255);
    expect(solidity[1]).toBeLessThan(200);
    expect(solidity[1]).toBeGreaterThan(50);
    expect(solidity[2]).toBeLessThan(5);
  });

  it("is the same wherever a strip of it starts, so the strips meet with no seam", () => {
    const whole = GLACIER.strip(0, 40, NEAR);
    const part = GLACIER.strip(25, 40, NEAR);

    for (const x of [26.01, 30.3, 37.77]) {
      for (const depth of [0.1, 0.9, 2.2]) {
        expect(pixel(part, x, depth)).toEqual(pixel(whole, x, depth));
      }
    }
  });

  it("lays its layers along each block of the glacier, breaking off where a wall parts two", () => {
    const step = (from: number, to: number): number =>
      Math.abs(
        GLACIER.column(to).run + GLACIER.top(to) - GLACIER.column(from).run - GLACIER.top(from),
      );

    // Within a block a layer runs on smoothly; across the wall it starts somewhere else.
    expect(step(29.9, 30.1)).toBeLessThan(0.05);
    expect(GLACIER.blockAt(19.9)).not.toBe(GLACIER.blockAt(20.1));
  });

  it("hangs each strip from the surface: its top on the ground, its foot the band's depth under it, a wall's two corners at one x", () => {
    const strip = GLACIER.strip(15, 25, NEAR);
    const { vertices, uvs, indices } = GLACIER.hang(strip);
    const corners = vertices.length / 4;
    const tops = Array.from({ length: corners }, (_, index) => ({
      x: vertices[index * 4] ?? 0,
      y: vertices[index * 4 + 1] ?? 0,
      footY: vertices[index * 4 + 3] ?? 0,
      across: uvs[index * 4] ?? 0,
    }));

    expect(tops.map(({ x }) => x)).toEqual([15, 20, 20, strip.right]);
    expect(tops.map(({ y }) => y)).toEqual([0, 0, 3, 3]);
    for (const { y, footY } of tops) {
      expect(y - footY).toBeCloseTo(NEAR.to - NEAR.from, 6);
    }
    for (const [index, share] of [0, 0.5, 0.5, 1].entries()) {
      expect(tops[index]?.across).toBeCloseTo(share, 2);
    }
    expect(indices.length).toBe((corners - 1) * 6);
  });

  it("hollows the bare ice's top into sun cups, a few centimetres deep, its sheen following them", () => {
    const [sheen = []] = GLACIER.sheen();
    const hollows = sheen.map(({ x, y }) => TERRAIN.height(x) - y);
    const shines = GLACIER.shines();

    expect(Math.min(...hollows)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...hollows)).toBeGreaterThan(0.01);
    expect(Math.max(...hollows)).toBeLessThan(0.05);
    expect(shines.length).toBeGreaterThan(5);
    for (const { x, y } of shines) {
      expect(x).toBeGreaterThan(BARE[0]?.left ?? 0);
      expect(x).toBeLessThan(BARE[0]?.right ?? 0);
      expect(y).toBeCloseTo(TERRAIN.height(x), 6);
    }
  });

  it("is worked out in strips small enough for a frame, which cover its reach band by band", () => {
    const pieces = GLACIER.pieces();

    for (const band of GlacierIce.BANDS) {
      const ofBand = pieces.filter((piece) => piece.band === band);
      expect(ofBand[0]?.left).toBe(REACH.left);
      expect(ofBand.at(-1)?.right).toBe(REACH.right);
      for (const [index, piece] of ofBand.entries()) {
        const columns = Math.round((piece.right - piece.left) * band.fine);
        const rows = Math.round((band.to - band.from) * band.fine);
        expect(columns * rows).toBeLessThanOrEqual(GlacierIce.MOST_PIXELS);
        expect(piece.left).toBe(ofBand[index - 1]?.right ?? REACH.left);
      }
    }
  });
});
