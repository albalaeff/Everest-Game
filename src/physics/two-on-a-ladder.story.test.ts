import { describe, expect, it } from "vitest";

import { SimulationClock } from "../simulation";
import type { ExpeditionSave } from "../simulation";
import type {
  ClimberLayout,
  LadderLayout,
  RopeLayout,
  SlopeLayout,
  SlopeSettings,
} from "./slope-physics";
import { Climb } from "./testing/climb";
import { TestMountain } from "./testing/test-mountain";

const { walk, clip } = Climb;

/** The steps in `seconds`. */
const steps = (seconds: number): number => seconds * SimulationClock.STEPS_PER_SECOND;

/** Plays up to `most` steps until `done` says so: whether it did. */
const until = (climb: Climb, done: () => boolean, most: number): boolean => {
  for (let step = 0; step < most && !done(); step += 1) {
    climb.play(1);
  }
  return done();
};

/** Nobody slips, and a ladder across a crevasse always slides off its lip as a second climber
 * steps onto it, creaking a second before it falls. */
const SHARED: SlopeSettings = {
  ...TestMountain.CALM,
  ladderBreak: { creak: 1, reset: 600, overload: 1 },
};

/** Flat to a crevasse 8 m wide and 30 m deep, from x = 20 to 28, and flat beyond: its near lip is
 * 20 m along the ground, its far one 88. */
const WIDE: SlopeLayout["terrain"] = [
  [0, 0],
  [20, 0],
  [20, -30],
  [28, -30],
  [28, 0],
  [60, 0],
];
const LADDER: LadderLayout = { id: "long", from: 20, to: 88 };
/** A rope fixed along it, from 4 m before it to 4 m past it, a metre slack. */
const ALONG_IT: RopeLayout = { id: "fixed", from: 16, to: 92, length: 17 };

/** The wide crevasse with its ladder, the rope along it, and these climbers. */
const overTheCrevasse = (climbers: readonly ClimberLayout[]): SlopeLayout => ({
  terrain: WIDE,
  altitude: { start: TestMountain.FOOT, end: TestMountain.FOOT },
  ropes: [ALONG_IT],
  ladders: [LADDER],
  climbers,
});

/** Anna at the near lip and Boris 2 m behind her, both clipped to the rope along the ladder; Anna
 * walks onto it, and Boris after her once she's two seconds out on it. */
const together = (settings: SlopeSettings): Climb => {
  const climb = new Climb(
    settings,
    overTheCrevasse([
      { id: "anna", along: 20 },
      { id: "boris", along: 18 },
    ]),
  );
  climb.play(1, [clip("anna", "second"), clip("boris", "second"), walk("anna", "right")]);
  climb.play(1, [
    clip("anna", "first"),
    clip("boris", "first"),
    { kind: "jumar", climber: "anna", held: true },
    { kind: "jumar", climber: "boris", held: true },
  ]);
  climb.play(steps(2), [walk("boris", "right")]);
  return climb;
};

/**
 * Two on one ladder (#256): the Icefall Doctors ask for one climber on a ladder at a time
 * (technique.one-on-a-ladder), and in May 2018 a ladder whose end lay too near the lip slid into a
 * crevasse as a second Sherpa stepped onto it, taking both (technique.ladder-slid-in). A ladder
 * across a crevasse may slide off its lip as a climber steps onto it with someone already on it:
 * it creaks, the end they stepped on from tears free, and it falls as a staged one does (#209),
 * the ropes holding whoever is clipped.
 */
describe("Two on one ladder", () => {
  it("slides off its lip as a second climber steps onto it, the end he stepped on from torn free, and the rope holds both", () => {
    const climb = together(SHARED);
    const on = until(climb, () => climb.physics.climber("boris").ladder === "long", steps(4));
    climb.play(1);
    const creaking = climb.physics.ladderCondition("long");
    climb.play(steps(1.2));
    const fell = climb.physics.ladderCondition("long");
    climb.play(steps(3));

    expect(on).toBe(true);
    expect(creaking).toBe("creaking");
    expect(fell).toBe("broken");
    expect(climb.physics.ladderTorn("long")).toBe("start");
    for (const id of ["anna", "boris"]) {
      expect(climb.physics.climber(id)).toMatchObject({
        falling: true,
        hanging: true,
        dead: false,
      });
    }
    // Out to the lip and on their feet, her fall says how the ladder went.
    climb.play(1, [walk("anna", "up")]);
    until(climb, () => !climb.physics.climber("anna").falling, steps(120));
    expect(climb.physics.climber("anna").falls.at(-1)).toMatchObject({
      held: true,
      broke: true,
      twoOn: true,
    });
  });

  it("never slides under one climber alone, nor up a wall with two on it", () => {
    const alone = new Climb(SHARED, overTheCrevasse([{ id: "anna", along: 20 }]));
    alone.play(1, [clip("anna", "second"), walk("anna", "right")]);
    alone.play(steps(20));

    const wall = new Climb(
      SHARED,
      TestMountain.WALL.layout(
        [
          { id: "anna", along: 20 },
          { id: "boris", along: 20 },
        ],
        [],
        [{ id: "wall", from: 20, to: 30 }],
      ),
    );
    wall.play(1, [walk("anna", "up")]);
    wall.play(steps(1), [walk("boris", "up")]);
    const both = until(
      wall,
      () =>
        wall.physics.climber("anna").ladder === "wall" &&
        wall.physics.climber("boris").ladder === "wall",
      steps(10),
    );
    wall.play(steps(3));

    expect(alone.physics.ladderCondition("long")).toBe("whole");
    expect(alone.physics.along("anna")).toBeGreaterThanOrEqual(88);
    expect(both).toBe(true);
    expect(wall.physics.ladderCondition("wall")).toBe("whole");
  });

  it("holds two who step onto it with no chance of sliding, as the test mountain has it", () => {
    const climb = together(TestMountain.CALM);
    climb.play(steps(20));

    expect(climb.physics.ladderCondition("long")).toBe("whole");
    expect(climb.physics.climber("anna").falls).toEqual([]);
  });

  it("goes on from a save while it creaks, as if it had never stopped", () => {
    const climb = together(SHARED);
    until(climb, () => climb.physics.ladderCondition("long") === "creaking", steps(5));
    const saved = JSON.parse(JSON.stringify(climb.expedition.save())) as ExpeditionSave;
    const resumed = new Climb(SHARED, saved);
    for (const run of [climb, resumed]) {
      run.play(steps(4));
    }

    expect(resumed.physics.ladderCondition("long")).toBe("broken");
    expect(resumed.physics.climber("boris")).toEqual(climb.physics.climber("boris"));
  });
});
