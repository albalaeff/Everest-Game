import type { HazardWeather } from "../simulation";

/**
 * The wind as the picture feels it in one weather: a strength, 0 to 1, that rises and falls over
 * the seconds in a few slow waves, around what the weather sets, so the spindrift, the plume and
 * the snow come in gusts rather than streaming. Pure: a function of the picture's seconds.
 */
export class Gust {
  /** The wind around which it gusts, by weather, and how far the gusts swing. */
  static readonly MEAN: Readonly<Record<HazardWeather, number>> = {
    clear: 0.12,
    cloud: 0.18,
    snow: 0.3,
    wind: 0.62,
  };
  private static readonly SWING: Readonly<Record<HazardWeather, number>> = {
    clear: 0.08,
    cloud: 0.1,
    snow: 0.18,
    wind: 0.35,
  };

  constructor(readonly weather: HazardWeather) {}

  /** The wind's strength at `elapsed` seconds of picture. */
  at(elapsed: number): number {
    const wave =
      0.5 * Math.sin(0.23 * elapsed) +
      0.33 * Math.sin(0.61 * elapsed + 1.3) +
      0.17 * Math.sin(1.7 * elapsed + 0.4);
    const gust = Gust.MEAN[this.weather] + Gust.SWING[this.weather] * wave;
    return Math.min(Math.max(gust, 0), 1);
  }
}
