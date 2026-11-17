import { describe, expect, it } from "vitest";
import tentTexts from "../../../content/tent.json";
import { KNOWLEDGE_FILES } from "../../content/knowledge-files";
import { KnowledgeBase } from "../../content/knowledge-base";
import { TentFacts } from "../../content/tent-facts";
import { Texts } from "../../interface/texts";
import type { BodyView, Chore, Lack, TentView } from "../../simulation";
import { TentReadout } from "./tent-readout";
import type { TentState } from "./tent-readout";

const facts = new TentFacts(new KnowledgeBase(KNOWLEDGE_FILES));
const CAMPS: Readonly<Record<string, string>> = { "base-camp": "Base Camp", "camp-1": "Camp 1" };
const readout = new TentReadout(
  new Texts(tentTexts.en),
  facts.numbers,
  facts.canister,
  (id) => CAMPS[id] ?? id,
);

const NOTHING: Readonly<Record<Chore, Lack | null>> = {
  melt: null,
  cook: null,
  nap: null,
  sleep: null,
  guitar: null,
};
const TENT: TentView = {
  camp: "camp-1",
  tent: 0,
  chore: null,
  progress: 0,
  gas: 454,
  meals: 6,
  guitar: false,
  lacks: { ...NOTHING, guitar: "guitar" },
  slept: null,
};
const FRESH: BodyView = { tiredness: "fresh", symptoms: [], oximeter: 80, pace: "steady" };
const STATE: TentState = {
  tent: TENT,
  body: FRESH,
  timeOfDay: 14 * 3600,
  altitude: 6065,
  water: 1.5,
  bottles: 3,
  bars: 2,
  oxygen: 0,
};

function row(state: TentState, chore: Chore) {
  const found = readout.of(state).chores.find((each) => each.chore === chore);
  if (found === undefined) {
    throw new RangeError(`No row for ${chore}`);
  }
  return found;
}

describe("TentReadout: the tent's panel in words (#258)", () => {
  it("says where the tent is, the time, and how the climber feels, in the self-check's words", () => {
    const panel = readout.of({
      ...STATE,
      body: { ...FRESH, tiredness: "tired", symptoms: ["thirsty", "sleepy"] },
    });

    expect(panel.where).toBe("Camp 1 · 6,065 m");
    expect(panel.clock).toBe("14:00");
    expect(panel.feel).toBe("You feel tired, thirsty, sleepy.");
    expect(readout.of(STATE).feel).toBe("You feel fresh.");
    expect(readout.of({ ...STATE, body: { ...FRESH, symptoms: ["hungry"] } }).feel).toBe(
      "You feel hungry.",
    );
  });

  it("counts the water against the bottles, the gas in grams, the meals, the bars and the oxygen", () => {
    const { stock } = readout.of(STATE);

    expect(stock.water).toEqual({ text: "1.5 of 3 L", share: 0.5 });
    expect(stock.gas.text).toBe("454 g");
    expect(stock.meals.text).toBe("6");
    expect(stock.bars.text).toBe("2");
    expect(stock.oxygen.text).toBe("0");
  });

  it("says plenty for what Base Camp's kitchen never runs out of", () => {
    const { stock } = readout.of({
      ...STATE,
      tent: { ...TENT, camp: "base-camp", gas: null, meals: null, guitar: true, lacks: NOTHING },
    });

    expect(stock.gas).toEqual({ text: "plenty", share: 1 });
    expect(stock.meals.text).toBe("plenty");
  });

  it("gives each chore what it takes and gives, by the knowledge base's numbers", () => {
    expect(row(STATE, "melt").note).toBe("12 min, 38 g of gas: 1 L of water");
    expect(row(STATE, "cook").note).toBe("15 min, 10 g of gas, 0.4 L of water: 600 kcal");
    expect(row(STATE, "nap").note).toBe("1 h of sleep");
    expect(row(STATE, "sleep").note).toBe("Until the alarm at 02:00");
    expect(row(STATE, "melt")).toMatchObject({ able: true, doing: false, progress: 0 });
  });

  it("says what a chore lacks, and that it can't begin", () => {
    const lacking: TentState = {
      ...STATE,
      tent: {
        ...TENT,
        lacks: { melt: "room", cook: "water", nap: null, sleep: null, guitar: "guitar" },
      },
    };

    expect(row(lacking, "melt")).toMatchObject({ note: "Your bottles are full", able: false });
    expect(row(lacking, "cook").note).toBe("Takes 0.4 L of water: melt snow first");
    expect(row(lacking, "guitar").note).toBe("The guitar stays at Base Camp");
    expect(
      row({ ...STATE, tent: { ...TENT, lacks: { ...NOTHING, cook: "gas" } } }, "cook").note,
    ).toBe("The gas has run out");
  });

  it("says how long the chore in hand has left, and that its button stops it", () => {
    const melting = { ...STATE, tent: { ...TENT, chore: "melt" as const, progress: 0.25 } };
    const asleep = {
      ...STATE,
      timeOfDay: 21.5 * 3600,
      tent: { ...TENT, chore: "sleep" as const, progress: 0.1 },
    };
    const playing = { ...STATE, tent: { ...TENT, chore: "guitar" as const, lacks: NOTHING } };

    expect(row(melting, "melt")).toMatchObject({
      note: "9 min left. Stop",
      doing: true,
      progress: 0.25,
    });
    expect(row(asleep, "sleep").note).toBe("4 h 30 min left. Wake up");
    expect(row(playing, "guitar").note).toBe("Playing. Stop");
  });

  it("gives the stove's advice, how long the last sleep was, or that they're asleep", () => {
    const rested = { ...STATE, tent: { ...TENT, slept: { from: 1000, to: 1000 + 5.5 * 3600 } } };

    expect(readout.of(STATE).advice).toContain("door open");
    expect(readout.of(rested).advice).toBe("You slept 5 h 30 min.");
    expect(readout.of(STATE, true).advice).toContain("Asleep");
  });

  it("has every text in Russian too", () => {
    expect(Object.keys(tentTexts.ru)).toEqual(Object.keys(tentTexts.en));
  });
});
