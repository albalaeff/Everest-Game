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
  whole: 0,
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

/** A row's marks as they read: each mark, its text, and a cross for what's lacking. */
function marks(state: TentState, chore: Chore): string[] {
  return row(state, chore).chips.map(
    ({ mark, text, lacking }) => `${mark} ${text}${lacking ? " ✗" : ""}`,
  );
}

describe("TentReadout: the tent's panel in marks and few words (#258, #264)", () => {
  it("says where the tent is and the time, and how the climber feels, a mark and the self-check's word for each", () => {
    const panel = readout.of({
      ...STATE,
      body: { ...FRESH, tiredness: "tired", symptoms: ["thirsty", "sleepy"] },
    });

    expect(panel.where).toBe("Camp 1 · 6,065 m");
    expect(panel.clock).toBe("14:00");
    expect(panel.feel).toEqual([
      { mark: "pulse", text: "tired", lacking: false },
      { mark: "drop", text: "thirsty", lacking: false },
      { mark: "moon", text: "sleepy", lacking: false },
    ]);
    expect(panel.feeling).toBe("You feel tired, thirsty, sleepy.");
    expect(readout.of(STATE).feeling).toBe("You feel fresh.");
    const hungry = readout.of({
      ...STATE,
      body: { ...FRESH, symptoms: ["hungry", "out-of-breath"] },
    });
    expect(hungry.feel.map(({ mark }) => mark)).toEqual(["pouch", "wind"]);
    expect(hungry.feeling).toBe("You feel hungry, out of breath.");
  });

  it("counts the water against the bottles, the gas in grams, the meals, the bars and the oxygen, short, and in words with their names", () => {
    const { stock } = readout.of(STATE);

    expect(stock.water).toEqual({ text: "1.5/3 L", label: "Water: 1.5 of 3 L", share: 0.5 });
    expect(stock.gas).toMatchObject({ text: "454 g", label: "Gas: 454 g" });
    expect(stock.meals).toMatchObject({ text: "6", label: "Meals: 6" });
    expect(stock.bars).toMatchObject({ text: "2", label: "Bars: 2" });
    expect(stock.oxygen).toMatchObject({ text: "0", label: "Oxygen: 0" });
  });

  it("marks what Base Camp's kitchen never runs out of as endless, and says plenty", () => {
    const { stock } = readout.of({
      ...STATE,
      tent: { ...TENT, camp: "base-camp", gas: null, meals: null, guitar: true, lacks: NOTHING },
    });

    expect(stock.gas).toEqual({ text: "∞", label: "Gas: plenty", share: 1 });
    expect(stock.meals).toMatchObject({ text: "∞", label: "Meals: plenty" });
  });

  it("names each chore in a word, with what it takes and gives as marks, and in a sentence, by the knowledge base's numbers", () => {
    expect(row(STATE, "melt").name).toBe("Melt");
    expect(marks(STATE, "melt")).toEqual(["clock 12 min", "flame 38 g", "drop +1 L"]);
    expect(row(STATE, "melt").label).toBe("Melt snow: 12 min and 38 g of gas for 1 L of water");
    expect(marks(STATE, "cook")).toEqual([
      "clock 15 min",
      "flame 10 g",
      "drop 0.4 L",
      "bolt 600 kcal",
    ]);
    expect(row(STATE, "cook").label).toBe(
      "Cook a meal: 15 min, 10 g of gas and 0.4 L of water for 600 kcal",
    );
    expect(marks(STATE, "nap")).toEqual(["clock 1 h"]);
    expect(marks(STATE, "sleep")).toEqual(["alarm 02:00"]);
    expect(row(STATE, "sleep").label).toBe("Sleep until the alarm at 02:00");
    expect(row(STATE, "melt")).toMatchObject({ able: true, doing: false, progress: 0 });
  });

  it("crosses out the mark of what a chore lacks, says why in its sentence, and can't begin it", () => {
    const lacking: TentState = {
      ...STATE,
      tent: {
        ...TENT,
        lacks: { melt: "room", cook: "water", nap: null, sleep: null, guitar: "guitar" },
      },
    };
    const lacks = (lack: Lack): TentState => ({
      ...STATE,
      tent: { ...TENT, lacks: { ...NOTHING, cook: lack } },
    });

    expect(marks(lacking, "melt")).toEqual(["clock 12 min", "flame 38 g", "drop +1 L ✗"]);
    expect(row(lacking, "melt")).toMatchObject({
      label: "Melt snow: your bottles are full",
      able: false,
    });
    expect(marks(lacking, "cook")[2]).toBe("drop 0.4 L ✗");
    expect(row(lacking, "cook").label).toBe(
      "Cook a meal: it takes 0.4 L of water: melt snow first",
    );
    expect(marks(lacking, "guitar")).toEqual(["tent Base Camp ✗"]);
    expect(row(lacking, "guitar").label).toBe("Play the guitar: the guitar stays at Base Camp");
    expect(marks(lacks("gas"), "cook")[1]).toBe("flame 10 g ✗");
    expect(row(lacks("gas"), "cook").label).toBe("Cook a meal: the gas has run out");
    expect(marks(lacks("meals"), "cook").at(-1)).toBe("pouch 0 ✗");
  });

  it("shows how long the chore in hand has left and its stop, and says so", () => {
    const melting = { ...STATE, tent: { ...TENT, chore: "melt" as const, progress: 0.25 } };
    const asleep = {
      ...STATE,
      timeOfDay: 21.5 * 3600,
      tent: { ...TENT, chore: "sleep" as const, progress: 0.1 },
    };
    const playing = { ...STATE, tent: { ...TENT, chore: "guitar" as const, lacks: NOTHING } };

    expect(marks(melting, "melt")).toEqual(["clock 9 min", "stop Stop"]);
    expect(row(melting, "melt")).toMatchObject({
      label: "Melt snow: 9 min left. Press to stop",
      doing: true,
      progress: 0.25,
    });
    expect(marks(asleep, "sleep")).toEqual(["clock 4 h 30 min", "stop Wake up"]);
    expect(row(asleep, "sleep").label).toBe("Sleep: 4 h 30 min left. Press to wake up");
    expect(marks(playing, "guitar")).toEqual(["stop Stop"]);
    expect(row(playing, "guitar").label).toBe("Play the guitar: playing. Press to stop");
  });

  it("warns of the stove's fumes only while it burns, says they're asleep while they are, and how long they slept until the next chore", () => {
    const rested = { ...STATE, tent: { ...TENT, slept: { from: 1000, to: 1000 + 5.5 * 3600 } } };
    const melting = { ...STATE, tent: { ...TENT, chore: "melt" as const } };

    expect(readout.of(STATE).note).toBeNull();
    expect(readout.of(melting).note).toEqual({
      mark: "warning",
      text: "Door open for the fumes",
      label:
        "The stove burns in the vestibule with the door open: in a closed tent its fumes kill.",
    });
    expect(readout.of({ ...STATE, tent: { ...TENT, chore: "sleep" } }).note?.text).toContain(
      "Asleep",
    );
    expect(readout.of(rested).slept).toEqual({
      mark: "moon",
      text: "Slept 5 h 30 min",
      label: "You slept 5 h 30 min.",
    });
    expect(readout.of({ ...rested, tent: { ...rested.tent, chore: "melt" } }).slept).toBeNull();
    expect(readout.of(STATE).slept).toBeNull();
  });

  it("has every text in Russian too, in marks and words as short", () => {
    const russian = new TentReadout(
      new Texts(tentTexts.ru),
      facts.numbers,
      facts.canister,
      (id) => CAMPS[id] ?? id,
    );

    expect(Object.keys(tentTexts.ru)).toEqual(Object.keys(tentTexts.en));
    expect(russian.of(STATE).chores.map(({ name }) => name)).toEqual([
      "Натопить",
      "Готовить",
      "Вздремнуть",
      "Спать",
      "Играть",
    ]);
    expect(russian.of(STATE).stock.water.text).toMatch(/^1.5\/3 л$/u);
  });
});
