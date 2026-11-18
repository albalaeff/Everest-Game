import { describe, expect, it } from "vitest";
import { DwellerHead } from "./dweller-head";
import type { Features } from "./dweller-head";

const head = new DwellerHead("face");

/** The numbers of a path, in the order they're written. */
function numbers(text: string): number[] {
  return [...text.matchAll(/-?\d+(?:\.\d+)?/gu)].map(([found]) => Number(found));
}

/** The mean of a path's points, across and down. */
function middle(path: string): { x: number; y: number } {
  const all = numbers(path);
  const xs = all.filter((_, index) => index % 2 === 0);
  const ys = all.filter((_, index) => index % 2 === 1);
  return {
    x: xs.reduce((sum, x) => sum + x, 0) / xs.length,
    y: ys.reduce((sum, y) => sum + y, 0) / ys.length,
  };
}

/** How far across a path's points spread. */
function width(path: string): number {
  const xs = numbers(path).filter((_, index) => index % 2 === 0);
  return Math.max(...xs) - Math.min(...xs);
}

/** The `d` of the first element of `kind` in a head's markup. */
function shape(markup: string, kind: string, nth = 0): string {
  const found = [...markup.matchAll(new RegExp(`class="${kind}"[^>]* d="([^"]+)"`, "gu"))];
  return found[nth]?.[1] ?? "";
}

describe("DwellerHead: the face of the person in the tent (#264)", () => {
  it("draws a face as real as the climber's on the slope: two eyes, brows, a nose, lips, an ear, stubble, the hair and a hat", () => {
    const markup = head.markup();

    expect(markup.match(/class="dw-eye"/gu)).toHaveLength(2);
    expect(markup.match(/class="dw-white"/gu)).toHaveLength(2);
    expect(markup.match(/class="dw-iris"/gu)).toHaveLength(2);
    expect(markup.match(/class="dw-pupil"/gu)).toHaveLength(2);
    expect(markup.match(/class="dw-glint"/gu)).toHaveLength(2);
    expect(markup.match(/data-lid="/gu)).toHaveLength(2);
    expect(markup.match(/class="dw-brow"/gu)).toHaveLength(2);
    expect(markup.match(/class="dw-nostril"/gu)).toHaveLength(2);
    for (const part of [
      "dw-skin",
      "dw-nose-bridge",
      "dw-lip-upper",
      "dw-lip-lower",
      "dw-teeth",
      "dw-ear",
      "dw-stubble",
      "dw-sideburn",
      "dw-hat-cuff",
    ]) {
      expect(markup).toContain(`class="${part}"`);
    }
  });

  it("is a real head's size and proportions: the eyes halfway down, an eye's width apart, the mouth between the nose and the chin", () => {
    const { eyes, lips } = DwellerHead.CLIMBER;
    const outline = shape(head.markup(), "dw-skin");
    const ys = numbers(outline).filter((_, index) => index % 2 === 1);
    const tall = Math.max(...ys) - Math.min(...ys);

    // About 24 cm from the crown to the chin, and the eyes (at 0) halfway.
    expect(tall).toBeGreaterThan(225);
    expect(tall).toBeLessThan(250);
    expect(Math.abs(Math.max(...ys) + Math.min(...ys))).toBeLessThan(10);
    expect(2 * eyes.apart - eyes.wide).toBeCloseTo(eyes.wide + 6, -1);
    // The mouth a third of the way from the nose's base to the chin.
    expect(DwellerHead.MOUTH.y / DwellerHead.SCALE).toBeGreaterThan(60);
    expect(DwellerHead.MOUTH.y / DwellerHead.SCALE).toBeLessThan(75);
    expect(lips.wide).toBeGreaterThan(eyes.apart);
  });

  it("is turned a little toward the stove: the far eye narrower than the near, the nose over the far cheek, the mouth to the left of the middle", () => {
    const markup = head.markup();
    const near = shape(markup, "dw-white", 0);
    const far = shape(markup, "dw-white", 1);

    expect(width(far)).toBeLessThan(width(near) * 0.95);
    expect(middle(far).x).toBeLessThan(middle(near).x);
    // The nose's bridge leans toward the far side of the eyes' middle.
    const bridge = middle(shape(markup, "dw-nose-bridge"));
    expect(bridge.x).toBeLessThan((middle(far).x + middle(near).x) / 2 + 2);
    expect(DwellerHead.MOUTH.x).toBeLessThan(0);
  });

  it("draws another face from other measurements, as a character's would be", () => {
    const wide: Features = {
      ...DwellerHead.CLIMBER,
      eyes: { ...DwellerHead.CLIMBER.eyes, apart: 35 },
      nose: { ...DwellerHead.CLIMBER.nose, wide: 42 },
      stubble: 0,
    };
    const other = new DwellerHead("other", wide).markup();
    const climber = head.markup();

    expect(middle(shape(other, "dw-white", 0)).x).toBeGreaterThan(
      middle(shape(climber, "dw-white", 0)).x + 2,
    );
    expect(other).not.toContain('class="dw-stubble"');
    expect(climber).toContain('class="dw-stubble"');
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
      const open = middle(head.lid(index, 1).edge).y;
      const half = middle(head.lid(index, 0.5).edge).y;
      const shut = middle(head.lid(index, 0).edge).y;

      expect(open).toBeLessThan(half);
      expect(half).toBeLessThan(shut);
      expect(head.lid(index, 0.3).skin.startsWith(head.lid(index, 0.3).edge)).toBe(true);
    }
  });

  it("opens the mouth from where the lips meet, the lower lip dropping with the jaw", () => {
    const shut = head.open(0);
    const open = head.open(1);
    const { x, y } = DwellerHead.MOUTH;

    expect(shut.mouth).toContain("scale(1 0.000)");
    expect(open.mouth).toContain("scale(1 1.000)");
    expect(open.mouth).toContain(
      `translate(${Math.round((x / DwellerHead.SCALE) * 100) / 100} ${Math.round((y / DwellerHead.SCALE) * 100) / 100})`,
    );
    expect(open.jaw).toBe(`translate(0 ${DwellerHead.JAW.toFixed(2)})`);
  });

  it("asleep, shuts the eyes and lets the mouth fall a little open", () => {
    const asleep = new DwellerHead("sleeper").markup(true);
    const awake = new DwellerHead("sleeper").markup();

    expect(asleep).toContain(`d="${head.lid(0, 0).edge}"`);
    expect(awake).toContain(`d="${head.lid(0, 1).edge}"`);
    expect(asleep).toContain("scale(1 0.160)");
    expect(awake).toContain("scale(1 0.000)");
  });
});
