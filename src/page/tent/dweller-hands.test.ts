import { describe, expect, it } from "vitest";
import { DwellerHands } from "./dweller-hands";
import type { HandDrawing, Held } from "./dweller-hands";
import { HandBones, HandTurn, Vector3 } from "./hand-bones";
import { TentArt } from "./tent-art";

const HELD = Object.keys(DwellerHands.GRIPS) as Held[];
/** Every part of a hand drawn, wherever it's drawn. */
const all = ({ back, mid, front }: HandDrawing): HandDrawing["front"] => [
  ...back,
  ...mid,
  ...front,
];
/** A hand with its back to the viewer, or its palm. */
const BACK_SEEN = HandTurn.FLAT;
const PALM_SEEN = HandTurn.of(new Vector3(0, 1, 0), new Vector3(0, 0, -1));
const WRIST = new Vector3(100, 50, 20);

describe("DwellerHands: the hands of the person in the tent (#264, #269, #274)", () => {
  it("closes the hand on each thing it holds as it would: round a bottle, a fist on a spoon, a pinch, a pouch by its side or its top, a device as a radio is", () => {
    expect(DwellerHands.GRIPS).toEqual({
      nothing: "open",
      spoon: "pinch",
      spoonful: "pinch",
      stirrer: "fist",
      seal: "seal",
      bar: "bar",
      pick: "pinch",
      bottle: "wrap",
      pouch: "plate",
      sealed: "plate",
      lifted: "top",
      snow: "cup",
      lighter: "lighter",
      lit: "lighter",
      neck: "fret",
      pot: "pot",
      radio: "cradle",
      tracker: "cradle",
      meter: "cradle",
      watch: "open",
    });
  });

  it("draws the palm and each bone of the fingers and the thumb as it's seen, the nails where the fingertips' backs face the viewer", () => {
    const open = HandBones.shape("open", 0);
    const backSeen = all(DwellerHands.drawn(open, BACK_SEEN, WRIST, null));
    const palmSeen = all(DwellerHands.drawn(open, PALM_SEEN, WRIST, null));

    // The palm, and three bones each for four fingers and the thumb: as many as a hand's places
    // have room for.
    expect(backSeen).toHaveLength(DwellerHands.PARTS);
    for (const { skin } of backSeen) {
      expect(skin).toMatch(/^M[^Z]+Z$/u);
    }
    const nails = (parts: HandDrawing["front"]): number =>
      parts.filter(({ nail }) => nail !== "").length;
    expect(nails(backSeen)).toBe(5);
    expect(nails(palmSeen)).toBe(0);
    // Each part begins within a hand's length of the wrist, in the picture's pixels.
    for (const { skin } of backSeen) {
      const [x = NaN, y = NaN] = (skin.match(/-?[\d.]+/gu) ?? []).map(Number);
      expect(Math.hypot(x - WRIST.x, y - WRIST.y)).toBeLessThan(215 * HandBones.SCALE);
    }
  });

  it("draws what's nearer the viewer than the sleeve's cuff over it, and what's nearer than what the hand holds over that", () => {
    const wrap = HandBones.shape("wrap");
    // Its palm to the viewer, the fingers round a bottle's front: the palm is behind the bottle.
    const turned = PALM_SEEN;
    const bottle = WRIST.plus(turned.of(wrap.hold).times(HandBones.SCALE)).z;
    const held = DwellerHands.drawn(wrap, turned, WRIST, bottle);
    expect(held.front.length).toBeGreaterThan(0);
    expect(held.back.length + held.mid.length).toBeGreaterThan(0);
    expect(all(held)).toHaveLength(DwellerHands.PARTS);
    // Holding nothing, nothing goes between.
    const empty = DwellerHands.drawn(HandBones.shape("open", 0), turned, WRIST, null);
    expect(empty.mid).toHaveLength(0);
  });

  it("shades the skin with a gradient of its own id, so each hand's can be told apart, in places with room for every part", () => {
    const far = new DwellerHands("far");

    expect(far.defs()).toContain('id="far-skin"');
    const place = far.place("hand1");
    expect(place).toContain('data-part="hand1"');
    expect(place.match(/fill="url\(#far-skin\)"/gu)).toHaveLength(DwellerHands.PARTS);
    expect(place.match(/class="dw-nail"/gu)).toHaveLength(DwellerHands.PARTS);
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
    const pouch = (open: boolean): string =>
      `<g transform="translate(0 ${DwellerHands.POUCH_HELD})">${TentArt.pouch(open)}</g>`;

    expect(things).toContain(TentArt.bottle());
    expect(things).toContain(`data-held="pouch">${pouch(true)}`);
    expect(things).toContain(`data-held="sealed">${pouch(false)}`);
    // Lifted from the pile, as it stood there, sealed.
    expect(things).toContain(`data-held="lifted">${pouch(false)}`);
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
    // Lifted by its top, held as far below it as the hand's grip has it.
    expect(HandBones.TOP_HELD * HandBones.SCALE).toBeGreaterThan(
      POUCH.height - DwellerHands.POUCH_HELD - 10,
    );
    expect(HandBones.TOP_HELD * HandBones.SCALE).toBeLessThan(
      POUCH.height - DwellerHands.POUCH_HELD,
    );
    // The pot by its handle, below its rim, the lip it pours from at its side.
    expect(DwellerHands.POT_LIP).toEqual({ x: POT.half, y: POT.handle - POT.rim });
    expect(DwellerHands.REACH.bar).toBeGreaterThan(DwellerHands.REACH.lighter);
  });

  it("draws a lump of snow as a broken chunk, lit from above", () => {
    expect(DwellerHands.lump()).toContain('class="dw-snow"');
    expect(DwellerHands.lump()).toContain('class="dw-snow-shade"');
    expect(DwellerHands.things()).toContain(`data-held="snow">${DwellerHands.lump()}`);
  });
});
