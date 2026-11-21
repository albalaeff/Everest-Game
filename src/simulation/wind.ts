import type { DayWarmth } from "./day-warmth";
import type { HazardWeather } from "./objective-hazards";

/** Where each name a wind is called by starts, in km/h, by the Beaufort scale's forces
 * (weather.beaufort-*): a breeze at a light breeze, fresh at a fresh breeze, strong at a near
 * gale, and a gale at a gale. Under a breeze, it's calm. */
export interface WindScale {
  readonly breeze: number;
  readonly fresh: number;
  readonly strong: number;
  readonly gale: number;
}

/** The wind's speeds in the Icefall, in km/h, from the knowledge base (weather.icefall-wind-*):
 * in the still of the night, what the sun's warmth adds at the day's warmest, while snow falls,
 * in a strong wind, in a storm (#272), and in a gust; and the scale its names start on. */
export interface WindNumbers {
  readonly still: number;
  readonly thermal: number;
  readonly snow: number;
  readonly strong: number;
  readonly storm: number;
  readonly gust: number;
  readonly scale: WindScale;
}

/** What the Beaufort scale calls a wind, as far as a climber needs it. */
export type WindName = "calm" | "breeze" | "fresh" | "strong" | "gale";

/**
 * The wind in the Icefall (#260, #272): its speed where a climber stands, as a pocket weather
 * meter's impeller reads it (gear.wind-meter) and as the body feels it. It blows as the mountain
 * does: the weather of the hour, the up-valley wind the sun brings as the day warms
 * (route.icefall-wind, weather.khumbu-valley-winds), and a gust, which the jolts bring (#197). Its
 * speeds are the knowledge base's coefficients, fitted to the winds measured at Camp II above and
 * to the Beaufort scale, which names them.
 */
export class Wind {
  constructor(
    private readonly numbers: WindNumbers,
    private readonly warmth: DayWarmth,
  ) {
    const { still, thermal, snow, strong, storm, gust, scale } = numbers;
    const rising = snow >= still && strong >= snow && storm >= strong && gust >= strong;
    if (!(still >= 0 && thermal >= 0 && rising)) {
      throw new RangeError("The wind's speeds have to rise from the still night to a storm");
    }
    const { breeze, fresh, strong: near, gale } = scale;
    if (!(breeze > 0 && fresh > breeze && near > fresh && gale > near)) {
      throw new RangeError("The wind's names have to rise from a breeze to a gale");
    }
  }

  /** The steady wind at `timeOfDay` seconds after midnight in `weather`, in km/h. */
  steady(timeOfDay: number, weather: HazardWeather): number {
    const { still, thermal, snow, strong, storm } = this.numbers;
    const base =
      weather === "snow" ? snow : weather === "wind" ? strong : weather === "storm" ? storm : still;
    return base + thermal * this.warmth.at(timeOfDay, weather);
  }

  /** A gust's speed, in km/h: never under the steady wind it comes out of. */
  gust(timeOfDay: number, weather: HazardWeather): number {
    return Math.max(this.numbers.gust, this.steady(timeOfDay, weather));
  }

  /** What a speed in km/h is called, by the Beaufort scale's forces: calm and light air under a
   * light breeze, a breeze up to a fresh one, fresh up to a near gale, strong up to a gale. */
  named(speed: number): WindName {
    const { breeze, fresh, strong, gale } = this.numbers.scale;
    return speed < breeze
      ? "calm"
      : speed < fresh
        ? "breeze"
        : speed < strong
          ? "fresh"
          : speed < gale
            ? "strong"
            : "gale";
  }
}
