/** The day's warmth on the ice, in hours of the day, as the hazards have it (`HazardSettings`). */
export interface DayWarmth {
  readonly from: number;
  readonly peak: number;
  readonly until: number;
}

/** Where the sun is on the ice at an hour: before it, how long until it comes; on it, how warm
 * the ice is, from 0 as it starts to 1 at the day's warmest. */
export type SunReading =
  | { readonly state: "cold"; readonly hours: number; readonly minutes: number; readonly warmth: 0 }
  | { readonly state: "warming" | "cooling"; readonly warmth: number };

/**
 * The sun clock (#194): when the sun comes onto the ice, what a climber leaving at 3 a.m. races,
 * since the warming ice brings the seracs down (route.icefall-lessons). Before the sun, how long
 * until it comes; while it's on the ice, how warm it's grown. Read off the mountain's clock and
 * the hazards' own hours, so the HUD says what the hazards do.
 */
export class SunClock {
  private static readonly HOUR = 3600;
  private static readonly DAY = 24;

  constructor(private readonly warmth: DayWarmth) {
    const { from, peak, until } = warmth;
    if (!(from < peak && peak < until)) {
      throw new RangeError(
        `The day's warmth can't rise from ${from} h to ${peak} h and end at ${until} h`,
      );
    }
  }

  /** Where the sun is on the ice at `timeOfDay` seconds after midnight. */
  at(timeOfDay: number): SunReading {
    const hour = timeOfDay / SunClock.HOUR;
    const { from, peak, until } = this.warmth;
    if (hour >= from && hour < peak) {
      return { state: "warming", warmth: (hour - from) / (peak - from) };
    }
    if (hour >= peak && hour < until) {
      return { state: "cooling", warmth: (until - hour) / (until - peak) };
    }
    const left = (hour < from ? from - hour : SunClock.DAY - hour + from) * 60;
    const whole = Math.floor(left + 1e-9);
    return { state: "cold", hours: Math.floor(whole / 60), minutes: whole % 60, warmth: 0 };
  }
}
