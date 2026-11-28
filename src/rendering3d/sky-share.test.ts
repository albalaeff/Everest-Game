import { describe, expect, it } from "vitest";

import { SkyShare } from "./sky-share";

/** A sheet of ground a metre between its points, `rows` up the valley and `columns` across,
 * as high at each point as `height` says. */
function sheet(rows: number, columns: number, height: (row: number, column: number) => number) {
  const positions = new Float32Array(rows * columns * 3);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      positions.set([column, height(row, column), -row], 3 * (row * columns + column));
    }
  }
  return positions;
}

describe("how much of the sky a point of the ground sees", () => {
  const open = new SkyShare([]);

  it("is all of it on flat ground", () => {
    const shares = open.over(
      sheet(40, 40, () => 3),
      40,
      40,
    );
    expect(Math.min(...shares)).toBe(1);
  });

  it("is less the deeper into a crevasse: its floor darker than its wall, its lip nearly open", () => {
    // A crevasse 4 m wide and 12 m deep, running across the valley.
    const depth = (row: number): number =>
      row >= 18 && row <= 22 ? -12 : row === 17 || row === 23 ? -6 : 0;
    const shares = open.over(
      sheet(40, 40, (row) => depth(row)),
      40,
      40,
    );
    const at = (row: number): number => shares[row * 40 + 20] ?? 1;
    expect(at(5)).toBeGreaterThan(0.99);
    expect(at(16)).toBeGreaterThan(0.95);
    expect(at(17)).toBeLessThan(0.9);
    expect(at(20)).toBeLessThan(at(17));
    expect(at(20)).toBeLessThan(0.65);
    // Not black: the sky still comes down the crevasse's length.
    expect(at(20)).toBeGreaterThan(0.25);
  });

  it("is about half at the foot of a wall, and whole on top of it", () => {
    const shares = open.over(
      sheet(40, 40, (row) => (row >= 20 ? 15 : 0)),
      40,
      40,
    );
    const at = (row: number): number => shares[row * 40 + 20] ?? 1;
    expect(at(19)).toBeGreaterThan(0.5);
    expect(at(19)).toBeLessThan(0.75);
    expect(at(30)).toBe(1);
    expect(at(10)).toBeGreaterThan(at(19));
  });

  it("is less at a tower's foot than a tower's height away, and takes two towers' shade together", () => {
    const tower = { x: 0, z: 0, width: 4, depth: 4, height: 10 };
    const one = new SkyShare([tower]);
    expect(one.under(0, 0)).toBeCloseTo(0.4, 1);
    expect(one.under(3, 0)).toBeGreaterThan(one.under(0, 0));
    expect(one.under(3, 0)).toBeLessThan(1);
    expect(one.under(12, 0)).toBe(1);
    const two = new SkyShare([tower, { ...tower, x: 5 }]);
    expect(two.under(2.5, 0)).toBeLessThan(one.under(2.5, 0));
    expect(two.under(2.5, 0)).toBeGreaterThan(0);
  });
});
