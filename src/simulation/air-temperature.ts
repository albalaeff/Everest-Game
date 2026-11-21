import type { HazardWeather } from "./objective-hazards";

/** The coldest and the warmest the air gets in a day, in °C. */
export interface AirDay {
  readonly min: number;
  readonly max: number;
}

/** The air's numbers, from the knowledge base (#260): a day's coldest and warmest at Base Camp's
 * weather station in each weather (weather.icefall-air-*), the hours of the day they come at
 * (weather.icefall-coldest-hour, -warmest-hour), how many degrees colder it is a kilometre higher
 * (weather.premonsoon-lapse-rate), and the station's altitude, in metres
 * (weather.base-camp-station-altitude). */
export interface AirNumbers {
  readonly days: Readonly<Record<HazardWeather, AirDay>>;
  readonly coldest: number;
  readonly warmest: number;
  readonly lapse: number;
  readonly station: number;
}

/**
 * The air's temperature on the mountain (#260), as a thermometer reads it in the shade: coldest
 * as the sun comes up and warmest at midday, a day's range by its weather, and colder the higher
 * it is. Its day is the Base Camp weather station's: the air warms fast in the morning's sun and
 * cools fast through the late afternoon, then slowly through the night
 * (weather.base-camp-daily-cycle). So it rises from the coldest along a curve that flattens
 * towards the warmest, and falls from there along one that flattens towards the next sunrise.
 * The weather meter reads it, Base Camp's station, and the body feels it (#272): four operations
 * only, as the simulation core's maths are.
 */
export class AirTemperature {
  private static readonly SECONDS_AN_HOUR = 3600;
  private static readonly HOURS_A_DAY = 24;
  private static readonly METRES_A_KILOMETRE = 1000;

  constructor(private readonly numbers: AirNumbers) {
    const { days, coldest, warmest, lapse } = numbers;
    const day = AirTemperature.HOURS_A_DAY;
    const ordered = Object.values(days).every(({ min, max }) => min <= max);
    if (!(ordered && 0 <= coldest && coldest < warmest && warmest < day && lapse >= 0)) {
      throw new RangeError("The air has to warm from its coldest hour to its warmest within a day");
    }
  }

  /** The air's temperature, in °C, `altitude` metres up, `timeOfDay` seconds after midnight, in
   * `weather`. */
  at(timeOfDay: number, weather: HazardWeather, altitude: number): number {
    const { days, lapse, station } = this.numbers;
    const { min, max } = days[weather];
    const higher = (altitude - station) / AirTemperature.METRES_A_KILOMETRE;
    return min + (max - min) * this.warmed(timeOfDay) - lapse * higher;
  }

  /** What Base Camp's weather station reads, `timeOfDay` seconds after midnight in `weather`. */
  station(timeOfDay: number, weather: HazardWeather): number {
    return this.at(timeOfDay, weather, this.numbers.station);
  }

  /** How far the air has warmed at `timeOfDay`, from 0 at the day's coldest to 1 at its warmest:
   * the morning's rise slows as it nears the top, and the fall after it slows towards sunrise. */
  private warmed(timeOfDay: number): number {
    const { coldest, warmest } = this.numbers;
    const day = AirTemperature.HOURS_A_DAY;
    const hour = (((timeOfDay / AirTemperature.SECONDS_AN_HOUR) % day) + day) % day;
    const rising = warmest - coldest;
    if (hour >= coldest && hour < warmest) {
      const left = 1 - (hour - coldest) / rising;
      return 1 - left * left;
    }
    const left = 1 - ((hour - warmest + day) % day) / (day - rising);
    return left * left;
  }
}
