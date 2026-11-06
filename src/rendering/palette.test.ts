import { describe, expect, it } from "vitest";

import { DayLight } from "./day-light";
import { Palette } from "./palette";

const at = (hours: number, minutes = 0): Palette =>
  new Palette(DayLight.at(hours * 3600 + minutes * 60));

describe("Palette", () => {
  it("mixes two colours by a share, and holds the ends", () => {
    expect(Palette.mix(0x000000, 0xffffff, 0)).toBe(0x000000);
    expect(Palette.mix(0x000000, 0xffffff, 1)).toBe(0xffffff);
    expect(Palette.mix(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(Palette.mix(0xff0000, 0x0000ff, 2)).toBe(0x0000ff);
    expect(Palette.mix(0xff0000, 0x0000ff, -1)).toBe(0xff0000);
  });

  it("shades a colour towards black, and writes it as CSS does", () => {
    expect(Palette.shaded(0xffffff, 0.5)).toBe(0x808080);
    expect(Palette.shaded(Palette.PLAYER_SUIT, 0)).toBe(Palette.PLAYER_SUIT);
    expect(Palette.css(0xff9a5c, 0.5)).toBe("rgba(255,154,92,0.5)");
    expect(Palette.css(0x000000, 2)).toBe("rgba(0,0,0,1)");
  });

  it("reads brightness as the stories do, and contrast as WCAG does", () => {
    expect(Palette.brightness(0xffffff)).toBe(255);
    expect(Palette.brightness(0x000000)).toBe(0);
    expect(Palette.contrast(0xffffff, 0x000000)).toBeCloseTo(21, 5);
    expect(Palette.contrast(0x000000, 0xffffff)).toBeCloseTo(21, 5);
  });

  it("keeps the player's suit 3:1 on the snow, and the rope 2:1", () => {
    expect(Palette.contrast(Palette.PLAYER_SUIT, Palette.SNOW)).toBeGreaterThan(3);
    expect(Palette.contrast(Palette.ROPE, Palette.SNOW)).toBeGreaterThan(2);
    expect(Palette.contrast(Palette.ROPE_SHADE, Palette.SNOW)).toBeGreaterThan(7);
  });

  it("keeps the suit and the rope 3:1 on the night's snow, and the rope's edge on the day's", () => {
    // The slope draws its snow white and tints it, so the tint is the snow's colour.
    const snow = at(3).snowTint;

    expect(Palette.contrast(Palette.PLAYER_SUIT, snow)).toBeGreaterThan(3);
    expect(Palette.contrast(Palette.ROPE, snow)).toBeGreaterThan(3);
    expect(Palette.contrast(Palette.OTHER_SUIT, snow)).toBeGreaterThan(3);
  });

  it("keeps a sling 3:1 on the night's snow and on either suit by its edge, and the mark on any light", () => {
    const night = at(3);

    expect(Palette.contrast(Palette.SLING, night.snowTint)).toBeGreaterThan(3);
    expect(Palette.contrast(Palette.SLING_SHADE, Palette.SNOW)).toBeGreaterThan(7);
    for (const suit of [Palette.PLAYER_SUIT, Palette.OTHER_SUIT]) {
      expect(Palette.contrast(Palette.SLING_SHADE, suit)).toBeGreaterThan(3);
    }
    for (const behind of [night.skyTop, night.snowTint, at(12).skyTop]) {
      expect(Palette.contrast(Palette.MARK, behind)).toBeGreaterThan(3);
    }
    expect(Palette.contrast(Palette.MARK_EDGE, Palette.SNOW)).toBeGreaterThan(7);
  });

  it("is dark at night, the snow navy under the stars, blue at first light and white by day", () => {
    const night = at(3);
    const blueHour = at(5, 25);
    const day = at(12);
    const blueness = (colour: number): number => {
      const { red, blue } = Palette.channels(colour);
      return blue - red;
    };

    expect(Palette.brightness(night.skyTop)).toBeLessThan(90);
    expect(Palette.brightness(day.skyTop)).toBeGreaterThan(Palette.brightness(night.skyTop));
    expect(Palette.brightness(day.face)).toBeGreaterThan(Palette.brightness(night.face));
    expect(Palette.brightness(night.face)).toBeLessThan(90);
    expect(Palette.brightness(night.snowTint)).toBeLessThan(70);
    expect(Palette.brightness(night.snowTint)).toBeGreaterThan(Palette.brightness(night.skyTop));
    expect(Palette.brightness(blueHour.snowTint)).toBeGreaterThan(
      Palette.brightness(night.snowTint),
    );
    expect(blueness(blueHour.snowTint)).toBeGreaterThan(50);
    expect(day.snowTint).toBe(0xffffff);
  });

  it("shades the snow darker than itself at every hour, and its crest brighter in the dark", () => {
    for (const [hours, minutes] of [
      [3, 0],
      [5, 24],
      [6, 0],
      [12, 0],
    ] as const) {
      const palette = at(hours, minutes);
      const snow = Palette.brightness(palette.snowTint);

      expect(Palette.brightness(palette.snowShade)).toBeLessThan(snow);
      expect(Palette.brightness(palette.snowDeep)).toBeLessThan(snow);
      expect(Palette.brightness(palette.track)).toBeLessThan(snow);
      if (hours < 6) {
        expect(Palette.brightness(palette.snowCrest)).toBeGreaterThan(snow);
      }
    }
  });

  it("glows pink before the sun is up and orange as it rises, on the crest of the snow too", () => {
    const blueHour = at(5, 15);
    const sunrise = at(5, 50);
    const night = at(2);
    const warmth = (colour: number): number => {
      const { red, blue } = Palette.channels(colour);
      return red - blue;
    };

    expect(warmth(blueHour.glow)).toBeLessThan(warmth(sunrise.glow));
    expect(Palette.channels(blueHour.glow).blue).toBeGreaterThan(
      Palette.channels(sunrise.glow).blue,
    );
    expect(warmth(sunrise.snowCrest)).toBeGreaterThan(warmth(night.snowCrest) + 30);
  });

  it("rims a figure in the glow at dawn, in the sky's cold light at night, and white by day", () => {
    const night = at(2);
    const sunrise = at(5, 50);
    const day = at(12);
    const warmth = (colour: number): number => {
      const { red, blue } = Palette.channels(colour);
      return red - blue;
    };

    expect(warmth(night.rim)).toBeLessThan(0);
    expect(warmth(sunrise.rim)).toBeGreaterThan(40);
    expect(Palette.brightness(day.rim)).toBeGreaterThan(230);
  });

  it("reddens the horizon at dawn, and fades a face into the haze by its share", () => {
    const dawn = at(5, 45);
    const noon = at(12);

    expect(Palette.channels(dawn.skyHorizon).red).toBeGreaterThan(
      Palette.channels(noon.skyHorizon).red,
    );
    expect(noon.faded(noon.face, 0)).toBe(noon.face);
    expect(noon.faded(noon.face, 1)).toBe(noon.haze);
    expect(Palette.brightness(noon.fluting)).toBeGreaterThan(Palette.brightness(noon.face));
    expect(Palette.brightness(noon.rock)).toBeLessThan(Palette.brightness(noon.face));
  });
});
