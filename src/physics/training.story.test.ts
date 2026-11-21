import { describe, expect, it } from "vitest";

import { SimulationClock } from "../simulation";
import type { ExpeditionSave, GameAction } from "../simulation";
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

/** Holds the haul, or lets it go. */
const haul = (climber: string, held: boolean): GameAction => ({ kind: "haul", climber, held });

/** Nobody slips, a ladder creaks a second before it breaks and two at whole strides haul it back
 * in 8 s, a whole stride hauls a partner at 0.5 m/s from 3 m, and a landing faster than 12 m/s,
 * a drop of about 7 m, kills. */
const SETTINGS: SlopeSettings = {
  ...TestMountain.CALM,
  ladderBreak: { creak: 1, reset: 8, overload: 0 },
  lethalLanding: 12,
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
/** A ladder across it, staged to break 3 m out from the near lip. */
const STAGED: LadderLayout = { id: "long", from: 20, to: 88, breaks: 3 };
/** A rope fixed along it, from 4 m before it to 4 m past it, a metre slack. */
const ALONG_IT: RopeLayout = { id: "fixed", from: 16, to: 92, length: 17 };

/** The wide crevasse with its staged ladder, the rope along it, and these climbers. */
const overTheCrevasse = (climbers: readonly ClimberLayout[]): SlopeLayout => ({
  terrain: WIDE,
  altitude: { start: TestMountain.FOOT, end: TestMountain.FOOT },
  ropes: [ALONG_IT],
  ladders: [STAGED],
  climbers,
});

/** Anna at the near lip, clipped to the rope and walking onto the ladder, and Boris behind her,
 * `back` metres along the ground. At 0.5 m/s she steps past its third metre at 6 s, it creaks,
 * and it breaks a second later. */
const crossing = (back = 18): Climb => {
  const climb = new Climb(
    SETTINGS,
    overTheCrevasse([
      { id: "anna", along: 20 },
      { id: "boris", along: back },
    ]),
  );
  climb.play(1, [clip("anna", "second"), walk("anna", "right")]);
  return climb;
};

/**
 * Training events on the ladders (#209): a ladder staged to break creaks once a climber steps past
 * the rung it breaks at, then breaks, and swings down into the crevasse. The rope holds the climber
 * who clipped in, and up they come to the lip, by their own climb or hauled by a partner holding
 * the haul at the lip; nobody crosses until two of them haul the ladder back (#228).
 */
describe("A ladder staged to break", () => {
  it("creaks as a climber steps past the rung it breaks at, then breaks, and the rope holds the one clipped in", () => {
    const climb = crossing();
    climb.play(steps(6.2));
    const creaking = climb.physics.ladderCondition("long");
    climb.play(steps(1));
    const anna = climb.physics.climber("anna");

    expect(creaking).toBe("creaking");
    expect(climb.physics.ladderCondition("long")).toBe("broken");
    // The end behind her tore free.
    expect(climb.physics.ladderTorn("long")).toBe("start");
    expect(anna).toMatchObject({ falling: true, ladder: null, second: "fixed", dead: false });
    climb.play(steps(3));
    expect(climb.physics.climber("anna")).toMatchObject({ hanging: true, dead: false });
  });

  it("says where the one hanging would be hauled up to, the lip behind them, and nowhere for one on their feet", () => {
    const climb = crossing();
    climb.play(steps(10));

    expect(climb.physics.liftPoint("anna")).toEqual({ x: 20, y: 0 });
    expect(climb.physics.liftPoint("boris")).toBeNull();
  });

  it("creaks only under a step of the climbers it's staged for, when it names them (#212)", () => {
    const staged = (trainees: readonly string[]): Climb => {
      const climb = new Climb(SETTINGS, {
        ...overTheCrevasse([{ id: "pemba", along: 20 }]),
        ladders: [{ ...STAGED, trainees }],
      });
      climb.play(1, [clip("pemba", "second"), walk("pemba", "right")]);
      climb.play(steps(8));
      return climb;
    };

    const guided = staged(["anna"]);
    expect(guided.physics.ladderCondition("long")).toBe("whole");
    expect(guided.physics.climber("pemba")).toMatchObject({ falling: false, ladder: "long" });
    expect(staged(["pemba"]).physics.ladderCondition("long")).toBe("broken");
  });

  it("drops one who isn't clipped in to the crevasse's floor, to their death", () => {
    const climb = new Climb(SETTINGS, overTheCrevasse([{ id: "anna", along: 20 }]));
    climb.play(steps(15), [walk("anna", "right")]);
    const anna = climb.physics.climber("anna");

    expect(anna).toMatchObject({ dead: true, y: -30 });
    expect(anna.falls).toMatchObject([{ broke: true, held: false }]);
  });

  it("brings the one hanging back up the rope to the lip behind them, not onto the broken ladder", () => {
    const climb = crossing();
    climb.play(steps(10));
    climb.play(1, [clip("anna", "first"), walk("anna", "up")]);
    climb.play(steps(20));
    const anna = climb.physics.climber("anna");

    expect(anna).toMatchObject({ falling: false, hanging: false, ladder: null, x: 20, y: 0 });
    expect(anna.falls).toMatchObject([{ broke: true, held: true }]);
    expect(anna.falls[0]?.pulled).toBeUndefined();
  });

  it("is staged between steps by the god mode as a scenario stages it, and creaks under the trainees it names (#245)", () => {
    const climb = new Climb(SETTINGS, {
      ...overTheCrevasse([
        { id: "pemba", along: 20 },
        { id: "anna", along: 18 },
      ]),
      ladders: [{ id: "long", from: 20, to: 88 }],
    });

    climb.physics.stageBreak("long", 3, ["anna"]);
    climb.play(1, [clip("pemba", "second"), walk("pemba", "right")]);
    climb.play(steps(8));
    const underPemba = climb.physics.ladderCondition("long");
    climb.physics.stand("pemba", 88, true);
    climb.physics.stand("anna", 20, true);
    climb.play(1, [Climb.jumar("anna", true), walk("anna", "right")]);
    climb.play(steps(6.2));
    const creaking = climb.physics.ladderCondition("long");
    climb.play(steps(1));

    expect(underPemba).toBe("whole");
    expect(creaking).toBe("creaking");
    expect(climb.physics.ladderCondition("long")).toBe("broken");
    expect(climb.physics.climber("anna")).toMatchObject({ falling: true, second: "fixed" });
  });

  it("lies across again, whole, staged again after it broke (#245)", () => {
    const climb = crossing();
    climb.play(steps(10));
    const broken = climb.physics.ladderCondition("long");

    climb.physics.stageBreak("long", 3, ["anna"]);

    expect(broken).toBe("broken");
    expect(climb.physics.ladderCondition("long")).toBe("whole");
    expect(climb.physics.ladderTorn("long")).toBeNull();
    expect(climb.physics.climber("anna")).toMatchObject({ hanging: true, second: "fixed" });
    expect(() => {
      climb.physics.stageBreak("nowhere", 3, ["anna"]);
    }).toThrow(RangeError);
  });
});

describe("A fallen ladder set back (#228)", () => {
  /** Anna, out of the crevasse at the near lip of the ladder that broke under her, and Boris
   * `boris` metres along the ground. */
  const outOfIt = (boris = 18): Climb => {
    const climb = crossing(boris);
    climb.play(steps(10));
    climb.play(1, [clip("anna", "first"), walk("anna", "up")]);
    climb.play(steps(16));
    climb.play(1, [walk("anna", "stop")]);
    return climb;
  };
  /** Both hold the haul. */
  const bothHaul = [haul("anna", true), haul("boris", true)];

  it("stays down however long they wait, and lets nobody onto it", () => {
    const climb = outOfIt();
    climb.play(1, [Climb.jumar("anna", true), walk("anna", "right")]);
    climb.play(steps(90));

    expect(climb.physics.ladderCondition("long")).toBe("broken");
    expect(climb.physics.ladderRaised("long")).toBe(0);
    expect(climb.physics.climber("anna")).toMatchObject({ x: 20, ladder: null, falling: false });
  });

  it("comes back up while two hold the haul within reach of its ends, in its time at whole strides, and then it holds", () => {
    const climb = outOfIt();
    climb.play(1, bothHaul);
    climb.play(steps(4) - 1);
    const halfway = climb.physics.ladderRaised("long");
    const hauling = ["anna", "boris"].map((id) => climb.physics.climber(id));
    climb.play(steps(4.2));
    const set = climb.physics.ladderCondition("long");
    climb.play(1, [
      haul("anna", false),
      haul("boris", false),
      Climb.jumar("anna", true),
      walk("anna", "right"),
    ]);
    climb.play(steps(30));

    expect(halfway).toBeCloseTo(0.5, 2);
    for (const climber of hauling) {
      expect(climber).toMatchObject({ hauling: true, haulHeld: true, moving: true, exertion: 1 });
    }
    expect(set).toBe("whole");
    expect(climb.physics.ladderRaised("long")).toBe(0);
    expect(climb.physics.climber("anna").x).toBeGreaterThan(28);
    expect(climb.physics.climber("anna").falls).toHaveLength(1);
  });

  it("comes back up as well with one at each lip", () => {
    const climb = outOfIt(90);
    climb.play(1, bothHaul);
    climb.play(steps(8.2));

    expect(climb.physics.ladderCondition("long")).toBe("whole");
  });

  it("doesn't move for one alone, nor for two out of reach of its ends, and stays where it came to once they let go", () => {
    const alone = outOfIt();
    alone.play(1, [haul("anna", true)]);
    alone.play(steps(10));
    const far = outOfIt(10);
    far.play(1, bothHaul);
    far.play(steps(10));
    const paused = outOfIt();
    paused.play(1, bothHaul);
    paused.play(steps(2));
    paused.play(1, [haul("boris", false)]);
    const partway = paused.physics.ladderRaised("long");
    paused.play(steps(5));

    expect(alone.physics.ladderRaised("long")).toBe(0);
    expect(alone.physics.climber("anna")).toMatchObject({ hauling: false, haulHeld: true });
    expect(far.physics.ladderRaised("long")).toBe(0);
    expect(partway).toBeGreaterThan(0.2);
    expect(paused.physics.ladderRaised("long")).toBeCloseTo(partway, 9);
    expect(paused.physics.ladderCondition("long")).toBe("broken");
  });

  it("comes up slower at their strides' share: twice as long at half a stride each", () => {
    const climb = outOfIt();
    climb.physics.stride("anna", 0.5);
    climb.physics.stride("boris", 0.5);
    climb.play(1, bothHaul);
    climb.play(steps(8) - 1);

    expect(climb.physics.ladderRaised("long")).toBeCloseTo(0.5, 2);
  });
});

describe("Hauling a partner out", () => {
  /** Anna hanging under the broken ladder, Boris `back` metres along the ground. */
  const hanging = (back = 18): Climb => {
    const climb = crossing(back);
    climb.play(steps(10));
    return climb;
  };
  /** The seconds Anna takes to be on her feet from now, playing `actions` first, up to 60. */
  const outIn = (climb: Climb, actions: readonly GameAction[]): number => {
    climb.play(1, actions);
    for (let step = 1; step < steps(60); step += 1) {
      if (!climb.physics.climber("anna").falling) {
        return step / SimulationClock.STEPS_PER_SECOND;
      }
      climb.play(1);
    }
    return Infinity;
  };

  it("hauls the one hanging up to the lip while a partner there holds the haul, on their own power", () => {
    const climb = hanging();
    climb.play(1, [haul("boris", true), walk("boris", "right")]);
    climb.play(steps(1));
    const boris = climb.physics.climber("boris");
    const out = outIn(climb, []);
    const anna = climb.physics.climber("anna");

    expect(boris).toMatchObject({
      hauling: true,
      haulHeld: true,
      moving: true,
      exertion: 1,
      x: 18,
    });
    expect(out).toBeLessThan(30);
    expect(anna).toMatchObject({ falling: false, x: 20, y: 0 });
    // The fall says who pulled her out (#212).
    expect(anna.falls).toMatchObject([
      { broke: true, held: true, pulled: true, pulledBy: ["boris"] },
    ]);
    climb.play(1);
    expect(climb.physics.climber("boris")).toMatchObject({ hauling: false, haulHeld: true });
  });

  it("brings them out twice as fast with their own climb as with either alone", () => {
    const hauled = outIn(hanging(), [haul("boris", true)]);
    const jumar = clip("anna", "first");
    const climbed = outIn(hanging(), [jumar, walk("anna", "up")]);
    const both = outIn(hanging(), [haul("boris", true), jumar, walk("anna", "up")]);

    expect(hauled).toBeCloseTo(climbed, 0);
    expect(both).toBeLessThan(climbed * 0.6);
  });

  it("does nothing from out of reach, or once the haul is let go", () => {
    const far = hanging(10);
    far.play(steps(5), [haul("boris", true)]);
    const near = hanging();
    near.play(steps(1), [haul("boris", true)]);
    const partway = near.physics.climber("anna").y;
    near.play(1, [haul("boris", false)]);
    near.play(steps(3));

    expect(far.physics.climber("boris")).toMatchObject({ hauling: false });
    expect(far.physics.climber("anna")).toMatchObject({ falling: true, hanging: true });
    expect(near.physics.climber("anna").y).toBeCloseTo(partway, 1);
  });
});

describe("A save keeps the training's ladder and the haul", () => {
  it("goes on from a save made mid-creak, mid-break and mid-haul as it would have", () => {
    const whole = crossing();
    const broken = crossing();
    whole.play(steps(6.5));
    broken.play(steps(6.5));
    const saved = JSON.parse(JSON.stringify(broken.expedition.save())) as ExpeditionSave;
    const resumed = new Climb(SETTINGS, saved);
    for (const climb of [whole, resumed]) {
      climb.play(steps(4));
      climb.play(1, [haul("boris", true)]);
      climb.play(steps(3));
    }

    expect(resumed.physics.ladderCondition("long")).toBe(whole.physics.ladderCondition("long"));
    expect(resumed.physics.climber("anna")).toEqual(whole.physics.climber("anna"));
    expect(resumed.physics.climber("boris")).toEqual(whole.physics.climber("boris"));
    expect(resumed.expedition.save()).toEqual(whole.expedition.save());
  });

  it("goes on from a save made while the fallen ladder is hauled back as it would have (#228)", () => {
    const go = (climb: Climb): Climb => {
      climb.play(steps(10));
      climb.play(1, [clip("anna", "first"), walk("anna", "up")]);
      climb.play(steps(16));
      climb.play(1, [walk("anna", "stop"), haul("anna", true), haul("boris", true)]);
      climb.play(steps(3));
      return climb;
    };
    const whole = go(crossing());
    const saved = JSON.parse(JSON.stringify(go(crossing()).expedition.save())) as ExpeditionSave;
    const resumed = new Climb(SETTINGS, saved);
    for (const climb of [whole, resumed]) {
      climb.play(steps(6));
    }

    expect(resumed.physics.ladderRaised("long")).toBe(whole.physics.ladderRaised("long"));
    expect(resumed.physics.ladderCondition("long")).toBe("whole");
    expect(resumed.expedition.save()).toEqual(whole.expedition.save());
  });
});
