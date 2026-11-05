import type { HazardWeather } from "../simulation";
import { DayLight } from "./day-light";
import { Gust } from "./gust";
import { Palette } from "./palette";
import { WeatherLook } from "./weather-look";

/**
 * The air and the light of a frame, as every layer reads them: the light of the hour, the palette
 * mixed from it, the weather's look, the wind's gust now, and the picture's own seconds. The scene
 * makes one each frame from the mountain's clock and the hazards' weather; the palette is mixed
 * again only when the light has changed enough to show.
 */
export class Atmosphere {
  readonly light: DayLight;
  readonly palette: Palette;
  readonly look: WeatherLook;
  /** The wind's strength this frame, 0 to 1. */
  readonly gust: number;
  /** Seconds of picture since the scene opened: what the twinkle, the wobble and the breath run
   * on. */
  readonly elapsed: number;

  private constructor(
    light: DayLight,
    palette: Palette,
    look: WeatherLook,
    gust: number,
    elapsed: number,
  ) {
    this.light = light;
    this.palette = palette;
    this.look = look;
    this.gust = gust;
    this.elapsed = elapsed;
  }

  /** The atmosphere as the picture opens: `timeOfDay` seconds since midnight, in `weather`. */
  static at(timeOfDay: number, weather: HazardWeather): Atmosphere {
    const light = DayLight.at(timeOfDay);
    return new Atmosphere(
      light,
      new Palette(light),
      WeatherLook.of(weather),
      new Gust(weather).at(0),
      0,
    );
  }

  /** The atmosphere `seconds` later, the clock at `timeOfDay` and the weather as it is: the same
   * palette while the light looks the same. */
  after(seconds: number, timeOfDay: number, weather: HazardWeather): Atmosphere {
    const light = DayLight.at(timeOfDay);
    const elapsed = this.elapsed + Math.max(seconds, 0);
    return new Atmosphere(
      light,
      light.same(this.light) ? this.palette : new Palette(light),
      WeatherLook.of(weather),
      new Gust(weather).at(elapsed),
      elapsed,
    );
  }

  /** Whether the colours have been mixed again since `other`: a layer redraws its gradients. */
  recoloured(other: Atmosphere): boolean {
    return this.palette !== other.palette;
  }
}
