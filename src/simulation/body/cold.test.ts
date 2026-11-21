import { describe, expect, it } from "vitest";

import { TestCold } from "../testing/test-cold";

const TEST_COLD = new TestCold();
import { Cold } from "./cold";
import type { Exposure } from "./cold";

const NUMBERS = TEST_COLD.numbers;
const CHILL = TEST_COLD.chill;
const STORM = TEST_COLD.storm;
/** A gale at −30 °C: a wind chill of about −53 °C, a severe risk, freezing in 2 to 5 minutes. */
const GALE: Exposure = { air: -30, wind: 60, sheltered: false };
/** How fast a climber at rest in the storm cools, in °C an hour. */
const COOLING = TEST_COLD.cooling();
const STILL_NIGHT: Exposure = { air: -10, wind: 4, sheltered: false };
const TENT: Exposure = { ...STORM, sheltered: true };

/** `cold` lives `hours` in `exposure`, an hour at a time, moving or not. */
function live(cold: Cold, hours: number, exposure: Exposure, moving = false): Cold {
  for (let hour = 0; hour < hours; hour += 1) {
    cold.live(1, exposure, moving, NUMBERS, CHILL);
  }
  return cold;
}

const symptoms = (cold: Cold, exposure: Exposure, moving = false) =>
  cold.symptoms(NUMBERS, cold.losing(exposure, moving, NUMBERS, CHILL));

describe("the body in the cold (#272)", () => {
  it("keeps its heat on a still night, and on the move in a storm", () => {
    expect(live(Cold.warm(NUMBERS), 8, STILL_NIGHT).temperature).toBe(37);
    expect(live(Cold.warm(NUMBERS), 8, STORM, true).temperature).toBe(37);
    expect(symptoms(Cold.warm(NUMBERS), STILL_NIGHT)).toEqual([]);
  });

  it("loses it at rest in a storm, in proportion to how much colder than it holds", () => {
    const chill = CHILL.of(STORM.air, STORM.wind).chill;
    const cold = live(Cold.warm(NUMBERS), 1, STORM);
    expect(cold.temperature).toBeCloseTo(37 - 0.02 * (-20 - chill), 9);
    // An hour of it nips the face, too, behind its hood, goggles and buff.
    expect(symptoms(cold, STORM)).toEqual(["cold", "frostnip"]);
  });

  it("goes through hypothermia's stages to death, resting in the storm", () => {
    const cold = Cold.warm(NUMBERS);
    const felt = (hours: number) => {
      live(cold, hours, STORM);
      return symptoms(cold, STORM).filter((each) =>
        ["cold", "shivering", "confused", "unconscious"].includes(each),
      );
    };
    const hoursTo = (temperature: number) => (37 - temperature) / COOLING;
    expect(felt(Math.ceil(hoursTo(35)))).toEqual(["shivering"]);
    expect(cold.stride(NUMBERS)).toBe(0.8);
    expect(cold.footing(NUMBERS)).toBe(0.6);
    expect(felt(Math.ceil(hoursTo(32)) - Math.ceil(hoursTo(35)))).toEqual(["confused"]);
    expect(cold.stopped(NUMBERS)).toBe(true);
    expect(cold.stride(NUMBERS)).toBe(0);
    expect(felt(Math.ceil(hoursTo(28)) - Math.ceil(hoursTo(32)))).toEqual(["unconscious"]);
    expect(cold.dead(NUMBERS)).toBe(false);
    live(cold, Math.ceil(hoursTo(24)) - Math.ceil(hoursTo(28)), STORM);
    expect(cold.dead(NUMBERS)).toBe(true);
    const dead = cold.temperature;
    live(cold, 5, TENT);
    expect(cold.temperature).toBe(dead);
  });

  it("shivers itself warm out of the cold while it can, and needs a tent's heat past that", () => {
    const shivering = live(Cold.warm(NUMBERS), Math.ceil(3.5 / COOLING), STORM);
    expect(shivering.temperature).toBeLessThan(35);
    expect(shivering.temperature).toBeGreaterThan(32);
    live(shivering, 1, STILL_NIGHT);
    expect(shivering.temperature).toBeGreaterThan(35);
    const confused = live(Cold.warm(NUMBERS), Math.ceil(6 / COOLING), STORM);
    expect(confused.temperature).toBeLessThan(32);
    const before = confused.temperature;
    live(confused, 2, STILL_NIGHT);
    expect(confused.temperature).toBe(before);
    live(confused, 2, TENT);
    expect(confused.temperature).toBeCloseTo(before + 3, 9);
  });

  it("freezes the face before the fingers, numb, then frostnip, which thaws", () => {
    // Bare skin freezes in 20 minutes, on the band's middle; the face three times slower.
    const cold = Cold.warm(NUMBERS);
    cold.live(0.6, STORM, true, NUMBERS, CHILL);
    expect(symptoms(cold, STORM, true)).toEqual(["numb-face"]);
    cold.live(0.5, STORM, true, NUMBERS, CHILL);
    expect(symptoms(cold, STORM, true)).toEqual(["frostnip"]);
    cold.live(1, TENT, false, NUMBERS, CHILL);
    expect(symptoms(cold, TENT)).toEqual([]);
    expect(cold.frostbitten).toEqual([]);
  });

  it("frostbites what stays out longer, and frostbite stays", () => {
    const cold = Cold.warm(NUMBERS);
    live(cold, 6, STORM, true);
    expect(cold.frostbitten).toEqual(["face"]);
    live(cold, 5, GALE, true);
    expect(cold.frostbitten).toEqual(["face", "fingers"]);
    live(cold, 10, TENT);
    expect(cold.frostbitten).toEqual(["face", "fingers"]);
    expect(symptoms(cold, TENT)).toEqual(["frostbite"]);
  });

  it("freezes no skin in air above freezing, nor in a moderate wind chill", () => {
    const thaw: Exposure = { air: 1, wind: 80, sheltered: false };
    expect(live(Cold.warm(NUMBERS), 8, thaw, true).save().frost).toEqual({ face: 0, fingers: 0 });
    expect(live(Cold.warm(NUMBERS), 8, STILL_NIGHT).save().frost).toEqual({ face: 0, fingers: 0 });
  });

  it("goes on exactly from its save", () => {
    const cold = live(Cold.warm(NUMBERS), 3, STORM);
    const again = Cold.load(cold.save());
    live(cold, 2, STORM);
    live(again, 2, STORM);
    expect(again.save()).toEqual(cold.save());
  });
});
