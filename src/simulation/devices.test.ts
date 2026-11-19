import { describe, expect, it } from "vitest";

import { Devices } from "./devices";
import type { DeviceGround, DeviceNumbers } from "./devices";
import { Expedition } from "./expedition";
import type { ExpeditionSave } from "./expedition";
import type { GameAction } from "./game-action";
import { MountainClock } from "./mountain-clock";
import type { Scenario } from "./scenario";

/** A point every 10 minutes, a battery of 2 hours and a message out in a minute: made up, to
 * show the rule. */
const NUMBERS: DeviceNumbers = { interval: 600, life: 7200, delivery: 60 };

/** The slope under the devices: Anna on her feet, hanging in a crevasse, or dead. */
class Slope implements DeviceGround {
  hanging = false;
  dead = false;

  climber(): { dead: boolean; hanging: boolean } {
    return { dead: this.dead, hanging: this.hanging };
  }
}

/** Anna sets off at 03:00 on a mountain whose clock runs 60 times faster than play: a step is
 * three of its seconds, and the clock has taken it by the time the devices read the hour. */
const climb = (): { expedition: Expedition; devices: Devices; slope: Slope } => {
  const clock = new MountainClock(60);
  const slope = new Slope();
  const devices = new Devices(NUMBERS, clock, slope);
  const scenario: Scenario = {
    seed: 1,
    climbers: ["anna"],
    start: {
      [MountainClock.NAME]: MountainClock.start({ date: "2026-04-20", time: "03:00" }),
      [Devices.NAME]: Devices.start({ climbers: ["anna"] }),
    },
  };
  return { expedition: Expedition.start(scenario, [clock, devices]), devices, slope };
};

const call = (phrase: string): GameAction => ({
  kind: "radio",
  climber: "anna",
  channel: "base-camp",
  phrase,
});

const press = (what: "track" | "stop" | "check-in" | "sos"): GameAction => ({
  kind: "tracker",
  climber: "anna",
  do: what,
});

/** Plays `seconds` of the mountain's time, in whole steps. */
const pass = (expedition: Expedition, seconds: number): void => {
  for (let played = 0; played < seconds; played += 3) {
    expedition.advance();
  }
};

describe("the radio", () => {
  it("keeps each call, with the mountain's time, and says it was heard", () => {
    const { expedition, devices } = climb();
    expedition.advance([call("radio-check")]);
    expedition.advance();
    expedition.advance([call("position")]);

    expect(devices.calls).toEqual([
      {
        step: 0,
        at: 3 * 3600 + 3,
        climber: "anna",
        channel: "base-camp",
        phrase: "radio-check",
        heard: true,
      },
      {
        step: 2,
        at: 3 * 3600 + 9,
        climber: "anna",
        channel: "base-camp",
        phrase: "position",
        heard: true,
      },
    ]);
    expect(devices.radio("anna")).toEqual({ contact: true });
  });

  it("doesn't get out of a crevasse", () => {
    const { expedition, devices, slope } = climb();
    slope.hanging = true;
    expedition.advance([call("help")]);

    expect(devices.radio("anna")).toEqual({ contact: false });
    expect(devices.calls.at(-1)).toMatchObject({ phrase: "help", heard: false });

    slope.hanging = false;
    expedition.advance([call("help")]);
    expect(devices.calls.at(-1)).toMatchObject({ phrase: "help", heard: true });
  });

  it("is silent in a dead climber's hand", () => {
    const { expedition, devices, slope } = climb();
    slope.dead = true;
    expedition.advance([call("radio-check")]);

    expect(devices.calls).toEqual([]);
  });
});

describe("the tracker", () => {
  it("sets off charged and off, and sends nothing", () => {
    const { expedition, devices } = climb();
    pass(expedition, 1200);

    expect(devices.tracker("anna")).toEqual({
      tracking: false,
      charge: 1,
      points: 0,
      last: null,
      checkIns: 0,
      sending: 0,
      sos: "none",
      sky: true,
    });
  });

  it("sends a point at once and one each interval, and its battery runs down", () => {
    const { expedition, devices } = climb();
    expedition.advance([press("track")]);

    expect(devices.tracker("anna")).toMatchObject({
      tracking: true,
      points: 1,
      last: 3 * 3600 + 3,
    });

    pass(expedition, 1200);
    const tracker = devices.tracker("anna");
    expect(tracker.points).toBe(3);
    expect(tracker.last).toBe(3 * 3600 + 1203);
    // 401 steps of three seconds out of a battery of 7,200.
    expect(tracker.charge).toBeCloseTo(1 - (401 * 3) / 7200, 9);
  });

  it("stops when it's told to, and when its battery is flat", () => {
    const { expedition, devices } = climb();
    expedition.advance([press("track")]);
    expedition.advance([press("stop")]);
    pass(expedition, 1200);
    expect(devices.tracker("anna")).toMatchObject({ tracking: false, points: 1 });

    expedition.advance([press("track")]);
    pass(expedition, 7500);
    const flat = devices.tracker("anna");
    expect(flat.charge).toBe(0);
    expect(flat.tracking).toBe(false);

    const { points } = flat;
    expedition.advance([press("track"), press("check-in")]);
    pass(expedition, 1200);
    expect(devices.tracker("anna")).toMatchObject({ points, checkIns: 0, sending: 0 });
  });

  it("misses its points under the ice, and sends one as soon as it sees the sky again", () => {
    const { expedition, devices, slope } = climb();
    expedition.advance([press("track")]);
    slope.hanging = true;
    pass(expedition, 1500);
    expect(devices.tracker("anna")).toMatchObject({ points: 1, sky: false });

    slope.hanging = false;
    expedition.advance();
    expect(devices.tracker("anna")).toMatchObject({ points: 2, sky: true });
  });

  it("takes its delivery time to send a check-in, with the sky over it", () => {
    const { expedition, devices, slope } = climb();
    expedition.advance([press("check-in")]);
    expect(devices.tracker("anna")).toMatchObject({ checkIns: 0, sending: 1 });

    slope.hanging = true;
    pass(expedition, 300);
    expect(devices.tracker("anna")).toMatchObject({ checkIns: 0, sending: 1 });

    slope.hanging = false;
    pass(expedition, 60);
    expect(devices.tracker("anna")).toMatchObject({ checkIns: 1, sending: 0 });
  });

  it("raises one SOS, which turns the tracking on, and goes on tracking for the dead", () => {
    const { expedition, devices, slope } = climb();
    expedition.advance([press("sos")]);
    expedition.advance([press("sos")]);
    expect(devices.tracker("anna")).toMatchObject({ sos: "sending", sending: 1, tracking: true });

    pass(expedition, 60);
    expect(devices.tracker("anna")).toMatchObject({ sos: "sent", sending: 0 });

    slope.dead = true;
    expedition.advance([press("stop")]);
    const { points } = devices.tracker("anna");
    pass(expedition, 600);
    expect(devices.tracker("anna")).toMatchObject({ tracking: true, points: points + 1 });
  });
});

const take = (device: "radio" | "gps" | "wind" | "tracker" | "none"): GameAction => ({
  kind: "device",
  climber: "anna",
  device,
});

describe("a device in the hand", () => {
  it("is taken out, and seen for as long as it has been held", () => {
    const { expedition, devices } = climb();
    expect(devices.hand("anna")).toEqual({ device: null, was: null, seconds: 0, spoke: null });

    expedition.advance([take("radio")]);
    expect(devices.hand("anna")).toMatchObject({ device: "radio", was: null, seconds: 0 });

    expedition.advance();
    expedition.advance();
    expect(devices.hand("anna")).toMatchObject({ device: "radio", seconds: 0.1 });
  });

  it("goes back, and the one before it is remembered while the hand comes down", () => {
    const { expedition, devices } = climb();
    expedition.advance([take("gps")]);
    pass(expedition, 30);
    expedition.advance([take("none")]);
    expedition.advance();

    expect(devices.hand("anna")).toMatchObject({ device: null, was: "gps", seconds: 0.05 });
  });

  it("changes for another, and taking the one in the hand again changes nothing", () => {
    const { expedition, devices } = climb();
    expedition.advance([take("wind")]);
    pass(expedition, 30);
    expedition.advance([take("wind")]);
    expect(devices.hand("anna").seconds).toBeGreaterThan(0.4);

    expedition.advance([take("tracker")]);
    expect(devices.hand("anna")).toMatchObject({ device: "tracker", was: "wind", seconds: 0 });
  });

  it("says how long ago they last spoke on the radio", () => {
    const { expedition, devices } = climb();
    expedition.advance([take("radio"), call("radio-check")]);
    expect(devices.hand("anna").spoke).toBe(0);

    expedition.advance();
    expect(devices.hand("anna").spoke).toBeCloseTo(0.05);
  });

  it("stays as it was for the dead, who take nothing out", () => {
    const { expedition, devices, slope } = climb();
    slope.dead = true;
    expedition.advance([take("radio")]);

    expect(devices.hand("anna").device).toBeNull();
  });

  it("is empty on a save from before devices were held", () => {
    const first = climb();
    first.expedition.advance([press("track")]);
    const save = JSON.parse(JSON.stringify(first.expedition.save())) as ExpeditionSave;
    const state = save.rules[Devices.NAME] as Record<string, unknown>;
    delete state.hands;
    delete state.step;

    const clock = new MountainClock(60);
    const devices = new Devices(NUMBERS, clock, new Slope());
    Expedition.resume(save, [clock, devices]);

    expect(devices.hand("anna")).toEqual({ device: null, was: null, seconds: 0, spoke: null });
  });
});

describe("the devices' state", () => {
  it("goes on exactly from a save", () => {
    const first = climb();
    first.expedition.advance([call("radio-check"), press("track"), press("check-in"), take("gps")]);
    pass(first.expedition, 30);
    const save = JSON.parse(JSON.stringify(first.expedition.save())) as ExpeditionSave;

    const clock = new MountainClock(60);
    const devices = new Devices(NUMBERS, clock, new Slope());
    const resumed = Expedition.resume(save, [clock, devices]);
    pass(first.expedition, 900);
    pass(resumed, 900);

    expect(devices.tracker("anna")).toEqual(first.devices.tracker("anna"));
    expect(devices.calls).toEqual(first.devices.calls);
    expect(devices.hand("anna")).toEqual(first.devices.hand("anna"));
    expect(resumed.save()).toEqual(first.expedition.save());
  });

  it("knows only the climbers who carry them", () => {
    const { devices } = climb();
    expect(() => devices.tracker("boris")).toThrow("boris carries no devices");
  });

  it("refuses numbers no tracker has", () => {
    const clock = new MountainClock(60);
    expect(() => new Devices({ interval: 0, life: 1, delivery: 1 }, clock, new Slope())).toThrow(
      RangeError,
    );
  });
});
