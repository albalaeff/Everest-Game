import { describe, expect, it } from "vitest";

import { SlopePhysics } from "../physics";
import type { LadderLayout, RopeLayout, SlopeLayout } from "../physics";
import { TestMountain } from "../physics/testing/test-mountain";
import { SimulationClock } from "../simulation";
import type { ExpeditionSave, GameAction } from "../simulation";
import { GuidedClimb } from "./testing/guided-climb";

const { walk } = GuidedClimb;

/** The steps in `seconds`. */
const steps = (seconds: number): number => seconds * SimulationClock.STEPS_PER_SECOND;

const clip = (climber: string, cowstail: "first" | "second"): GameAction => ({
  kind: "clip",
  climber,
  cowstail,
});

/** The camp the flat's climbs are bound for: its last ten metres. */
const ARRIVAL = { from: 90, to: 100 };
/** Anna, a client at 10 m, and Pemba, her Sherpa, at 14, on a hundred metres of flat ground. */
const FLAT = (): GuidedClimb =>
  new GuidedClimb({
    layout: TestMountain.FLAT.layout([
      { id: "anna", along: 10 },
      { id: "pemba", along: 14 },
    ]),
    sherpa: { climber: "pemba", clients: ["anna"], arrival: ARRIVAL },
  });

/** Flat to a crevasse 8 m wide and 30 m deep, from x = 20 to 28, and flat beyond to x = 60: its
 * near lip is 20 m along the ground, its far one 88, and the ground ends at 120. */
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

/** Anna at `anna` and Pemba at `pemba`, both short of the wide crevasse's ladder, and the ladder
 * as `ladder` lays it. */
const atTheCrevasse = (
  anna: number,
  pemba: number,
  ladder: LadderLayout = LADDER,
  settings = TestMountain.CALM,
): GuidedClimb =>
  new GuidedClimb(
    {
      layout: {
        terrain: WIDE,
        altitude: { start: TestMountain.FOOT, end: TestMountain.FOOT },
        ropes: [ALONG_IT],
        ladders: [ladder],
        climbers: [
          { id: "anna", along: anna },
          { id: "pemba", along: pemba },
        ],
      },
      sherpa: { climber: "pemba", clients: ["anna"], arrival: { from: 110, to: 120 } },
    },
    settings,
  );

/** Anna walks right at half a stride, clipping both cowstails to the rope once it's in reach. */
const annaCrosses = (climb: GuidedClimb): void => {
  climb.physics.stride("anna", 0.5);
  climb.play(1, [walk("anna", "right")]);
  climb.until(() => climb.physics.ropeWithin("anna") !== null, steps(30));
  climb.play(1, [
    clip("anna", "second"),
    clip("anna", "first"),
    { kind: "jumar", climber: "anna", held: true },
  ]);
};

describe("A Sherpa leads his client", () => {
  it("waits for his client to set off, then walks ahead of them, 3 to 6 m, at their pace", () => {
    const climb = FLAT();
    climb.play(steps(2));
    const before = { along: climb.along("pemba"), doing: climb.sherpa.view.doing };
    // Anna goes at half his pace: he walks on, waits, walks on.
    climb.physics.stride("anna", 0.5);
    climb.play(1, [walk("anna", "right")]);
    const gaps: number[] = [];
    for (let second = 0; second < 40; second += 1) {
      climb.play(steps(1));
      gaps.push(climb.along("pemba") - climb.along("anna"));
    }

    expect(before.along).toBeCloseTo(14, 6);
    expect(before.doing).toBe("waiting");
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(2.5);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(6.1);
    expect(climb.along("anna")).toBeGreaterThan(25);
  });

  it("waits for a client who stops, but never in a hazard's zone: past it", () => {
    const climb = new GuidedClimb({
      layout: TestMountain.FLAT.layout([
        { id: "anna", along: 10 },
        { id: "pemba", along: 14 },
      ]),
      hazards: {
        weather: "clear",
        zones: [{ id: "seracs", kind: "serac", from: 16, to: 30 }],
      },
      sherpa: { climber: "pemba", clients: ["anna"], arrival: ARRIVAL },
    });
    climb.play(steps(2), [walk("anna", "right")]);
    climb.play(steps(30), [walk("anna", "stop")]);
    const pemba = climb.physics.climber("pemba");

    expect(climb.along("anna")).toBeCloseTo(12, 0);
    expect(pemba.moving).toBe(false);
    expect(climb.along("pemba")).toBeGreaterThan(30);
    expect(climb.along("pemba")).toBeLessThan(31);
    expect(climb.sherpa.view).toMatchObject({ doing: "waiting", client: "anna" });
  });

  it("falls in behind a client who goes ahead of him", () => {
    const climb = FLAT();
    climb.play(1, [walk("anna", "right")]);
    climb.play(steps(2));
    // Pemba tires: he walks at half her pace, and she overtakes him.
    climb.physics.stride("pemba", 0.5);
    climb.play(steps(30));
    const behind = climb.along("anna") - climb.along("pemba");

    expect(behind).toBeGreaterThan(0);
    expect(climb.sherpa.view.doing).toBe("following");
  });

  it("goes past a client who went ahead of him and stands still a while, and leads again (#197)", () => {
    const climb = FLAT();
    climb.play(1, [walk("anna", "right")]);
    climb.play(steps(2));
    climb.physics.stride("pemba", 0.5);
    climb.play(steps(30));
    const following = climb.sherpa.view.doing;
    climb.physics.stride("pemba", 1);
    climb.play(1, [walk("anna", "stop")]);
    const waited = climb.until(() => climb.sherpa.view.doing === "passing", steps(20));
    const stood = climb.physics.climber("anna").moving;
    const passed = climb.until(() => climb.along("pemba") > climb.along("anna"), steps(20));
    climb.play(steps(5));

    expect(following).toBe("following");
    expect(waited).toBe(true);
    expect(stood).toBe(false);
    expect(passed).toBe(true);
    expect(climb.along("pemba") - climb.along("anna")).toBeGreaterThanOrEqual(3);
    expect(climb.sherpa.view.doing).toBe("leading");
  });

  it("stops in the camp the climb is bound for", () => {
    const climb = FLAT();
    climb.play(1, [walk("anna", "right")]);
    climb.play(steps(120));

    expect(climb.along("pemba")).toBeGreaterThanOrEqual(ARRIVAL.from);
    expect(climb.along("pemba")).toBeLessThan(ARRIVAL.to);
    expect(climb.physics.climber("pemba").moving).toBe(false);
  });
});

describe("A Sherpa at a ladder", () => {
  it("crosses first, clipped in, and holds its line taut from the far end until his client is over", () => {
    const climb = atTheCrevasse(12, 17);
    annaCrosses(climb);
    const crossed = climb.until(
      () => climb.along("pemba") >= 88 && !climb.physics.climber("pemba").moving,
      steps(40),
    );
    const holding = { view: climb.sherpa.view, pemba: climb.physics.climber("pemba") };
    const annaOn = climb.until(() => climb.physics.climber("anna").ladder === "long", steps(40));
    const whileShe = climb.sherpa.view;
    climb.until(
      () => climb.along("anna") >= 88 && climb.physics.climber("anna").ladder === null,
      steps(60),
    );
    climb.play(steps(3));

    expect(crossed).toBe(true);
    expect(holding.view).toMatchObject({ doing: "holding", ladder: "long", client: "anna" });
    expect(holding.pemba).toMatchObject({ haulHeld: true, first: "fixed", second: "fixed" });
    expect(annaOn).toBe(true);
    expect(whileShe).toMatchObject({ doing: "holding", ladder: "long" });
    expect(climb.physics.climber("pemba").haulHeld).toBe(false);
    expect(climb.along("pemba")).toBeGreaterThan(88.5);
  });

  it("goes to the lip of a ladder that's down, holds its rope there, hauls it back up with his client, and crosses first (#228)", () => {
    // The ladder broke as the climb began, and hangs from its far end.
    const start = atTheCrevasse(12, 17).expedition.save();
    const physics = start.rules[SlopePhysics.NAME] as unknown as { ladders: LadderLayout[] };
    physics.ladders = [{ ...LADDER, breaks: 2, broke: 0, free: "start" }];
    const climb = new GuidedClimb(start);
    climb.physics.stride("anna", 0.5);
    climb.play(1, [walk("anna", "right")]);
    // Anna stops 2 m short of its lip, within the haul's reach of it.
    climb.until(() => climb.along("anna") >= 18, steps(30));
    climb.play(steps(4), [walk("anna", "stop")]);
    const alone = { along: climb.along("pemba"), view: climb.sherpa.view };
    const pemba = climb.physics.climber("pemba");
    climb.play(steps(10));
    const stillDown = climb.physics.ladderCondition("long");
    climb.play(1, [{ kind: "haul", climber: "anna", held: true }]);
    const set = climb.until(() => climb.physics.ladderCondition("long") === "whole", steps(30));
    climb.play(1, [{ kind: "haul", climber: "anna", held: false }, walk("anna", "right")]);
    climb.play(steps(25));

    expect(alone.along).toBeGreaterThan(19);
    expect(alone.along).toBeLessThanOrEqual(20);
    expect(alone.view).toMatchObject({ doing: "raising" });
    expect(pemba).toMatchObject({ ladder: null, falling: false, haulHeld: true });
    // Alone, he can't lift it.
    expect(stillDown).toBe("broken");
    expect(set).toBe(true);
    // Across, he holds its line for Anna.
    expect(climb.along("pemba")).toBeCloseTo(88, 6);
    expect(climb.sherpa.view).toMatchObject({ doing: "holding", ladder: "long" });
  });
});

describe("A Sherpa and a client on the rope", () => {
  it("hauls out a client hanging under a ladder that broke near his end, then rests with them", () => {
    // The ladder breaks under Anna's step past its fifth metre, nearer Pemba's end than hers.
    const climb = atTheCrevasse(
      12,
      17,
      { ...LADDER, breaks: 5, trainees: ["anna"] },
      { ...TestMountain.CALM, ladderBreak: { creak: 1, reset: 600 } },
    );
    annaCrosses(climb);
    const broke = climb.until(() => climb.physics.climber("anna").hanging, steps(80));
    climb.play(1, [walk("anna", "stop")]);
    const hauling = climb.until(() => climb.physics.climber("pemba").hauling, steps(20));
    const rescue = climb.sherpa.view;
    const out = climb.until(() => !climb.physics.climber("anna").falling, steps(120));
    climb.play(steps(3));
    const resting = { view: climb.sherpa.view, pemba: climb.physics.climber("pemba") };
    climb.play(steps(7));

    expect(broke).toBe(true);
    expect(hauling).toBe(true);
    expect(rescue).toMatchObject({ doing: "rescuing", client: "anna" });
    expect(out).toBe(true);
    expect(climb.physics.climber("anna").falls.at(-1)).toMatchObject({ broke: true, pulled: true });
    expect(resting.view).toMatchObject({ doing: "resting", client: "anna" });
    expect(resting.view.restLeft).toBeGreaterThan(0);
    expect(resting.pemba.moving).toBe(false);
    // A mountain minute later, the rest is over: he leads on.
    expect(climb.sherpa.view.doing).not.toBe("resting");
  });
});

describe("A Sherpa hauling from where he can stand (#239)", () => {
  it("comes back to the lip of a ladder that broke near his end, stops short of it, and hauls his client out from there", () => {
    // Pemba 3.5 m past the far lip, as when he leads; the ladder breaks under Anna's step past
    // its fifth metre, nearer his end than hers.
    const climb = atTheCrevasse(
      12,
      91.5,
      { ...LADDER, breaks: 5, trainees: ["anna"] },
      { ...TestMountain.CALM, ladderBreak: { creak: 1, reset: 600 } },
    );
    annaCrosses(climb);
    const broke = climb.until(() => climb.physics.climber("anna").hanging, steps(80));
    climb.play(1, [walk("anna", "stop")]);
    const hauling = climb.until(() => climb.physics.climber("pemba").hauling, steps(40));
    const from = climb.along("pemba");
    const out = climb.until(() => !climb.physics.climber("anna").falling, steps(120));

    expect(broke).toBe(true);
    expect(hauling).toBe(true);
    // He never steps onto the broken ladder: he hauls from the ground by its end.
    expect(from).toBeGreaterThan(88);
    expect(from).toBeLessThanOrEqual(89);
    expect(out).toBe(true);
    expect(climb.physics.climber("anna").falls.at(-1)).toMatchObject({ broke: true, pulled: true });
  });

  it("hauls out a client who slipped off the middle of a ladder that stands, from its end on his side, and they come up there", () => {
    // Anna half way over the 8 m ladder, more than the haul's 3 m from both lips, Pemba across
    // it and holding its line; then its rungs ice over, and her next step slips.
    const calm = atTheCrevasse(12, 17);
    annaCrosses(calm);
    const half = calm.until(() => calm.physics.climber("anna").x >= 24, steps(120));
    const icy = new GuidedClimb(calm.expedition.save(), TestMountain.ICY_LADDERS);
    const slipped = icy.until(() => icy.physics.climber("anna").hanging, steps(20));
    const at = icy.physics.climber("anna").x;
    icy.play(1, [walk("anna", "stop")]);
    const hauling = icy.until(() => icy.physics.climber("pemba").hauling, steps(40));
    const out = icy.until(() => !icy.physics.climber("anna").falling, steps(200));
    const anna = icy.physics.climber("anna");

    expect(half).toBe(true);
    expect(slipped).toBe(true);
    expect(at).toBeGreaterThan(23);
    expect(at).toBeLessThan(25);
    expect(hauling).toBe(true);
    expect(icy.physics.climber("pemba").ladder).toBeNull();
    expect(out).toBe(true);
    // Up at the far lip, by him, on the ground: not back on the rung.
    expect(anna).toMatchObject({ ladder: null, dead: false });
    expect(anna.x).toBeCloseTo(28, 1);
    expect(icy.along("anna")).toBeCloseTo(88, 1);
    expect(anna.falls.at(-1)).toMatchObject({ held: true, pulled: true });
  });
});

describe("A Sherpa under a hazard", () => {
  it("backs off out from under a serac cracking over him, as his client nears it", () => {
    const climb = new GuidedClimb({
      layout: TestMountain.FLAT.layout([
        { id: "anna", along: 10 },
        { id: "pemba", along: 14 },
      ]),
      hazards: {
        weather: "clear",
        zones: [{ id: "seracs", kind: "serac", from: 15, to: 40 }],
        events: [{ id: "collapse", kind: "serac", from: 20, to: 28, lead: 3, trainees: ["anna"] }],
      },
      sherpa: { climber: "pemba", clients: ["anna"], arrival: ARRIVAL },
    });
    climb.physics.stride("anna", 0.5);
    climb.play(1, [walk("anna", "right")]);
    const cracking = climb.until(() => climb.hazards.warnings.length > 0, steps(60));
    const when = climb.along("pemba");
    climb.play(steps(1));
    const doing = climb.sherpa.view.doing;
    climb.play(steps(5), [walk("anna", "stop")]);

    expect(cracking).toBe(true);
    expect(when).toBeGreaterThan(20);
    expect(doing).toBe("retreating");
    expect(climb.hazards.strikes).toMatchObject([{ zone: "collapse", training: true }]);
    expect(climb.hazards.strikes[0]?.climbers).not.toContain("pemba");
  });
});

describe("A Sherpa in a save", () => {
  it("goes on from a save, through JSON, as if it had never stopped", () => {
    const climb = FLAT();
    climb.physics.stride("anna", 0.5);
    climb.play(1, [walk("anna", "right")]);
    climb.play(steps(9));
    const save = JSON.parse(JSON.stringify(climb.expedition.save())) as ExpeditionSave;
    const resumed = new GuidedClimb(save);
    climb.play(steps(10));
    resumed.play(steps(10));

    expect(resumed.expedition.save()).toEqual(climb.expedition.save());
  });
});

describe("A Sherpa put somewhere else by the god mode (#245)", () => {
  it("takes the climb afresh from where he's put, and leads his client on from there", () => {
    const climb = FLAT();
    climb.play(1, [walk("anna", "right")]);
    climb.play(steps(2));
    // Pemba tires, she overtakes him, and he follows her.
    climb.physics.stride("pemba", 0.5);
    climb.play(steps(30));
    const following = climb.sherpa.view.doing;

    climb.physics.stride("pemba", 1);
    climb.physics.stand("anna", 50, false);
    climb.physics.stand("pemba", 50, false);
    climb.sherpa.afresh();
    const afresh = climb.sherpa.view;
    climb.play(steps(10));
    const ahead = climb.along("pemba") - climb.along("anna");

    expect(following).toBe("following");
    expect(afresh).toEqual({
      climber: "pemba",
      doing: "waiting",
      client: null,
      ladder: null,
      restLeft: null,
    });
    expect(climb.along("anna")).toBe(50);
    expect(ahead).toBeGreaterThanOrEqual(2.5);
    expect(ahead).toBeLessThanOrEqual(6.1);
  });

  it("goes on from a save of him taken afresh as if he'd started there", () => {
    const climb = FLAT();
    climb.play(1, [walk("anna", "right")]);
    climb.play(steps(5));
    climb.physics.stand("pemba", 60, true);
    climb.sherpa.afresh();
    const save = JSON.parse(JSON.stringify(climb.expedition.save())) as ExpeditionSave;
    const resumed = new GuidedClimb(save);
    climb.play(steps(10));
    resumed.play(steps(10));

    expect(resumed.expedition.save()).toEqual(climb.expedition.save());
  });
});
