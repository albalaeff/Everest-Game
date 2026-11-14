import { describe, expect, it } from "vitest";

import { DayLight } from "./day-light";
import { Palette } from "./palette";
import { ThinAir } from "./thin-air";
import { WeatherLook } from "./weather-look";

/** The palette at an hour over Base Camp, in clear weather, unless another altitude or look. */
const at = (
  hours: number,
  minutes = 0,
  altitude = 5_364,
  look: WeatherLook = WeatherLook.CLEAR,
): Palette => new Palette(DayLight.at(hours * 3600 + minutes * 60), ThinAir.at(altitude), look);

/** How far a colour is from a grey: its strongest channel less its weakest. */
const saturation = (colour: number): number => {
  const { red, green, blue } = Palette.channels(colour);
  return Math.max(red, green, blue) - Math.min(red, green, blue);
};

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

  it("keeps the ice axe 3:1 on the night's snow, its steel too, and its dark edge 7:1 on the day's", () => {
    const night = at(3).snowTint;

    expect(Palette.contrast(Palette.AXE_SHAFT, night)).toBeGreaterThan(3);
    expect(Palette.contrast(Palette.TOOL_STEEL, night)).toBeGreaterThan(3);
    expect(Palette.contrast(Palette.TOOL_EDGE, Palette.SNOW)).toBeGreaterThan(7);
    expect(Palette.contrast(Palette.TOOL_EDGE, Palette.ICE)).toBeGreaterThan(7);
  });

  it("keeps the player's mark 3:1 on the night's sky and snow and the day's sky, and its edge on the snow", () => {
    const night = at(3);

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

  it("shades a far face's flank away from the sun darker than the face, and blue by day", () => {
    for (const hours of [3, 6, 9, 12, 17]) {
      const { face, faceShade } = at(hours);

      expect(Palette.brightness(faceShade)).toBeLessThan(Palette.brightness(face));
    }
    const { red, blue } = Palette.channels(at(12).faceShade);
    expect(blue - red).toBeGreaterThan(30);
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

  it("keeps the moraine navy under the stars, as the stories read the ground at Base Camp, darker than the snow, and grey by day", () => {
    const night = at(3);
    const day = at(12);
    const { red, blue } = Palette.channels(night.moraine);
    const grey = Palette.channels(day.moraine);

    expect(blue - red).toBeGreaterThan(40);
    expect(Palette.brightness(night.moraine)).toBeGreaterThan(45);
    expect(Palette.brightness(night.moraine)).toBeLessThan(Palette.brightness(night.snowTint));
    expect(Math.abs(grey.red - grey.blue)).toBeLessThan(20);
    expect(Palette.brightness(day.moraine)).toBeLessThan(Palette.brightness(day.snowTint) - 80);
  });

  it("darkens a crevasse's inside under the snow at every hour, and blues the light through the walls' ice", () => {
    const blueness = (colour: number): number => {
      const { red, blue } = Palette.channels(colour);
      return blue - red;
    };
    for (const [hours, minutes] of [
      [3, 0],
      [5, 24],
      [6, 0],
      [12, 0],
    ] as const) {
      const palette = at(hours, minutes);

      expect(Palette.brightness(palette.crevasse)).toBeLessThan(
        Palette.brightness(palette.snowTint) / 2,
      );
      expect(blueness(palette.crevasse)).toBeGreaterThan(0);
    }
    for (const [index, [, colour]] of Palette.LIT_ICE.entries()) {
      expect(blueness(colour)).toBeGreaterThan(30);
      expect(Palette.brightness(colour)).toBeLessThan(
        Palette.brightness(Palette.LIT_ICE[index - 1]?.[1] ?? 0xffffff),
      );
    }
  });

  it("darkens the glacier's ice as it goes down under the snow, blue all the way", () => {
    const depths = [0, 1, 2.5, 4, 6, 9, 12, 16, 20, 24, 40];
    const colours = depths.map((depth) => Palette.glacier(depth));

    for (const [index, colour] of colours.entries()) {
      const { red, blue } = Palette.channels(colour);
      expect(blue - red).toBeGreaterThan(20);
      expect(Palette.brightness(colour)).toBeLessThanOrEqual(
        Palette.brightness(colours[index - 1] ?? 0xffffff),
      );
    }
    expect(colours[0]).toBe(Palette.GLACIER[0]?.[1]);
    expect(colours.at(-1)).toBe(Palette.GLACIER.at(-1)?.[1]);
    expect(Palette.brightness(Palette.glacier(20))).toBeLessThan(
      Palette.brightness(Palette.glacier(1)) / 2,
    );
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

  it("deepens the blue at the top of the sky the higher the climber, and leaves its horizon pale", () => {
    const baseCamp = at(12);
    const campOne = at(12, 0, 6_065);
    const summit = at(12, 0, 8_849);

    // Over Base Camp the noon sky is the blue it was before the altitude counted (#149).
    expect(
      Math.abs(Palette.brightness(baseCamp.skyTop) - Palette.brightness(0x1b4a97)),
    ).toBeLessThan(2);
    expect(Palette.brightness(campOne.skyTop)).toBeLessThan(Palette.brightness(baseCamp.skyTop));
    expect(Palette.brightness(summit.skyTop)).toBeLessThan(
      Palette.brightness(baseCamp.skyTop) * 0.8,
    );
    expect(Palette.channels(summit.skyTop).blue).toBeGreaterThan(
      Palette.channels(summit.skyTop).red * 3,
    );
    expect(summit.skyHorizon).toBe(baseCamp.skyHorizon);
    expect(Palette.brightness(at(2, 0, 8_849).skyTop)).toBeLessThan(20);
  });

  it("greys the sky under cloud, its top and horizon close, and the far air with it", () => {
    const clear = at(12);
    const cloud = at(12, 0, 5_364, WeatherLook.CLOUD);
    const snow = at(12, 0, 5_364, WeatherLook.SNOW);
    const spread = (palette: Palette): number =>
      Math.abs(Palette.brightness(palette.skyHorizon) - Palette.brightness(palette.skyTop));

    expect(saturation(cloud.skyTop)).toBeLessThan(saturation(clear.skyTop) / 2);
    expect(saturation(snow.skyTop)).toBeLessThan(saturation(cloud.skyTop));
    expect(spread(cloud)).toBeLessThan(spread(clear) / 2);
    expect(saturation(cloud.haze)).toBeLessThan(saturation(clear.haze));
    expect(Palette.brightness(at(2, 0, 5_364, WeatherLook.SNOW).skyTop)).toBeLessThan(60);
    expect(at(12, 0, 5_364, WeatherLook.WIND).skyTop).not.toBe(cloud.skyTop);
  });

  it("keeps the glow off the snow and a figure's edge when the sun rises behind cloud", () => {
    const clear = at(5, 50);
    const snow = at(5, 50, 5_364, WeatherLook.SNOW);
    const warmth = (colour: number): number => {
      const { red, blue } = Palette.channels(colour);
      return red - blue;
    };

    expect(warmth(snow.snowCrest)).toBeLessThan(warmth(clear.snowCrest) - 30);
    expect(warmth(snow.rim)).toBeLessThan(warmth(clear.rim) - 40);
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
