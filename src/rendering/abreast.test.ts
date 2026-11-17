import { describe, expect, it } from "vitest";

import { Abreast } from "./abreast";
import type { Standing } from "./abreast";

const FRAME = 1 / 60;
/** Level ground, with a crevasse's lip at 10 m: 8 m down past it. */
const ground = (x: number): number => (x < 10 ? 0 : -8);

const on = (x: number, over: Partial<Standing> = {}): Standing => ({
  at: { x, y: ground(x) },
  free: true,
  there: true,
  grown: 1,
  ...over,
});

/** The steps aside once they've settled: a couple of seconds of frames. */
const settled = (abreast: Abreast, standing: readonly Standing[]): readonly number[] => {
  let aside: readonly number[] = [];
  for (let frame = 0; frame < 120; frame += 1) {
    aside = abreast.advance(FRAME, standing).map(({ x }) => x);
  }
  return aside;
};

describe("Abreast", () => {
  it("stands the second of two at one spot a step aside, ahead, and leaves the first where they are", () => {
    const aside = settled(new Abreast(ground), [on(4), on(4)]);

    expect(aside[0]).toBe(0);
    expect(aside[1]).toBeCloseTo(Abreast.APART, 6);
  });

  it("keeps them a step apart, on the side the second already is, and leaves two further apart alone", () => {
    const abreast = new Abreast(ground);

    expect(settled(abreast, [on(4), on(3.8)])[1]).toBeCloseTo(-(Abreast.APART - 0.2), 6);
    expect(settled(new Abreast(ground), [on(4), on(4.3)])[1]).toBeCloseTo(Abreast.APART - 0.3, 6);
    expect(settled(new Abreast(ground), [on(4), on(4 + Abreast.APART)])[1]).toBe(0);
    expect(settled(new Abreast(ground), [on(4), on(2)])[1]).toBe(0);
  });

  it("steps aside in a moment, not at once, and back when the other has gone", () => {
    const abreast = new Abreast(ground);
    const first = abreast.advance(FRAME, [on(4), on(4)])[1]?.x ?? 0;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThanOrEqual(Abreast.SPEED * FRAME + 1e-9);

    settled(abreast, [on(4), on(4)]);
    const back = abreast.advance(FRAME, [on(8), on(4)])[1]?.x ?? 0;
    expect(back).toBeGreaterThan(Abreast.APART - Abreast.SPEED * FRAME - 1e-9);
    expect(back).toBeLessThan(Abreast.APART);
    expect(settled(abreast, [on(8), on(4)])[1]).toBe(0);
  });

  it("never steps over a lip: by a crevasse's edge they step back from it instead", () => {
    const aside = settled(new Abreast(ground), [on(9.8), on(9.8)]);

    expect(aside[1]).toBeCloseTo(-Abreast.APART, 6);
  });

  it("stands a climber aside as high as the ground is there", () => {
    const rising = (x: number): number => 0.5 * x;
    const abreast = new Abreast(rising);
    let aside = abreast.advance(FRAME, [on(4), on(4)]);
    for (let frame = 0; frame < 120; frame += 1) {
      aside = abreast.advance(FRAME, [
        { ...on(4), at: { x: 4, y: 2 } },
        { ...on(4), at: { x: 4, y: 2 } },
      ]);
    }

    expect(aside[1]?.y).toBeCloseTo(0.5 * Abreast.APART, 6);
  });

  it("leaves a climber on the ice or on the rope where they are, and steps one on the ground aside from them", () => {
    const onTheRope = on(4, { free: false });

    expect(settled(new Abreast(ground), [on(4), onTheRope])[1]).toBe(0);
    expect(settled(new Abreast(ground), [onTheRope, on(4)])[1]).toBeCloseTo(Abreast.APART, 6);
  });

  it("leaves a climber out on a ladder where they are, and steps one at its end on the lip aside onto the ground by it", () => {
    // A ladder from the lip at 10 m across the crevasse, level with the lip.
    const out = { ...on(12), at: { x: 12, y: 0 } };
    expect(settled(new Abreast(ground), [out, out])[1]).toBe(0);

    // At its end, where the hauled-out climber comes up: back from the lip, onto the ground.
    const atTheEnd = { ...on(10), at: { x: 9.99, y: 0 } };
    const hauledUp = { ...on(10), at: { x: 9.8, y: -0.1 }, free: false };
    expect(settled(new Abreast(ground), [hauledUp, atTheEnd])[1]).toBeCloseTo(
      -(Abreast.APART + 0.19),
      6,
    );
  });

  it("steps aside from nobody who isn't there: a body, or a climber a wall's height above", () => {
    expect(settled(new Abreast(ground), [on(4, { there: false }), on(4)])[1]).toBe(0);
    const above = { ...on(4), at: { x: 4, y: 3 } };
    expect(settled(new Abreast(ground), [above, on(4)])[1]).toBe(0);
  });

  it("stands a third clear of both", () => {
    const aside = settled(new Abreast(ground), [on(4), on(4), on(4)]);
    const drawn = aside.map((x) => 4 + x).sort((a, b) => a - b);

    expect((drawn[1] ?? 0) - (drawn[0] ?? 0)).toBeGreaterThan(Abreast.APART - 1e-6);
    expect((drawn[2] ?? 0) - (drawn[1] ?? 0)).toBeGreaterThan(Abreast.APART - 1e-6);
  });

  it("stands a bigger figure further aside, as it's drawn", () => {
    const aside = settled(new Abreast(ground), [on(4, { grown: 2 }), on(4, { grown: 2 })]);

    expect(aside[1]).toBeCloseTo(2 * Abreast.APART, 6);
  });
});
