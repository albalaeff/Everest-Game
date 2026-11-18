import type { DayWarmth, HazardWeather } from "../simulation";

/** The wind's speeds in the Icefall, in km/h, from the knowledge base (weather.icefall-wind-*):
 * in the still of the night, what the sun's thermals add at the day's warmest, while snow falls,
 * in a strong wind, and in a gust. */
export interface WindNumbers {
  readonly still: number;
  readonly thermal: number;
  readonly snow: number;
  readonly strong: number;
  readonly gust: number;
}

/** What the Beaufort scale calls a wind, as far as a climber needs it. */
export type WindName = "calm" | "breeze" | "fresh" | "strong" | "gale";

/**
 * A pocket wind meter (#260), as climbers have carried on Everest (gear.wind-meter): the speed
 * of the wind where its holder stands. It reads what the mountain does: the scenario's weather,
 * the thermals the sun brings as the day warms (route.icefall-wind), and a gust, which the jolts
 * bring (#197). Its speeds are the knowledge base's coefficients, fitted to the Beaufort scale.
 */
export class WindMeter {
  constructor(
    private readonly numbers: WindNumbers,
    private readonly warmth: DayWarmth,
  ) {
    const { still, thermal, snow, strong, gust } = numbers;
    if (!(still >= 0 && thermal >= 0 && snow >= still && strong >= snow && gust >= strong)) {
      throw new RangeError("The wind's speeds have to rise from the still night to a gust");
    }
  }

  /** The steady wind at `timeOfDay` seconds after midnight in `weather`, in km/h. */
  steady(timeOfDay: number, weather: HazardWeather): number {
    const { still, thermal, snow, strong } = this.numbers;
    const base = weather === "snow" ? snow : weather === "wind" ? strong : still;
    return base + thermal * this.warmth.at(timeOfDay, weather);
  }

  /** A gust's speed, in km/h: never under the steady wind it comes out of. */
  gust(timeOfDay: number, weather: HazardWeather): number {
    return Math.max(this.numbers.gust, this.steady(timeOfDay, weather));
  }

  /** What a speed in km/h is called, by the Beaufort scale's forces: calm and light air under 6,
   * a breeze to 28, fresh to 49, strong to 61, a gale from 62. */
  static named(speed: number): WindName {
    return speed < 6
      ? "calm"
      : speed < 29
        ? "breeze"
        : speed < 50
          ? "fresh"
          : speed < 62
            ? "strong"
            : "gale";
  }
}
