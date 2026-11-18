import type { CallScene } from "../interface/base-camp";
import type { GpsFix, GpsWatch } from "../interface/gps-watch";
import type { SunClock, SunReading } from "../interface/sun-clock";
import type { WindMeter } from "../interface/wind-meter";
import type { SlopePhysics } from "../physics";
import type {
  ClimberId,
  Devices,
  Jolts,
  MountainClock,
  ObjectiveHazards,
  RadioCall,
  RadioView,
  TrackerView,
} from "../simulation";

/** The rules the devices read: the page's, or a room's. */
export interface DeviceRules {
  readonly devices: Devices;
  readonly clock: MountainClock;
  readonly physics: SlopePhysics;
  readonly hazards: ObjectiveHazards;
  readonly jolts: Jolts;
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
 * the GPS watch's fix, the wind where they stand, their radio and their tracker, their own calls,
 * and the mountain as Base Camp knows it when a call comes in. It keeps nothing: every reading
 * is the rules' own state, so a room's player reads what the room's climb does.
 */
export class DeviceReadings {
  constructor(
    private readonly rules: DeviceRules,
    private readonly player: ClimberId,
    private readonly watch: GpsWatch,
    private readonly meter: WindMeter,
    private readonly sunClock: SunClock,
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

  /** Where the player is on the slope, in its metres: the dot on the watch's map. */
  get spot(): { readonly x: number; readonly y: number } {
    const { x, y } = this.rules.physics.climber(this.player);
    return { x, y };
  }

  /** The player's altitude, as the altimeter reads it. */
  get altitude(): number {
    return this.rules.physics.climber(this.player).altitude;
  }

  /** The mountain's time of day, in seconds. */
  get timeOfDay(): number {
    return this.rules.clock.timeOfDay;
  }

  /** Where the sun is on the ice. */
  get sun(): SunReading {
    return this.sunClock.at(this.rules.clock.timeOfDay);
  }

  /** The wind where the player stands. */
  get wind(): WindNow {
    const { clock, hazards, jolts } = this.rules;
    const { timeOfDay } = clock;
    return {
      steady: this.meter.steady(timeOfDay, hazards.weather),
      gust: this.meter.gust(timeOfDay, hazards.weather),
      coming: jolts.comingTo(this.player) === "gust",
      gusts: jolts.jolts.filter(
        ({ kind, caught }) => kind === "gust" && caught.includes(this.player),
      ).length,
    };
  }

  get radio(): RadioView {
    return this.rules.devices.radio(this.player);
  }

  get tracker(): TrackerView {
    return this.rules.devices.tracker(this.player);
  }

  /** The player's own calls on the radio, in order. */
  get calls(): readonly RadioCall[] {
    return this.rules.devices.calls.filter(({ climber }) => climber === this.player);
  }

  /** The mountain as Base Camp knows it now: where the player is, the weather, the sun, the
   * ladders that are down, and how far they have left. */
  get scene(): CallScene {
    const { physics, hazards } = this.rules;
    const { part, left } = this.gps;
    return {
      part,
      altitude: this.altitude,
      weather: hazards.weather,
      sun: this.sun,
      laddersDown: physics.ladders.filter((id) => physics.ladderCondition(id) === "broken").length,
      left,
    };
  }
}
