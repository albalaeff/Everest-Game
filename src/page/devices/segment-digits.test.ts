import { describe, expect, it } from "vitest";
import { SegmentDigits } from "./segment-digits";

/** How many bars a markup lights, and how many it draws faint. */
const lit = (markup: string): number => markup.match(/seg seg--lit/g)?.length ?? 0;
const all = (markup: string): number => markup.match(/<path /g)?.length ?? 0;

describe("SegmentDigits: a segment screen's figures (#284)", () => {
  it("lights the bars each figure has, and draws the rest of its cell faint", () => {
    const one = new SegmentDigits(1, 10);

    expect(lit(one.markup("8"))).toBe(7);
    expect(lit(one.markup("1"))).toBe(2);
    expect(lit(one.markup("0"))).toBe(6);
    expect(lit(one.markup("-"))).toBe(1);
    expect(lit(one.markup("−"))).toBe(1);
    // Seven bars and a decimal point to a cell, lit or not.
    expect(all(one.markup("1"))).toBe(8);
  });

  it("puts a number at the right of its cells, as a meter does, with nothing lit before it", () => {
    const three = new SegmentDigits(3, 10);
    const four = three.markup("4");

    expect(all(four)).toBe(24);
    expect(lit(four)).toBe(4);
    // The lit bars are the last cell's: none of the first two's.
    const firstTwo = four.split("<path ").slice(1, 17).join("");
    expect(lit(firstTwo)).toBe(0);
  });

  it("lights a decimal point after its figure without giving it a cell, and a minus its own", () => {
    const four = new SegmentDigits(4, 10);

    // The minus 1, the one 2, the nought 6, the point 1, the two 5.
    expect(lit(four.markup("−10.2"))).toBe(15);
    expect(all(four.markup("−10.2"))).toBe(32);
  });

  it("writes the letters of a weather meter's hints as its bars can", () => {
    const five = new SegmentDigits(5, 10);

    // S 5, P 5, d 5.
    expect(lit(five.markup("SPd"))).toBe(15);
    // c 3, h 4, i 1, L 3 and L 3.
    expect(lit(five.markup("chiLL"))).toBe(14);
  });

  it("refuses what its screen can't show: too many figures, or a letter it has no bars for", () => {
    const two = new SegmentDigits(2, 10);

    expect(() => two.markup("123")).toThrow(RangeError);
    expect(() => two.markup("X")).toThrow(RangeError);
    expect(() => new SegmentDigits(0, 10)).toThrow(RangeError);
  });

  it("draws an SVG as wide as its cells and as high as its figures, at the right of a wider screen, hidden from screen readers", () => {
    const digits = new SegmentDigits(3, 20);
    const svg = digits.svg("12");

    expect(svg).toMatch(
      /^<svg class="segments" viewBox="0 0 [\d.]+ 20" preserveAspectRatio="xMaxYMid meet" aria-hidden="true">/,
    );
    expect(digits.width).toBeGreaterThan(3 * 0.54 * 20);
    expect(digits.width).toBeLessThan(3 * 20);
  });
});
