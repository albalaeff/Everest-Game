import { describe, expect, it } from "vitest";
import { Palette } from "../../rendering/palette";
import { Appearance } from "./appearance";

describe("Appearance: how the person in the tent looks (#264)", () => {
  it("dresses the climber in the slope's suit and yoke, each shaded as the slope paints the kit", () => {
    const variables = Appearance.CLIMBER.variables();

    expect(variables["--suit"]).toBe(Palette.css(Palette.PLAYER_SUIT));
    expect(variables["--yoke"]).toBe(Palette.css(Palette.PANEL));
    expect(variables["--suit-dark"]).toBe(
      Palette.css(Palette.toned(Palette.PLAYER_SUIT, Palette.KIT_TONES.dark)),
    );
    expect(variables["--suit-light"]).toBe(
      Palette.css(Palette.toned(Palette.PLAYER_SUIT, Palette.KIT_TONES.light)),
    );
    for (const kit of ["suit", "yoke", "booties", "hat", "base-layer"]) {
      expect(variables[`--${kit}-dark`]).not.toBe(variables[`--${kit}`]);
      expect(variables[`--${kit}-light`]).not.toBe(variables[`--${kit}`]);
    }
  });

  it("takes every colour from its own set, so another climber looks another way", () => {
    const other = new Appearance({
      ...Appearance.CLIMBER.colours,
      skin: 0x8a5a3c,
      hair: 0xc9a46a,
      eyes: 0x3d6f8c,
    });
    const variables = other.variables();

    expect(variables["--skin"]).toBe(Palette.css(0x8a5a3c));
    expect(variables["--hair"]).toBe(Palette.css(0xc9a46a));
    expect(variables["--eyes"]).toBe(Palette.css(0x3d6f8c));
    expect(variables["--lips"]).not.toBe(Appearance.CLIMBER.variables()["--lips"]);
    expect(variables["--suit"]).toBe(Appearance.CLIMBER.variables()["--suit"]);
  });

  it("gives the skin a lit tone, a shaded one and a deep one, darker in turn", () => {
    const variables = Appearance.CLIMBER.variables();
    const bright = (css: string | undefined): number =>
      [...(css ?? "").matchAll(/\d+/gu)]
        .slice(0, 3)
        .reduce((sum, [channel]) => sum + Number(channel), 0);

    expect(bright(variables["--skin-light"])).toBeGreaterThan(bright(variables["--skin"]));
    expect(bright(variables["--skin"])).toBeGreaterThan(bright(variables["--skin-shade"]));
    expect(bright(variables["--skin-shade"])).toBeGreaterThan(bright(variables["--skin-deep"]));
  });
});
