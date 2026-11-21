import { DEVICE_KINDS } from "../simulation";
import type { Confidence, DeviceKind, HazardWeather } from "../simulation";
import type { SunReading } from "./sun-clock";
import type { FrostbiteRisk, WindName } from "../simulation";

/** The devices a climber carries (#260), in the order the panel's tabs have them. */
export const DEVICES = DEVICE_KINDS;
export type DeviceName = DeviceKind;

/** The radio's ready phrases, in the order its buttons have them: the forecast since #272. */
export const RADIO_PHRASES = [
  "radio-check",
  "position",
  "conditions",
  "forecast",
  "route",
  "help",
] as const;
export type RadioPhrase = (typeof RADIO_PHRASES)[number];

/** A forecast's days, from the day it's issued, and its six hours of the day, from midnight
 * (#272). */
export type ForecastDayIndex = 0 | 1 | 2;
export type ForecastPart = 0 | 1 | 2 | 3;

/** The devices' words in content/devices.json: the panel's, each device's face, what the climber
 * says on the radio for each phrase and each of Base Camp's answers, and the route's parts and
 * camps by their ids in the section's file. */
export type DeviceTextName =
  | "eyebrow"
  | "title"
  | "close"
  | "close-label"
  | `tab.${DeviceName}`
  | "radio.channel"
  | "radio.contact"
  | "radio.no-contact"
  | "radio.empty"
  | "radio.waiting"
  | "who.you"
  | "who.base-camp"
  | `phrase.${RadioPhrase}`
  | `said.${RadioPhrase}`
  | "reply.no-contact"
  | "reply.radio-check"
  | "reply.position"
  | `reply.conditions.${HazardWeather}`
  | "reply.air"
  | "reply.forecast"
  | `forecast.day.${ForecastDayIndex}`
  | `forecast.sky.${HazardWeather}`
  | `forecast.by.${ForecastPart}`
  | "forecast.all-day"
  | `forecast.confidence.${Confidence}`
  | `forecast.part.${ForecastPart}`
  | `reply.sun.${SunReading["state"]}`
  | "reply.route.open"
  | "reply.route.ladder"
  | "reply.help"
  | "reply.unknown"
  | `part.${string}`
  | `camp.${string}`
  | "gps.no-fix"
  | "gps.where"
  | "gps.altitude"
  | "gps.done"
  | "gps.left"
  | "gps.to-climb"
  | "gps.rate"
  | "gps.arrival"
  | "gps.sun"
  | "gps.metres"
  | "gps.kilometres"
  | "gps.rate-value"
  | "gps.none"
  | "gps.early"
  | "gps.late"
  | "gps.sun-on"
  | "gps.pace"
  | "wind.now"
  | "wind.average"
  | "wind.strongest"
  | "wind.unit"
  | `wind.name.${WindName}`
  | "wind.gust"
  | "wind.air"
  | "wind.chill"
  | `wind.risk.${FrostbiteRisk}`
  | "wind.reset"
  | "wind.note"
  | "tracker.off"
  | "tracker.on"
  | "tracker.flat"
  | "tracker.track"
  | "tracker.stop"
  | "tracker.points"
  | "tracker.last"
  | "tracker.battery"
  | "tracker.percent"
  | "tracker.check-ins"
  | "tracker.no-sky"
  | "tracker.sending"
  | "tracker.check-in"
  | "tracker.weather"
  | "tracker.weather-asking"
  | "tracker.weather-coming"
  | "tracker.weather-of"
  | "tracker.weather-air"
  | "tracker.weather-wind"
  | "tracker.weather-note"
  | "tracker.sos"
  | "tracker.sos-hold"
  | "tracker.sos-sending"
  | "tracker.sos-sent"
  | "tracker.sos-note"
  | "tracker.note";
