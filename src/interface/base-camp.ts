import type { ForecastDay, HazardWeather, RadioCall } from "../simulation";
import { RADIO_PHRASES } from "./device-texts";
import type { DeviceTextName, ForecastDayIndex, ForecastPart, RadioPhrase } from "./device-texts";
import { Readings } from "./readings";
import type { SunReading } from "./sun-clock";
import type { Texts } from "./texts";

/** The mountain as Base Camp knows it when a call comes in: the part of the route the caller is
 * on and their altitude, the weather, what Base Camp's weather station reads, in °C, where the sun
 * is on the ice, how many ladders are down, the metres of route the caller has left, and its
 * forecaster's forecast as issued then (#272). */
export interface CallScene {
  readonly part: string;
  readonly altitude: number;
  readonly weather: HazardWeather;
  readonly air: number;
  readonly sun: SunReading;
  readonly laddersDown: number;
  readonly left: number;
  readonly forecast: readonly ForecastDay[];
}

/**
 * Base Camp on the radio (#260): whoever listens on the team's channel there (gear.radio-limits)
 * and answers a climber's ready phrase from what the mountain is doing, as a base camp manager
 * does: a radio check, a position logged with its time, the conditions with what its weather
 * station reads and the sun's hour, the route above, a call for help. A call that didn't get out
 * gets static. The words are content/devices.json's; nothing here is a number of the mountain's.
 */
export class BaseCamp {
  private static readonly METRES_A_KILOMETRE = 1000;
  private static readonly SIX_HOURS = 6 * 60 * 60;
  /** The forecaster gives the wind to the nearest 5 km/h. */
  private static readonly WIND_STEP = 5;
  private readonly readings = new Readings();

  constructor(private readonly texts: Texts<DeviceTextName>) {}

  /** Whether `phrase` is one of the radio's. */
  static knows(phrase: string): phrase is RadioPhrase {
    return (RADIO_PHRASES as readonly string[]).includes(phrase);
  }

  /** What the climber says into the radio for a phrase, where they stand. */
  said(phrase: RadioPhrase, scene: CallScene): string {
    return this.texts.say(`said.${phrase}`, this.place(scene));
  }

  /** Base Camp's answer to a call, a line or two. */
  answer(call: RadioCall, scene: CallScene): readonly string[] {
    const { texts } = this;
    if (!call.heard) {
      return [texts.say("reply.no-contact")];
    }
    if (!BaseCamp.knows(call.phrase)) {
      return [texts.say("reply.unknown")];
    }
    switch (call.phrase) {
      case "radio-check":
        return [texts.say("reply.radio-check")];
      case "position":
        return [
          texts.say("reply.position", {
            ...this.place(scene),
            time: this.readings.clock(call.at),
          }),
        ];
      case "conditions":
        return [
          texts.say(`reply.conditions.${scene.weather}`),
          texts.say("reply.air", { air: this.readings.temperature(scene.air, 1) }),
          this.sun(scene.sun),
        ];
      case "forecast":
        return scene.forecast.map((day) => this.forecastOf(day));
      case "route":
        return [
          scene.laddersDown > 0
            ? texts.say("reply.route.ladder")
            : texts.say("reply.route.open", { left: this.distance(scene.left) }),
        ];
      case "help":
        return [texts.say("reply.help", this.place(scene))];
    }
  }

  /** A distance along the route as the radio says it: whole metres under a kilometre, and
   * kilometres to a tenth from there. */
  distance(metres: number): string {
    return metres < BaseCamp.METRES_A_KILOMETRE
      ? this.texts.say("gps.metres", { metres: Math.round(metres) })
      : this.texts.say("gps.kilometres", {
          kilometres: Math.round(metres / (BaseCamp.METRES_A_KILOMETRE / 10)) / 10,
        });
  }

  /** A day of the forecaster's forecast in a line (#272): its skies in the order they come, from
   * the six hours they come by, the strongest wind to the nearest 5 km/h, and how sure they are. */
  forecastOf(day: ForecastDay): string {
    const { texts } = this;
    const [first] = day.periods;
    const index = Math.min(day.day, 2) as ForecastDayIndex;
    const wind = Math.max(0, ...day.periods.map(({ wind: blowing }) => blowing));
    const skies: string[] = [];
    let last: HazardWeather | null = null;
    for (const { sky, from } of day.periods) {
      if (sky === last) {
        continue;
      }
      const words = texts.say(`forecast.sky.${sky}`);
      const part = (Math.floor(from / BaseCamp.SIX_HOURS) % 4) as ForecastPart;
      skies.push(last === null ? words : texts.say(`forecast.by.${part}`, { sky: words }));
      last = sky;
    }
    const steady = skies.length === 1 && first !== undefined;
    return texts.say("reply.forecast", {
      day: texts.say(`forecast.day.${index}`),
      skies: steady ? texts.say("forecast.all-day", { sky: skies[0] ?? "" }) : skies.join(", "),
      wind: Math.round(wind / BaseCamp.WIND_STEP) * BaseCamp.WIND_STEP,
      confidence: texts.say(`forecast.confidence.${day.confidence ?? "low"}`),
    });
  }

  private place(scene: CallScene): { part: string; altitude: string } {
    return {
      part: this.texts.say(`part.${scene.part}`),
      altitude: this.readings.altitude(scene.altitude),
    };
  }

  private sun(sun: SunReading): string {
    return sun.state === "cold"
      ? this.texts.say("reply.sun.cold", {
          hours: sun.hours,
          minutes: String(sun.minutes).padStart(2, "0"),
        })
      : this.texts.say(`reply.sun.${sun.state}`);
  }
}
