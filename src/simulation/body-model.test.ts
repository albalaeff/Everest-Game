import { describe, expect, it } from "vitest";
import {
  createBodyState,
  updateBodyState,
  type BodyInputs,
} from "./body-model";

const baseInputs: BodyInputs = {
  altitudeM: 5364,
  oxygenFlowLMin: 0,
  pace: "normal",
  loadKg: 10,
  sleepHours: 0,
  food: 0,
  water: 0,
  deltaMinutes: 1,
};

describe("body model v1", () => {
  it("lowers SpO2 as altitude rises", () => {
    const baseCamp = updateBodyState(createBodyState(), {
      ...baseInputs,
      altitudeM: 5364,
    });
    const summit = updateBodyState(createBodyState(), {
      ...baseInputs,
      altitudeM: 8849,
    });

    expect(summit.spo2).toBeLessThan(baseCamp.spo2);
  });

  it("raises SpO2 when oxygen flow is used", () => {
    const withoutOxygen = updateBodyState(createBodyState(), baseInputs);
    const withOxygen = updateBodyState(createBodyState(), {
      ...baseInputs,
      oxygenFlowLMin: 2,
    });

    expect(withOxygen.spo2).toBeGreaterThan(withoutOxygen.spo2);
  });

  it("makes a fast pace more tiring than a normal pace", () => {
    const normal = updateBodyState(createBodyState(), {
      ...baseInputs,
      pace: "normal",
      deltaMinutes: 60,
    });
    const fast = updateBodyState(createBodyState(), {
      ...baseInputs,
      pace: "fast",
      deltaMinutes: 60,
    });

    expect(fast.fatigue).toBeGreaterThan(normal.fatigue);
  });

  it("lets the rest step recover fatigue", () => {
    const tired = { ...createBodyState(), fatigue: 50 };
    const resting = updateBodyState(tired, {
      ...baseInputs,
      pace: "rest",
      deltaMinutes: 60,
    });

    expect(resting.fatigue).toBeLessThan(tired.fatigue);
  });

  it("makes a heavier load more tiring", () => {
    const light = updateBodyState(createBodyState(), {
      ...baseInputs,
      loadKg: 5,
    });
    const heavy = updateBodyState(createBodyState(), {
      ...baseInputs,
      loadKg: 25,
    });

    expect(heavy.fatigue).toBeGreaterThan(light.fatigue);
  });

  it("reduces sleep debt after sleep", () => {
    const tired = { ...createBodyState(), sleepDebt: 10 };
    const rested = updateBodyState(tired, {
      ...baseInputs,
      sleepHours: 4,
      pace: "rest",
      deltaMinutes: 0,
    });

    expect(rested.sleepDebt).toBe(6);
  });

  it("restores hydration and nutrition from water and food", () => {
    const depleted = {
      ...createBodyState(),
      hydration: 50,
      nutrition: 50,
    };
    const restored = updateBodyState(depleted, {
      ...baseInputs,
      food: 2,
      water: 2,
      pace: "rest",
      deltaMinutes: 0,
    });

    expect(rested.hydration).toBe(70);
    expect(rested.nutrition).toBe(70);
  });

  it("keeps all body values within their bounds", () => {
    const updated = updateBodyState(createBodyState(), {
      ...baseInputs,
      altitudeM: 10000,
      oxygenFlowLMin: 100,
      pace: "fast",
      loadKg: 100,
      deltaMinutes: 100000,
    });

    expect(updated.spo2).toBeGreaterThanOrEqual(0);
    expect(updated.spo2).toBeLessThanOrEqual(100);
    expect(updated.fatigue).toBeGreaterThanOrEqual(0);
    expect(updated.fatigue).toBeLessThanOrEqual(100);
  });

  it("does not mutate the input state", () => {
    const state = createBodyState();
    const snapshot = { ...state };

    updateBodyState(state, baseInputs);

    expect(state).toEqual(snapshot);
  });
});
