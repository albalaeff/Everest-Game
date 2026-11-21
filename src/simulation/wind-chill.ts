import { Power } from "./power";

/** Canada's names for the risk of frostbite at a wind chill, from the least
 * (cold.wind-chill-*). */
export const FROSTBITE_RISKS = [
  "low",
  "moderate",
  "high",
  "very-high",
  "severe",
  "extreme",
] as const;
export type FrostbiteRisk = (typeof FROSTBITE_RISKS)[number];

/** A risk over low: the warmest wind chill it starts at, in whole degrees, and how soon bare skin
 * can freeze in it, in minutes, where Canada gives a time. */
export interface RiskBand {
  readonly from: number;
  readonly freezes: { readonly min: number; readonly max: number } | null;
}

/** The wind chill's numbers, from the knowledge base (#260): the index's terms,
 * constant + air·T − wind·V^power + airInWind·T·V^power for the air at T °C and the wind at
 * V km/h 10 m up, and the warmest air and the calmest wind it holds for (cold.wind-chill-*); what
 * the meter multiplies the wind in its hand by for the wind 10 m up (gear.wind-meter-chill-factor);
 * and Canada's bands of the risk of frostbite, with the minutes bare skin can freeze in each
 * (cold.wind-chill-<risk>, cold.freeze-time-<risk>). */
export interface WindChillNumbers {
  readonly constant: number;
  readonly air: number;
  readonly wind: number;
  readonly airInWind: number;
  readonly power: number;
  readonly warmest: number;
  readonly calmest: number;
  readonly factor: number;
  readonly risks: Readonly<Record<Exclude<FrostbiteRisk, "low">, RiskBand>>;
}

/** A wind chill, in °C, its risk of frostbite, and how soon bare skin can freeze in it. */
export interface ChillReading {
  readonly chill: number;
  readonly risk: FrostbiteRisk;
  readonly freezes: RiskBand["freezes"];
}

/**
 * The wind chill (#260): how cold the air feels on bare skin in the wind, by the index Canada and
 * the United States have used since 2001, from the air's temperature and the wind in hand, as a
 * pocket weather meter reads it (gear.wind-meter-readings), raised to the wind 10 m up that the
 * index takes (gear.wind-meter-chill-factor). Where the index doesn't hold, in a calm or in air
 * over its warmest, the chill is the air's own. Its risk of frostbite is Canada's, by the band its
 * whole degrees fall in. It's the core's since #272, the body's cold as much as the meter's: the
 * wind's power is raised with square roots (`Power`), so it comes out the same everywhere.
 */
export class WindChill {
  /** The risks over low, the worst first: a chill has the first whose band it's in. */
  private static readonly WORST_FIRST = FROSTBITE_RISKS.filter(
    (risk): risk is Exclude<FrostbiteRisk, "low"> => risk !== "low",
  ).reverse();

  private readonly power: Power;

  constructor(private readonly numbers: WindChillNumbers) {
    const froms = WindChill.WORST_FIRST.map((risk) => numbers.risks[risk].from);
    const warmer = froms.every((from, at) => at === 0 || from > (froms[at - 1] ?? from));
    if (!(warmer && numbers.factor > 0 && numbers.power > 0 && numbers.calmest >= 0)) {
      throw new RangeError("The risks of frostbite have to start colder as they rise");
    }
    this.power = new Power(numbers.power);
  }

  /** The wind chill of air at `air` °C in a wind the meter reads at `wind` km/h in its hand. */
  of(air: number, wind: number): ChillReading {
    const chill = this.chill(air, wind);
    const degrees = Math.round(chill);
    const { risks } = this.numbers;
    const risk = WindChill.WORST_FIRST.find((band) => degrees <= risks[band].from) ?? "low";
    return { chill, risk, freezes: risk === "low" ? null : risks[risk].freezes };
  }

  /** The index, for the wind 10 m up; the air itself where it doesn't hold. */
  private chill(air: number, wind: number): number {
    const { numbers } = this;
    const high = wind * numbers.factor;
    if (air > numbers.warmest || high < numbers.calmest) {
      return air;
    }
    const blown = this.power.of(high);
    return (
      numbers.constant + numbers.air * air - numbers.wind * blown + numbers.airInWind * air * blown
    );
  }
}
