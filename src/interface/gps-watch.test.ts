import { describe, expect, it } from "vitest";

import { GpsWatch } from "./gps-watch";
import type { GpsPlace } from "./gps-watch";

/** A route of 3 km drawn on 600 m of ground, between a camp that ends 10 m along it and one that
 * starts at 610 m, from 5,300 m to 5,900 m, in three parts. */
const watch = new GpsWatch({
  length: 3000,
  from: 10,
  to: 610,
  foot: 5300,
  top: 5900,
  parts: [
    { id: "moraine", from: 0, to: 110 },
    { id: "popcorn", from: 110, to: 410 },
    { id: "cwm", from: 410, to: 620 },
  ],
});

/** An hour out of camp at 04:00, a third of the way along and 150 m up. */
const AN_HOUR_OUT: GpsPlace = {
  along: 210,
  altitude: 5450,
  sky: true,
  elapsed: 3600,
  timeOfDay: 4 * 3600,
};

describe("the GPS watch", () => {
  it("says how far along and up the route its wearer is, and what's left", () => {
    expect(watch.reading(AN_HOUR_OUT)).toMatchObject({
      fix: true,
      done: 1000,
      left: 2000,
      climbed: 150,
      toClimb: 450,
      part: "popcorn",
    });
    expect(watch.reading(AN_HOUR_OUT).share).toBeCloseTo(1 / 3, 9);
  });

  it("gives the rate of climb and the arrival at the pace so far", () => {
    const { rate, arrival } = watch.reading(AN_HOUR_OUT);
    // 150 m in an hour; 1 km an hour leaves two hours to go.
    expect(rate).toBeCloseTo(150, 9);
    expect(arrival).toBeCloseTo(6 * 3600, 6);
  });

  it("gives no pace before there's a track to tell it from, nor at the top", () => {
    const fresh = watch.reading({ ...AN_HOUR_OUT, along: 12, altitude: 5300, elapsed: 60 });
    expect(fresh).toMatchObject({ rate: null, arrival: null, part: "moraine" });

    // Still among the camp's tents an hour on: nowhere gone, so no pace to tell.
    const waiting = watch.reading({ ...AN_HOUR_OUT, along: 6, altitude: 5300 });
    expect(waiting).toMatchObject({ done: 0, left: 3000, rate: null, arrival: null });

    const top = watch.reading({ ...AN_HOUR_OUT, along: 610, altitude: 5900 });
    expect(top).toMatchObject({ left: 0, toClimb: 0, rate: null, arrival: null, part: "cwm" });
  });

  it("has no fix without the sky, and keeps the route within its ends", () => {
    expect(watch.reading({ ...AN_HOUR_OUT, sky: false }).fix).toBe(false);
    expect(watch.reading({ ...AN_HOUR_OUT, along: 700 })).toMatchObject({ share: 1, part: "cwm" });
    expect(watch.reading({ ...AN_HOUR_OUT, along: 3 })).toMatchObject({ share: 0, done: 0 });
  });

  it("refuses a route with no length", () => {
    expect(() => new GpsWatch({ length: 0, from: 0, to: 1, foot: 0, top: 1, parts: [] })).toThrow(
      RangeError,
    );
  });
});
