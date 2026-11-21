import { describe, expect, it } from "vitest";

import type { ExpeditionSave } from "../simulation";
import { Ladder } from "./ladder";
import { SlopePhysics } from "./slope-physics";
import type { LadderLayout, RopeLayout, SlopeLayout } from "./slope-physics";
import { Climb } from "./testing/climb";
import { TestMountain } from "./testing/test-mountain";

const { walk, clip } = Climb;

/** A ladder across the crevasse of `TestMountain.CREVASSE`, from its edge at x = 20 to the one at
 * x = 23, and a rope beside it from a metre before the one to a metre past the other. */
const BRIDGE: LadderLayout = { id: "bridge", from: 20, to: 83 };
const HANDLINE: RopeLayout = { id: "handline", from: 19, to: 84, length: 5.2 };
/** A ladder up the wall of `TestMountain.WALL`, from its foot to its top. */
const UP_THE_WALL: LadderLayout = { id: "wall", from: 20, to: 30 };

const atTheCrevasse = (along: number, ropes: RopeLayout[] = []): SlopeLayout =>
  TestMountain.CREVASSE.layout([{ id: "anna", along }], ropes, [BRIDGE]);
const atTheWall = (along: number): SlopeLayout =>
  TestMountain.WALL.layout([{ id: "anna", along }], [], [UP_THE_WALL]);

describe("SlopePhysics: ladders", () => {
  it("crosses a crevasse on a ladder at the ladder's speed, and walks on past it", () => {
    const climb = new Climb(TestMountain.CALM, atTheCrevasse(19));

    // A second to the edge on flat ground, then two at half a metre a second on the ladder.
    climb.play(60, [walk("anna", "right")]);
    const onIt = climb.physics.climber("anna");
    climb.play(200);
    const past = climb.physics.climber("anna");

    expect(climb.physics.ladder("bridge")).toEqual([
      { x: 20, y: 0 },
      { x: 23, y: 0 },
    ]);
    expect(onIt).toMatchObject({ y: 0, falling: false, ladder: "bridge" });
    expect(onIt.x).toBeCloseTo(21, 1);
    expect(past).toMatchObject({ y: 0, ladder: null, falls: [] });
    expect(past.x).toBeGreaterThan(23);
  });

  it("crosses it the other way too", () => {
    const climb = new Climb(TestMountain.CALM, atTheCrevasse(88));

    climb.play(300, [walk("anna", "left")]);

    expect(climb.physics.climber("anna")).toMatchObject({ y: 0, ladder: null, falls: [] });
    expect(climb.physics.climber("anna").x).toBeLessThan(20);
  });

  it("leaves alone a key that points across it: up and down on a ladder across a crevasse", () => {
    const climb = new Climb(TestMountain.CALM, atTheCrevasse(20));

    climb.play(100, [walk("anna", "up")]);
    climb.play(100, [walk("anna", "down")]);

    expect(climb.physics.climber("anna")).toMatchObject({ x: 20, y: 0, ladder: null });
  });

  it("drops a climber who slips on it into the crevasse: the ladder's slips, not the ground's", () => {
    const climb = new Climb(TestMountain.ICY_LADDERS, atTheCrevasse(15));

    climb.play(400, [walk("anna", "right")]);
    climb.play(400, [walk("anna", "stop")]);
    const anna = climb.physics.climber("anna");

    expect(anna).toMatchObject({ y: -30, falling: false, ladder: null });
    expect(anna.falls).toHaveLength(1);
    expect(anna.falls[0]?.drop).toBeCloseTo(30, 6);
  });

  it("holds a climber clipped to the rope beside it who slips off it, hanging in the crevasse", () => {
    const climb = new Climb(TestMountain.HARSH, atTheCrevasse(20, [HANDLINE]));
    // Its anchors 5 m apart: hanging, she's on the ellipse they are the foci of.
    const deepest = -Math.sqrt(3.4 * 3.4 - 2.5 * 2.5);

    climb.step("anna", "right", [clip("anna", "second")]);
    let lowest = 0;
    for (let step = 0; step < 400; step += 1) {
      climb.play(1);
      lowest = Math.min(lowest, climb.physics.climber("anna").y);
    }

    expect(climb.physics.climber("anna")).toMatchObject({ second: "handline", ladder: null });
    expect(lowest).toBeLessThan(-1.5);
    expect(lowest).toBeGreaterThan(deepest - 0.05);
  });

  it("climbs a ladder up a wall with up and down, and steps off at its ends", () => {
    const climb = new Climb(TestMountain.CALM, atTheWall(18));

    climb.play(100, [walk("anna", "right")]);
    const atTheFoot = climb.physics.climber("anna");
    // Ten metres at 0.3 m/s up it, and 0.4 down.
    climb.play(700, [walk("anna", "up")]);
    const atTheTop = climb.physics.climber("anna");
    climb.play(20, [walk("anna", "right")]);
    const onTop = climb.physics.climber("anna");
    climb.play(100, [walk("anna", "left")]);
    const backAtTheEdge = climb.physics.climber("anna");
    climb.play(600, [walk("anna", "down")]);

    expect(atTheFoot).toMatchObject({ x: 20, y: 0, ladder: null });
    expect(atTheTop).toMatchObject({ x: 20, y: 10, ladder: null });
    expect(onTop.x).toBeCloseTo(21, 9);
    expect(backAtTheEdge).toMatchObject({ x: 20, y: 10, ladder: null, falls: [] });
    expect(climb.physics.climber("anna")).toMatchObject({ x: 20, y: 0, ladder: null, falls: [] });
  });

  it("goes up a wall at the ladder's speed for its steepness", () => {
    const climb = new Climb(TestMountain.CALM, atTheWall(20));

    climb.play(100, [walk("anna", "up")]);

    expect(climb.physics.climber("anna")).toMatchObject({ x: 20, ladder: "wall" });
    expect(climb.physics.climber("anna").y).toBeCloseTo(1.5, 9);
  });

  it("goes on exactly from a save on a ladder, through JSON", () => {
    const straight = new Climb(TestMountain.SETTINGS, atTheCrevasse(19), 3);
    straight.play(260, [walk("anna", "right")]);
    const halfway = new Climb(TestMountain.SETTINGS, atTheCrevasse(19), 3);
    halfway.play(60, [walk("anna", "right")]);

    const save = JSON.parse(JSON.stringify(halfway.expedition.save())) as ExpeditionSave;
    const resumed = new Climb(TestMountain.SETTINGS, save);
    resumed.play(200);

    expect(halfway.physics.climber("anna").ladder).toBe("bridge");
    expect(resumed.expedition.save()).toEqual(straight.expedition.save());
  });

  it("refuses a ladder off the ground, of no length, or with its ends the wrong way round", () => {
    const laid = (ladder: LadderLayout) => () =>
      SlopePhysics.start(TestMountain.CREVASSE.layout([{ id: "anna", along: 1 }], [], [ladder]));

    expect(laid({ ...BRIDGE, to: 1000 })).toThrow(RangeError);
    expect(laid({ ...BRIDGE, to: 20 })).toThrow(RangeError);
    expect(laid({ ...BRIDGE, from: 83, to: 20 })).toThrow(RangeError);
  });
});

describe("Ladder: sliding off its lip under two (#256)", () => {
  const bridge = (): Ladder => new Ladder(BRIDGE, TestMountain.CREVASSE.terrain);

  it("slides only across a crevasse, whole: then it creaks, the end said torn free, and a save keeps that it slid", () => {
    const ladder = bridge();
    ladder.slideOff(5, "finish");
    const wall = new Ladder(UP_THE_WALL, TestMountain.WALL.terrain);
    wall.slideOff(5, "start");

    expect(ladder).toMatchObject({ condition: "creaking", torn: "finish", slipped: true });
    expect(ladder.slidable).toBe(false);
    expect(ladder.save()).toMatchObject({ creaking: 5, free: "finish", slid: true });
    expect(new Ladder(ladder.save(), TestMountain.CREVASSE.terrain).slipped).toBe(true);
    expect(wall).toMatchObject({ condition: "whole", slipped: false, slidable: false });
  });

  it("falls when it has creaked its time, and forgets it slid once it's hauled back across", () => {
    const ladder = bridge();
    ladder.slideOff(5, "start");
    // Creaking, a second slide changes nothing.
    ladder.slideOff(6, "finish");

    expect(ladder.snap(7, 3)).toBe(false);
    expect(ladder.snap(8, 3)).toBe(true);
    expect(ladder).toMatchObject({ condition: "broken", torn: "start", slipped: true });
    ladder.raise(1);
    expect(ladder).toMatchObject({
      condition: "whole",
      torn: null,
      slipped: false,
      slidable: true,
    });
    expect(ladder.save()).toEqual(BRIDGE);
  });
});
