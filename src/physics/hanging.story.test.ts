import { describe, expect, it } from "vitest";

import { SimulationClock } from "../simulation";
import type { GameAction } from "../simulation";
import type { ClimberLayout, RopeLayout, SlopeLayout, SlopeSettings } from "./slope-physics";
import { Climb } from "./testing/climb";
import { TestMountain } from "./testing/test-mountain";

const { walk, clip, jumar } = Climb;

/** The steps in `seconds`. */
const steps = (seconds: number): number => seconds * SimulationClock.STEPS_PER_SECOND;

/** Holds the haul, or lets it go. */
const haul = (climber: string, held: boolean): GameAction => ({ kind: "haul", climber, held });

/** The ice axe swung in at a point of the slope. */
const swing = (climber: string, x: number, y: number): GameAction => ({
  kind: "tool",
  climber,
  tool: "ice-axe",
  x,
  y,
});

/** Flat to a wall 10 m high, as the Icefall's walls stand: a ramp at its foot, a metre high at
 * 53°, which nobody comes to rest on, 20 m along the ground to 21.25, then straight up to its
 * top, 30.25 m along it, and flat above. A ladder from the ramp's foot to the top leans clear of
 * the wall, so a climber who hangs beside it hangs free. */
const WALL: SlopeLayout["terrain"] = [
  [0, 0],
  [20, 0],
  [20.75, 1],
  [20.75, 10],
  [50.75, 10],
];
/** Where the ladder that leans against it stands, and where it tops out. */
const FOOT = 20;
const TOP = 30.25;

/** A rope along the flat that ends at the ladder's foot, half a metre slack; and the ladder's
 * own from there to a metre past its top, a little slack. */
const BELOW: RopeLayout = { id: "below", from: 10, to: FOOT, length: 10.5 };
const UP_IT: RopeLayout = { id: "up-it", from: FOOT, to: TOP + 1, length: 11 };

/** Nobody slips, and a landing faster than 12 m/s, a drop of about 7 m, kills. */
const FALLS_KILL: SlopeSettings = { ...TestMountain.CALM, lethalLanding: 12 };

/** The wall with its ladder, clear of the ice all the way up, and these ropes and climbers. */
const ladderUp = (
  ropes: readonly RopeLayout[],
  climbers: readonly ClimberLayout[],
): SlopeLayout => ({
  terrain: WALL,
  altitude: { start: TestMountain.FOOT, end: TestMountain.FOOT + 10 },
  ropes,
  ladders: [{ id: "ladder", from: FOOT, to: TOP }],
  climbers,
});

/** The seconds Anna takes to be on her feet from now, playing `actions` first, up to 60. */
const outIn = (climb: Climb, actions: readonly GameAction[] = []): number => {
  climb.play(1, actions);
  for (let step = 1; step < steps(60); step += 1) {
    if (!climb.physics.climber("anna").falling) {
      return step / SimulationClock.STEPS_PER_SECOND;
    }
    climb.play(1);
  }
  return Infinity;
};

/**
 * Anna a metre short of the ladder's foot, Boris at `boris` along the ground, holding the haul.
 * She clips both cowstails to the first rope within her reach, walks to the foot and climbs the
 * ladder without changing ropes there, until `high` metres up it or until the rope she came on
 * holds her.
 */
const climbsOn = (ropes: readonly RopeLayout[], boris: number, high = Infinity): Climb => {
  const climb = new Climb(
    FALLS_KILL,
    ladderUp(ropes, [
      { id: "anna", along: 19 },
      { id: "boris", along: boris },
    ]),
  );
  climb.play(1, [walk("anna", "right"), jumar("anna", true), haul("boris", true)]);
  for (let step = 0; step < steps(3) && climb.physics.ropeWithin("anna") === null; step += 1) {
    climb.play(1);
  }
  climb.play(steps(3), [clip("anna", "first"), clip("anna", "second")]);
  climb.play(1, [walk("anna", "up")]);
  for (let step = 0; step < steps(40); step += 1) {
    const anna = climb.physics.climber("anna");
    if (anna.y >= high || anna.heldBack === "rope") {
      break;
    }
    climb.play(1);
  }
  return climb;
};

/**
 * A climber off their feet on their rope comes back up it only as far as it reaches (#305): to
 * where they slipped, on the jumar or by a partner's haul; and a partner hauls them to a ladder's
 * end, or up a face to its lip, only on a rope that goes there.
 */
describe("Slipping off a wall's ladder on the rope they came on, which ends at its foot", () => {
  it("says a partner hauls them back to their rung, not to the ladder's top, which that rope doesn't reach", () => {
    const climb = climbsOn([BELOW, UP_IT], TOP + 0.2);
    const stood = climb.physics.climber("anna");
    climb.physics.upset("anna", 0);

    expect(stood).toMatchObject({ ladder: "ladder", first: "below", second: "below" });
    // Up the wall as far as two cowstails and the rope's half metre of slack let her.
    expect(stood.y).toBeGreaterThan(1);
    expect(stood.y).toBeLessThan(3);
    expect(climb.physics.climber("anna")).toMatchObject({ falling: true, hanging: true });
    expect(climb.physics.haulPoints("anna")).toEqual([{ x: stood.x, y: stood.y }]);
  });

  it("climbs straight back to their rung, holding on, whoever holds the haul at the top", () => {
    const climb = climbsOn([BELOW, UP_IT], TOP + 0.2);
    const stood = climb.physics.climber("anna");
    climb.physics.upset("anna", 0);
    let hauled = false;
    for (let step = 0; step < steps(2); step += 1) {
      climb.play(1);
      hauled ||= climb.physics.climber("boris").hauling;
    }
    const anna = climb.physics.climber("anna");

    expect(hauled).toBe(false);
    expect(anna).toMatchObject({ falling: false, ladder: "ladder", dead: false });
    expect(anna.x).toBeCloseTo(stood.x, 6);
    expect(anna.y).toBeCloseTo(stood.y, 6);
    expect(anna.falls).toMatchObject([{ held: true }]);
    expect(anna.falls[0]?.pulled).toBeUndefined();
  });

  it("falls no harder than from that height, letting go: to the ladder's foot, on their rope, nobody dragging them up, and the jumar's grip jerking them nowhere", () => {
    const climb = climbsOn([BELOW, UP_IT], TOP + 0.2);
    climb.play(1, [walk("anna", "stop")]);
    const stood = climb.physics.climber("anna");
    climb.physics.upset("anna", 0);
    let hauled = false;
    let out = Infinity;
    for (let step = 1; step <= steps(10); step += 1) {
      climb.play(1);
      hauled ||= climb.physics.climber("boris").hauling;
      if (out === Infinity && !climb.physics.climber("anna").falling) {
        out = step / SimulationClock.STEPS_PER_SECOND;
      }
    }
    const anna = climb.physics.climber("anna");
    const [fall] = anna.falls;

    expect(hauled).toBe(false);
    expect(climb.physics.climber("boris")).toMatchObject({ haulHeld: true });
    expect(out).toBeLessThan(5);
    // Onto the ramp under the ladder, and down it to the flat at its foot.
    expect(anna).toMatchObject({
      dead: false,
      ladder: null,
      y: 0,
      first: "below",
      second: "below",
    });
    expect(anna.x).toBeGreaterThan(FOOT - 2);
    expect(anna.x).toBeLessThanOrEqual(FOOT);
    expect(anna.falls).toMatchObject([{ held: true }]);
    expect(fall?.pulled).toBeUndefined();
    // A drop of her height on the ladder, no faster than gravity makes it: under 2.5 m, 7 m/s.
    const freeFall = Math.sqrt(2 * FALLS_KILL.gravity * stood.y);
    expect(fall?.drop).toBeCloseTo(stood.y, 1);
    expect(fall?.speed).toBeLessThan(freeFall + 0.5);
    expect(fall?.impact).toBeLessThan(freeFall + 0.5);
  });
});

describe("Slipping off a wall's ladder on its own rope, anchored past its top", () => {
  it("says a partner hauls them back to their rung or up to its top, and one at the top does (#239)", () => {
    const climb = climbsOn([UP_IT], TOP + 0.2, 4);
    const stood = climb.physics.climber("anna");
    climb.physics.upset("anna", 0);
    const points = climb.physics.haulPoints("anna");
    const out = outIn(climb);
    const anna = climb.physics.climber("anna");

    expect(stood).toMatchObject({ ladder: "ladder", first: "up-it", second: "up-it" });
    expect(points).toEqual([
      { x: stood.x, y: stood.y },
      { x: 20.75, y: 10 },
    ]);
    expect(out).toBeLessThan(30);
    expect(anna).toMatchObject({ falling: false, ladder: null, x: 20.75, y: 10 });
    expect(anna.falls).toMatchObject([{ held: true, pulled: true, pulledBy: ["boris"] }]);
  });
});

describe("Hanging on a face of ice, on the rope that runs down it", () => {
  /** The wall, 10 m of ice with no ladder, its rope from a metre before its foot to a metre past
   * its lip, a little slack; Anna at its foot on two tools, Boris at its lip. She clips in once
   * the rope has come to rest, climbs 3 m up it on six picks, and her feet slip. */
  const hanging = (): Climb => {
    const layout = TestMountain.WALL.layout(
      [
        { id: "anna", along: 20, gear: { jumar: true, tools: 2 } },
        { id: "boris", along: 30.5 },
      ],
      [{ id: "fixed", from: 19, to: 31, length: 12.3 }],
    );
    const climb = new Climb(TestMountain.CALM, layout);
    climb.play(steps(5));
    climb.play(1, [clip("anna", "first"), clip("anna", "second"), jumar("anna", true)]);
    // Each pick 1.9 m over her feet: her feet stop 1.4 m under it, half a metre higher.
    for (let pick = 0; pick < 6; pick += 1) {
      const { y } = climb.physics.climber("anna");
      climb.play(steps(1.5), [swing("anna", 20, y + 1.9), walk("anna", "up")]);
    }
    return climb;
  };
  /** Her feet slip, and two seconds on she hangs still. */
  const slip = (climb: Climb): void => {
    climb.physics.upset("anna", 0);
    climb.play(steps(2), [walk("anna", "stop")]);
  };

  it("says they're hauled up to its lip, where a partner can stand, not to where they slipped", () => {
    const climb = hanging();
    const climbing = climb.physics.climber("anna");
    slip(climb);
    const hung = climb.physics.climber("anna");

    expect(climbing).toMatchObject({ onIce: true, x: 20, first: "fixed", second: "fixed" });
    expect(climbing.y).toBeCloseTo(3, 6);
    expect(hung).toMatchObject({ hanging: true, first: "fixed", second: "fixed" });
    // Off the ground, and more than the haul's 3 m below the lip.
    expect(hung.y).toBeGreaterThan(0.5);
    expect(hung.y).toBeLessThan(3);
    expect(climb.physics.liftPoint("anna")).toEqual({ x: 20, y: 10 });
    expect(climb.physics.haulPoints("anna")).toEqual([{ x: 20, y: 10 }]);
  });

  it("is hauled up it by a partner holding the haul at its lip, however far below they hang", () => {
    const climb = hanging();
    slip(climb);
    climb.play(steps(1), [haul("boris", true)]);
    const boris = climb.physics.climber("boris");
    const out = outIn(climb);
    const anna = climb.physics.climber("anna");

    expect(boris).toMatchObject({ hauling: true, exertion: 1 });
    expect(out).toBeLessThan(30);
    expect(anna).toMatchObject({ falling: false, onIce: false, x: 20, y: 10 });
    expect(anna.falls).toMatchObject([{ held: true, pulled: true, pulledBy: ["boris"] }]);
  });
});

describe("Hanging low on a face of ice between two ropes, the jumar on the one that runs up it", () => {
  /** The wall of ice with a rope along the flat that ends at its foot, half a metre slack, and
   * one up it from there to its lip, 20 cm slack. Anna clips her second cowstail to the first, a
   * metre short of the wall, and her jumar to the other at its foot; climbs on two tools as far as
   * the rope below lets her, under 2 m; and there her feet slip. Boris holds the haul at `boris`
   * along the ground. */
  const between = (boris: number): Climb => {
    const layout = TestMountain.WALL.layout(
      [
        { id: "anna", along: 19, gear: { jumar: true, tools: 2 } },
        { id: "boris", along: boris },
      ],
      [
        { id: "below", from: 10, to: 20, length: 10.5 },
        { id: "fixed", from: 20, to: 30, length: 10.2 },
      ],
    );
    const climb = new Climb(TestMountain.CALM, layout);
    climb.play(steps(5), [haul("boris", true)]);
    climb.play(steps(2), [clip("anna", "second"), jumar("anna", true), walk("anna", "right")]);
    climb.play(1, [clip("anna", "first")]);
    for (let pick = 0; pick < 5; pick += 1) {
      const { y } = climb.physics.climber("anna");
      climb.play(steps(1.5), [swing("anna", 20, y + 1.9), walk("anna", "up")]);
    }
    return climb;
  };
  /** Her feet slip, and she does nothing. */
  const slip = (climb: Climb): void => {
    climb.physics.upset("anna", 0);
    climb.play(1, [walk("anna", "stop")]);
  };

  it("says a partner helps them down to its foot, the rope below reaching no higher, and not up to its lip", () => {
    const climb = between(30.5);
    const climbing = climb.physics.climber("anna");
    slip(climb);
    climb.play(steps(2));
    const hung = climb.physics.climber("anna");

    expect(climbing).toMatchObject({ onIce: true, x: 20, first: "fixed", second: "below" });
    expect(climbing.heldBack).toBe("rope");
    expect(climbing.y).toBeGreaterThan(1.5);
    expect(climbing.y).toBeLessThan(2);
    // The jumar holds her off the ground, under where she slipped.
    expect(hung).toMatchObject({ hanging: true, x: 20, first: "fixed", second: "below" });
    expect(hung.y).toBeGreaterThan(0.3);
    expect(hung.y).toBeLessThan(climbing.y);
    expect(climb.physics.liftPoint("anna")).toEqual({ x: 20, y: 0 });
    expect(climb.physics.haulPoints("anna")).toEqual([{ x: 20, y: 0 }]);
  });

  it("is helped down by a partner holding the haul at its foot, and left hanging by one at its lip", () => {
    const helped = between(18);
    slip(helped);
    const out = outIn(helped);
    const anna = helped.physics.climber("anna");
    const left = between(30.5);
    slip(left);
    left.play(steps(10));

    expect(out).toBeLessThan(10);
    expect(anna).toMatchObject({ falling: false, onIce: false, x: 20, y: 0 });
    expect(anna.falls).toMatchObject([{ held: true, pulled: true, pulledBy: ["boris"] }]);
    expect(left.physics.climber("anna")).toMatchObject({ hanging: true });
    expect(left.physics.climber("boris")).toMatchObject({ haulHeld: true, hauling: false });
  });
});
