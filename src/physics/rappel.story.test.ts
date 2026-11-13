import { describe, expect, it } from "vitest";

import { SimulationClock } from "../simulation";
import type { ExpeditionSave } from "../simulation";
import type { RopeLayout, SlopeLayout } from "./slope-physics";
import { Climb } from "./testing/climb";
import { TestMountain } from "./testing/test-mountain";

const { walk, clip, unclip, jumar } = Climb;

/** The steps in `seconds`. */
const steps = (seconds: number): number => seconds * SimulationClock.STEPS_PER_SECOND;

/** Nobody slips. A whole stride lowers itself down a face at 1 m/s and climbs back at 0.5. */
const CALM = TestMountain.CALM;

/** The fixed rope down a step of ice: from a metre before its foot to a metre back from its lip,
 * as the route anchors one. */
const DOWN_THE_STEP: RopeLayout = { id: "down", from: 19, to: 27, length: 8.5 };
/** A rope that runs along the top, both anchors on it, and none down the step. */
const ALONG_THE_TOP: RopeLayout = { id: "top", from: 27, to: 34, length: 7.5 };

/** Flat ground to a step of ice 6 m high at x = 20, and flat on top: its foot is 20 m along the
 * ground, its lip 26. Anna stands on top, `along` metres along it; Boris beside her, if asked. */
const step = (
  ropes: readonly RopeLayout[],
  { along = 27, boris = false }: { along?: number; boris?: boolean } = {},
): SlopeLayout => ({
  terrain: [
    [0, 0],
    [20, 0],
    [20, 6],
    [40, 6],
  ],
  altitude: { start: TestMountain.FOOT, end: TestMountain.FOOT + 6 },
  ropes,
  ladders: [],
  climbers: [{ id: "anna", along }, ...(boris ? [{ id: "boris", along: along + 0.5 }] : [])],
});

/**
 * A step of ice with no ladder, on the way down: the fixed rope runs down it, and the climbers go
 * down it on the rope through their descenders, as they do on the mountain's fixed lines
 * (technique.down-fixed-ropes). Clipped to that rope, nobody walks off its edge.
 */
describe("Down a step of ice on its rope", () => {
  it("stops a climber clipped to the rope down it at the edge, where one off it walks off and falls", () => {
    const climb = new Climb(CALM, step([DOWN_THE_STEP], { boris: true }));
    climb.play(steps(1), [clip("anna", "first"), clip("anna", "second"), jumar("anna", true)]);
    climb.play(steps(4), [walk("anna", "left"), walk("boris", "left")]);
    const anna = climb.physics.climber("anna");
    const boris = climb.physics.climber("boris");

    expect(anna).toMatchObject({ falling: false, lowering: false, x: 20, y: 6 });
    expect(anna.falls).toEqual([]);
    expect(boris.falls.length + (boris.falling ? 1 : 0)).toBeGreaterThan(0);
    expect(boris.y).toBeLessThan(1);
  });

  it("lowers them down it with a key that points down, at the rappel's speed, to its foot, on their feet", () => {
    const climb = new Climb(CALM, step([DOWN_THE_STEP]));
    climb.play(steps(1), [clip("anna", "first"), clip("anna", "second"), jumar("anna", true)]);
    climb.play(steps(2), [walk("anna", "left")]);
    climb.play(steps(2), [walk("anna", "down")]);
    const halfway = climb.physics.climber("anna");
    climb.play(steps(6));
    const down = climb.physics.climber("anna");

    expect(halfway).toMatchObject({ lowering: true, falling: false, x: 20 });
    expect(halfway.y).toBeGreaterThan(3);
    expect(halfway.y).toBeLessThan(5);
    expect(down).toMatchObject({ lowering: false, falling: false, x: 20, y: 0 });
    expect(down.falls).toEqual([]);
    expect(climb.physics.along("anna")).toBe(20);
  });

  it("takes them back up it on the jumar, and not on the carabiner alone", () => {
    const onTheJumar = new Climb(CALM, step([DOWN_THE_STEP]));
    const carabiner = new Climb(CALM, step([DOWN_THE_STEP]));
    onTheJumar.play(steps(1), [clip("anna", "first"), clip("anna", "second"), jumar("anna", true)]);
    carabiner.play(steps(1), [clip("anna", "second")]);
    for (const climb of [onTheJumar, carabiner]) {
      climb.play(steps(2), [walk("anna", "left")]);
      climb.play(steps(2), [walk("anna", "down")]);
    }
    const lowered = onTheJumar.physics.climber("anna").y;
    onTheJumar.play(steps(10), [walk("anna", "up")]);
    carabiner.play(steps(10), [walk("anna", "up")]);

    expect(lowered).toBeLessThan(5);
    expect(onTheJumar.physics.climber("anna")).toMatchObject({ lowering: false, x: 20, y: 6 });
    expect(carabiner.physics.climber("anna")).toMatchObject({ lowering: true, x: 20 });
    expect(carabiner.physics.climber("anna").y).toBeLessThan(5);
  });

  it("doesn't take a climber down on a rope that runs along the top: they walk off and fall", () => {
    const climb = new Climb(CALM, step([ALONG_THE_TOP], { along: 27.5 }));
    climb.play(steps(1), [clip("anna", "second")]);
    climb.play(steps(3), [walk("anna", "left")]);
    climb.play(steps(3), [walk("anna", "down")]);
    const anna = climb.physics.climber("anna");

    expect(anna.lowering).toBe(false);
    expect(anna.falls.length + (anna.falling ? 1 : 0)).toBeGreaterThan(0);
  });

  it("drops a climber who takes both cowstails off the rope they're lowering on", () => {
    const climb = new Climb(CALM, step([DOWN_THE_STEP]));
    climb.play(steps(1), [clip("anna", "first"), clip("anna", "second"), jumar("anna", true)]);
    climb.play(steps(2), [walk("anna", "left")]);
    climb.play(steps(1), [walk("anna", "down")]);
    climb.play(1, [unclip("anna", "first"), unclip("anna", "second")]);
    climb.play(steps(3));
    const anna = climb.physics.climber("anna");

    expect(anna.lowering).toBe(false);
    expect(anna.falls).toHaveLength(1);
    expect(anna.falls[0]?.held).toBe(false);
  });

  it("goes on lowering from a save as it would have", () => {
    const climb = new Climb(CALM, step([DOWN_THE_STEP]));
    climb.play(steps(1), [clip("anna", "first"), clip("anna", "second"), jumar("anna", true)]);
    climb.play(steps(2), [walk("anna", "left")]);
    climb.play(steps(2), [walk("anna", "down")]);
    const save = JSON.parse(JSON.stringify(climb.expedition.save())) as ExpeditionSave;
    const resumed = new Climb(CALM, save);
    climb.play(steps(1));
    resumed.play(steps(1));

    expect(resumed.physics.climber("anna")).toEqual(climb.physics.climber("anna"));
    expect(resumed.physics.climber("anna").lowering).toBe(true);
  });
});
