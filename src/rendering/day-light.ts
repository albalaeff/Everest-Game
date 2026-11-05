export type DayPhase = "night" | "dawn" | "day" | "dusk";

/**
 * The light of an hour of the mountain's day (docs/guidelines/graphics.md → light tells the time):
 * how high the sun stands, and from that how much daylight there is, how strong the alpenglow and
 * the stars are, and whether headlamps are on. Pure: the same hour gives the same light, in Node
 * as on the screen; `Palette` mixes the picture's colours from it.
 */
export class DayLight {
  static readonly SECONDS_A_DAY = 86_400;
  /** Sunrise and sunset over Everest in the climbing season, hours of Nepal's clock. */
  static readonly SUNRISE_HOUR = 5.75;
  static readonly SUNSET_HOUR = 18.3;
  /** How high the sun stands, as a share of its noon, when the twilight begins and ends. */
  private static readonly TWILIGHT = 0.12;
  /** How wide the glow of dawn and dusk is, in the sun's height each side of the horizon. */
  private static readonly GLOW_WIDTH = 0.14;
  /** The stars: all out with the sun this far down, gone by the time it's this near. */
  private static readonly STARS_FULL = -0.25;
  private static readonly STARS_GONE = -0.05;
  /** Headlamps: on until the sun is this high, off by the time it's this high. */
  private static readonly LAMPS_ON = -0.05;
  private static readonly LAMPS_OFF = 0.1;

  /** How high the sun stands: 1 at noon, 0 on the horizon, -1 in the middle of the night. */
  readonly sun: number;
  readonly phase: DayPhase;
  /** How much daylight there is, 0 at night to 1 by day. */
  readonly daylight: number;
  /** The alpenglow and the glow on the horizon, 0 to 1, strongest as the sun touches it. */
  readonly glow: number;
  /** Which side of the screen the glow is on: the right, up the mountain, in the morning, and
   * the left in the evening. */
  readonly glowSide: 1 | -1;
  /** How bright the stars are, 0 to 1. */
  readonly stars: number;
  /** How bright a headlamp shows, 0 to 1. */
  readonly lamps: number;

  private constructor(timeOfDay: number) {
    const hours = DayLight.hours(timeOfDay);
    const sun = DayLight.sunAt(hours);
    const morning = hours < (DayLight.SUNRISE_HOUR + DayLight.SUNSET_HOUR) / 2;
    this.sun = sun;
    this.phase =
      sun <= -DayLight.TWILIGHT
        ? "night"
        : sun >= DayLight.TWILIGHT
          ? "day"
          : morning
            ? "dawn"
            : "dusk";
    this.daylight = DayLight.smooth(sun, -DayLight.TWILIGHT, DayLight.TWILIGHT);
    this.glow = Math.exp(-((sun / DayLight.GLOW_WIDTH) ** 2));
    this.glowSide = morning ? 1 : -1;
    this.stars = 1 - DayLight.smooth(sun, DayLight.STARS_FULL, DayLight.STARS_GONE);
    this.lamps = 1 - DayLight.smooth(sun, DayLight.LAMPS_ON, DayLight.LAMPS_OFF);
  }

  /** The light at `timeOfDay` seconds since midnight, on any day: it wraps. */
  static at(timeOfDay: number): DayLight {
    return new DayLight(timeOfDay);
  }

  /** Whether two lights draw the same picture, near enough not to mix the colours again. */
  same(other: DayLight): boolean {
    const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.01;
    return (
      near(this.daylight, other.daylight) &&
      near(this.glow, other.glow) &&
      near(this.stars, other.stars) &&
      near(this.lamps, other.lamps) &&
      this.glowSide === other.glowSide
    );
  }

  /** Hours since midnight, 0 to 24, on whichever day. */
  private static hours(timeOfDay: number): number {
    const day = DayLight.SECONDS_A_DAY;
    return (((timeOfDay % day) + day) % day) / 3600;
  }

  /** The sun's height: half a sine up from sunrise to sunset, and the same down through the
   * night, so it's 0 at both ends and never jumps. */
  private static sunAt(hours: number): number {
    const { SUNRISE_HOUR: sunrise, SUNSET_HOUR: sunset } = DayLight;
    const dayLength = sunset - sunrise;
    if (hours >= sunrise && hours <= sunset) {
      return Math.sin((Math.PI * (hours - sunrise)) / dayLength);
    }
    const sinceSunset = (((hours - sunset) % 24) + 24) % 24;
    return -Math.sin((Math.PI * sinceSunset) / (24 - dayLength));
  }

  /** 0 below `from`, 1 above `to`, and a smooth step between. */
  private static smooth(value: number, from: number, to: number): number {
    const share = Math.min(Math.max((value - from) / (to - from), 0), 1);
    return share * share * (3 - 2 * share);
  }
}
