import type { HazardWeather } from "../simulation";

/**
 * How a weather looks (docs/guidelines/graphics.md → an effect tells something): how much of the
 * snow falls, how far the mountains behind fade into the air, and how thick the veil over the
 * whole picture is. The wind's gusts are `Gust`'s. One frozen look a weather.
 */
export class WeatherLook {
  static readonly CLEAR = new WeatherLook("clear", 0.08, 0, 0);
  static readonly CLOUD = new WeatherLook("cloud", 0.3, 0.45, 0.12);
  static readonly SNOW = new WeatherLook("snow", 1, 0.7, 0.28);
  static readonly WIND = new WeatherLook("wind", 0.5, 0.25, 0.08);
  private static readonly LOOKS: Readonly<Record<HazardWeather, WeatherLook>> = {
    clear: WeatherLook.CLEAR,
    cloud: WeatherLook.CLOUD,
    snow: WeatherLook.SNOW,
    wind: WeatherLook.WIND,
  };

  private constructor(
    readonly weather: HazardWeather,
    /** How many of the flakes fall, 0 to 1 of the quality's. */
    readonly snowfall: number,
    /** How far the far layers fade into the sky, 0 to 1. */
    readonly haze: number,
    /** How thick the veil over the picture is, 0 to 1: cloud and falling snow between the eye
     * and the slope. The rope in the climber's hand always shows through it. */
    readonly veil: number,
  ) {}

  static of(weather: HazardWeather): WeatherLook {
    return WeatherLook.LOOKS[weather];
  }
}
