import type { CallScene } from "../interface/base-camp";
import type { GpsFix, GpsWatch } from "../interface/gps-watch";
import type { SunClock, SunReading } from "../interface/sun-clock";
import type { SlopePhysics } from "../physics";
import type {
  ChillReading,
  ClimberId,
  Devices,
  Forecast,
  ForecastDay,
  HandView,
  Jolts,
  MountainClock,
  ObjectiveHazards,
  RadioCall,
  RadioView,
  TrackerView,
  Weather,
  Wind,
  WindChill,
  WindName,
} from "../simulation";

/** The rules the devices read: the page's, or a room's. */
export interface DeviceRules {
  readonly devices: Devices;
  readonly clock: MountainClock;
  readonly physics: SlopePhysics;
  readonly hazards: ObjectiveHazards;
  readonly jolts: Jolts;
  /** The weather of the hour, the sky turning, and the days ahead (#272). */
  readonly weather: Weather;
}

/** A pocket weather meter's parts (#260): its impeller, which names the wind and reads a gust;
 * the wind chill it works out; and the altitude of Base Camp's weather station, which Base Camp
 * reads its air at. The air and the steady wind are the weather's, as the sky turns (#272). */
export interface WeatherMeter {
  readonly wind: Wind;
  readonly chill: WindChill;
  readonly station: number;
}

/** The forecasts the devices give (#272): Base Camp's forecaster's, on the radio, and the general
 * model's, which the tracker fetches. */
export interface Forecasts {
  readonly baseCamp: Forecast;
  readonly general: Forecast;
}

/** The wind where the player stands, in km/h: as it blows steadily, as a gust would, whether a
 * gust is on its way to them, and how many gusts have caught them so far. */
export interface WindNow {
  readonly steady: number;
  readonly gust: number;
  readonly coming: boolean;
  readonly gusts: number;
}

/**
 * What the player's devices read off the climb this frame (#260), for the panel that draws them:
 * the GPS watch's fix, the wind and the air where they stand, their radio and their tracker,
 * their own calls, and the mountain as Base Camp knows it when a call comes in. It keeps nothing:
 * every reading is the rules' own state, so a room's player reads what the room's climb does.
 */
export class DeviceReadings {
  constructor(
    private readonly rules: DeviceRules,
    private readonly player: ClimberId,
    private readonly watch: GpsWatch,
    private readonly meter: WeatherMeter,
    private readonly sunClock: SunClock,
    private readonly forecasts: Forecasts,
  ) {}

  /** The GPS watch's reading where the player is: no fix where they hang under the ice. */
  get gps(): GpsFix {
    const { physics, clock } = this.rules;
    const { altitude, hanging } = physics.climber(this.player);
    return this.watch.reading({
      along: physics.along(this.player),
      altitude,
      sky: !hanging,
      elapsed: clock.elapsed,
      timeOfDay: clock.timeOfDay,
    });
  }

  /** Where the player is on the slope, in its metres, and how far along its ground: the dot on
   * the watch's map, and the end of the track on it. */
  get spot(): { readonly x: number; readonly y: number; readonly along: number } {
    const { physics } = this.rules;
    const { x, y } = physics.climber(this.player);
    return { x, y, along: physics.along(this.player) };
  }

  /** The player's altitude, as the altimeter reads it. */
  get altitude(): number {
    return this.rules.physics.climber(this.player).altitude;
  }

  /** The mountain's time of day, in seconds. */
  get timeOfDay(): number {
    return this.rules.clock.timeOfDay;
  }

  /** The mountain's seconds since the climb set off: the watch's activity (#284). */
  get elapsed(): number {
    return this.rules.clock.elapsed;
  }

  /** Where the sun is on the ice. */
  get sun(): SunReading {
    return this.sunClock.at(this.rules.clock.timeOfDay);
  }

  /** The wind where the player stands: the weather's, as the sky turns (#272). */
  get wind(): WindNow {
    const { clock, jolts, weather } = this.rules;
    const steady = weather.windNow();
    return {
      steady,
      gust: Math.max(steady, this.meter.wind.gust(clock.timeOfDay, weather.now)),
      coming: jolts.comingTo(this.player) === "gust",
      gusts: jolts.jolts.filter(
        ({ kind, caught }) => kind === "gust" && caught.includes(this.player),
      ).length,
    };
  }

  /** What the meter calls a wind of `speed` km/h. */
  named(speed: number): WindName {
    return this.meter.wind.named(speed);
  }

  /** The air where the player stands, in °C, as the sky turns (#272). */
  get air(): number {
    return this.rules.weather.airNow(this.altitude);
  }

  /** The wind chill the meter works out from the air where the player stands and a wind it
   * reads at `speed` km/h, with its risk of frostbite. */
  chill(speed: number): ChillReading {
    return this.meter.chill.of(this.air, speed);
  }

  get radio(): RadioView {
    return this.rules.devices.radio(this.player);
  }

  get tracker(): TrackerView {
    return this.rules.devices.tracker(this.player);
  }

  /** The player's hand: the device they took out, if any (#271). */
  get hand(): HandView {
    return this.rules.devices.hand(this.player);
  }

  /** The player's own calls on the radio, in order. */
  get calls(): readonly RadioCall[] {
    return this.rules.devices.calls.filter(({ climber }) => climber === this.player);
  }

  /** The mountain as Base Camp knows it now: where the player is, the weather, what its weather
   * station reads, the sun, the ladders that are down, how far they have left, and its
   * forecaster's forecast for where they are, as issued now (#272). */
  get scene(): CallScene {
    const { physics, weather } = this.rules;
    const { part, left } = this.gps;
    return {
      part,
      altitude: this.altitude,
      weather: weather.now,
      air: weather.airNow(this.meter.station),
      sun: this.sun,
      laddersDown: physics.ladders.filter((id) => physics.ladderCondition(id) === "broken").length,
      left,
      forecast: this.forecasts.baseCamp.issued(weather.seconds, this.altitude),
    };
  }

  /** The general model's forecast the tracker fetched (#272), as it was issued when its request
   * reached the service, for where the player was then; none until one has come back. */
  get fetched(): readonly ForecastDay[] | null {
    const { weather } = this.tracker;
    if (weather.arrived === null) {
      return null;
    }
    return this.forecasts.general.issued(weather.arrived.issued, weather.arrived.altitude);
  }
}
