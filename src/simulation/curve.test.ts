import { describe, expect, it } from "vitest";

import { Curve } from "./curve";

describe("Curve", () => {
  const curve = new Curve([
    [0, 98],
    [5000, 80],
    [8000, 60],
  ]);

  it("joins its points by straight lines", () => {
    expect(curve.at(0)).toBe(98);
    expect(curve.at(2500)).toBe(89);
    expect(curve.at(5000)).toBe(80);
    expect(curve.at(6500)).toBe(70);
  });

  it("keeps its end values past its ends", () => {
    expect(curve.at(-100)).toBe(98);
    expect(curve.at(9000)).toBe(60);
  });

  it("says where it begins and ends", () => {
    expect(curve.start).toBe(0);
    expect(curve.end).toBe(8000);
  });

  it("is one value everywhere with a single point", () => {
    const flat = new Curve([[45, 2]]);

    expect([flat.at(-90), flat.at(45), flat.at(90)]).toEqual([2, 2, 2]);
  });

  it("refuses no points, and points out of order", () => {
    expect(() => new Curve([])).toThrow(RangeError);
    expect(
      () =>
        new Curve([
          [5000, 80],
          [0, 98],
        ]),
    ).toThrow(RangeError);
    expect(
      () =>
        new Curve([
          [0, 98],
          [0, 80],
        ]),
    ).toThrow(RangeError);
  });
});
