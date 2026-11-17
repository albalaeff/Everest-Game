import { describe, expect, it } from "vitest";

import { KnowledgeBase } from "./knowledge-base";
import { KNOWLEDGE_FILES } from "./knowledge-files";
import { TentFacts } from "./tent-facts";

const knowledge = new KnowledgeBase(KNOWLEDGE_FILES);
const { numbers, sizes } = new TentFacts(knowledge);
const range = (id: string) => knowledge.range(id);
const fact = (id: string): number => knowledge.number(id);

/** The tents' coefficients, held to the facts they were fitted to (#258). */
describe("TentFacts: the stove, from the knowledge base", () => {
  it("melts a litre of snow on the gas a canister's laboratory litres give it, three to four times over", () => {
    const boiled = range("gear.stove-water-boiled");
    const harder = range("gear.snow-melt-fuel");
    const canister = fact("gear.gas-canister") * 1000;

    expect(numbers.melt.gas).toBeGreaterThanOrEqual((canister / boiled.max) * harder.min);
    expect(numbers.melt.gas).toBeLessThanOrEqual((canister / boiled.min) * harder.max);
    expect(numbers.melt.litres).toBe(1);
  });

  it("takes three to four times a laboratory boil to melt it, and a canister's litres within the time it burns", () => {
    const boil = range("gear.stove-boil-time");
    const harder = range("gear.snow-melt-fuel");
    const minutes = numbers.melt.seconds / 60;
    const litres = (fact("gear.gas-canister") * 1000) / numbers.melt.gas;

    expect(minutes).toBeGreaterThanOrEqual(boil.min * harder.min);
    expect(minutes).toBeLessThanOrEqual(boil.max * harder.max);
    expect(litres * minutes).toBeLessThanOrEqual(fact("gear.stove-burn-time"));
    expect(litres * minutes).toBeGreaterThan(0.75 * fact("gear.stove-burn-time"));
  });

  it("cooks a meal with the pouch's water and energy, in its wait and the time to boil its water, on less gas than melting it", () => {
    const { meal, melt } = numbers;

    expect(meal.water).toBe(fact("gear.meal-water"));
    expect(meal.kcal).toBe(fact("gear.meal-energy"));
    expect(meal.seconds / 60).toBeGreaterThan(fact("gear.meal-wait"));
    expect(meal.seconds / 60).toBeLessThanOrEqual(
      fact("gear.meal-wait") + range("gear.stove-boil-time").max * range("gear.snow-melt-fuel").max,
    );
    expect(meal.gas).toBeLessThan(melt.gas * meal.water);
    expect(meal.gas).toBeGreaterThan(
      ((fact("gear.gas-canister") * 1000) / range("gear.stove-water-boiled").max) * meal.water,
    );
  });
});

describe("TentFacts: sleep and the tents' sizes", () => {
  it("rings the alarm a breakfast before the hour climbers leave Base Camp, and naps an hour", () => {
    expect(numbers.wake).toBe((fact("time.base-camp-departure") - fact("time.breakfast")) * 3600);
    expect(numbers.wake).toBe(2 * 3600);
    expect(numbers.nap).toBe(3600);
  });

  it("clears the eighteen hours awake that go with six hours' sleep", () => {
    const slept = fact("body.acute-sleep-loss");

    expect(fact("body.sleep-restores") * slept).toBeCloseTo(fact("body.sleepy-after"), 9);
  });

  it("draws an expedition dome at its floor's length and its peak, lower than a climber, with a vestibule that covers its ground", () => {
    expect(sizes.length).toBe(fact("gear.tent-length"));
    expect(sizes.height).toBe(fact("gear.tent-height"));
    expect(sizes.height).toBeLessThan(1.77);
    expect((sizes.vestibule * fact("gear.tent-width")) / 2).toBeCloseTo(
      fact("gear.tent-vestibule"),
      9,
    );
    expect(sizes.tail).toBeCloseTo(sizes.vestibule / 2, 9);
    expect(sizes.dome).toEqual({
      width: fact("gear.dome-tent-width"),
      height: fact("gear.dome-tent-height"),
    });
    expect(sizes.dome.height).toBeGreaterThan(1.77);
  });
});
