import { describe, expect, it } from "vitest";

import type { ClimberView } from "../physics";
import { Changeover } from "./changeover";
import type { ChangeoverStep } from "./changeover";

/** A climber at the anchor at x = 20 on flat ground, past it, clipped as `over` says. */
const at = (over: Partial<ClimberView> = {}): ClimberView => ({
  x: 20.6,
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
  sheltered: false,
  ...over,
});

/** Each step's state for a climber clipped as `view` is. */
const states = (change: Changeover, view: ClimberView): Record<ChangeoverStep, string> =>
  Object.fromEntries(change.steps.map((step) => [step, change.state(step, view)])) as Record<
    ChangeoverStep,
    string
  >;

describe("Changeover: onto the next rope at an anchor (#247)", () => {
  const change = new Changeover({ x: 20, y: 0 }, "lower", "upper");

  it("moves the carabiner over first, then the jumar, a step at a time, never both off", () => {
    expect(change.steps).toEqual(["carabiner-off", "carabiner-on", "jumar-off", "jumar-on"]);

    expect(states(change, at({ first: "lower", second: "lower" }))).toEqual({
      "carabiner-off": "now",
      "carabiner-on": "later",
      "jumar-off": "later",
      "jumar-on": "later",
    });
    expect(states(change, at({ first: "lower", second: null }))).toEqual({
      "carabiner-off": "done",
      "carabiner-on": "now",
      "jumar-off": "later",
      "jumar-on": "later",
    });
    expect(states(change, at({ first: "lower", second: "upper" }))).toEqual({
      "carabiner-off": "done",
      "carabiner-on": "done",
      "jumar-off": "now",
      "jumar-on": "later",
    });
    expect(change.now(at({ first: null, second: "upper" }))).toBe("jumar-on");
  });

  it("is over once both cowstails are on the next rope, and not before", () => {
    expect(change.over(at({ first: "lower", second: "upper" }))).toBe(false);
    expect(change.over(at({ first: "upper", second: "upper" }))).toBe(true);
    expect(change.now(at({ first: "upper", second: "upper" }))).toBeNull();
  });

  it("puts a cowstail that came off first back on before anything else, the carabiner before the jumar", () => {
    // The jumar taken off first: it goes back on, onto the next rope, before the carabiner moves.
    expect(change.now(at({ first: null, second: "lower" }))).toBe("jumar-on");
    expect(change.now(at({ first: null, second: null }))).toBe("carabiner-on");
  });

  it("says which carabiner is going on while the hands are at it (#197)", () => {
    const clipping = at({ first: "lower", second: null, clipping: "second" });

    expect(change.state("carabiner-on", clipping)).toBe("going");
    expect(change.state("jumar-on", at({ first: null, second: "upper", clipping: "first" }))).toBe(
      "going",
    );
  });

  it("says how far the player is from its anchor", () => {
    expect(change.away(at())).toBeCloseTo(0.6, 9);
  });
});

describe("Changeover: off a rope that ends with no next one in reach (#247)", () => {
  const change = new Changeover({ x: 30, y: 0 }, "last", null);

  it("takes both cowstails off it, the carabiner first, and is over once neither is on it", () => {
    expect(change.steps).toEqual(["carabiner-off", "jumar-off"]);
    expect(states(change, at({ first: "last", second: "last" }))).toEqual({
      "carabiner-off": "now",
      "jumar-off": "later",
    });
    expect(states(change, at({ first: "last", second: null }))).toEqual({
      "carabiner-off": "done",
      "jumar-off": "now",
    });
    expect(change.over(at({ first: null, second: null }))).toBe(true);
    expect(change.going(at({ clipping: "second" }))).toBeNull();
  });
});
