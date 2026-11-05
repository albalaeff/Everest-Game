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

  it("splits a duration into whole hours and minutes", () => {
    expect(readings.duration(4 * 3600 + 50 * 60 + 20)).toEqual({ hours: 4, minutes: 50 });
    expect(readings.duration(59)).toEqual({ hours: 0, minutes: 0 });
  });
});
