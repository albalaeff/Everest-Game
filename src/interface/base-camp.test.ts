import { describe, expect, it } from "vitest";

import deviceTexts from "../../content/devices.json";
import icefall from "../../content/route/icefall.json";
import type { RadioCall } from "../simulation";
import { BaseCamp } from "./base-camp";
import type { CallScene } from "./base-camp";
import { RADIO_PHRASES } from "./device-texts";
import type { DeviceTextName } from "./device-texts";
import { Texts } from "./texts";

const baseCamp = new BaseCamp(new Texts<DeviceTextName>(deviceTexts.en));

/** On the Popcorn at 5,480 m in the cold of a clear night, −9.8 °C at Base Camp, the sun 1 h 05
 * away, 2.4 km to go. */
const SCENE: CallScene = {
  part: "popcorn",
  altitude: 5480,
  weather: "clear",
  air: -9.84,
  sun: { state: "cold", hours: 1, minutes: 5, warmth: 0 },
  laddersDown: 0,
  left: 2400,
};

const call = (phrase: string, heard = true): RadioCall => ({
  step: 10,
  at: 4 * 3600 + 55 * 60,
  climber: "player",
  channel: "base-camp",
  phrase,
  heard,
});

describe("Base Camp on the radio", () => {
  it("answers a radio check, and logs a position with its time", () => {
    expect(baseCamp.answer(call("radio-check"), SCENE)).toEqual(["Loud and clear."]);
    expect(baseCamp.answer(call("position"), SCENE)).toEqual([
      "Copy: the Popcorn, 5,480 m, at 04:55. It's in the log.",
    ]);
  });

  it("gives the conditions as the weather has them, the air at Base Camp, and the sun's hour", () => {
    expect(baseCamp.answer(call("conditions"), SCENE)).toEqual([
      "Clear over the Icefall, hardly any wind.",
      "It's −9.8 °C here at Base Camp.",
      "The sun reaches the ice in 1 h 05 min. Be out of the Icefall before it.",
    ]);
    const windy: CallScene = {
      ...SCENE,
      weather: "wind",
      air: -7.5,
      sun: { state: "warming", warmth: 0.5 },
    };
    expect(baseCamp.answer(call("conditions"), windy)).toEqual([
      "Strong wind today, gusting on the ladders. Clip both, and brace when it comes.",
      "It's −7.5 °C here at Base Camp.",
      "The sun is on the ice and it's warming. Don't stop under the seracs.",
    ]);
  });

  it("says how the route is, and how far it is to the top of it", () => {
    expect(baseCamp.answer(call("route"), SCENE)).toEqual([
      "The route is open to Camp 1. You have about 2.4 km to go.",
    ]);
    expect(baseCamp.answer(call("route"), { ...SCENE, left: 640 })).toEqual([
      "The route is open to Camp 1. You have about 640 m to go.",
    ]);
    expect(baseCamp.answer(call("route"), { ...SCENE, laddersDown: 1 })[0]).toContain(
      "A ladder is down",
    );
  });

  it("copies a call for help with the place", () => {
    expect(baseCamp.answer(call("help"), SCENE)).toEqual([
      "Copy, you need help at the Popcorn, 5,480 m. Clip in, keep warm, and keep talking to us.",
    ]);
  });

  it("answers a call that didn't get out with static, and one it doesn't know with a question", () => {
    expect(baseCamp.answer(call("help", false), SCENE)).toEqual([
      "Only static. Nothing gets out from down here.",
    ]);
    expect(baseCamp.answer(call("sing"), SCENE)).toEqual(["Say again?"]);
  });

  it("has the climber's own words for every phrase, in both languages", () => {
    for (const language of [deviceTexts.en, deviceTexts.ru]) {
      const spoken = new BaseCamp(new Texts<DeviceTextName>(language));
      for (const phrase of RADIO_PHRASES) {
        expect(spoken.said(phrase, SCENE)).not.toContain("{");
        expect(spoken.answer(call(phrase), SCENE).join(" ")).not.toContain("{");
      }
    }
  });
});

describe("the devices' words", () => {
  it("name every part and camp of the route, in both languages", () => {
    for (const language of [deviceTexts.en, deviceTexts.ru]) {
      const texts = new Texts<DeviceTextName>(language);
      for (const { id } of icefall.parts) {
        expect(texts.say(`part.${id}`)).not.toBe("");
      }
      for (const { id } of icefall.camps) {
        expect(texts.say(`camp.${id}`)).not.toBe("");
      }
    }
  });

  it("are the same set in both languages", () => {
    expect(Object.keys(deviceTexts.ru)).toEqual(Object.keys(deviceTexts.en));
  });
});
