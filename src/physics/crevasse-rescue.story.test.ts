import { describe, expect, it } from "vitest";

import { SimulationClock } from "../simulation";
import type { Gear } from "./climber";
import type { SlopeLayout, SlopeSettings } from "./slope-physics";
import { Terrain } from "./terrain";
import { Climb } from "./testing/climb";
import { TestMountain } from "./testing/test-mountain";

const { walk, clip, jumar } = Climb;

/** The steps in `seconds`. */
const steps = (seconds: number): number => seconds * SimulationClock.STEPS_PER_SECOND;

/** Every step on a ladder slips, and no landing kills. */
const ICY: SlopeSettings = { ...TestMountain.ICY_LADDERS, lethalLanding: 1000 };

/** A crevasse from x = 20 to 23 with a ledge a metre wide 2 m down its near wall, and 12 m deep
 * past it: the near lip is 20 m along the ground, the ledge from 22 to 23, the far lip 49. A
 * ladder from lip to lip, and a rope along it from 2 m before to 2 m past, 2 m slack. */
const LEDGED: SlopeLayout["terrain"] = [
  [0, 0],
  [20, 0],
  [20, -2],
  [21, -2],
  [21, -12],
  [23, -12],
  [23, 0],
  [40, 0],
];
const ledged = (along = 20, gear: Gear = { jumar: true, tools: 1 }): SlopeLayout => ({
  terrain: LEDGED,
  altitude: { start: TestMountain.FOOT, end: TestMountain.FOOT },
  ropes: [{ id: "fixed", from: 18, to: 51, length: 9 }],
  ladders: [{ id: "long", from: 20, to: 49 }],
  climbers: [{ id: "anna", along, gear }],
});

/** Twin crevasses a metre wide and 10 m deep with a fin of ice 25 cm thick between them, from
 * x = 20 to 22.25: one ladder over both, 20 m along the ground to 62.25, and a rope along it. */
const TWINS: SlopeLayout["terrain"] = [
  [0, 0],
  [20, 0],
  [20, -10],
  [21, -10],
  [21, -1],
  [21.25, -1],
  [21.25, -10],
  [22.25, -10],
  [22.25, 0],
  [40, 0],
];
const twins = (): SlopeLayout => ({
  terrain: TWINS,
  altitude: { start: TestMountain.FOOT, end: TestMountain.FOOT },
  ropes: [{ id: "fixed", from: 18, to: 64.25, length: 9 }],
  ladders: [{ id: "long", from: 20, to: 62.25 }],
  climbers: [{ id: "anna", along: 20 }],
});

/**
 * A climber their rope holds in a crevasse comes back out: up the rope on the jumar, along the ice
 * where they hang against it, onto ground they can walk off. A ledge down the wall is no place to
 * be left standing, and no step of the way goes through the ice.
 */
describe("Out of a crevasse on the rope", () => {
  it("still hangs a climber whose fall ends on a ledge down the wall, and up they come to the lip", () => {
    const climb = new Climb(ICY, ledged());
    climb.play(steps(2));
    climb.play(steps(10), [clip("anna", "first"), jumar("anna", true), walk("anna", "right")]);
    const landed = climb.physics.climber("anna");
    climb.play(steps(30), [jumar("anna", false), walk("anna", "up")]);
    const out = climb.physics.climber("anna");

    expect(landed).toMatchObject({ falling: true, hanging: true, dead: false });
    // On the ledge 2 m down, or just over it on the rope.
    expect(landed.y).toBeGreaterThan(-2.01);
    expect(landed.y).toBeLessThan(-1.5);
    expect(out).toMatchObject({ falling: false, hanging: false, x: 20, y: 0 });
    expect(out.falls).toMatchObject([{ held: true }]);
    expect(climb.physics.deadEnd(climb.physics.along("anna"))).toBe(false);
  });

  it("leaves one with no rope on their feet on the ledge, to climb out on their tools", () => {
    const climb = new Climb(ICY, ledged(22.5));
    const onTheLedge = climb.physics.climber("anna");
    climb.play(steps(3), [walk("anna", "left")]);
    const atTheWall = climb.physics.climber("anna");
    climb.play(1, [{ kind: "tool", climber: "anna", tool: "ice-axe", x: 19.8, y: 0 }]);
    climb.play(steps(10), [walk("anna", "up")]);

    expect(onTheLedge).toMatchObject({ falling: false, hanging: false, y: -2 });
    expect(climb.physics.deadEnd(22.5)).toBe(true);
    expect(atTheWall).toMatchObject({ x: 20, y: -2, falling: false });
    expect(climb.physics.climber("anna")).toMatchObject({ onIce: false, x: 20, y: 0 });
  });

  it("never takes a step through the ice, falling or climbing back, wherever on the ladder they slip", () => {
    const terrain = new Terrain(TWINS);
    const through = (from: { x: number; y: number }, to: { x: number; y: number }): number => {
      let deepest = 0;
      for (let part = 1; part <= 8; part += 1) {
        const point = {
          x: from.x + ((to.x - from.x) * part) / 8,
          y: from.y + ((to.y - from.y) * part) / 8,
        };
        if (terrain.holds(point)) {
          const surface = terrain.nearest(point);
          deepest = Math.max(deepest, Math.hypot(surface.x - point.x, surface.y - point.y));
        }
      }
      return deepest;
    };
    let deepest = 0;
    let out = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      // On an icy ladder, a seed's slip comes at its own rung.
      const settings: SlopeSettings = {
        ...ICY,
        ladderSlipChance: [[0, 0.4 * seed]],
      };
      const climb = new Climb(settings, twins(), seed);
      climb.play(steps(2));
      climb.play(1, [
        clip("anna", "first"),
        clip("anna", "second"),
        jumar("anna", true),
        walk("anna", "right"),
      ]);
      let last = climb.physics.climber("anna");
      for (let step = 0; step < steps(40); step += 1) {
        if (step === steps(8)) {
          climb.play(1, [jumar("anna", false), walk("anna", "up")]);
        } else {
          climb.play(1);
        }
        const now = climb.physics.climber("anna");
        deepest = Math.max(deepest, through(last, now));
        last = now;
      }
      if (!last.falling && last.falls.length > 0) {
        out += 1;
      }
    }

    expect(deepest).toBeLessThan(0.02);
    expect(out).toBeGreaterThan(4);
  });
});
