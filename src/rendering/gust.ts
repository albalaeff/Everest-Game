import type { HazardWeather, SkyTurn } from "../simulation";

/**
 * The wind as the picture feels it in one weather, or as the sky turns from one to the next
 * (#272): a strength, 0 to 1, that rises and falls over the seconds in a few slow waves, around
 * what the weather sets, so the spindrift, the plume and the snow come in gusts rather than
 * streaming. Pure: a function of the picture's seconds.
 */
export class Gust {
  /** The wind around which it gusts, by weather, and how far the gusts swing. */
  static readonly MEAN: Readonly<Record<HazardWeather, number>> = {
    clear: 0.12,
    cloud: 0.18,
    snow: 0.3,
    wind: 0.62,
    storm: 0.78,
  };
  private static readonly SWING: Readonly<Record<HazardWeather, number>> = {
    clear: 0.08,
    cloud: 0.1,
    snow: 0.18,
    wind: 0.35,
    storm: 0.3,
  };

  private readonly mean: number;
  private readonly swing: number;

  constructor(weather: HazardWeather | SkyTurn) {
    const { from, to, share } =
      typeof weather === "string" ? { from: weather, to: weather, share: 1 } : weather;
    const turned = Math.min(Math.max(share, 0), 1);
    this.mean = Gust.MEAN[from] + (Gust.MEAN[to] - Gust.MEAN[from]) * turned;
    this.swing = Gust.SWING[from] + (Gust.SWING[to] - Gust.SWING[from]) * turned;
  }

  /** The wind's strength at `elapsed` seconds of picture. */
  at(elapsed: number): number {
    const wave =
      0.5 * Math.sin(0.23 * elapsed) +
      0.33 * Math.sin(0.61 * elapsed + 1.3) +
      0.17 * Math.sin(1.7 * elapsed + 0.4);
    const gust = this.mean + this.swing * wave;
    return Math.min(Math.max(gust, 0), 1);
  }
}
