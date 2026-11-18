import type { HazardWeather, RadioCall } from "../simulation";
import { RADIO_PHRASES } from "./device-texts";
import type { DeviceTextName, RadioPhrase } from "./device-texts";
import { Readings } from "./readings";
import type { SunReading } from "./sun-clock";
import type { Texts } from "./texts";

/** The mountain as Base Camp knows it when a call comes in: the part of the route the caller is
 * on and their altitude, the weather, what Base Camp's weather station reads, in °C, where the sun
 * is on the ice, how many ladders are down, and the metres of route the caller has left. */
export interface CallScene {
  readonly part: string;
  readonly altitude: number;
  readonly weather: HazardWeather;
  readonly air: number;
  readonly sun: SunReading;
  readonly laddersDown: number;
  readonly left: number;
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
