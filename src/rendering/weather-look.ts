import type { HazardWeather } from "../simulation";

/** A weather's look, each 0 to 1. */
interface LookShares {
  /** How many of the flakes fall, of the quality's. */
  readonly snowfall: number;
  /** How far the far layers fade into the sky. */
  readonly haze: number;
  /** How thick the veil over the picture behind the slope is: cloud and falling snow between
   * the eye and the mountain. */
  readonly veil: number;
  /** How much of the sky is under cloud: grey, with the glow and the stars dimmed. */
  readonly overcast: number;
  /** How thick the fog banks drifting across the peaks are. */
  readonly fog: number;
  /** How thick the mist in front of the slope is, away from the climber: never so thick the rope
   * ahead doesn't show through it. */
  readonly mist: number;
}

/**
 * How a weather looks (docs/guidelines/graphics.md → an effect tells something): how much of the
 * snow falls, how far the mountains behind fade into the air, how thick the veil behind the slope
 * is, how much of the sky is cloud, how thick the fog banks and the mist in front are. The wind's
 * gusts are `Gust`'s. One frozen look a weather.
 */
export class WeatherLook {
  static readonly CLEAR = new WeatherLook("clear", {
    snowfall: 0.08,
    haze: 0,
    veil: 0,
    overcast: 0,
    fog: 0,
    mist: 0,
  });
  static readonly CLOUD = new WeatherLook("cloud", {
    snowfall: 0.3,
    haze: 0.45,
    veil: 0.12,
    overcast: 0.8,
    fog: 0.7,
    mist: 0,
  });
  static readonly SNOW = new WeatherLook("snow", {
    snowfall: 1,
    haze: 0.7,
    veil: 0.28,
    overcast: 0.95,
    fog: 0.9,
    mist: 0.22,
  });
  static readonly WIND = new WeatherLook("wind", {
    snowfall: 0.5,
    haze: 0.25,
    veil: 0.08,
    overcast: 0.15,
    fog: 0.12,
    mist: 0,
  });
  private static readonly LOOKS: Readonly<Record<HazardWeather, WeatherLook>> = {
    clear: WeatherLook.CLEAR,
    cloud: WeatherLook.CLOUD,
    snow: WeatherLook.SNOW,
    wind: WeatherLook.WIND,
  };

  readonly snowfall: number;
  readonly haze: number;
  readonly veil: number;
  readonly overcast: number;
  readonly fog: number;
  readonly mist: number;

  private constructor(
    readonly weather: HazardWeather,
    shares: LookShares,
  ) {
    this.snowfall = shares.snowfall;
    this.haze = shares.haze;
    this.veil = shares.veil;
    this.overcast = shares.overcast;
    this.fog = shares.fog;
    this.mist = shares.mist;
  }

  static of(weather: HazardWeather): WeatherLook {
    return WeatherLook.LOOKS[weather];
  }
}
