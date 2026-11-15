import { describe, expect, it } from "vitest";

import { SimulationClock } from "../simulation";
import type { ExpeditionSave, GameAction } from "../simulation";
import type { Gear } from "./climber";
import type { SlopeLayout, SlopeSettings } from "./slope-physics";
import { Climb } from "./testing/climb";
import { TestMountain } from "./testing/test-mountain";

const { walk, clip, jumar } = Climb;

/** The steps in `seconds`. */
const steps = (seconds: number): number => seconds * SimulationClock.STEPS_PER_SECOND;

/** The ice axe swung in at a point of the slope, or the crampons kicked in at one. */
const swing = (climber: string, x: number, y: number): GameAction => ({
  kind: "tool",
  climber,
  tool: "ice-axe",
  x,
  y,
});
const kick = (climber: string, x: number, y: number): GameAction => ({
  kind: "tool",
  climber,
  tool: "crampons",
  x,
  y,
});

/** Nobody slips. On the test mountain a pick goes in up to 2.2 m above the feet, bites poorly
 * above 2 m, and the feet stop 1.4 m under it; two tools climb at 0.5 m/s and the axe alone at
 * half that. */
const CALM = TestMountain.CALM;
/** The ice slips only on a pick that bites poorly, and then at once. */
const POOR_SLIPS: SlopeSettings = {
  ...CALM,
  iceClimb: { ...CALM.iceClimb, slip: 1e-9, poor: 1e18 },
};
/** A swing of the axe alone always comes off. */
const BAD_SWINGS: SlopeSettings = {
  ...CALM,
  iceClimb: { ...CALM.iceClimb, swingSlip: TestMountain.SURE },
};

const TWO_TOOLS: Gear = { jumar: true, tools: 2 };
const AXE_ALONE: Gear = { jumar: true, tools: 1 };

/** Flat ground to a wall of ice 6 m high at x = 20, and flat above it: its foot is 20 m along
 * the ground, its lip 26. `brittle` ice from 2.5 to 3.5 m up it, if asked for; a rope down it from
 * a metre past the lip to a metre before the foot, if asked for. */
const wall = (gear: Gear, { along = 20, brittle = false, roped = false } = {}): SlopeLayout => ({
  terrain: [
    [0, 0],
    [20, 0],
    [20, 6],
    [40, 6],
  ],
  altitude: { start: TestMountain.FOOT, end: TestMountain.FOOT + 6 },
  ...(brittle ? { brittle: [{ from: 22.5, to: 23.5 }] } : {}),
  ropes: roped ? [{ id: "fixed", from: 19, to: 27, length: 8.5 }] : [],
  ladders: [],
  climbers: [{ id: "anna", along, gear }],
});

/** Flat ground with a crevasse 2 m wide and 6 m deep, from x = 20 to 22: its near lip is 20 m
 * along the ground, its foot from 26 to 28, and its far lip 34. */
const crevasse = (along: number, gear: Gear): SlopeLayout => ({
  terrain: [
    [0, 0],
    [20, 0],
    [20, -6],
    [22, -6],
    [22, 0],
    [40, 0],
  ],
  altitude: { start: TestMountain.FOOT, end: TestMountain.FOOT },
  ropes: [],
  ladders: [],
  climbers: [{ id: "anna", along, gear }],
});

/** A crevasse 2 m wide and 30 m deep, from x = 20 to 22, a ladder across it from lip to lip
 * (20 m along the ground to 82), and a rope along the ladder from 2 m before it to 2 m past it,
 * 3 m slack: a climber who comes off the ladder on it hangs a few metres down, in reach of a
 * wall. */
const bridged = (gear: Gear): SlopeLayout => ({
  terrain: [
    [0, 0],
    [20, 0],
    [20, -30],
    [22, -30],
    [22, 0],
    [40, 0],
  ],
  altitude: { start: TestMountain.FOOT, end: TestMountain.FOOT },
  ropes: [{ id: "fixed", from: 18, to: 84, length: 9 }],
  ladders: [{ id: "long", from: 20, to: 82 }],
  climbers: [{ id: "anna", along: 20, gear }],
});

/** Climbs the face above Anna's feet, a pick at a time: each swung in 1.9 m above her feet, or
 * `over` the lip once that's within her reach, then up until the pick stops her. Says how many
 * seconds it took, or Infinity if she isn't off the ice after 20 picks. */
const climbUp = (climb: Climb, x: number, lip: number, over = 0.4): number => {
  let taken = 0;
  for (let pick = 0; pick < 20; pick += 1) {
    const { y } = climb.physics.climber("anna");
    const place = y + 1.9 >= lip ? swing("anna", x + over, lip) : swing("anna", x, y + 1.9);
    climb.play(1, [place, walk("anna", "up")]);
    taken += 1;
    for (let step = 0; step < steps(10); step += 1) {
      const before = climb.physics.climber("anna").y;
      climb.play(1);
      taken += 1;
      const anna = climb.physics.climber("anna");
      if (!anna.onIce) {
        return taken / SimulationClock.STEPS_PER_SECOND;
      }
      if (anna.y === before) {
        break;
      }
    }
  }
  return Infinity;
};

/**
 * Ice too steep to walk is climbed on the tools: a pick swung in above, the feet walked up under
 * it on the front points, the next pick higher. The player places each pick, and the picks they
 * place decide how far they go and how surely.
 */
describe("A wall of ice, on the tools", () => {
  it("stops a climber who walks into it, and takes them onto it with the first pick they swing in", () => {
    const climb = new Climb(CALM, wall(TWO_TOOLS, { along: 18 }));
    climb.play(steps(5), [walk("anna", "right")]);
    const stopped = climb.physics.climber("anna");
    climb.play(1, [swing("anna", 20, 2)]);
    const onIt = climb.physics.climber("anna");

    expect(stopped).toMatchObject({ x: 20, y: 0, onIce: false, falling: false });
    expect(onIt).toMatchObject({ x: 20, y: 0, onIce: true, falling: false, pickPoor: false });
    expect(onIt.picks).toEqual([{ x: 20, y: 2 }]);
  });

  it("walks their feet up until the pick is at their shoulder, and no further till the next one goes in", () => {
    const climb = new Climb(CALM, wall(TWO_TOOLS));
    climb.play(steps(10), [swing("anna", 20, 2), walk("anna", "up")]);
    const lockedOff = climb.physics.climber("anna");
    climb.play(steps(10), [swing("anna", 20, 2.5)]);
    const higher = climb.physics.climber("anna");

    expect(lockedOff.y).toBeCloseTo(0.6, 9);
    expect(lockedOff).toMatchObject({ onIce: true, x: 20 });
    expect(higher.y).toBeCloseTo(1.1, 9);
    // The pick before stays in the ice under the new one.
    expect(higher.picks.map(({ y }) => y)).toEqual([2.5, 2]);
  });

  it("takes no pick out of their reach, too high or too low, and none off the ice", () => {
    const climb = new Climb(CALM, wall(TWO_TOOLS));
    climb.play(1, [swing("anna", 20, 2.5)]);
    const tooHigh = climb.physics.climber("anna").onIce;
    climb.play(1, [swing("anna", 20, 1)]);
    const tooLow = climb.physics.climber("anna").onIce;
    climb.play(1, [swing("anna", 18, 2)]);
    const inTheAir = climb.physics.climber("anna").onIce;

    expect([tooHigh, tooLow, inTheAir]).toEqual([false, false, false]);
  });

  it("tops out over the lip on a pick planted past it, and they walk on", () => {
    const climb = new Climb(CALM, wall(TWO_TOOLS));
    const seconds = climbUp(climb, 20, 6);
    const onTop = climb.physics.climber("anna");
    climb.play(steps(2), [walk("anna", "right")]);

    expect(seconds).toBeLessThan(30);
    expect(onTop).toMatchObject({ x: 20, y: 6, onIce: false, falling: false });
    expect(onTop.falls).toHaveLength(0);
    expect(climb.physics.climber("anna").x).toBeGreaterThan(21);
  });

  it("leaves a climber on their feet on the lip when a pick is swung over it once they're up", () => {
    const climb = new Climb(CALM, wall(TWO_TOOLS));
    climbUp(climb, 20, 6);
    climb.play(steps(1), [swing("anna", 20.4, 6), walk("anna", "up")]);
    const swungAgain = climb.physics.climber("anna");
    climb.play(steps(2), [walk("anna", "right")]);

    expect(swungAgain).toMatchObject({ x: 20, y: 6, onIce: false, falling: false });
    expect(climb.physics.climber("anna").x).toBeGreaterThan(21);
  });

  it("is climbed on the ice axe alone at half the speed, a single pick in the ice", () => {
    const twoTools = new Climb(CALM, wall(TWO_TOOLS));
    const axeAlone = new Climb(CALM, wall(AXE_ALONE));
    axeAlone.play(steps(1), [swing("anna", 20, 2), walk("anna", "up")]);
    twoTools.play(steps(1), [swing("anna", 20, 2), walk("anna", "up")]);
    axeAlone.play(steps(5), [swing("anna", 20, 2.25)]);

    expect(twoTools.physics.climber("anna").y).toBeCloseTo(0.5, 9);
    expect(axeAlone.physics.climber("anna").picks).toEqual([{ x: 20, y: 2.25 }]);
    expect(climbUp(new Climb(CALM, wall(AXE_ALONE)), 20, 6)).toBeGreaterThan(
      1.8 * climbUp(new Climb(CALM, wall(TWO_TOOLS)), 20, 6),
    );
  });

  it("isn't climbed with no tool at all", () => {
    const climb = new Climb(CALM, wall({ jumar: true, tools: 0 }));
    climb.play(steps(2), [swing("anna", 20, 2), walk("anna", "up")]);

    expect(climb.physics.climber("anna")).toMatchObject({ onIce: false, y: 0 });
  });

  it("slips a climber who hangs still on their front points now and then, more on the axe alone, and never one who climbs on (#197)", () => {
    // Standing still on the front points slips a twentieth of the time a second, on two tools.
    const TIRING: SlopeSettings = {
      ...CALM,
      footing: { ...CALM.footing, still: { ...CALM.footing.still, frontPoints: 0.05 } },
    };
    const seeds = Array.from({ length: 20 }, (_, index) => index + 1);
    const hangsStill = (gear: Gear, seed: number): boolean => {
      const climb = new Climb(TIRING, wall(gear), seed);
      climb.play(steps(2), [swing("anna", 20, 2), walk("anna", "up")]);
      climb.play(steps(10));
      const anna = climb.physics.climber("anna");
      return anna.falling || anna.falls.length > 0;
    };
    const twoTools = seeds.filter((seed) => hangsStill(TWO_TOOLS, seed)).length;
    const axeAlone = seeds.filter((seed) => hangsStill(AXE_ALONE, seed)).length;
    const climbsOn = new Climb(TIRING, wall(TWO_TOOLS), 1);
    climbUp(climbsOn, 20, 6);

    expect(twoTools).toBeGreaterThan(0);
    expect(axeAlone).toBeGreaterThan(twoTools);
    expect(climbsOn.physics.climber("anna").falls).toEqual([]);
  });

  it("lets a climber who slips off the face, on a rope anchored at its foot, down to the foot, where they stand (#197)", () => {
    // The rope comes from the flat and ends half a metre up the face: no higher.
    const anchored: SlopeLayout = {
      ...wall(TWO_TOOLS),
      ropes: [{ id: "below", from: 15, to: 20.5, length: 6 }],
    };
    const slipping: SlopeSettings = {
      ...CALM,
      footing: {
        ...CALM.footing,
        still: { ...CALM.footing.still, frontPoints: TestMountain.SURE },
      },
    };
    const climb = new Climb(slipping, anchored);
    climb.play(1, [clip("anna", "first"), swing("anna", 20, 2), walk("anna", "up")]);
    climb.play(steps(0.4));
    // Standing still 0.2 m up the face, short of where the rope holds her: her calves give.
    climb.play(2, [walk("anna", "stop")]);
    const hanging = climb.physics.climber("anna");
    climb.play(steps(10), [walk("anna", "up")]);

    expect(hanging.falling).toBe(true);
    expect(climb.physics.climber("anna")).toMatchObject({ falling: false, x: 20, y: 0 });
  });

  it("tires a climber who hangs still on their tools", () => {
    const climb = new Climb(CALM, wall(TWO_TOOLS));
    climb.play(steps(1), [swing("anna", 20, 2)]);

    expect(climb.physics.climber("anna")).toMatchObject({ onIce: true, moving: true });
    expect(climb.physics.climber("anna").exertion).toBe(CALM.iceClimb.hang);
  });

  it("goes on the same from a save made on the ice", () => {
    const climb = new Climb(CALM, wall(TWO_TOOLS));
    climb.play(steps(1), [swing("anna", 20, 2), walk("anna", "up")]);
    const saved = JSON.parse(JSON.stringify(climb.expedition.save())) as ExpeditionSave;
    const resumed = new Climb(CALM, saved);
    climb.play(steps(3));
    resumed.play(steps(3));

    expect(resumed.physics.climber("anna")).toEqual(climb.physics.climber("anna"));
    expect(resumed.physics.climber("anna")).toMatchObject({ onIce: true });
  });
});

describe("Where the pick goes in", () => {
  it("bites poorly at full stretch, and in brittle ice", () => {
    const stretched = new Climb(CALM, wall(TWO_TOOLS));
    stretched.play(1, [swing("anna", 20, 2.15)]);
    const brittle = new Climb(CALM, wall(TWO_TOOLS, { brittle: true }));
    brittle.play(steps(10), [swing("anna", 20, 2), walk("anna", "up")]);
    const sound = brittle.physics.climber("anna").pickPoor;
    // From 0.6 m up, a pick 2 m higher goes into the brittle ice, from 2.5 to 3.5 m up the wall.
    brittle.play(1, [swing("anna", 20, 2.6)]);

    expect(stretched.physics.climber("anna")).toMatchObject({ onIce: true, pickPoor: true });
    expect(sound).toBe(false);
    expect(brittle.physics.climber("anna")).toMatchObject({ onIce: true, pickPoor: true });
  });

  it("holds the climber who places their picks well, and drops the one who moves on a poor one", () => {
    const careful = new Climb(POOR_SLIPS, wall(TWO_TOOLS));
    const seconds = climbUp(careful, 20, 6);
    const careless = new Climb(POOR_SLIPS, wall(TWO_TOOLS));
    careless.play(steps(2), [swing("anna", 20, 2.15), walk("anna", "up")]);

    expect(seconds).toBeLessThan(30);
    expect(careful.physics.climber("anna").falls).toHaveLength(0);
    expect(careless.physics.climber("anna")).toMatchObject({ onIce: false, y: 0 });
    expect(careless.physics.climber("anna").falls).toHaveLength(1);
  });

  it("leaves a climber on the axe alone on their front points as it swings: a swing that comes off is a fall", () => {
    const axeAlone = new Climb(BAD_SWINGS, wall(AXE_ALONE));
    axeAlone.play(steps(3), [swing("anna", 20, 2), walk("anna", "up")]);
    const before = axeAlone.physics.climber("anna");
    axeAlone.play(steps(3), [swing("anna", 20, before.y + 2)]);
    const twoTools = new Climb(BAD_SWINGS, wall(TWO_TOOLS));
    twoTools.play(steps(3), [swing("anna", 20, 2), walk("anna", "up")]);
    twoTools.play(steps(3), [swing("anna", 20, before.y + 2)]);

    // The first pick goes in from the ground, on their feet.
    expect(before).toMatchObject({ onIce: true });
    expect(axeAlone.physics.climber("anna")).toMatchObject({ onIce: false, y: 0 });
    expect(axeAlone.physics.climber("anna").falls).toHaveLength(1);
    expect(twoTools.physics.climber("anna")).toMatchObject({ onIce: true });
    expect(twoTools.physics.climber("anna").falls).toHaveLength(0);
  });
});

describe("Down the ice", () => {
  it("steps down from the lip onto the front points, the axe planted over it, and down-climbs a pick at a time", () => {
    const climb = new Climb(CALM, wall(TWO_TOOLS, { along: 26 }));
    climb.play(steps(10), [kick("anna", 20, 5), walk("anna", "down")]);
    const underTheLip = climb.physics.climber("anna");
    for (let pick = 0; pick < 12 && climb.physics.climber("anna").onIce; pick += 1) {
      const { y } = climb.physics.climber("anna");
      climb.play(steps(5), [swing("anna", 20, y + CALM.iceClimb.lockOff)]);
    }
    const atTheFoot = climb.physics.climber("anna");

    // Their arm straight under the axe: its reach below the lip.
    expect(underTheLip).toMatchObject({ onIce: true, x: 20 });
    expect(underTheLip.y).toBeCloseTo(6 - CALM.iceClimb.reach, 9);
    expect(atTheFoot).toMatchObject({ onIce: false, falling: false, x: 20, y: 0 });
    expect(atTheFoot.falls).toHaveLength(0);
  });

  it("doesn't step off a lip that isn't one, or with the crampons pointed anywhere else", () => {
    const farFromTheLip = new Climb(CALM, wall(TWO_TOOLS, { along: 30 }));
    farFromTheLip.play(1, [kick("anna", 20, 5)]);
    const pointedAway = new Climb(CALM, wall(TWO_TOOLS, { along: 26 }));
    pointedAway.play(1, [kick("anna", 22, 6)]);

    expect(farFromTheLip.physics.climber("anna").onIce).toBe(false);
    expect(pointedAway.physics.climber("anna").onIce).toBe(false);
  });
});

describe("Out of a crevasse on the tools", () => {
  it("takes a climber alive at its foot, with no rope, up its wall and over the lip", () => {
    const climb = new Climb(CALM, crevasse(27, AXE_ALONE));
    const atTheFoot = climb.physics.deadEnd(27);
    climb.play(steps(4), [walk("anna", "right")]);
    const atTheWall = climb.physics.climber("anna");
    const seconds = climbUp(climb, 22, 0);

    expect(atTheFoot).toBe(true);
    expect(atTheWall).toMatchObject({ x: 22, y: -6, onIce: false });
    expect(seconds).toBeLessThan(60);
    expect(climb.physics.climber("anna")).toMatchObject({ x: 22, y: 0, onIce: false });
    expect(climb.physics.deadEnd(climb.physics.along("anna"))).toBe(false);
  });

  it("puts a climber who hangs in one on a carabiner alone, which climbs no rope, onto the ice", () => {
    const climb = new Climb(TestMountain.ICY_LADDERS, bridged(TWO_TOOLS));
    climb.play(steps(2));
    climb.play(steps(8), [clip("anna", "second"), walk("anna", "right")]);
    const hanging = climb.physics.climber("anna");
    climb.play(steps(20), [walk("anna", "up")]);
    const still = climb.physics.climber("anna");
    const wall = still.x < 21 ? 20 : 22;
    climb.play(1, [swing("anna", wall, still.y + 1.6)]);
    const onIt = climb.physics.climber("anna");
    const seconds = climbUp(climb, wall, 0, wall === 20 ? -0.4 : 0.4);
    const out = climb.physics.climber("anna");

    expect(hanging).toMatchObject({ falling: true, hanging: true, first: null, second: "fixed" });
    expect(hanging.y).toBeLessThan(-2);
    expect(still).toMatchObject({ falling: true, hanging: true });
    expect(still.y).toBeCloseTo(hanging.y, 1);
    expect(onIt).toMatchObject({ onIce: true, falling: false, x: wall });
    expect(onIt.falls).toMatchObject([{ held: true }]);
    expect(seconds).toBeLessThan(60);
    expect(out).toMatchObject({ onIce: false, falling: false, x: wall, y: 0 });
  });

  it("takes them up the rope once the jumar is on it, and never with no jumar in their pack", () => {
    const withJumar = new Climb(TestMountain.ICY_LADDERS, bridged(TWO_TOOLS));
    withJumar.play(steps(2));
    withJumar.play(steps(8), [clip("anna", "second"), walk("anna", "right")]);
    withJumar.play(steps(30), [clip("anna", "first"), walk("anna", "up")]);
    const without = new Climb(TestMountain.ICY_LADDERS, bridged({ jumar: false, tools: 2 }));
    without.play(steps(2));
    without.play(steps(8), [clip("anna", "second"), walk("anna", "right")]);
    without.play(steps(30), [clip("anna", "first"), walk("anna", "up")]);

    expect(withJumar.physics.climber("anna")).toMatchObject({ falling: false, y: 0 });
    expect(withJumar.physics.climber("anna").falls).toMatchObject([{ held: true }]);
    expect(without.physics.climber("anna")).toMatchObject({
      falling: true,
      hanging: true,
      first: "fixed",
    });
  });

  it("takes a climber who slipped off the ice up the rope on the jumar to the top of the face", () => {
    const climb = new Climb(POOR_SLIPS, wall(TWO_TOOLS, { roped: true }));
    climb.play(steps(3));
    climb.play(steps(1), [
      clip("anna", "first"),
      clip("anna", "second"),
      jumar("anna", true),
      swing("anna", 20, 2),
      walk("anna", "up"),
    ]);
    climb.play(steps(4), [swing("anna", 20, 2.4)]);
    climb.play(steps(1), [swing("anna", 20, climb.physics.climber("anna").y + 2.15)]);
    climb.play(steps(6), [jumar("anna", false)]);
    const slipped = climb.physics.climber("anna");
    climb.play(steps(30), [walk("anna", "up")]);

    expect(slipped).toMatchObject({ falling: true, hanging: true });
    expect(climb.physics.climber("anna")).toMatchObject({ falling: false, x: 20, y: 6 });
  });
});
