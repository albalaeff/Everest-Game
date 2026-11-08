import { describe, expect, it } from "vitest";

import type { ClimberView, Point } from "../physics";
import type { HazardZone } from "../simulation";
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
  footing: 1,
  hanging: false,
  ...over,
});

/** A route along a flat: a rope from 10 to 20 m and the next from 20 to 30, a ladder up a wall at
 * 40 m, one across a crevasse from 50 to 56, blue ice from 70 to 80, and seracs from 90 to 100. */
class World implements CoachWorld {
  view: ClimberView = standing(0);
  ice = [{ from: 70, to: 80 }];
  zones: readonly HazardZone[] = [{ id: "seracs", kind: "serac", from: 90, to: 100 }];
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

  along(): number {
    return this.view.x;
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

  it("shows the clip by a rope within reach, and lets it go once a cowstail is on it", () => {
    const { coach } = fresh();
    const world = new World();
    world.view = standing(12);
    after(coach, world);

    expect(after(coach, world)).toBe("clip");
    world.view = standing(12, { second: "one" });
    expect(after(coach, world, Coach.LEAST_SECONDS)).not.toBe("clip");
  });

  it("shows the changeover at an anchor where the next rope begins, until the next rope has them", () => {
    const { coach } = fresh();
    const world = new World();
    world.view = standing(19.5, { first: "one", second: "one" });

    expect(after(coach, world)).toBe("anchor");
    world.view = standing(21, { first: "two", second: "two" });
    expect(after(coach, world, Coach.LEAST_SECONDS)).not.toBe("anchor");
  });

  it("shows the jumar while it grips and holds a walking climber back", () => {
    const { coach } = fresh();
    const world = new World();
    world.view = standing(15, { first: "one", walking: "right", moving: false });

    expect(after(coach, world)).toBe("jumar");
    world.view = standing(15, { first: "one", jumarHeld: true, moving: true });
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
    world.view = standing(12, { second: "one" });
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
    world.view = standing(52, { falling: true, hanging: true, second: "one", footing: 0 });

    expect(after(coach, world)).toBe("hanging");
  });

  it("tells a climber losing their footing to steady themselves", () => {
    const { coach } = fresh();
    const world = new World();
    world.view = standing(4, { moving: true, walking: "right" });
    after(coach, world);
    world.view = standing(30, { moving: true, walking: "right", footing: 0.3 });

    expect(after(coach, world, Coach.LEAST_SECONDS)).toBe("footing");
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

  it("says nothing to the dead", () => {
    const { coach } = fresh();
    const world = new World();
    world.view = standing(52, { dead: true, falling: true });

    expect(after(coach, world)).toBeNull();
  });
});
