import { describe, expect, it } from "vitest";

import { Terrain } from "../physics";
import { PrayerFlags } from "./prayer-flags";

const LEVEL = new Terrain([
  [0, 0],
  [30, 0],
]);
const BASE_CAMP = { id: "base-camp", from: 0, to: 8 };

interface Seen {
  readonly colour: number;
  readonly corners: readonly number[];
}

function seen(flags: PrayerFlags, elapsed: number, gust: number): Seen[] {
  const all: Seen[] = [];
  flags.forEach(elapsed, gust, (colour, ...corners) => all.push({ colour, corners }));
  return all;
}

describe("PrayerFlags", () => {
  it("strings the flags from the top of a mast between the tents down to the snow each side", () => {
    const flags = new PrayerFlags(LEVEL, BASE_CAMP);
    const ends = flags.strings.map((string) => [string[0], string.at(-1)]);

    expect(flags.mast).toEqual({
      foot: { x: 2.5, y: 0 },
      top: { x: 2.5, y: PrayerFlags.MAST_METRES },
    });
    expect(ends).toEqual([
      [flags.mast.top, { x: -4.5, y: 0 }],
      [flags.mast.top, { x: 9.5, y: 0 }],
    ]);
    expect(flags.count).toBeGreaterThan(20);
  });

  it("hangs them straight down in a calm, in their five colours in turn", () => {
    const flags = seen(new PrayerFlags(LEVEL, BASE_CAMP), 0, 0);

    expect(flags.slice(0, 6).map(({ colour }) => colour)).toEqual([0, 1, 2, 3, 4, 0]);
    for (const { corners } of flags) {
      const [x0, y0, x1, y1, x2, y2, x3, y3] = corners;
      expect(x2).toBeCloseTo(x1 ?? Number.NaN, 9);
      expect(y2).toBeCloseTo((y1 ?? Number.NaN) - PrayerFlags.DROP_METRES, 9);
      expect(x3).toBeCloseTo(x0 ?? Number.NaN, 9);
      expect(y3).toBeCloseTo((y0 ?? Number.NaN) - PrayerFlags.DROP_METRES, 9);
    }
  });

  it("blows them out the way the wind blows on the gust, fluttering", () => {
    const flags = new PrayerFlags(LEVEL, BASE_CAMP);
    const now = seen(flags, 0, 1);
    const later = seen(flags, 0.2, 1);

    for (const { corners } of now) {
      const [x0, , x1, , x2, , x3] = corners;
      expect((x2 ?? 0) - (x1 ?? 0)).toBeGreaterThan(PrayerFlags.DROP_METRES / 2);
      expect((x3 ?? 0) - (x0 ?? 0)).toBeGreaterThan(PrayerFlags.DROP_METRES / 2);
    }
    expect(later[0]?.corners[6]).not.toBeCloseTo(now[0]?.corners[6] ?? 0, 3);
  });
});
