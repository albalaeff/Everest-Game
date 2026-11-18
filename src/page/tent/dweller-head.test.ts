import { describe, expect, it } from "vitest";
import { DwellerHead } from "./dweller-head";

/** The numbers of a path, in the order they're written. */
function numbers(text: string): number[] {
  return [...text.matchAll(/-?\d+(?:\.\d+)?/gu)].map(([found]) => Number(found));
}

/** The mean height of a path's points, down the screen. */
function height(path: string): number {
  const ys = numbers(path).filter((_, index) => index % 2 === 1);
  return ys.reduce((sum, y) => sum + y, 0) / ys.length;
}

describe("DwellerHead: the face of the person in the tent (#264)", () => {
  it("draws a face as real as the climber's on the slope: two eyes, brows, a nose, lips, an ear, stubble and a hat", () => {
    const head = new DwellerHead("face").markup();

    expect(head.match(/class="dw-eye"/gu)).toHaveLength(2);
    expect(head.match(/class="dw-white"/gu)).toHaveLength(2);
    expect(head.match(/class="dw-iris"/gu)).toHaveLength(2);
    expect(head.match(/class="dw-pupil"/gu)).toHaveLength(2);
    expect(head.match(/class="dw-glint"/gu)).toHaveLength(2);
    expect(head.match(/data-lid="/gu)).toHaveLength(2);
    expect(head.match(/class="dw-lash"/gu)).toHaveLength(2);
    expect(head.match(/class="dw-brow"/gu)).toHaveLength(2);
    for (const part of [
      "dw-nose-ridge",
      "dw-nostril",
      "dw-lip-upper",
      "dw-lip-lower",
      "dw-teeth",
      "dw-ear-rim",
      "dw-hair",
      "dw-hat-cuff",
      "dw-moustache",
      "dw-burn",
    ]) {
      expect(head).toContain(`class="${part}`);
    }
  });

  it("names its clips and shadings after its id, so two heads can be in one picture", () => {
    const awake = new DwellerHead("awake").markup();
    const asleep = new DwellerHead("asleep").markup(true);

    expect(awake).toContain('id="awake-eye0"');
    expect(awake).toContain("url(#awake-eye1)");
    expect(awake).not.toContain("asleep-");
    expect(asleep).toContain('id="asleep-face"');
    expect(asleep).not.toContain("awake-");
  });

  it("brings each lid down from the opening's upper edge to its lower one to shut the eye", () => {
    for (const index of [0, 1] as const) {
      const open = height(DwellerHead.lid(index, 1).edge);
      const half = height(DwellerHead.lid(index, 0.5).edge);
      const shut = height(DwellerHead.lid(index, 0).edge);

      expect(open).toBeLessThan(half);
      expect(half).toBeLessThan(shut);
      expect(DwellerHead.lid(index, 0.3).skin.startsWith(DwellerHead.lid(index, 0.3).edge)).toBe(
        true,
      );
    }
  });

  it("asleep, shuts the eyes and lets the mouth fall a little open", () => {
    const asleep = new DwellerHead("sleeper").markup(true);
    const awake = new DwellerHead("sleeper").markup();

    expect(asleep).toContain(`d="${DwellerHead.lid(0, 0).edge}"`);
    expect(awake).toContain(`d="${DwellerHead.lid(0, 1).edge}"`);
    expect(asleep).toContain("scale(1 0.18)");
    expect(awake).toContain("scale(1 0)");
  });
});
