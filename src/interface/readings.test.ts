import { describe, expect, it } from "vitest";

import { Readings } from "./readings";

const readings = new Readings();

describe("Readings", () => {
  it("reads the altimeter in whole metres, with the thousands marked", () => {
    expect(readings.altitude(5357.8)).toBe("5,358 m");
    expect(readings.altitude(880)).toBe("880 m");
  });

  it("reads the clock as 24-hour time, in hours and minutes", () => {
    expect(readings.clock(3 * 3600)).toBe("03:00");
    expect(readings.clock(7 * 3600 + 50 * 60 + 59)).toBe("07:50");
    expect(readings.clock(0)).toBe("00:00");
  });

  it("reads a temperature to the places asked, with a true minus and never a minus zero", () => {
    expect(readings.temperature(-9.64, 1)).toBe("−9.6 °C");
    expect(readings.temperature(-13.52)).toBe("−14 °C");
    expect(readings.temperature(2, 1)).toBe("2.0 °C");
    expect(readings.temperature(-0.04, 1)).toBe("0.0 °C");
    expect(readings.temperature(-0.4)).toBe("0 °C");
  });

  it("splits a duration into whole hours and minutes", () => {
    expect(readings.duration(4 * 3600 + 50 * 60 + 20)).toEqual({ hours: 4, minutes: 50 });
    expect(readings.duration(59)).toEqual({ hours: 0, minutes: 0 });
  });
});
