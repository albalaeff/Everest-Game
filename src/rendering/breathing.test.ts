import { describe, expect, it } from "vitest";

import { Breathing } from "./breathing";

describe("Breathing", () => {
  it("breathes slowest at rest at the base, and faster higher up, on the move, and tired", () => {
    const rest = Breathing.period(5000, "fresh", false);

    expect(rest).toBe(Breathing.REST_SECONDS);
    expect(Breathing.period(8000, "fresh", false)).toBeLessThan(rest);
    expect(Breathing.period(5000, "fresh", true)).toBeLessThan(rest);
    expect(Breathing.period(5000, "tired", false)).toBeLessThan(rest);
    expect(Breathing.period(5000, "exhausted", false)).toBeLessThan(
      Breathing.period(5000, "tired", false),
    );
    expect(Breathing.period(4000, "fresh", false)).toBe(rest);
  });

  it("never breathes faster than a gasp", () => {
    expect(Breathing.period(8848, "exhausted", true)).toBe(Breathing.FASTEST_SECONDS);
  });

  it("goes round a breath in its period, chest up in the middle, and breathes out after it", () => {
    const breathing = new Breathing();

    expect(breathing.chest).toBeCloseTo(0, 9);
    expect(breathing.exhaling).toBe(false);
    breathing.advance(2, 4);
    expect(breathing.where).toBeCloseTo(0.5, 9);
    expect(breathing.chest).toBeCloseTo(1, 9);
    expect(breathing.exhaling).toBe(true);
    breathing.advance(1.5, 4);
    expect(breathing.exhaling).toBe(false);
    breathing.advance(0.5, 4);
    expect(breathing.where).toBeCloseTo(0, 9);
  });

  it("wraps however long a frame is, and ignores a frame that runs back", () => {
    const breathing = new Breathing();

    breathing.advance(10.5, 4);
    expect(breathing.where).toBeCloseTo(0.625, 9);
    breathing.advance(-1, 4);
    expect(breathing.where).toBeCloseTo(0.625, 9);
  });
});
