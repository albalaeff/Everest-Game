import { describe, expect, it } from "vitest";

import { PaceEffort } from "./pace-effort";

describe("PaceEffort", () => {
  const paces = {
    "rest-step": { speed: 0.5, effort: 0.5 },
    steady: { speed: 1, effort: 1 },
    faster: { speed: 2, effort: 4 },
  };
  const effort = new PaceEffort(paces);

  it("tires a climber at each pace's effort when their steps take all of its power", () => {
    expect(effort.at(paces["rest-step"], 1)).toBe(0.5);
    expect(effort.at(paces.steady, 1)).toBe(1);
    expect(effort.at(paces.faster, 1)).toBe(4);
  });

  it("tires them as the pace whose speed their steps' share of the power makes, and not at all on none", () => {
    expect(effort.at(paces.faster, 0.5)).toBe(1);
    expect(effort.at(paces.faster, 0.75)).toBe(2.5);
    expect(effort.at(paces.steady, 0.25)).toBe(0.25);
    expect(effort.at(paces.steady, 0)).toBe(0);
  });

  it("refuses a pace with no speed or no effort", () => {
    expect(() => new PaceEffort({ ...paces, "rest-step": { speed: 0, effort: 0.5 } })).toThrow(
      RangeError,
    );
    expect(() => new PaceEffort({ ...paces, "rest-step": { speed: 0.5, effort: 0 } })).toThrow(
      RangeError,
    );
  });
});
