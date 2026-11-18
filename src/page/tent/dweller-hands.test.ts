import { describe, expect, it } from "vitest";
import { DwellerHands } from "./dweller-hands";
import type { Held, Shape } from "./dweller-hands";
import { TentArt } from "./tent-art";

const hands = new DwellerHands("near");
const HELD = Object.keys(DwellerHands.SHAPES) as Held[];
const SHAPES: readonly Shape[] = ["open", "wide", "flat", "tight", "pinch"];
/** The shapes a layer draws. */
const drawn = (layer: string): string[] =>
  [...layer.matchAll(/data-shape="(\w+)"/gu)].map(([, shape = ""]) => shape);
/** One shape's art in a layer. */
const shape = (layer: string, name: Shape): string =>
  layer.split(`data-shape="${name}">`)[1]?.split('<g class="dw-shape"')[0] ?? "";

describe("DwellerHands: the hands of the person in the tent (#264, #269)", () => {
  it("shapes the hand for each thing it holds: round a bottle, across a pouch, tight on a lighter, pinching a spoon", () => {
    expect(DwellerHands.SHAPES).toMatchObject({
      nothing: "open",
      bottle: "wide",
      snow: "wide",
      pouch: "flat",
      sealed: "flat",
      lighter: "tight",
      lit: "tight",
      stirrer: "tight",
      pot: "tight",
      neck: "tight",
      spoon: "pinch",
      spoonful: "pinch",
      bar: "pinch",
      pick: "pinch",
      seal: "pinch",
    });
    // Across what it wraps, along what it pinches or points at.
    expect(DwellerHands.GRIPS).toEqual({
      open: "along",
      pinch: "along",
      wide: "across",
      flat: "across",
      tight: "across",
    });
  });

  it("draws each hand in two layers, for what it holds to be in the hand: the palm behind the thing, the fingers in front", () => {
    const [back, front] = [hands.back(), hands.front()];

    // A wrapping hand's palm is behind a bottle and a pouch, and its fingers across the front
    // of them; a pinching hand's other fingers are under a spoon, its thumb and first finger over
    // it; the open hand and the fist are whole, in front.
    expect(drawn(back).sort()).toEqual(["flat", "pinch", "wide"]);
    expect(drawn(front).sort()).toEqual([...SHAPES].sort());
    expect(shape(front, "wide")).toContain('class="dw-knuckles"');
    expect(shape(front, "wide")).not.toContain('class="dw-nail"');
    // On a pouch the fingertips show, with their nails.
    expect(shape(front, "flat").match(/class="dw-nail"/gu)).toHaveLength(4);
    expect(shape(front, "open").match(/class="dw-nail"/gu)).toHaveLength(5);
    expect(shape(front, "open")).toContain('class="dw-tendons"');
    expect(shape(front, "tight")).toContain('class="dw-creases"');
    expect(shape(front, "pinch").match(/class="dw-nail"/gu)).toHaveLength(2);
    expect(shape(back, "pinch").match(/class="dw-hand-skin"/gu)).toHaveLength(4);
  });

  it("puts the wrist a real hand's length behind where each shape grips, and lets what's held turn in the fingers a little", () => {
    for (const name of SHAPES) {
      const millimetres = DwellerHands.WRIST[name] / DwellerHands.SCALE;
      expect(millimetres).toBeGreaterThan(60);
      expect(millimetres).toBeLessThan(125);
    }
    expect(DwellerHands.CANT.open).toBe(0);
    // A spoon lies along the finger, a bottle sits more loosely in the hand.
    expect(DwellerHands.CANT.pinch).toBeLessThan(DwellerHands.CANT.wide);
    expect(Math.max(...Object.values(DwellerHands.CANT))).toBeLessThanOrEqual(45);
    expect(DwellerHands.TURNS).toEqual({ pot: true });
  });

  it("shades the skin with a gradient of its own id, so each hand's can be told apart", () => {
    const far = new DwellerHands("far");

    expect(far.defs()).toContain('id="far-skin"');
    expect(far.front()).toContain("url(#far-skin)");
    expect(far.back()).toContain("url(#far-skin)");
    expect(far.front() + far.back()).not.toContain("SKIN");
  });

  it("draws everything a hand holds, each to be shown by itself: in front of its arm, or the pot behind it", () => {
    const [things, carried] = [DwellerHands.things(), DwellerHands.carried()];
    const names = (markup: string): string[] =>
      [...markup.matchAll(/data-held="(\w+)"/gu)].map(([, name = ""]) => name);

    expect(names(carried)).toEqual(["pot"]);
    // Everything but nothing, the pouch's seal, which is the pouch's own, and the guitar's neck,
    // which is the guitar's.
    expect([...names(things), ...names(carried)].sort()).toEqual(
      HELD.filter((held) => !["nothing", "seal", "neck"].includes(held)).sort(),
    );
  });

  it("holds the tent's own bottle, pouch, pot and spoon, so what's taken from the floor is what stood there", () => {
    const things = DwellerHands.things();

    expect(things).toContain(TentArt.bottle());
    expect(things).toContain(TentArt.pouch(true));
    expect(things).toContain(TentArt.pouch(false));
    expect(things).toContain(TentArt.spoon());
    expect(DwellerHands.carried()).toContain(TentArt.pot());
    expect(DwellerHands.stirrer()).toContain(TentArt.spoon());
  });

  it("says how far each thing's working end is from where it's held", () => {
    const { BOTTLE, SPOON, POUCH, POT } = TentArt;

    // A bottle by its middle, its mouth at the top of its cap.
    expect(DwellerHands.REACH.bottle).toBe(BOTTLE.height / 2 + BOTTLE.cap);
    // A spoon's bowl, further from the fist that stirs with it than from the fingers that eat
    // with it.
    expect(DwellerHands.REACH.spoon).toBeGreaterThan(SPOON.neck);
    expect(DwellerHands.REACH.spoon).toBeLessThan(SPOON.tip);
    expect(DwellerHands.REACH.stirrer).toBe(DwellerHands.REACH.spoon + DwellerHands.STIRRER_HELD);
    expect(DwellerHands.STIRRER_HELD).toBeLessThan(SPOON.handle);
    // A pouch near its base, its opening under its top.
    expect(DwellerHands.REACH.pouch).toBeLessThan(POUCH.height - DwellerHands.POUCH_HELD);
    expect(DwellerHands.REACH.pouch).toBeGreaterThan(POUCH.height / 2);
    // The pot by its handle, below its rim, the lip it pours from at its side.
    expect(DwellerHands.POT_LIP).toEqual({ x: POT.half, y: POT.handle - POT.rim });
    expect(DwellerHands.REACH.bar).toBeGreaterThan(DwellerHands.REACH.lighter);
  });

  it("draws a lump of snow as a broken chunk, held toward the fingertips so it shows beyond them", () => {
    expect(DwellerHands.lump()).toContain('class="dw-snow"');
    expect(DwellerHands.lump()).toContain('class="dw-snow-shade"');
    expect(DwellerHands.things()).toContain(
      `<g transform="translate(${-DwellerHands.LUMP_HELD} 0)">${DwellerHands.lump()}</g>`,
    );
    expect(DwellerHands.LUMP_HELD).toBeGreaterThan(0);
  });
});
