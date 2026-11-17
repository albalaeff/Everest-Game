import { describe, expect, it } from "vitest";

import type { ClimberLayout, SlopeLayout, SlopeSettings } from "../physics";
import { TestMountain } from "../physics/testing/test-mountain";
import { SimulationClock } from "../simulation";
import type { ExpeditionSave } from "../simulation";
import { GuidedClimb } from "./testing/guided-climb";
import type { SherpaDoing } from "./sherpa";

const { walk } = GuidedClimb;

/** The steps in `seconds`. */
const steps = (seconds: number): number => seconds * SimulationClock.STEPS_PER_SECOND;

/** Nobody slips, and every hard landing hurts a leg: from 5 m/s a sprain, from 7.7 a fracture,
 * from 9.9 an open one, and 12 kills. */
const HURTS: SlopeSettings = {
  ...TestMountain.CALM,
  lethalLanding: 12,
  injury: { ...TestMountain.CALM.injury, sprain: 5, fracture: 7.7, open: 9.9 },
};

/** Pemba, with the kits a Sherpa carries. */
const pemba = (along: number): ClimberLayout => ({
  id: "pemba",
  along,
  gear: { jumar: true, tools: 2, firstAid: true, rescueKit: true },
});

/** Base Camp, the ground's first 8 m, and the camp the climbs are bound for, its last 10. */
const BASE = { from: 0, to: 8 };

/** Flat ground from Base Camp to a step of ice `height` high at x = 20, its fixed rope down it,
 * and flat on top to the camp, a rope along it. Anna stands on top, 2 m from the lip, off the
 * rope; Pemba 4 m further on. */
const aStep = (height: number): GuidedClimb =>
  new GuidedClimb(
    {
      layout: {
        terrain: [
          [0, 0],
          [20, 0],
          [20, height],
          [60, height],
        ],
        altitude: { start: TestMountain.FOOT, end: TestMountain.FOOT + height },
        ropes: [
          { id: "down", from: 19, to: 21 + height, length: height + 2.5 },
          { id: "top", from: 21 + height, to: 40 + height, length: 19.5 },
        ],
        ladders: [],
        climbers: [{ id: "anna", along: 22 + height }, pemba(26 + height)],
      },
      sherpa: {
        climber: "pemba",
        clients: ["anna"],
        arrival: { from: 50 + height, to: 60 + height },
        base: BASE,
      },
    },
    HURTS,
  );

/** Flat ground from Base Camp to a crevasse 4 m wide and 4.5 m deep, its lips 20 and 33 m along
 * the ground, a ladder across it and a rope along the ladder, and flat beyond to the camp. */
const CREVASSE: Pick<SlopeLayout, "terrain" | "altitude" | "ropes" | "ladders"> = {
  terrain: [
    [0, 0],
    [20, 0],
    [20, -4.5],
    [24, -4.5],
    [24, 0],
    [60, 0],
  ],
  altitude: { start: TestMountain.FOOT, end: TestMountain.FOOT },
  ropes: [{ id: "fixed", from: 16, to: 37, length: 12.5 }],
  ladders: [{ id: "across", from: 20, to: 33 }],
};

/** Anna down on the crevasse's floor with a broken leg, as a fall off the ladder left her, and
 * Pemba `along` the ground. */
const inTheCrevasse = (along: number): GuidedClimb => {
  const climb = new GuidedClimb(
    {
      layout: { ...CREVASSE, climbers: [{ id: "anna", along: 12 }, pemba(along)] },
      sherpa: { climber: "pemba", clients: ["anna"], arrival: { from: 59, to: 69 }, base: BASE },
    },
    HURTS,
  );
  climb.play(1);
  climb.physics.stand("anna", 26.5, false);
  climb.physics.injure("anna", { part: "leg", kind: "fracture" }, 1);
  return climb;
};

/** Plays until Pemba is `doing`, within `seconds`: whether he came to it. */
const comesTo = (climb: GuidedClimb, doing: SherpaDoing, seconds: number): boolean =>
  climb.until(() => climb.sherpa.view.doing === doing, steps(seconds));

/**
 * Pemba and a client who lies hurt (#241): he goes to them, treats what he finds, takes one who
 * can't walk on his back and carries them down to Base Camp.
 */
describe("Pemba, and a client with a broken leg", () => {
  it("comes down the step's rope to a client who walked off its edge, and splints the leg", () => {
    const climb = aStep(4);
    climb.play(steps(4), [walk("anna", "left")]);
    const fallen = climb.physics.climber("anna");
    const reaching = climb.sherpa.view;
    const there = comesTo(climb, "treating", 40);
    const kneeling = climb.physics.climber("pemba");
    climb.until(() => climb.physics.aidDue("anna") === null, steps(10));

    expect(fallen).toMatchObject({ down: true, injuries: [{ part: "leg", kind: "fracture" }] });
    expect(reaching).toMatchObject({ doing: "reaching", client: "anna" });
    expect(there).toBe(true);
    expect(kneeling).toMatchObject({ falling: false, haulHeld: true, y: 0 });
    expect(kneeling.falls).toEqual([]);
    expect(climb.physics.climber("anna").injuries).toMatchObject([{ splinted: true }]);
    expect(climb.physics.kitsSpent("pemba")).toMatchObject({ firstAid: 1 });
  });

  it("takes them on his back, carries them down to Base Camp and sets them down there", () => {
    const climb = aStep(4);
    climb.play(steps(4), [walk("anna", "left")]);
    const carrying = climb.until(
      () => climb.physics.climber("pemba").carrying === "anna",
      steps(60),
    );
    climb.play(steps(4));
    const onTheWay = climb.sherpa.view;
    const walking = climb.physics.climber("pemba");
    const evacuated = comesTo(climb, "evacuated", 90);
    const anna = climb.physics.climber("anna");

    expect(carrying).toBe(true);
    expect(onTheWay).toMatchObject({ doing: "carrying", client: "anna" });
    expect(walking).toMatchObject({ moving: true, haulHeld: false, exertion: 1 });
    expect(evacuated).toBe(true);
    expect(anna).toMatchObject({ carriedBy: null, down: true, dead: false });
    expect(climb.along("anna")).toBeLessThanOrEqual(BASE.to);
    expect(climb.physics.climber("pemba")).toMatchObject({ carrying: null, moving: false });
  });

  it("stays with them in Base Camp, and doesn't pick them up again", () => {
    const climb = aStep(4);
    climb.play(steps(4), [walk("anna", "left")]);
    comesTo(climb, "evacuated", 160);
    const lies = climb.along("anna");
    climb.play(steps(20));

    expect(climb.sherpa.view).toMatchObject({ doing: "evacuated", client: "anna" });
    expect(climb.along("anna")).toBe(lies);
    expect(climb.physics.climber("pemba").carrying).toBeNull();
  });

  it("goes on from a save taken on the carry", () => {
    const climb = aStep(4);
    climb.play(steps(4), [walk("anna", "left")]);
    climb.until(() => climb.physics.climber("pemba").carrying === "anna", steps(60));
    climb.play(steps(3));
    const save = JSON.parse(JSON.stringify(climb.expedition.save())) as ExpeditionSave;
    const resumed = new GuidedClimb(save, HURTS);
    resumed.play(steps(30));
    climb.play(steps(30));

    expect(resumed.physics.climber("pemba")).toEqual(climb.physics.climber("pemba"));
    expect(resumed.physics.climber("anna")).toEqual(climb.physics.climber("anna"));
    expect(resumed.sherpa.view).toEqual(climb.sherpa.view);
  });
});

/**
 * A client down in a crevasse (#241): Pemba anchors a rope at its edge, goes down it to them,
 * treats them, climbs back up and hauls them out, and carries them to Base Camp.
 */
describe("Pemba, and a client down in a crevasse", () => {
  it("builds his anchor at the edge on Base Camp's side, back across the ladder, and goes down the rope", () => {
    const climb = inTheCrevasse(40);
    const anchoring = comesTo(climb, "anchoring", 60);
    const at = climb.along("pemba");
    climb.until(() => climb.physics.lines[0]?.built === 1, steps(10));
    const [line] = climb.physics.lines;
    const down = climb.until(() => climb.physics.deadEnd(climb.along("pemba")), steps(20));

    expect(anchoring).toBe(true);
    expect(at).toBeCloseTo(20, 0);
    expect(line).toMatchObject({ top: 20, built: 1 });
    expect(down).toBe(true);
    expect(climb.physics.climber("pemba")).toMatchObject({
      falling: false,
      first: null,
      second: null,
    });
    expect(climb.physics.climber("pemba").falls).toEqual([]);
  });

  it("splints the leg where they lie, climbs back up the rope and hauls them out to the edge", () => {
    const climb = inTheCrevasse(14);
    const treating = comesTo(climb, "treating", 60);
    const splinted = climb.until(() => climb.physics.aidDue("anna") === null, steps(10));
    const hauling = comesTo(climb, "hauling-out", 30);
    const pembaAt = climb.along("pemba");
    const out = climb.until(
      () => !climb.physics.climber("anna").hauled && climb.along("anna") === 20,
      steps(40),
    );

    expect(treating).toBe(true);
    expect(splinted).toBe(true);
    expect(hauling).toBe(true);
    expect(pembaAt).toBeCloseTo(20, 0);
    expect(out).toBe(true);
    expect(climb.physics.kitsSpent("pemba")).toEqual({ firstAid: 1, rescueKit: 1 });
  });

  it("carries them from the edge to Base Camp", () => {
    const climb = inTheCrevasse(14);
    const evacuated = comesTo(climb, "evacuated", 240);

    expect(evacuated).toBe(true);
    expect(climb.along("anna")).toBeLessThanOrEqual(BASE.to);
    expect(climb.physics.climber("anna")).toMatchObject({
      down: true,
      dead: false,
      carriedBy: null,
    });
    expect(climb.physics.climber("pemba").falls).toEqual([]);
  });

  it("anchors on his own side where the ladder is down, and gets them out there", () => {
    const climb = new GuidedClimb(
      {
        layout: {
          ...CREVASSE,
          ladders: [{ id: "across", from: 20, to: 33, breaks: 2, trainees: ["anna"] }],
          climbers: [{ id: "anna", along: 12 }, pemba(40)],
        },
        sherpa: { climber: "pemba", clients: ["anna"], arrival: { from: 59, to: 69 }, base: BASE },
      },
      HURTS,
    );
    // The ladder breaks under Anna, who isn't clipped, and she falls to the floor.
    climb.play(1, [walk("anna", "right")]);
    climb.until(() => climb.physics.climber("anna").down, steps(60));
    const anna = climb.physics.climber("anna");
    const anchoring = comesTo(climb, "anchoring", 60);
    const at = climb.along("pemba");
    const out = climb.until(
      () => climb.along("anna") === 33 && !climb.physics.climber("anna").hauled,
      steps(120),
    );

    expect(anna).toMatchObject({ down: true, y: -4.5 });
    expect(climb.physics.ladderCondition("across")).toBe("broken");
    expect(anchoring).toBe(true);
    expect(Math.abs(at - 33)).toBeLessThanOrEqual(0.6);
    expect(out).toBe(true);
    expect(climb.physics.climber("anna").injuries).toMatchObject([{ splinted: true }]);
  });
});

/** A sprain (#241): the client goes on, limping, and Pemba wraps it where they stand still. */
describe("Pemba, and a client with a sprained ankle", () => {
  it("wraps it where they stand still near him, and leads on", () => {
    const climb = aStep(2);
    climb.play(steps(3), [walk("anna", "left")]);
    climb.play(1, [walk("anna", "stop")]);
    const sprained = climb.physics.climber("anna");
    const treating = comesTo(climb, "treating", 40);
    const wrapped = climb.until(() => climb.physics.aidDue("anna") === null, steps(10));
    climb.play(steps(2));

    expect(sprained).toMatchObject({ down: false, injuries: [{ kind: "sprain" }] });
    expect(treating).toBe(true);
    expect(wrapped).toBe(true);
    expect(climb.physics.climber("anna").injuries).toMatchObject([{ splinted: true }]);
    expect(climb.sherpa.view.doing).not.toBe("treating");
    expect(climb.physics.climber("pemba").carrying).toBeNull();
  });
});
