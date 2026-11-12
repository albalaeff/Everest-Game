import { describe, expect, it } from "vitest";

import { Faces } from "./faces";
import { Terrain } from "./terrain";
import { Walking } from "./walking";
import { TestMountain } from "./testing/test-mountain";

const { walkingCost, steepest, walkingPower, fastestWalk } = TestMountain.SETTINGS;
const WALKING = new Walking(walkingCost, steepest, walkingPower, fastestWalk);

/** Flat to a crevasse from x = 20 to 23, 10 m deep, with a ledge a metre wide 2 m down its near
 * wall; then a wall 4 m high at x = 30, its top bevelled at 53°, and flat above it. Along the
 * ground: the near lip at 20, the ledge from 22 to 23, the foot from 31 to 33, the far lip at 43,
 * the wall from 50 to 54, and its bevel to 54.625. */
const GROUND = new Terrain([
  [0, 0],
  [20, 0],
  [20, -2],
  [21, -2],
  [21, -10],
  [23, -10],
  [23, 0],
  [30, 0],
  [30, 4],
  [30.375, 4.5],
  [40, 4.5],
]);
/** The route's marks: a ladder across the crevasse and one up the wall. */
const MARKS = [20, 43, 50, 54];

describe("Faces", () => {
  const faces = new Faces(GROUND, WALKING, MARKS);

  it("finds each stretch too steep to walk, its foot and its top wherever along the ground they are", () => {
    const down = faces.at(21);
    const up = faces.at(38);
    const wall = faces.at(52);

    expect(down).toMatchObject({ from: 20, to: 22, foot: 22, top: 20, up: -1 });
    expect(up).toMatchObject({ from: 33, to: 43, foot: 33, top: 43, up: 1 });
    expect(wall).toMatchObject({ from: 50, to: 54, foot: 50, top: 54, up: 1 });
    expect(faces.at(10)).toBeNull();
    // A bevel a climber walks isn't a face.
    expect(faces.at(54.3)).toBeNull();
  });

  it("says where along the ground a face is a height up", () => {
    const up = faces.at(38);
    const down = faces.at(26);

    expect(up?.alongAt(-4)).toBe(39);
    expect(up?.alongAt(5)).toBe(43);
    expect(down?.alongAt(-4)).toBe(25);
    expect(down?.alongAt(-20)).toBe(31);
  });

  it("finds the face a climber stands at the foot of, or at the lip of", () => {
    expect(faces.above(50.2, 0.3)).toBe(faces.at(52));
    expect(faces.above(49, 0.3)).toBeNull();
    expect(faces.below(43.4, 0.5)).toBe(faces.at(38));
    expect(faces.below(19.8, 0.5)).toBe(faces.at(21));
  });

  it("calls a ledge and a crevasse's foot dead ends, and the ground the route reaches open", () => {
    expect(faces.deadEnd(22.5)).toBe(true);
    expect(faces.deadEnd(32)).toBe(true);
    expect(faces.deadEnd(10)).toBe(false);
    expect(faces.deadEnd(46)).toBe(false);
    expect(faces.deadEnd(54.3)).toBe(false);
    // A face is nobody's ground to stand on, so no dead end either.
    expect(faces.deadEnd(52)).toBe(false);
  });
});
