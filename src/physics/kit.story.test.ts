import { describe, expect, it } from "vitest";

import { SimulationClock } from "../simulation";
import type { GameAction } from "../simulation";
import type { Kit } from "./climber";
import type { SlopeLayout, SlopeSettings } from "./slope-physics";
import { Climb } from "./testing/climb";
import { TestMountain } from "./testing/test-mountain";

const { walk } = Climb;

/** The steps in `seconds`. */
const steps = (seconds: number): number => seconds * SimulationClock.STEPS_PER_SECOND;

/** The crampons tool, at the climber's feet: what refits a loose one. */
const crampons = (climber: string): GameAction => ({
  kind: "tool",
  climber,
  tool: "crampons",
  x: 0,
  y: 0,
});

/** Flat to a crevasse 8 m wide from x = 20, its ladder from 20 m along to 88, and flat beyond; a
 * climber 15 m back from it, with this `kit`. */
const toTheLadder = (kit: Kit): SlopeLayout => ({
  terrain: [
    [0, 0],
    [20, 0],
    [20, -30],
    [28, -30],
    [28, 0],
    [60, 0],
  ],
  altitude: { start: TestMountain.FOOT, end: TestMountain.FOOT },
  ropes: [],
  ladders: [{ id: "long", from: 20, to: 88 }],
  climbers: [{ id: "anna", along: 5, kit }],
});

const UNCHECKED: Kit = { crampons: false, lamp: true, water: true };
const CHECKED: Kit = { crampons: true, lamp: true, water: true };

/** Nothing slips but a ladder's rungs, at `chance` a metre. */
const rungs = (chance: number): SlopeSettings => ({
  ...TestMountain.CALM,
  ladderSlipChance: [[0, chance]],
});

/**
 * The kit (#196): a crampon not checked before setting off comes loose on the first ladder once
 * the climber has been on the move long enough, and makes every step likelier to slip until they
 * kneel on the ground and refit it with the crampons tool; a checked one never does.
 */
describe("A crampon not checked before setting off", () => {
  it("comes loose on the first ladder after the climber has been on the move, and never if checked", () => {
    const loose = new Climb(TestMountain.CALM, toTheLadder(UNCHECKED));
    const tight = new Climb(TestMountain.CALM, toTheLadder(CHECKED));
    loose.play(steps(16), [walk("anna", "right")]);
    tight.play(steps(16), [walk("anna", "right")]);

    // 15 m at 1 m/s to the ladder, then onto it.
    expect(loose.physics.climber("anna")).toMatchObject({ ladder: "long", cramponLoose: true });
    expect(tight.physics.climber("anna")).toMatchObject({ ladder: "long", cramponLoose: false });
  });

  it("leaves the climber less sure-footed: each step on the ladder is likelier to slip (#208)", () => {
    const loose = new Climb(rungs(0.01), toTheLadder(UNCHECKED));
    const tight = new Climb(rungs(0.01), toTheLadder(CHECKED));
    loose.play(steps(16), [walk("anna", "right")]);
    tight.play(steps(16), [walk("anna", "right")]);

    expect(tight.physics.climber("anna").slipChance).toBeCloseTo(0.01, 9);
    expect(loose.physics.climber("anna").slipChance).toBeCloseTo(0.01 / 0.3, 9);
  });

  it("writes a fall on it into the climber's record, for the debrief to trace back", () => {
    const loose = new Climb(rungs(0.3), toTheLadder(UNCHECKED));
    const tight = new Climb(rungs(0.3), toTheLadder(CHECKED));
    loose.play(steps(60), [walk("anna", "right")]);
    tight.play(steps(60), [walk("anna", "right")]);

    const [fall] = loose.physics.climber("anna").falls;
    expect(fall).toMatchObject({ looseCrampon: true, held: false });
    expect(tight.physics.climber("anna").falls.every((it) => it.looseCrampon !== true)).toBe(true);
  });

  it("refits with the crampons tool on the ground, the climber kneeling a while, and not on a ladder", () => {
    const climb = new Climb(TestMountain.CALM, toTheLadder(UNCHECKED));
    climb.play(steps(16), [walk("anna", "right")]);
    climb.play(1, [crampons("anna")]);
    const onTheLadder = climb.physics.climber("anna");
    climb.play(steps(2), [walk("anna", "left")]);
    climb.play(1, [walk("anna", "stop")]);
    climb.play(1, [crampons("anna"), walk("anna", "right")]);
    const kneeling = climb.physics.climber("anna");
    climb.play(steps(0.5));
    const stillKneeling = climb.physics.climber("anna");
    climb.play(steps(1));

    expect(onTheLadder).toMatchObject({ cramponLoose: true, refitting: false });
    expect(kneeling).toMatchObject({ refitting: true, ladder: null });
    expect(stillKneeling.x).toBe(kneeling.x);
    expect(climb.physics.climber("anna")).toMatchObject({ cramponLoose: false, refitting: false });
  });
});
