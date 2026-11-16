import { describe, expect, it } from "vitest";

import { Palette } from "../../rendering/palette";
import { MenuFlags } from "./menu-flags";

describe("MenuFlags", () => {
  const flags = new MenuFlags();

  it("hangs the flags in their five colours, in their order, along each string", () => {
    for (const string of flags.strings) {
      expect(string.path.startsWith("M1457 684Q")).toBe(true);
      expect(string.flags.slice(0, 6).map(({ colour }) => colour)).toEqual([
        ...Palette.PRAYER_FLAGS,
        Palette.PRAYER_FLAGS[0],
      ]);
      for (const flag of string.flags) {
        expect(Math.abs(flag.tilt)).toBeLessThanOrEqual(90);
      }
    }
  });

  it("ties the strings to a pole on a cairn", () => {
    expect(flags.cairn).toHaveLength(3);
    expect(flags.pole).toBe("M1457 716L1457 684");
  });
});
