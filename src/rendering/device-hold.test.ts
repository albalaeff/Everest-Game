import { describe, expect, it } from "vitest";

import type { HandView } from "../simulation";
import { DeviceHold } from "./device-hold";

const hand = (over: Partial<HandView>): HandView => ({
  device: null,
  was: null,
  seconds: 0,
  spoke: null,
  ...over,
});

describe("DeviceHold", () => {
  it("is nothing with empty hands that held nothing", () => {
    expect(DeviceHold.of(hand({}))).toBeNull();
    expect(DeviceHold.of(hand({ seconds: 30 }))).toBeNull();
  });

  it("brings a device out over its time, and holds it", () => {
    const { OUT } = DeviceHold;

    expect(DeviceHold.of(hand({ device: "radio" }))).toMatchObject({ kind: "radio", out: 0 });
    expect(DeviceHold.of(hand({ device: "radio", seconds: OUT / 2 }))?.out).toBeCloseTo(0.5);
    expect(DeviceHold.of(hand({ device: "radio", seconds: OUT }))?.out).toBe(1);
    expect(DeviceHold.of(hand({ device: "radio", seconds: 600 }))?.out).toBe(1);
  });

  it("puts the one that was out away over its time, then the hand is empty", () => {
    const { AWAY } = DeviceHold;

    expect(DeviceHold.of(hand({ was: "wind" }))).toMatchObject({ kind: "wind", out: 1 });
    expect(DeviceHold.of(hand({ was: "wind", seconds: AWAY / 2 }))?.out).toBeCloseTo(0.5);
    expect(DeviceHold.of(hand({ was: "wind", seconds: AWAY }))).toBeNull();
  });

  it("changes one for another: the first goes back, then the next comes out", () => {
    const { AWAY, OUT } = DeviceHold;
    const changed = (seconds: number) =>
      DeviceHold.of(hand({ device: "tracker", was: "gps", seconds }));

    expect(changed(0)).toMatchObject({ kind: "gps", out: 1 });
    expect(changed(AWAY / 2)).toMatchObject({ kind: "gps" });
    expect(changed(AWAY)).toMatchObject({ kind: "tracker", out: 0 });
    expect(changed(AWAY + OUT)?.out).toBeCloseTo(1);
    expect(changed(AWAY + 2 * OUT)).toMatchObject({ kind: "tracker", out: 1 });
  });

  it("talks into the radio for a moment after a phrase is said", () => {
    const { TALK } = DeviceHold;
    const speaking = (spoke: number | null) =>
      DeviceHold.of(hand({ device: "radio", seconds: 9, spoke }))?.talking;

    expect(speaking(null)).toBe(false);
    expect(speaking(0)).toBe(true);
    expect(speaking(TALK - 0.01)).toBe(true);
    expect(speaking(TALK)).toBe(false);
    expect(DeviceHold.of(hand({ device: "gps", seconds: 9, spoke: 0 }))?.talking).toBe(false);
  });
});
