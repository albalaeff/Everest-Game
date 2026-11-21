import type { HazardWeather, SkyTurn } from "../simulation";

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
 * gusts are `Gust`'s. One frozen look a weather, and, while the sky turns from one weather to
 * the next (#272), a look between the two, by how far it has turned.
 */
export class WeatherLook {
  /** How many looks a turn goes through, from the one weather's to the next's: the same look
   * comes back within a twentieth of the turn, so the palette isn't mixed again each frame. */
  private static readonly STEPS = 20;
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
  /** A storm (#272): snow in a gale, the far ridges gone, the slope in spindrift. */
  static readonly STORM = new WeatherLook("storm", {
    snowfall: 1,
    haze: 0.9,
    veil: 0.42,
    overcast: 1,
    fog: 1,
    mist: 0.34,
  });
  private static readonly LOOKS: Readonly<Record<HazardWeather, WeatherLook>> = {
    clear: WeatherLook.CLEAR,
    cloud: WeatherLook.CLOUD,
    snow: WeatherLook.SNOW,
    wind: WeatherLook.WIND,
    storm: WeatherLook.STORM,
  };
  /** The looks between two weathers made so far, by the two and the step of the turn. */
  private static readonly TURNING = new Map<string, WeatherLook>();

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

  /** The look of the sky as it turns (#272): the weather's own while it's steady, and between
   * the one it turns from and the one it turns to otherwise, to the nearest step of the turn. It's
   * the weather it turns to once it has turned halfway. */
  static turning({ from, to, share }: SkyTurn): WeatherLook {
    const step = Math.round(Math.min(Math.max(share, 0), 1) * WeatherLook.STEPS);
    if (from === to || step >= WeatherLook.STEPS) {
      return WeatherLook.LOOKS[to];
    }
    if (step <= 0) {
      return WeatherLook.LOOKS[from];
    }
    const key = `${from}>${to}@${step}`;
    const made = WeatherLook.TURNING.get(key);
    if (made !== undefined) {
      return made;
    }
    const before = WeatherLook.LOOKS[from];
    const after = WeatherLook.LOOKS[to];
    const turned = step / WeatherLook.STEPS;
    const mixed = (one: number, other: number) => one + (other - one) * turned;
    const look = new WeatherLook(turned < 0.5 ? from : to, {
      snowfall: mixed(before.snowfall, after.snowfall),
      haze: mixed(before.haze, after.haze),
      veil: mixed(before.veil, after.veil),
      overcast: mixed(before.overcast, after.overcast),
      fog: mixed(before.fog, after.fog),
      mist: mixed(before.mist, after.mist),
    });
    WeatherLook.TURNING.set(key, look);
    return look;
  }
}
