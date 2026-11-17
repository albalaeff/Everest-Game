import { describe, expect, it } from "vitest";

import { SimulationClock } from "../simulation";
import type { ExpeditionSave, GameAction } from "../simulation";
import type { Gear } from "./climber";
import type { SlopeLayout, SlopeSettings } from "./slope-physics";
import { Climb } from "./testing/climb";
import { TestMountain } from "./testing/test-mountain";

const { walk, clip } = Climb;
const haul = (climber: string, held: boolean): GameAction => ({ kind: "haul", climber, held });

/** The steps in `seconds`. */
const steps = (seconds: number): number => Math.round(seconds * SimulationClock.STEPS_PER_SECOND);

/** Nobody slips, and a landing hurts as the test says: from 5 m/s a sprain, from 7.7 a fracture,
 * from 9.9 an open one, and 12 kills; every hard landing hurts, a leg on ground a climber could
 * stand on and an arm on a face. A sprain halves the pace, and a wrap gives four fifths back. */
const HURTS: SlopeSettings = {
  ...TestMountain.CALM,
  lethalLanding: 12,
  injury: {
    sprain: 5,
    fracture: 7.7,
    open: 9.9,
    unhurt: { soft: 0, hard: 0 },
    leg: { flat: 1, steep: 0 },
    sore: 0.5,
    wrapped: 0.8,
  },
};
/** The same landings, which chance lets half of the climbers walk away from. */
const BY_CHANCE: SlopeSettings = {
  ...HURTS,
  injury: { ...HURTS.injury, unhurt: { soft: 0.5, hard: 0.5 } },
};

/** The jumar and the axe, and the kits a rescuer carries. */
const RESCUER: Gear = { jumar: true, tools: 1, firstAid: true, rescueKit: true };
const FIRST_AIDER: Gear = { jumar: true, tools: 1, firstAid: true };

/** Flat ground to a step of ice `height` high at x = 20, and flat on top. Anna stands on top, a
 * metre back from its lip; Boris at its foot, 2 m out, with what `gear` he carries. */
const step = (height: number, gear: Gear = RESCUER): SlopeLayout => ({
  terrain: [
    [0, 0],
    [20, 0],
    [20, height],
    [40, height],
  ],
  altitude: { start: TestMountain.FOOT, end: TestMountain.FOOT + height },
  ropes: [{ id: "top", from: 20 + height + 0.5, to: 20 + height + 8, length: 8 }],
  ladders: [],
  climbers: [
    { id: "anna", along: 20 + height + 1 },
    { id: "boris", along: 18, gear },
  ],
});

/** Flat ground with a crevasse 3 m wide and 4.5 m deep, its lips 20 and 32 m along the ground and
 * its floor from 24.5 to 27.5. Anna stands a metre from its near lip; Boris beside her. */
const crevasse = (gear: Gear = RESCUER): SlopeLayout => ({
  terrain: [
    [0, 0],
    [20, 0],
    [20, -4.5],
    [23, -4.5],
    [23, 0],
    [50, 0],
  ],
  altitude: { start: TestMountain.FOOT, end: TestMountain.FOOT },
  ropes: [],
  ladders: [],
  climbers: [
    { id: "anna", along: 19 },
    { id: "boris", along: 18, gear },
  ],
});

/** Anna walks off the edge ahead of her, with no rope, and stops where the fall leaves her. */
const fallOff = (climb: Climb, direction: "left" | "right"): void => {
  climb.play(1, [walk("anna", direction)]);
  for (let step = 0; step < steps(8); step += 1) {
    const { falls, dead, falling } = climb.physics.climber("anna");
    if ((falls.length > 0 || dead) && !falling) {
      break;
    }
    climb.play(1);
  }
  climb.play(1, [walk("anna", "stop")]);
};

/**
 * A hard landing injures, by how fast the ice came up and how the climber came down on it (#241):
 * a sprain, a fracture, an open fracture, and past that the fall kills. A rope that holds the fall
 * hurts nobody.
 */
describe("A hard landing", () => {
  it("leaves a climber who drops a metre unhurt, and sprains the ankle of one who drops two", () => {
    const low = new Climb(HURTS, step(1));
    const higher = new Climb(HURTS, step(2));
    fallOff(low, "left");
    fallOff(higher, "left");

    expect(low.physics.climber("anna")).toMatchObject({ injuries: [], down: false, dead: false });
    expect(higher.physics.climber("anna")).toMatchObject({
      injuries: [{ part: "leg", kind: "sprain", splinted: false }],
      down: false,
      falling: false,
    });
  });

  it("limps on a sprained ankle at half the pace", () => {
    const sprained = new Climb(HURTS, step(2));
    const whole = new Climb(HURTS, step(1));
    for (const climb of [sprained, whole]) {
      fallOff(climb, "left");
      const from = climb.physics.along("anna");
      climb.play(steps(4), [walk("anna", "left")]);
      climb.play(1, [walk("anna", "stop")]);
      expect(from - climb.physics.along("anna")).toBeCloseTo(climb === whole ? 4 : 2, 0);
    }
  });

  it("breaks a leg off a step of 4 m: down where they came to rest, and no step from there", () => {
    const climb = new Climb(HURTS, step(4));
    fallOff(climb, "left");
    const lies = climb.physics.along("anna");
    climb.play(steps(3), [walk("anna", "left")]);
    const anna = climb.physics.climber("anna");

    expect(anna).toMatchObject({
      injuries: [{ part: "leg", kind: "fracture", tourniquet: false, splinted: false }],
      down: true,
      falling: false,
      dead: false,
      moving: false,
    });
    expect(climb.physics.along("anna")).toBe(lies);
    expect(anna.falls).toHaveLength(1);
    expect(climb.physics.movable("anna")).toBe(false);
  });

  it("breaks the bone open off a step of 6 m, which bleeds, and kills off one of 9", () => {
    const open = new Climb(HURTS, step(6));
    const deadly = new Climb(HURTS, step(9));
    fallOff(open, "left");
    fallOff(deadly, "left");

    expect(open.physics.climber("anna")).toMatchObject({
      injuries: [{ kind: "open-fracture", tourniquet: false }],
      down: true,
    });
    expect(open.physics.aidDue("anna")).toMatchObject({ what: "tourniquet", part: "leg" });
    expect(deadly.physics.climber("anna")).toMatchObject({ dead: true, down: false, injuries: [] });
  });

  it("hurts an arm where the climber is thrown against a face of ice", () => {
    // A wall 7.85 m high over a ramp of ice at 50°: she drops down the wall onto the ramp, which
    // throws her sideways, and slides on down it.
    const climb = new Climb(HURTS, {
      ...step(15),
      terrain: [
        [0, 0],
        [14, 0],
        [20, 7.15],
        [20, 15],
        [40, 15],
      ],
    });
    climb.play(steps(1.5), [walk("anna", "left")]);
    let first: string | undefined;
    for (let step = 0; step < steps(6) && first === undefined; step += 1) {
      climb.play(1);
      first = climb.physics.climber("anna").injuries[0]?.part;
    }

    expect(first).toBe("arm");
    expect(climb.physics.climber("anna").y).toBeGreaterThan(1);
  });

  it("hurts nobody the rope holds, off a ladder that kills the one who isn't clipped", () => {
    // A ladder over a crevasse 30 m deep, its rungs so icy that the first step slips.
    const icy: SlopeSettings = { ...HURTS, ladderSlipChance: [[0, TestMountain.SURE]] };
    const crossing = (): Climb =>
      new Climb(
        icy,
        TestMountain.CREVASSE.layout(
          [{ id: "anna", along: 19.5 }],
          [{ id: "across", from: 18, to: 85, length: 7.5 }],
          [{ id: "ladder", from: 20, to: 83 }],
        ),
      );
    const clipped = crossing();
    const unclipped = crossing();
    clipped.play(steps(1), [clip("anna", "first"), clip("anna", "second")]);
    clipped.play(steps(8), [walk("anna", "right")]);
    unclipped.play(steps(8), [walk("anna", "right")]);

    expect(clipped.physics.climber("anna")).toMatchObject({ hanging: true, injuries: [] });
    expect(clipped.physics.climber("anna").dead).toBe(false);
    expect(unclipped.physics.climber("anna")).toMatchObject({ dead: true });
  });

  it("is how they came down, which chance has: of twenty who drop 4 m, some walk away", () => {
    let hurt = 0;
    for (let seed = 1; seed <= 20; seed += 1) {
      const climb = new Climb(BY_CHANCE, step(4), seed);
      fallOff(climb, "left");
      hurt += climb.physics.climber("anna").injuries.length;
    }
    expect(hurt).toBeGreaterThan(4);
    expect(hurt).toBeLessThan(16);
  });

  it("is the same on the same seed, and goes on from a save", () => {
    const first = new Climb(BY_CHANCE, step(4), 7);
    const second = new Climb(BY_CHANCE, step(4), 7);
    fallOff(first, "left");
    fallOff(second, "left");
    const save = JSON.parse(JSON.stringify(first.expedition.save())) as ExpeditionSave;
    const resumed = new Climb(BY_CHANCE, save);
    resumed.play(steps(1));
    second.play(steps(1));

    expect(resumed.physics.climber("anna")).toEqual(second.physics.climber("anna"));
  });
});

/**
 * First aid, where the casualty lies (#241): whoever holds the haul by them, a first-aid kit in
 * their pack, puts the tourniquet on what bleeds, then the splint on what's broken; a casualty
 * isn't moved before that.
 */
describe("First aid", () => {
  it("is the tourniquet first on a leg that bleeds, then the splint, and uses the kit up", () => {
    const climb = new Climb(HURTS, step(6));
    fallOff(climb, "left");
    climb.play(steps(3), [walk("boris", "right")]);
    climb.play(steps(0.5), [walk("boris", "stop"), haul("boris", true)]);
    const during = climb.physics.climber("boris");
    climb.play(steps(0.6));
    const tourniquetOn = climb.physics.climber("anna");
    climb.play(steps(3.2));
    const anna = climb.physics.climber("anna");

    expect(during).toMatchObject({ helping: { kind: "aid", whom: "anna" }, moving: false });
    expect(tourniquetOn.injuries).toMatchObject([{ tourniquet: true, splinted: false }]);
    expect(climb.physics.aidDue("anna")).toBeNull();
    expect(anna.injuries).toMatchObject([{ tourniquet: true, splinted: true }]);
    expect(climb.physics.movable("anna")).toBe(true);
    expect(climb.physics.kitsSpent("boris")).toEqual({ firstAid: 1, rescueKit: 0 });
  });

  it("isn't given without a first-aid kit, or out of reach, or with the haul let go", () => {
    const noKit = new Climb(HURTS, step(4, { jumar: true, tools: 1 }));
    const far = new Climb(HURTS, step(4));
    const letGo = new Climb(HURTS, step(4));
    for (const climb of [noKit, far, letGo]) {
      fallOff(climb, "left");
    }
    noKit.play(steps(3), [walk("boris", "right")]);
    noKit.play(steps(5), [walk("boris", "stop"), haul("boris", true)]);
    far.play(steps(5), [haul("boris", true)]);
    letGo.play(steps(3), [walk("boris", "right")]);
    letGo.play(steps(5), [walk("boris", "stop")]);

    for (const climb of [noKit, far, letGo]) {
      expect(climb.physics.climber("anna").injuries).toMatchObject([{ splinted: false }]);
      expect(climb.physics.climber("boris").helping).toBeNull();
    }
  });

  it("wraps a sprain, and gives back some of the pace", () => {
    const climb = new Climb(HURTS, step(2));
    fallOff(climb, "left");
    climb.play(steps(3), [walk("boris", "right")]);
    climb.play(steps(2.2), [walk("boris", "stop"), haul("boris", true)]);
    climb.play(1, [haul("boris", false)]);
    const from = climb.physics.along("anna");
    climb.play(steps(5), [walk("anna", "left")]);

    expect(climb.physics.climber("anna").injuries).toMatchObject([
      { kind: "sprain", splinted: true },
    ]);
    expect(from - climb.physics.along("anna")).toBeCloseTo(4, 0);
  });
});

/**
 * The carry (#241): a casualty who can't walk, once they can be moved, goes onto a rescuer's
 * back, and down the route with them, at the carry's share of their stride.
 */
describe("A casualty on a rescuer's back", () => {
  /** Anna with a broken leg at the foot of a 4 m step, splinted by Boris, who still holds the
   * haul by her. */
  const splinted = (): Climb => {
    const climb = new Climb(HURTS, step(4));
    fallOff(climb, "left");
    climb.play(steps(3), [walk("boris", "right")]);
    climb.play(steps(3.2), [walk("boris", "stop"), haul("boris", true)]);
    return climb;
  };

  it("is lifted there once they're splinted, the haul held a second more", () => {
    const climb = splinted();
    const before = climb.physics.climber("boris");
    climb.play(steps(1.1));
    const boris = climb.physics.climber("boris");
    const anna = climb.physics.climber("anna");

    expect(before.carrying).toBeNull();
    expect(boris.carrying).toBe("anna");
    expect(anna).toMatchObject({ carriedBy: "boris", down: false, x: boris.x, y: boris.y });
  });

  it("goes where the rescuer goes, at half their stride, all their power in every step", () => {
    const climb = splinted();
    climb.play(steps(1.1));
    const from = climb.physics.along("boris");
    climb.play(steps(4), [haul("boris", false), walk("boris", "left")]);
    const boris = climb.physics.climber("boris");
    const anna = climb.physics.climber("anna");

    expect(from - climb.physics.along("boris")).toBeCloseTo(2, 1);
    expect(boris).toMatchObject({ moving: true, exertion: 1 });
    expect({ x: anna.x, y: anna.y }).toEqual({ x: boris.x, y: boris.y });
    expect(climb.physics.along("anna")).toBeCloseTo(climb.physics.along("boris"), 6);
  });

  it("is set down where the rescuer stands still and holds the haul again", () => {
    const climb = splinted();
    climb.play(steps(1.1));
    climb.play(steps(4), [haul("boris", false), walk("boris", "left")]);
    climb.play(steps(1.1), [walk("boris", "stop"), haul("boris", true)]);
    climb.play(steps(1), [haul("boris", false), walk("boris", "left")]);
    const anna = climb.physics.climber("anna");

    expect(anna).toMatchObject({ carriedBy: null, down: true });
    expect(climb.physics.climber("boris").carrying).toBeNull();
    expect(climb.physics.along("anna")).toBeGreaterThan(climb.physics.along("boris") + 0.5);
  });

  it("isn't lifted before the splint is on, nor does a casualty take a step on anyone's back", () => {
    const unsplinted = new Climb(HURTS, step(4, { jumar: true, tools: 1 }));
    fallOff(unsplinted, "left");
    unsplinted.play(steps(3), [walk("boris", "right")]);
    unsplinted.play(steps(4), [walk("boris", "stop"), haul("boris", true)]);
    const climb = splinted();
    climb.play(steps(1.1));
    climb.play(steps(2), [walk("anna", "right")]);

    expect(unsplinted.physics.climber("boris").carrying).toBeNull();
    expect(climb.physics.climber("anna")).toMatchObject({ carriedBy: "boris", moving: false });
  });

  it("goes on from a save", () => {
    const climb = splinted();
    climb.play(steps(1.1));
    climb.play(steps(1), [haul("boris", false), walk("boris", "left")]);
    const save = JSON.parse(JSON.stringify(climb.expedition.save())) as ExpeditionSave;
    const resumed = new Climb(HURTS, save);
    resumed.play(steps(2));
    climb.play(steps(2));

    expect(resumed.physics.climber("anna")).toEqual(climb.physics.climber("anna"));
    expect(resumed.physics.climber("boris")).toEqual(climb.physics.climber("boris"));
    expect(resumed.physics.climber("anna").carriedBy).toBe("boris");
  });
});

/**
 * Down into a crevasse after a climber (#241): they lie where the route doesn't reach, so a
 * rescuer with a rescue kit builds an anchor at the edge over them and throws a rope down, goes
 * down it to them, treats them, goes back up it and hauls them out.
 */
describe("A climber down in a crevasse", () => {
  /** Anna, who walked into the crevasse and broke her leg on its floor. */
  const fallen = (gear: Gear = RESCUER): Climb => {
    const climb = new Climb(HURTS, crevasse(gear));
    fallOff(climb, "right");
    return climb;
  };
  /** The same, the rescue line built by Boris at the lip over her. */
  const roped = (): Climb => {
    const climb = fallen();
    climb.play(steps(2), [walk("boris", "right")]);
    climb.play(steps(4.1), [walk("boris", "stop"), haul("boris", true)]);
    climb.play(1, [haul("boris", false)]);
    return climb;
  };
  /** The same, Boris down the line beside her, and her leg splinted. */
  const treated = (): Climb => {
    const climb = roped();
    climb.play(steps(8), [walk("boris", "down")]);
    climb.play(steps(3.2), [walk("boris", "stop"), haul("boris", true)]);
    climb.play(1, [haul("boris", false)]);
    return climb;
  };

  it("lies on its floor, where the route doesn't reach, an edge to anchor at on each side", () => {
    const climb = fallen();
    const anna = climb.physics.climber("anna");

    expect(anna).toMatchObject({ down: true, y: -4.5, injuries: [{ kind: "fracture" }] });
    expect(climb.physics.deadEnd(climb.physics.along("anna"))).toBe(true);
    expect(climb.physics.anchorSpots("anna")).toEqual([20, 32]);
    expect(climb.physics.anchorSpots("boris")).toEqual([]);
  });

  it("gets a rope down to them from the edge, the haul held there by a rescuer with a rescue kit", () => {
    const climb = fallen();
    climb.play(steps(2), [walk("boris", "right")]);
    climb.play(steps(2), [walk("boris", "stop"), haul("boris", true)]);
    const building = climb.physics.climber("boris");
    const half = climb.physics.lines;
    climb.play(steps(2.1));
    const [line] = climb.physics.lines;

    expect(building).toMatchObject({ helping: { kind: "anchor", whom: "anna" } });
    expect(half).toMatchObject([{ top: 20 }]);
    expect(half[0]?.built).toBeCloseTo(0.5, 6);
    expect(line).toMatchObject({ top: 20, foot: climb.physics.along("anna"), built: 1 });
    expect(line?.shape[0]).toEqual({ x: 20, y: 0 });
    expect(line?.shape.at(-1)?.y).toBe(-4.5);
    expect(climb.physics.kitsSpent("boris")).toEqual({ firstAid: 0, rescueKit: 1 });
  });

  it("gets no rope from one who carries no rescue kit, or stands back from the edge", () => {
    const noKit = fallen(FIRST_AIDER);
    const back = fallen();
    noKit.play(steps(2), [walk("boris", "right")]);
    noKit.play(steps(5), [walk("boris", "stop"), haul("boris", true)]);
    back.play(steps(5), [haul("boris", true)]);

    expect(noKit.physics.lines).toEqual([]);
    expect(back.physics.lines).toEqual([]);
  });

  it("is reached down the rope, at the rappel's speed, held by it all the way", () => {
    const climb = roped();
    climb.play(steps(2), [walk("boris", "down")]);
    const onTheWay = climb.physics.climber("boris");
    climb.play(steps(6));
    const down = climb.physics.climber("boris");

    expect(onTheWay).toMatchObject({ lowering: true, falling: false, x: 20, onLine: "rescue-1" });
    expect(onTheWay.y).toBeLessThan(-1);
    expect(onTheWay.y).toBeGreaterThan(-3);
    expect(down).toMatchObject({ lowering: false, falling: false, y: -4.5, onLine: null });
    expect(down.falls).toEqual([]);
    expect(climb.physics.along("boris")).toBeCloseTo(climb.physics.along("anna"), 6);
  });

  it("is treated where they lie, and isn't lifted there: the way out is the rope", () => {
    const climb = treated();
    climb.play(steps(3), [haul("boris", true)]);

    expect(climb.physics.movable("anna")).toBe(true);
    expect(climb.physics.climber("boris")).toMatchObject({ carrying: null, helping: null });
  });

  it("is hauled up the rope from its anchor to the edge, where they lie on the route's ground", () => {
    const climb = treated();
    climb.play(steps(16), [walk("boris", "up")]);
    const boris = climb.physics.climber("boris");
    climb.play(steps(6), [walk("boris", "stop"), haul("boris", true)]);
    const halfway = climb.physics.climber("anna");
    const hauling = climb.physics.climber("boris");
    for (let step = 0; step < steps(12) && climb.physics.climber("anna").hauled; step += 1) {
      climb.play(1);
    }
    const anna = climb.physics.climber("anna");

    expect(boris).toMatchObject({ x: 20, y: 0, lowering: false, onLine: null });
    expect(hauling).toMatchObject({ hauling: true, helping: { kind: "line-haul", whom: "anna" } });
    expect(halfway).toMatchObject({ hauled: true, onLine: "rescue-1", down: true });
    expect(halfway.y).toBeGreaterThan(-4.5);
    expect(halfway.y).toBeLessThan(0);
    expect(anna).toMatchObject({ x: 20, y: 0, hauled: false, onLine: null, down: true });
    expect(climb.physics.deadEnd(climb.physics.along("anna"))).toBe(false);
  });

  it("stays where the haul stopped, held by the rope, and comes on up when it's taken up again", () => {
    const climb = treated();
    climb.play(steps(16), [walk("boris", "up")]);
    climb.play(steps(6), [walk("boris", "stop"), haul("boris", true)]);
    climb.play(steps(3), [haul("boris", false)]);
    const held = climb.physics.climber("anna");
    const save = JSON.parse(JSON.stringify(climb.expedition.save())) as ExpeditionSave;
    const resumed = new Climb(HURTS, save);
    resumed.play(steps(12), [haul("boris", true)]);

    expect(held).toMatchObject({ hauled: true, falling: false });
    expect(resumed.physics.climber("anna")).toMatchObject({ x: 20, y: 0, onLine: null });
  });

  it("isn't hauled before the splint is on", () => {
    const climb = roped();
    climb.play(steps(6), [haul("boris", true)]);

    expect(climb.physics.climber("anna")).toMatchObject({ y: -4.5, hauled: false });
    expect(climb.physics.climber("boris").helping).toBeNull();
  });

  it("goes onto the rescuer's back at the edge, and away from the crevasse", () => {
    const climb = treated();
    climb.play(steps(16), [walk("boris", "up")]);
    climb.play(steps(20), [walk("boris", "stop"), haul("boris", true)]);
    climb.play(steps(4), [haul("boris", false), walk("boris", "left")]);

    expect(climb.physics.climber("anna")).toMatchObject({ carriedBy: "boris" });
    expect(climb.physics.along("anna")).toBeLessThan(19);
    expect(climb.physics.climber("boris")).toMatchObject({ falling: false, lowering: false });
  });

  it("lets a climber who is whole go down the rope and back up it too", () => {
    const climb = roped();
    climb.play(steps(8), [walk("boris", "down")]);
    climb.play(steps(14), [walk("boris", "up")]);

    expect(climb.physics.climber("boris")).toMatchObject({ x: 20, y: 0, onLine: null });
    expect(climb.physics.climber("boris").falls).toEqual([]);
  });
});
