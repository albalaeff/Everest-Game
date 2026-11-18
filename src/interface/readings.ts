import { MountainClock } from "../simulation";

/** A length of time, in whole hours and the minutes over: plain data, which fills a text. */
export type Duration = {
  readonly hours: number;
  readonly minutes: number;
};

/**
 * The instruments' readings as the player sees them, the same on the HUD and in a camp's notice:
 * the altimeter in whole metres with the thousands marked, the clock as 24-hour time, a
 * thermometer in degrees Celsius, and a duration in hours and minutes. English until the
 * language switch (#89).
 */
export class Readings {
  private static readonly LANGUAGE = "en";
  private static readonly SECONDS_AN_HOUR = 3600;
  private static readonly SECONDS_A_MINUTE = 60;
  /** The minus sign, U+2212, as a reading prints it: a hyphen is a dash's height and width. */
  private static readonly MINUS = "\u2212";

  /** The altimeter's reading of `metres` above sea level. */
  altitude(metres: number): string {
    return `${Math.round(metres).toLocaleString(Readings.LANGUAGE)} m`;
  }

  /** The clock's reading of `seconds` since midnight. */
  clock(seconds: number): string {
    return MountainClock.text(seconds);
  }

  /** A thermometer's reading of `celsius`, to `places` decimal places, with a true minus sign:
   * a reading that rounds to nought has none. */
  temperature(celsius: number, places = 0): string {
    const scale = 10 ** places;
    const rounded = Math.round(celsius * scale) / scale;
    const digits = Math.abs(rounded).toLocaleString(Readings.LANGUAGE, {
      minimumFractionDigits: places,
      maximumFractionDigits: places,
    });
    return `${rounded < 0 ? Readings.MINUS : ""}${digits} °C`;
  }

  /** `seconds` as whole hours and minutes. */
  duration(seconds: number): Duration {
    const hours = Math.floor(seconds / Readings.SECONDS_AN_HOUR);
    const minutes = Math.floor(
      (seconds - hours * Readings.SECONDS_AN_HOUR) / Readings.SECONDS_A_MINUTE,
    );
    return { hours, minutes };
  }
}
