import type { HazardWeather } from "./objective-hazards";

/** The day's warmth, in hours of the day: it starts to warm the ice `from`, is warmest at
 * `peak`, and is over `until`. */
export type WarmthHours = { readonly from: number; readonly peak: number; readonly until: number };

/** How much of the sun's warmth reaches the ice under cloud, and while snow falls: a share. */
export type SunShares = { readonly cloud: number; readonly snow: number };

/**
 * The sun's warmth on the ice at an hour and in a weather, 0 in the night to 1 at the warmest
 * hour of a clear day: what makes the seracs fall more often (`HazardChance`), the thermals blow
 * and the ladders' anchors loosen (`Jolts`, #197). It rises in a line from `from` to `peak` and
 * falls in one to `until`, so it needs nothing but the four operations
 * (docs/conventions/simulation-core.md → The same result).
 */
export class DayWarmth {
  private static readonly HOUR = 3600;

  constructor(
    private readonly hours: WarmthHours,
    private readonly sun: SunShares,
  ) {
    const { from, peak, until } = hours;
    if (!(from < peak && peak < until)) {
      throw new RangeError(
        `The day's warmth can't rise from ${from} h to ${peak} h and end at ${until} h`,
      );
    }
  }

  /** The warmth on the ice at `timeOfDay` seconds after midnight, in `weather`. */
  at(timeOfDay: number, weather: HazardWeather): number {
    return this.ofTheDay(timeOfDay) * this.sunIn(weather);
  }

  /** The day's warmth at a time of day: 0 in the night, 1 at its peak. */
  private ofTheDay(timeOfDay: number): number {
    const hour = timeOfDay / DayWarmth.HOUR;
    const { from, peak, until } = this.hours;
    if (hour <= from || hour >= until) {
      return 0;
    }
    return hour < peak ? (hour - from) / (peak - from) : (until - hour) / (until - peak);
  }

  /** How much of the sun's warmth reaches the ice in a weather. */
  private sunIn(weather: HazardWeather): number {
    const { sun } = this;
    return weather === "cloud" ? sun.cloud : weather === "snow" ? sun.snow : 1;
  }
}
