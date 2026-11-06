import { describe, expect, it } from "vitest";

import { Questionnaire } from "../content/questionnaire";
import { KeptClimber } from "./kept-climber";

const questionnaire = new Questionnaire();
const { typical } = questionnaire;

/** A device's storage, in memory. */
function memory(): Storage {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
  } as Storage;
}

describe("KeptClimber: the player's answers, kept on the device for the next new climb", () => {
  it("has none on a device that never answered", () => {
    expect(new KeptClimber(memory(), questionnaire).answers).toBeNull();
  });

  it("gives back the answers kept, on the next visit too", () => {
    const storage = memory();
    const answers = { ...typical, age: 52, weight: 88, conditions: ["asthma"] };

    new KeptClimber(storage, questionnaire).keep(answers);

    expect(new KeptClimber(storage, questionnaire).answers).toEqual(answers);
  });

  it("forgets answers the questions no longer take, or that aren't answers at all", () => {
    const storage = memory();
    const kept = new KeptClimber(storage, questionnaire);

    storage.setItem(KeptClimber.KEY, JSON.stringify({ ...typical, training: "marathons" }));
    expect(kept.answers).toBeNull();
    storage.setItem(KeptClimber.KEY, "{not json");
    expect(kept.answers).toBeNull();
  });

  it("asks afresh on a browser that keeps nothing", () => {
    const refusing = {
      getItem: () => {
        throw new Error("The storage is off");
      },
      setItem: () => {
        throw new Error("The storage is off");
      },
    } as unknown as Storage;

    expect(() => {
      new KeptClimber(refusing, questionnaire).keep(typical);
    }).not.toThrow();
    expect(new KeptClimber(refusing, questionnaire).answers).toBeNull();
    expect(new KeptClimber(null, questionnaire).answers).toBeNull();
  });
});
