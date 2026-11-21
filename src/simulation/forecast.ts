import type { HazardWeather } from "./objective-hazards";
import { SeededRandom } from "./seeded-random";
import type { WeatherTruth } from "./weather";

/** Who forecasts (#272): Base Camp's forecaster, a meteorologist who weighs several models and
 * says how sure they are (weather.everest-forecast-models), or the general model a satellite
 * messenger fetches, one global model with no word on how sure it is (gear.messenger-weather). */
export type Forecaster = "base-camp" | "general";

/** How sure Base Camp's forecaster is of a day (weather.everest-forecast-confidence). */
export type Confidence = "high" | "medium" | "low";

/** How good a forecaster is, from the knowledge base (weather.*-forecast-*): the chance it calls
 * the sky right today, tomorrow and the day after; the chance it calls a storm a storm, when it
 * calls the sky right otherwise; and how far off its air is, in °C, and its wind, as a share,
 * for each day further ahead. */
export interface ForecastNumbers {
  readonly right: readonly [today: number, tomorrow: number, after: number];
  readonly storms: number;
  readonly air: number;
  readonly wind: number;
}

/** Six hours of a forecast: from when, in the mountain's seconds since the first day's midnight;
 * how many days after the day it was issued; the sky it says; the air, in °C, at the altitude it
 * was asked for, in the middle of the six hours; and the strongest steady wind, in km/h. */
export interface ForecastPeriod {
  readonly from: number;
  readonly day: number;
  readonly sky: HazardWeather;
  readonly air: number;
  readonly wind: number;
}

/** A day of a forecast: how many days after its issue, its six hours from midnight (today's from
 * the issue's on), and, Base Camp's, how sure the forecaster is of it. */
export interface ForecastDay {
  readonly day: number;
  readonly periods: readonly ForecastPeriod[];
  readonly confidence: Confidence | null;
}

/**
 * A forecast of the weather (#272): the truth, as the weather will be, with errors that grow the
 * further ahead it looks (weather.forecast-by-days, weather.forecast-precipitation-harder): the
 * sky called as another weather near it, the air off by degrees and the wind by a share. It's
 * issued every six hours, as forecasters send theirs (weather.forecast-issued), so it says the
 * same however often it's asked within them: its errors are drawn from the seed and the six hours
 * it was issued in, by a chance of its own, and draw nothing from the expedition's. It covers the
 * day it's issued on and the two after, in six hours each, as a satellite messenger's basic
 * forecast does (gear.messenger-weather).
 */
export class Forecast {
  static readonly DAYS = 3;
  private static readonly SIX_HOURS = 6 * 60 * 60;
  private static readonly DAY = 24 * 60 * 60;
  private static readonly PERIODS_A_DAY = 4;
  /** The forecasters' own chances, apart from each other's and the expedition's. */
  private static readonly CHANCE: Readonly<Record<Forecaster, number>> = {
    "base-camp": 0xbc0f,
    general: 0x6f5a,
  };
  /** The weathers from the mildest to the worst: a period says the worst in its six hours. */
  private static readonly WORSE: readonly HazardWeather[] = [
    "clear",
    "cloud",
    "wind",
    "snow",
    "storm",
  ];
  /** What each weather is mistaken for, when it is. */
  private static readonly MISTAKEN: Readonly<Record<HazardWeather, readonly HazardWeather[]>> = {
    clear: ["cloud", "wind"],
    cloud: ["clear", "snow"],
    snow: ["cloud", "storm"],
    wind: ["clear", "storm"],
    storm: ["snow", "wind"],
  };

  constructor(
    private readonly forecaster: Forecaster,
    private readonly numbers: ForecastNumbers,
    private readonly truth: WeatherTruth,
    private readonly seed: number,
  ) {
    const { right, storms, air, wind } = numbers;
    const shares = [...right, storms];
    if (!(shares.every((share) => share >= 0 && share <= 1) && air >= 0 && wind >= 0)) {
      throw new RangeError("A forecast's chances are shares, and its errors from nought up");
    }
  }

  /** The forecast as issued for the six hours `seconds`, since the first day's midnight, falls
   * in, for the place `altitude` metres up: today's from then, and the two days after. */
  issued(seconds: number, altitude: number): readonly ForecastDay[] {
    const issue = Math.floor(Math.max(0, seconds) / Forecast.SIX_HOURS);
    const first = Math.floor(issue / Forecast.PERIODS_A_DAY);
    const days: ForecastDay[] = [];
    for (let ahead = 0; ahead < Forecast.DAYS; ahead += 1) {
      const periods: ForecastPeriod[] = [];
      for (let quarter = 0; quarter < Forecast.PERIODS_A_DAY; quarter += 1) {
        const period = (first + ahead) * Forecast.PERIODS_A_DAY + quarter;
        if (period >= issue) {
          periods.push(this.period(issue, period, ahead, altitude));
        }
      }
      days.push({ day: ahead, periods, confidence: this.confidence(ahead, periods) });
    }
    return days;
  }

  /** The six hours `period` (counted from the first day's midnight), forecast at `issue`. */
  private period(issue: number, period: number, ahead: number, altitude: number): ForecastPeriod {
    const random = SeededRandom.fromSeed(
      Math.imul(this.seed ^ Forecast.CHANCE[this.forecaster], 0x9e3779b1) ^
        Math.imul(issue + 1, 0x85ebca77) ^
        Math.imul(period + 1, 0xc2b2ae3d),
    );
    const from = period * Forecast.SIX_HOURS;
    const truly = this.worst(from);
    const { right, storms, air, wind } = this.numbers;
    const calledRight = random.chance(right[ahead] ?? right[right.length - 1] ?? 0);
    const stormCaught = random.chance(storms);
    const mistaken = Forecast.MISTAKEN[truly];
    const other = mistaken[random.between(0, mistaken.length - 1)] ?? truly;
    const sky = calledRight && (truly !== "storm" || stormCaught) ? truly : other;
    const off = ahead + 1;
    const middle = from + Forecast.SIX_HOURS / 2;
    const airOff = (random.fraction() * 2 - 1) * air * off;
    const windOff = 1 + (random.fraction() * 2 - 1) * wind * off;
    return {
      from,
      day: ahead,
      sky,
      air: this.truth.air(middle, altitude) + airOff,
      wind: Math.max(0, this.strongest(from) * windOff),
    };
  }

  /** The worst weather in the six hours from `from`, each hour's. */
  private worst(from: number): HazardWeather {
    let worst = 0;
    for (let hour = 0; hour < 6; hour += 1) {
      const weather = this.truth.at(from + hour * 3600 + 1800);
      worst = Math.max(worst, Forecast.WORSE.indexOf(weather));
    }
    return Forecast.WORSE[worst] ?? "clear";
  }

  /** The strongest steady wind in the six hours from `from`, each hour's. */
  private strongest(from: number): number {
    let strongest = 0;
    for (let hour = 0; hour < 6; hour += 1) {
      strongest = Math.max(strongest, this.truth.wind(from + hour * 3600 + 1800));
    }
    return strongest;
  }

  /** How sure Base Camp's forecaster is of a day: less the further ahead, and less again of a day
   * it calls snow or a storm, which forecasts get wrong more often
   * (weather.forecast-precipitation-harder). The general model says nothing of it. */
  private confidence(ahead: number, periods: readonly ForecastPeriod[]): Confidence | null {
    if (this.forecaster === "general") {
      return null;
    }
    const levels: readonly Confidence[] = ["high", "medium", "low"];
    const falling = periods.some(({ sky }) => sky === "snow" || sky === "storm") ? 1 : 0;
    return levels[Math.min(levels.length - 1, ahead + falling)] ?? "low";
  }

  /** The day `seconds` falls on, from the first: a period's `from` is in it. */
  static dayOf(seconds: number): number {
    return Math.floor(seconds / Forecast.DAY);
  }
}
