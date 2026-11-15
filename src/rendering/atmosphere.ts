import type { HazardWeather } from "../simulation";
import { DayLight } from "./day-light";
import { Gust } from "./gust";
import { Palette } from "./palette";
import { ThinAir } from "./thin-air";
import { WeatherLook } from "./weather-look";

/** A palette, and the light and the air it was mixed in. */
interface Mixed {
  readonly palette: Palette;
  readonly light: DayLight;
  readonly air: ThinAir;
}

/**
 * The air and the light of a frame, as every layer reads them: the light of the hour, the air
 * above the climber, the palette mixed from them, the weather's look, the wind's gust now, and the
 * picture's own seconds. The scene makes one each frame from the mountain's clock, the climber's
 * altitude and the hazards' weather; the palette is mixed again only when the light or the air
 * has changed enough to show since it was mixed, or the weather has.
 */
export class Atmosphere {
  readonly light: DayLight;
  readonly air: ThinAir;
  readonly look: WeatherLook;
  /** The wind's strength this frame, 0 to 1. */
  readonly gust: number;
  /** Seconds of picture since the scene opened: what the twinkle, the wobble and the breath run
   * on. */
  readonly elapsed: number;
  private readonly mixed: Mixed;

  private constructor(
    light: DayLight,
    air: ThinAir,
    look: WeatherLook,
    mixed: Mixed,
    gust: number,
    elapsed: number,
  ) {
    this.light = light;
    this.air = air;
    this.look = look;
    this.mixed = mixed;
    this.gust = gust;
    this.elapsed = elapsed;
  }

  /** The atmosphere as the picture opens: `timeOfDay` seconds since midnight, in `weather`, at
   * `altitude` metres. */
  static at(timeOfDay: number, weather: HazardWeather, altitude: number): Atmosphere {
    const light = DayLight.at(timeOfDay);
    const air = ThinAir.at(altitude);
    const look = WeatherLook.of(weather);
    return new Atmosphere(
      light,
      air,
      look,
      { palette: new Palette(light, air, look), light, air },
      new Gust(weather).at(0),
      0,
    );
  }

  /** The atmosphere `seconds` later, the clock at `timeOfDay`, the weather and the altitude as they
   * are, and a gust that jolts the climbers `blowing`, 0 to 1, on its way (#197): the same palette
   * while the light and the air look as they did when it was mixed, so a dawn that no frame's step
   * shows still shows once it has gone on long enough. */
  after(
    seconds: number,
    timeOfDay: number,
    weather: HazardWeather,
    altitude: number,
    blowing = 0,
  ): Atmosphere {
    const light = DayLight.at(timeOfDay);
    const air = ThinAir.at(altitude);
    const look = WeatherLook.of(weather);
    const elapsed = this.elapsed + Math.max(seconds, 0);
    const { mixed } = this;
    const same = look === this.look && light.same(mixed.light) && air.same(mixed.air);
    return new Atmosphere(
      light,
      air,
      look,
      same ? mixed : { palette: new Palette(light, air, look), light, air },
      Math.max(new Gust(weather).at(elapsed), Math.min(Math.max(blowing, 0), 1)),
      elapsed,
    );
  }

  /** The colours of the frame. */
  get palette(): Palette {
    return this.mixed.palette;
  }

  /** The glow of dawn and dusk as far as the sky shows it, 0 to 1: dimmed by the cloud. */
  get glow(): number {
    return this.light.glow * (1 - this.look.overcast);
  }

  /** How bright the stars are, 0 to 1: dimmed by the cloud. */
  get stars(): number {
    return this.light.stars * (1 - this.look.overcast);
  }

  /** Whether the colours have been mixed again since `other`: a layer redraws its gradients. */
  recoloured(other: Atmosphere): boolean {
    return this.palette !== other.palette;
  }
}
