import { describe, expect, it } from "vitest";

import type { ClimberView, LadderCondition, Point } from "../physics";
import type { HazardKind, HazardZone, JoltKind } from "../simulation";
import { Coach } from "./coach";
import type { CoachWorld } from "./coach";

/** A climber standing at `x` on flat ground, steady, clipped to nothing. */
const standing = (x: number, over: Partial<ClimberView> = {}): ClimberView => ({
  x,
  y: 0,
  altitude: 5400,
  falling: false,
  dead: false,
  walking: "stop",
  moving: false,
  exertion: 0,
  first: null,
  second: null,
  firstAt: null,
  secondAt: null,
  jumarHeld: false,
  ladder: null,
  falls: [],
  slipChance: 0,
  hanging: false,
  kit: { crampons: true, lamp: true, water: true },
  cramponLoose: false,
  refitting: false,
  hauling: false,
  haulHeld: false,
  onIce: false,
  picks: [],
  pickPoor: false,
  lowering: false,
  gear: { jumar: true, tools: 1 },
  clipping: null,
  stillChance: 0,
  heldBack: null,
  facing: 1,
  towardViewer: false,
  ...over,
});

/** A route along a flat: a rope from 10 to 20 m and the next from 20 to 30, a ladder up a wall at
 * 40 m, one across a crevasse from 50 to 56, blue ice from 70 to 80, and seracs from 90 to 100. */
class World implements CoachWorld {
  view: ClimberView = standing(0);
  dark = false;
  going: HazardKind | null = null;
  jolting: JoltKind | null = null;
  passer = false;
  conditions: Record<string, LadderCondition> = {};
  partner = false;
  ice = [{ from: 70, to: 80 }];
  zones: readonly HazardZone[] = [{ id: "seracs", kind: "serac", from: 90, to: 100 }];
  wall: "foot" | "lip" | "rope" | null = null;
  deadEnd = false;
  ropes = ["one", "two"];
  ladders = ["wall", "crevasse"];
  private readonly shapes: Readonly<Record<string, readonly Point[]>> = {
    one: [
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ],
    two: [
      { x: 20, y: 0 },
      { x: 30, y: 0 },
    ],
    wall: [
      { x: 40, y: 0 },
      { x: 40, y: 5 },
    ],
    crevasse: [
      { x: 50, y: 0 },
      { x: 56, y: 0 },
    ],
  };

  player(): ClimberView {
    return this.view;
  }

  inTheDark(): boolean {
    return this.dark;
  }

  warning(): HazardKind | null {
    return this.going;
  }

  jolt(): JoltKind | null {
    return this.jolting;
  }

  passing(): boolean {
    return this.passer;
  }

  ladderCondition(id: string): LadderCondition {
    return this.conditions[id] ?? "whole";
  }

  partnerHangs(): boolean {
    return this.partner;
  }

  along(): number {
    return this.view.x;
  }

  iceWall(): "foot" | "lip" | "rope" | null {
    return this.wall;
  }

  inADeadEnd(): boolean {
    return this.deadEnd;
  }

  ropeWithin(): string | null {
    const { x } = this.view;
    if (x >= 10 && x < 20) {
      return "one";
    }
    return x >= 20 && x <= 30 ? "two" : null;
  }

  rope(id: string): readonly Point[] {
    return this.shapes[id] ?? [];
  }

  ladder(id: string): readonly Point[] {
    return this.shapes[id] ?? [];
  }
}

/** A coach with nothing done yet, kept in a plain map. */
function fresh(): { readonly coach: Coach; readonly kept: Map<string, string> } {
  const kept = new Map<string, string>();
  const storage = {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => kept.set(key, value),
  };
  return { coach: new Coach(storage), kept };
}

/** The tip the coach shows after `seconds` of the world as it is. */
const after = (coach: Coach, world: World, seconds = 0.1): string | null =>
  coach.tip(world, seconds);

describe("Coach: the tutorial, one thing at a time, where the route first needs it", () => {
  it("starts with the walk, and lets it go once the climber has walked a few metres", () => {
    const { coach } = fresh();
    const world = new World();

    expect(after(coach, world)).toBe("walk");
    world.view = standing(4, { moving: true, walking: "right" });
    expect(after(coach, world, Coach.LEAST_SECONDS)).toBeNull();
  });

  it("shows the clip by a rope within reach, and lets it go once both cowstails are on one (#233)", () => {
    const { coach } = fresh();
    const world = new World();
    world.view = standing(12);
    after(coach, world);

    expect(after(coach, world)).toBe("clip");
    // One cowstail on isn't clipped in: the tip stays for the other.
    world.view = standing(12, { second: "one" });
    expect(after(coach, world, Coach.LEAST_SECONDS)).toBe("clip");
    world.view = standing(12, { first: "one", second: "one" });
    expect(after(coach, world, Coach.LEAST_SECONDS)).not.toBe("clip");
    // Learnt: it doesn't come back at the next rope.
    world.view = standing(25);
    expect(after(coach, world, Coach.LEAST_SECONDS)).not.toBe("clip");
  });

  it("shows the changeover past an anchor, where a clip takes the next rope, until both cowstails are on it (#247)", () => {
    const { coach } = fresh();
    const world = new World();
    world.view = standing(20.5, { first: "one", second: "one", walking: "right" });

    expect(after(coach, world)).toBe("anchor");
    expect(coach.changeover).toMatchObject({ anchor: { x: 20, y: 0 }, from: "one", next: "two" });
    // It stays through each step, the key let go, one cowstail at a time.
    for (const [first, second] of [
      ["one", null],
      ["one", "two"],
      [null, "two"],
    ] as const) {
      world.view = standing(20.5, { first, second });
      expect(after(coach, world, Coach.LEAST_SECONDS)).toBe("anchor");
    }
    world.view = standing(20.5, { first: "two", second: "two" });
    expect(after(coach, world, Coach.LEAST_SECONDS)).not.toBe("anchor");
    expect(coach.changeover).toBeNull();
  });

  it("shows the changeover unasked only before the first is done, and after that wherever the rope holds the player at an anchor (#247)", () => {
    const { kept } = fresh();
    kept.set(Coach.KEY, JSON.stringify(["walk", "clip", "anchor"]));
    const learnt = new Coach({
      getItem: (key) => kept.get(key) ?? null,
      setItem: (key, value) => kept.set(key, value),
    });
    const world = new World();
    world.view = standing(20.5, { first: "one", second: "one" });
    const passing = after(learnt, world);
    world.view = standing(20.6, {
      first: "one",
      second: "one",
      walking: "right",
      heldBack: "rope",
    });

    expect(passing).toBeNull();
    expect(after(learnt, world)).toBe("anchor");
    // The key let go to change over, it stays.
    world.view = standing(20.6, { first: "one", second: null });
    expect(after(learnt, world, Coach.LEAST_SECONDS)).toBe("anchor");
  });

  it("at a rope's end with no next rope in reach, where it holds the player, has both cowstails off and the player walk on (#247)", () => {
    const { coach } = fresh();
    const world = new World();
    world.view = standing(30.7, { first: "two", second: "two", walking: "right" });
    const going = after(coach, world);
    world.view = standing(30.8, {
      first: "two",
      second: "two",
      walking: "right",
      heldBack: "rope",
    });
    const held = after(coach, world, Coach.LEAST_SECONDS);
    const change = coach.changeover;
    world.view = standing(30.8, { first: "two", second: null });
    const halfway = after(coach, world, Coach.LEAST_SECONDS);
    world.view = standing(30.8);

    expect(going).not.toBe("rope-end");
    expect(held).toBe("rope-end");
    expect(change).toMatchObject({ anchor: { x: 30, y: 0 }, from: "two", next: null });
    expect(halfway).toBe("rope-end");
    expect(after(coach, world, Coach.LEAST_SECONDS)).not.toBe("rope-end");
  });

  it("lets a changeover go once the player walks away from its anchor (#247)", () => {
    const { coach } = fresh();
    const world = new World();
    world.view = standing(20.5, { first: "one", second: "one" });
    after(coach, world);
    world.view = standing(16, { first: "one", second: "one", moving: true, walking: "left" });

    expect(after(coach, world, Coach.LEAST_SECONDS)).not.toBe("anchor");
    expect(coach.changeover).toBeNull();
  });

  it("shows the jumar whenever its grip holds a walking climber back, learnt or not, and not where a wall stops them (#247)", () => {
    const { coach } = fresh();
    const world = new World();
    const held = { first: "one", second: "one", walking: "right", heldBack: "jumar" } as const;
    world.view = standing(15, held);

    expect(after(coach, world)).toBe("jumar");
    world.view = standing(15.5, { first: "one", second: "one", jumarHeld: true, moving: true });
    expect(after(coach, world, Coach.LEAST_SECONDS)).not.toBe("jumar");
    world.view = standing(18, held);
    expect(after(coach, world, Coach.LEAST_SECONDS)).toBe("jumar");
    world.view = standing(18, { ...held, heldBack: null });
    expect(after(coach, world, Coach.LEAST_SECONDS)).not.toBe("jumar");
  });

  it("shows the ladder up a wall at its foot, and the crossing at a ladder over a crevasse", () => {
    const { coach } = fresh();
    const world = new World();
    world.view = standing(39.5);
    expect(after(coach, world)).toBe("ladder-up");
    world.view = standing(49.5);
    expect(after(coach, world, Coach.LEAST_SECONDS)).toBe("crossing");
  });

  it("warns of blue ice ahead, and of seracs overhead", () => {
    const { coach } = fresh();
    const world = new World();
    world.view = standing(67, { moving: true, walking: "right" });
    expect(after(coach, world)).toBe("ice");
    world.view = standing(92, { moving: true, walking: "right" });
    expect(after(coach, world, Coach.LEAST_SECONDS)).toBe("seracs");
  });

  it("keeps what's done on the device, and teaches it no more", () => {
    const { coach, kept } = fresh();
    const world = new World();
    world.view = standing(4, { moving: true, walking: "right" });
    after(coach, world);
    world.view = standing(12, { first: "one", second: "one" });
    after(coach, world, Coach.LEAST_SECONDS);
    const storage = {
      getItem: (key: string) => kept.get(key) ?? null,
      setItem: (key: string, value: string) => kept.set(key, value),
    };
    const again = new Coach(storage);
    world.view = standing(0);

    expect(again.tip(world, 0.1)).toBeNull();
    world.view = standing(12);
    expect(again.tip(world, 0.1)).toBeNull();
  });

  it("holds a tip a few seconds at least, so it can be read", () => {
    const { coach } = fresh();
    const world = new World();
    after(coach, world);
    world.view = standing(4, { moving: true, walking: "right" });

    expect(after(coach, world, Coach.LEAST_SECONDS / 2)).toBe("walk");
  });
});

describe("Coach: the warnings, whenever they matter", () => {
  it("tells a hanging climber how to climb back, before anything else", () => {
    const { coach } = fresh();
    const world = new World();
    world.view = standing(52, { falling: true, hanging: true, first: "one", second: "one" });

    expect(after(coach, world)).toBe("hanging");
  });

  it("tells a climber whose steps are careless on blue ice or a ladder to take care, and not on snow (#208)", () => {
    const { coach } = fresh();
    const world = new World();
    world.view = standing(4, { moving: true, walking: "right" });
    after(coach, world);
    world.view = standing(75, { moving: true, walking: "right", second: "one", slipChance: 0.05 });
    const onIce = after(coach, world, Coach.LEAST_SECONDS);
    world.view = standing(30, { moving: true, walking: "right", slipChance: 0.05 });
    const onSnow = after(coach, world, Coach.LEAST_SECONDS);
    world.view = standing(75, { moving: true, walking: "right", second: "one", slipChance: 0.01 });
    const careful = after(coach, world, Coach.LEAST_SECONDS);

    expect(onIce).toBe("careless");
    expect(onSnow).not.toBe("careless");
    expect(careful).not.toBe("careless");
  });

  it("warns an unclipped climber by a crevasse's ladder, a rope within reach", () => {
    const { coach } = fresh();
    const world = new World();
    world.ropes = ["one", "two", "crevasse-rope"];
    world.view = standing(49);
    world.ropeWithin = () => "crevasse-rope";

    expect(after(coach, world)).toBe("unclipped");
  });

  it("warns a climber who stops under the seracs, and not one who keeps moving", () => {
    const { coach } = fresh();
    const world = new World();
    world.view = standing(95, { moving: true, walking: "right" });
    after(coach, world);
    after(coach, world, Coach.LEAST_SECONDS);
    world.view = standing(95);

    expect(after(coach, world, Coach.STOPPED_SECONDS + 0.1)).toBe("stopped-under-seracs");
  });

  it("tells a climber whose crampon came loose to refit it, until they kneel to (#196)", () => {
    const { coach } = fresh();
    const world = new World();
    world.view = standing(4, { moving: true, walking: "right" });
    after(coach, world);
    world.view = standing(30, { cramponLoose: true });
    const loose = after(coach, world, Coach.LEAST_SECONDS);
    world.view = standing(30, { cramponLoose: true, refitting: true });

    expect(loose).toBe("crampon-loose");
    expect(after(coach, world, Coach.LEAST_SECONDS)).not.toBe("crampon-loose");
  });

  it("says the headlamp has died as the dark comes, for a while, not all the way to dawn (#196)", () => {
    const { coach } = fresh();
    const world = new World();
    world.view = standing(4, { moving: true, walking: "right" });
    after(coach, world);
    world.view = standing(30, { moving: true, walking: "right" });
    world.dark = true;
    const died = after(coach, world, Coach.LEAST_SECONDS);
    const later = after(coach, world, Coach.DARK_SECONDS);

    expect(died).toBe("lamp");
    expect(later).not.toBe("lamp");
  });

  it("says the serac is cracking at once, whatever else it was saying (#209)", () => {
    const { coach } = fresh();
    const world = new World();
    world.view = standing(12);
    after(coach, world);
    world.view = standing(86, { moving: true, walking: "right" });
    world.going = "serac";

    expect(after(coach, world)).toBe("serac-crack");
    world.going = null;
    expect(after(coach, world, Coach.LEAST_SECONDS)).not.toBe("serac-crack");
  });

  it("says the ladder under the player creaks, and to hold on (#209)", () => {
    const { coach } = fresh();
    const world = new World();
    world.view = standing(53, { ladder: "crevasse", moving: true, walking: "right" });
    world.conditions = { crevasse: "creaking" };

    expect(after(coach, world)).toBe("ladder-creak");
  });

  it("says a gust is coming, at once, and to stop and stay clipped (#197)", () => {
    const { coach } = fresh();
    const world = new World();
    world.view = standing(60, { moving: true, walking: "right" });
    after(coach, world);
    world.jolting = "gust";

    expect(after(coach, world)).toBe("gust");
    world.jolting = null;
    expect(after(coach, world, Coach.LEAST_SECONDS)).not.toBe("gust");
  });

  it("says the player's lashed ladder is twisting, and only to one on it (#197)", () => {
    const { coach } = fresh();
    const world = new World();
    world.view = standing(53, { ladder: "crevasse", moving: true, walking: "right" });
    world.jolting = "twist";
    const onIt = after(coach, world);
    world.view = standing(45, { moving: true, walking: "right" });
    const offIt = after(coach, world, Coach.LEAST_SECONDS);

    expect(onIt).toBe("ladder-twist");
    expect(offIt).not.toBe("ladder-twist");
  });

  it("tells the player someone is passing them on their rope, to stand still until they're by (#197)", () => {
    const { coach } = fresh();
    const world = new World();
    world.view = standing(15, { second: "one" });
    world.passer = true;

    expect(after(coach, world)).toBe("passing");
  });

  it("says a ladder bouncing under someone else's steps is no place to stand, and a front-point stand held too long (#197)", () => {
    const { coach } = fresh();
    const bounced = new World();
    bounced.view = standing(53, { ladder: "crevasse", stillChance: 0.2 });
    const onPoints = new World();
    onPoints.view = standing(45, { onIce: true, stillChance: 0.02 });
    const brief = after(coach, onPoints, Coach.STANCE_SECONDS / 2);
    const held = after(coach, onPoints, Coach.STANCE_SECONDS);

    expect(after(fresh().coach, bounced)).toBe("ladder-bounced");
    expect(brief).not.toBe("front-points");
    expect(held).toBe("front-points");
  });

  it("says a broken ladder is being lashed back to one waiting at its end (#209)", () => {
    const { coach } = fresh();
    const world = new World();
    world.view = standing(4, { moving: true, walking: "right" });
    after(coach, world);
    world.view = standing(50.5);
    world.conditions = { crevasse: "broken" };

    expect(after(coach, world, Coach.LEAST_SECONDS)).toBe("ladder-broken");
    world.conditions = {};
    expect(after(coach, world, Coach.LEAST_SECONDS)).not.toBe("ladder-broken");
  });

  it("tells the player a partner hangs on the rope, to pull them out, until they are hauling (#209)", () => {
    const { coach } = fresh();
    const world = new World();
    world.view = standing(4, { moving: true, walking: "right" });
    after(coach, world);
    world.partner = true;
    world.view = standing(49);

    expect(after(coach, world)).toBe("haul");
    world.view = standing(49, { hauling: true, haulHeld: true });
    expect(after(coach, world, Coach.LEAST_SECONDS)).not.toBe("haul");
  });

  it("says nothing to the dead", () => {
    const { coach } = fresh();
    const world = new World();
    world.view = standing(52, { dead: true, falling: true });

    expect(after(coach, world)).toBeNull();
  });
});

describe("Coach: the ice tools and the ways out of a crevasse", () => {
  /** A coach that has learnt the walk, past the route's first rope. */
  const walked = (): { coach: Coach; world: World } => {
    const { coach } = fresh();
    const world = new World();
    world.view = standing(4, { moving: true, walking: "right" });
    after(coach, world);
    return { coach, world };
  };

  it("teaches the first pick at a wall of ice with no ladder, the next ones on it, and lets both go once it's climbed", () => {
    const { coach, world } = walked();
    world.view = standing(60);
    world.wall = "foot";
    const atTheFoot = after(coach, world, Coach.LEAST_SECONDS);
    world.wall = null;
    world.view = standing(60, { onIce: true, picks: [{ x: 60, y: 2 }] });
    const onIt = after(coach, world, Coach.LEAST_SECONDS);
    world.view = standing(60);
    after(coach, world, Coach.LEAST_SECONDS);
    world.wall = "foot";
    const atTheNext = after(coach, world, Coach.LEAST_SECONDS);
    world.wall = null;
    world.view = standing(60, { onIce: true });

    expect(atTheFoot).toBe("ice-wall");
    expect(onIt).toBe("on-ice");
    expect(atTheNext).not.toBe("ice-wall");
    expect(after(coach, world, Coach.LEAST_SECONDS)).not.toBe("on-ice");
  });

  it("teaches the step down onto the ice at a lip with no ladder", () => {
    const { coach, world } = walked();
    world.view = standing(60);
    world.wall = "lip";

    expect(after(coach, world, Coach.LEAST_SECONDS)).toBe("ice-down");
  });

  it("still teaches the step down at a lip after a wall climbed up, and lets it go once they've stepped down", () => {
    const { coach, world } = walked();
    world.view = standing(60);
    world.wall = "foot";
    after(coach, world, Coach.LEAST_SECONDS);
    world.wall = null;
    world.view = standing(60, { onIce: true });
    after(coach, world, Coach.LEAST_SECONDS);
    world.view = standing(64);
    after(coach, world, Coach.LEAST_SECONDS);
    world.wall = "lip";
    const atALip = after(coach, world, Coach.LEAST_SECONDS);
    world.wall = null;
    world.view = standing(64, { onIce: true });
    after(coach, world, Coach.LEAST_SECONDS);
    world.view = standing(64);
    after(coach, world, Coach.LEAST_SECONDS);
    world.wall = "lip";

    expect(atALip).toBe("ice-down");
    expect(after(coach, world, Coach.LEAST_SECONDS)).not.toBe("ice-down");
  });

  it("teaches the rope down a step of ice where the fixed rope runs down it, and lets it go once they've lowered themselves", () => {
    const { coach, world } = walked();
    world.view = standing(60);
    world.wall = "rope";
    const atTheLip = after(coach, world, Coach.LEAST_SECONDS);
    world.wall = null;
    world.view = standing(60, { lowering: true });
    after(coach, world, Coach.LEAST_SECONDS);
    world.view = standing(64);
    after(coach, world, Coach.LEAST_SECONDS);
    world.wall = "rope";

    expect(atTheLip).toBe("rappel");
    expect(after(coach, world, Coach.LEAST_SECONDS)).not.toBe("rappel");
  });

  it("warns of a pick that bites poorly, every time", () => {
    const { coach, world } = walked();
    world.view = standing(60, { onIce: true, pickPoor: true });
    const first = after(coach, world);
    world.view = standing(60, { onIce: true });
    after(coach, world, Coach.LEAST_SECONDS);
    world.view = standing(60, { onIce: true, pickPoor: true });

    expect(first).toBe("pick-poor");
    expect(after(coach, world)).toBe("pick-poor");
  });

  it("tells one who hangs what gets them out: the jumar on the rope, the jumar to clip on, or the tools", () => {
    const { coach, world } = walked();
    const hanging = { falling: true, hanging: true, second: "one" };
    world.view = standing(52, { ...hanging, first: "one" });
    const onTheJumar = after(coach, world);
    world.view = standing(52, hanging);
    const onACarabiner = after(coach, world);
    world.view = standing(52, { ...hanging, gear: { jumar: false, tools: 1 } });

    expect(onTheJumar).toBe("hanging");
    expect(onACarabiner).toBe("hanging-carabiner");
    expect(after(coach, world)).toBe("hanging-no-jumar");
  });

  it("tells one alive down a crevasse, off the rope, to climb out on their tools", () => {
    const { coach, world } = walked();
    world.view = standing(52);
    world.deadEnd = true;

    expect(after(coach, world)).toBe("crevasse-floor");
  });
});
