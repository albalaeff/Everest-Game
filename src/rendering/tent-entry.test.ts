import { describe, expect, it } from "vitest";

import { TentEntry } from "./tent-entry";
import type { EntryLook } from "./tent-entry";

/** A tent whose door's end is at 10 m, its body lying on from there; and one lying back. */
const ON = { x: 10, lies: 1 } as const;
const BACK = { x: 10, lies: -1 } as const;

/** The looks of a climber standing at `x`, a tenth of a second apart, over `seconds`. */
const looks = (
  entry: TentEntry,
  sheltered: boolean,
  x: number,
  seconds: number,
  door: typeof ON | typeof BACK = ON,
): EntryLook[] =>
  Array.from({ length: Math.round(seconds * 10) }, () => entry.advance(0.1, sheltered, x, door));

describe("TentEntry: the way into a tent, and out of it (#258)", () => {
  it("leaves a climber outside as they are, and one first seen inside there, with nothing to show", () => {
    expect(new TentEntry().advance(0.1, false, 9, ON)).toEqual({
      shift: 0,
      down: 0,
      facing: null,
      shown: 1,
      open: 0,
      inside: false,
      passing: false,
      way: null,
    });
    expect(new TentEntry().advance(0.1, true, 9, ON)).toMatchObject({
      shown: 0,
      inside: true,
      passing: false,
      open: 0,
    });
    // Drawn where they crawled to, for the camera to stay on the tent.
    expect(new TentEntry().advance(0.1, true, 9, ON).shift).toBeCloseTo(1 + TentEntry.PAST, 9);
  });

  it("goes in through the door: to it on their feet as the flap opens, down, in on hands and knees, gone, and the flap falls", () => {
    const entry = new TentEntry();
    entry.advance(0.1, false, 9, ON);

    const way = looks(entry, true, 9, TentEntry.SECONDS.in + 0.2);
    const [first] = way;
    const last = way.at(-1);
    const downAt = way.findIndex(({ down }) => down > 0.99);
    const goneAt = way.findIndex(({ shown }) => shown < 0.01);

    expect(first).toMatchObject({ facing: 1, passing: true, inside: false, way: "in" });
    expect(first?.down).toBe(0);
    // Down before the door's end, facing in, the flap open.
    expect(9 + (way[downAt]?.shift ?? 0)).toBeCloseTo(10 - TentEntry.BEFORE, 1);
    expect(way[downAt]?.open).toBeGreaterThan(0.99);
    // Then on, never back, to well past the door's end before they're gone.
    for (let index = 1; index < way.length; index += 1) {
      expect(way[index]?.shift ?? 0).toBeGreaterThanOrEqual((way[index - 1]?.shift ?? 0) - 1e-9);
    }
    expect(9 + (way[goneAt]?.shift ?? 0)).toBeGreaterThan(10 + 0.5);
    expect(way[goneAt]?.down).toBe(1);
    expect(last).toMatchObject({ shown: 0, inside: true, passing: false, open: 0 });
  });

  it("comes out the way they went in: the flap opens, out on hands and knees facing out, up, and back to where they stand", () => {
    const entry = new TentEntry();
    entry.advance(0.1, true, 9, ON);

    const way = looks(entry, false, 9, TentEntry.SECONDS.out + 0.2);
    const shownAt = way.findIndex(({ shown }) => shown > 0.99);

    expect(way[0]).toMatchObject({ facing: -1, passing: true, inside: false, way: "out" });
    expect(way[0]?.shown).toBeLessThan(0.1);
    expect(9 + (way[0]?.shift ?? 0)).toBeGreaterThan(10 + 0.5);
    expect(way[shownAt]?.down).toBe(1);
    expect(way.at(-1)).toEqual({
      shift: 0,
      down: 0,
      facing: null,
      shown: 1,
      open: 0,
      inside: false,
      passing: false,
      way: null,
    });
  });

  it("goes the other way into a tent that lies the other way", () => {
    const entry = new TentEntry();
    entry.advance(0.1, false, 11, BACK);

    const way = looks(entry, true, 11, TentEntry.SECONDS.in, BACK);

    expect(way[0]?.facing).toBe(-1);
    expect(11 + (way.at(-2)?.shift ?? 0)).toBeLessThan(10 - 0.5);
  });

  it("takes the same time on a slow device as on a fast one", () => {
    const fast = new TentEntry();
    const slow = new TentEntry();
    fast.advance(0.016, false, 9, ON);
    slow.advance(0.1, false, 9, ON);

    let quick: EntryLook | null = null;
    for (let frame = 0; frame < 60; frame += 1) {
      quick = fast.advance(1 / 60, true, 9, ON);
    }
    let late: EntryLook | null = null;
    for (let frame = 0; frame < 10; frame += 1) {
      late = slow.advance(0.1, true, 9, ON);
    }

    expect(quick?.shift).toBeCloseTo(late?.shift ?? NaN, 6);
    expect(quick?.down).toBeCloseTo(late?.down ?? NaN, 6);
  });

  it("shows nothing of the way where there's no tent to show it at", () => {
    const entry = new TentEntry();
    entry.advance(0.1, false, 9, null);

    expect(entry.advance(0.1, true, 9, null)).toMatchObject({ inside: true, shown: 0, shift: 0 });
  });
});
