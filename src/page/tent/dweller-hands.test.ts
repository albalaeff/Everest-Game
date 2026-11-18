import { describe, expect, it } from "vitest";
import { DwellerHands } from "./dweller-hands";

describe("DwellerHands: the hands of the person in the tent (#264)", () => {
  it("draws an open hand with four fingers and a thumb, nails and knuckles, and a fist round what it holds", () => {
    const open = new DwellerHands("near").markup("open");
    const fist = new DwellerHands("near").markup("fist");

    expect(open.match(/class="dw-nail"/gu)).toHaveLength(5);
    expect(open).toContain('class="dw-tendons"');
    expect(open).toContain('class="dw-knuckles"');
    expect(fist).toContain('class="dw-creases"');
    expect(fist.match(/class="dw-nail"/gu)).toHaveLength(1);
  });

  it("shades the skin with a gradient of its own id, so each hand's can be told apart", () => {
    const hand = new DwellerHands("far").markup("open");

    expect(hand).toContain('id="far-open"');
    expect(hand).toContain("url(#far-open)");
    expect(hand).not.toContain("SKIN");
  });

  it("draws everything a hand holds in the tent, each to be shown by itself", () => {
    const held = DwellerHands.held();

    for (const thing of ["spoon", "bar", "lighter", "snow", "bottle", "pouch", "pick"]) {
      expect(held).toContain(`data-held="${thing}"`);
    }
    // A spoon's bowl, a bar's end and a bottle's mouth are beyond the hand, toward the lips.
    expect(DwellerHands.SPOON).toBeGreaterThan(0);
    expect(DwellerHands.BAR).toBeGreaterThan(0);
    expect(DwellerHands.BOTTLE_NECK).toBeGreaterThan(DwellerHands.BAR);
  });
});
