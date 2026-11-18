import { Readings } from "../../interface/readings";
import type { Texts } from "../../interface/texts";
import { CHORES, MountainClock } from "../../simulation";
import type { BodyView, Chore, Lack, TentNumbers, TentView } from "../../simulation";

/** The tent's words, by their names in content/tent.json. */
export type TentTextName =
  | "title"
  | "where"
  | "enter"
  | "leave"
  | "leave.label"
  | "feel"
  | `feel.${BodyView["tiredness"]}`
  | `symptom.${BodyView["symptoms"][number]}`
  | "stock"
  | `stock.${StockName}`
  | "water"
  | "water.short"
  | "gas"
  | "count"
  | "plenty"
  | "plenty.short"
  | `chore.${Chore}`
  | `name.${Chore}`
  | `about.${Chore}`
  | "minutes"
  | "hours"
  | "hours.whole"
  | "litres"
  | "more"
  | "kcal"
  | "doing"
  | "doing.sleep"
  | "doing.guitar"
  | "stop"
  | "wake"
  | "lacking"
  | `lack.${Lack}`
  | "drink"
  | "eat"
  | "eat.label"
  | "pack"
  | "stove"
  | "stove.label"
  | "asleep"
  | "asleep.label"
  | "slept"
  | "slept.label";

/** What the tent has: water in the bottles, gas, meals, bars and oxygen. */
export type StockName = "water" | "gas" | "meals" | "bars" | "oxygen";

/** A mark of the panel's, drawn in the menu's style (`--icon-<mark>` in the style sheet): the
 * time a chore takes, the gas, the water, the energy a meal gives, the alarm, a meal, a camp, the
 * stop of a chore in hand; how one feels (the pulse, a drop, a meal, the moon, the wind); the
 * stove's warning. */
export type Mark =
  | "clock"
  | "flame"
  | "drop"
  | "bolt"
  | "alarm"
  | "pouch"
  | "tent"
  | "stop"
  | "pulse"
  | "moon"
  | "wind"
  | "warning";

/** A mark with a word or a number beside it: what a chore takes or gives, a feeling. `lacking`,
 * it's crossed out: what keeps a chore from beginning. */
export interface Chip {
  readonly mark: Mark;
  readonly text: string;
  readonly lacking: boolean;
}

/** A mark and a few words, and the whole of it in a sentence, for its tooltip and a screen
 * reader. */
export interface Note {
  readonly mark: Mark;
  readonly text: string;
  readonly label: string;
}

/** A thing the tent has, as its panel shows it: its amount, short; the whole of it in words, its
 * name and its amount; and how full its gauge is, 0 to 1, or none for what isn't measured
 * against anything. */
export interface StockRow {
  readonly text: string;
  readonly label: string;
  readonly share: number | null;
}

/** A chore as the panel shows it: its name, a word; what it takes and gives, as marks, or in
 * hand the time it has left and its stop; the whole of it in a sentence, for its tooltip and a
 * screen reader; whether it's the one in hand and how far through it is, and whether it can
 * begin. */
export interface ChoreRow {
  readonly chore: Chore;
  readonly name: string;
  readonly chips: readonly Chip[];
  readonly label: string;
  readonly doing: boolean;
  readonly progress: number;
  readonly able: boolean;
}

/** What the readout reads the tent's panel from. */
export interface TentState {
  readonly tent: TentView;
  readonly body: BodyView;
  /** The mountain's seconds since midnight, and the altimeter's metres. */
  readonly timeOfDay: number;
  readonly altitude: number;
  /** The litres in the bottles and how many they hold; the bars and the oxygen bottles. */
  readonly water: number;
  readonly bottles: number;
  readonly bars: number;
  readonly oxygen: number;
}

/** The tent's panel. */
export interface TentPanel {
  readonly where: string;
  readonly clock: string;
  /** How long the last sleep was, by the clock, until a chore begins. */
  readonly slept: Note | null;
  /** How the climber feels, a mark and a word for the tiredness and each symptom; and in a
   * sentence. */
  readonly feel: readonly Chip[];
  readonly feeling: string;
  readonly stock: Readonly<Record<StockName, StockRow>>;
  readonly chores: readonly ChoreRow[];
  /** What's said under the chores: the stove's warning while it burns, or that they're asleep;
   * nothing the rest of the time. */
  readonly note: Note | null;
}

/**
 * The tent's panel (#258), in marks and few words (#264), from the tent's rule, the body, the
 * pack and the clock: where the tent is and what time it is, how the climber feels, a mark and the
 * self-check's word for each; the water, the gas, the meals, the bars and the oxygen there are;
 * and each chore with what it takes and gives, by the tent's numbers, as marks with numbers, the
 * mark of what it lacks crossed out, or, in hand, how long it has left. Every chore, stock and
 * note has its whole in a sentence too, for its tooltip and a screen reader. It holds nothing:
 * the same state reads the same.
 */
export class TentReadout {
  private static readonly SECONDS_A_MINUTE = 60;
  private static readonly SECONDS_AN_HOUR = 3600;
  /** The camp whose kitchen has the guitar. */
  private static readonly BASE_CAMP = "base-camp";
  /** A mark for each feeling. */
  private static readonly FEELINGS: Readonly<Record<BodyView["symptoms"][number], Mark>> = {
    "out-of-breath": "wind",
    thirsty: "drop",
    hungry: "pouch",
    sleepy: "moon",
  };
  private readonly readings = new Readings();

  constructor(
    private readonly texts: Texts<TentTextName>,
    private readonly numbers: TentNumbers,
    /** The grams of gas a full canister holds, and each camp's name by its id. */
    private readonly canister: number,
    private readonly camps: (id: string) => string,
  ) {}

  of(state: TentState): TentPanel {
    const { texts, readings } = this;
    const { tent, body } = state;
    // Fresh goes without saying beside a symptom: "thirsty", not "fresh, thirsty".
    const feelings: Chip[] = [
      ...(body.tiredness === "fresh" && body.symptoms.length > 0
        ? []
        : [TentReadout.chip("pulse", texts.say(`feel.${body.tiredness}`))]),
      ...body.symptoms.map((symptom) =>
        TentReadout.chip(TentReadout.FEELINGS[symptom], texts.say(`symptom.${symptom}`)),
      ),
    ];
    const slept = tent.slept === null ? 0 : tent.slept.to - tent.slept.from;
    const asleep = tent.chore === "nap" || tent.chore === "sleep";
    const burning = tent.chore === "melt" || tent.chore === "cook";
    return {
      where: texts.say("where", {
        camp: this.camps(tent.camp),
        altitude: readings.altitude(state.altitude),
      }),
      clock: readings.clock(state.timeOfDay),
      slept:
        slept >= TentReadout.SECONDS_A_MINUTE && tent.chore === null
          ? {
              mark: "moon",
              text: texts.say("slept", { time: this.time(slept) }),
              label: texts.say("slept.label", { time: this.time(slept) }),
            }
          : null,
      feel: feelings,
      feeling: texts.say("feel", { feel: feelings.map(({ text }) => text).join(", ") }),
      stock: this.stock(state),
      chores: CHORES.map((chore) => this.chore(chore, state)),
      // Asleep with the clock still running, others are awake: the night waits for them.
      note: asleep
        ? { mark: "moon", text: texts.say("asleep"), label: texts.say("asleep.label") }
        : burning
          ? { mark: "warning", text: texts.say("stove"), label: texts.say("stove.label") }
          : null,
    };
  }

  private stock(state: TentState): Readonly<Record<StockName, StockRow>> {
    const { texts } = this;
    const { tent } = state;
    const row = (name: StockName, text: string, amount: string, share: number | null) => ({
      text,
      label: texts.say("stock", { name: texts.say(`stock.${name}`), amount }),
      share,
    });
    const count = (name: StockName, value: number | null): StockRow =>
      value === null
        ? row(name, texts.say("plenty.short"), texts.say("plenty"), null)
        : row(
            name,
            texts.say("count", { count: TentReadout.rounded(value) }),
            texts.say("count", { count: TentReadout.rounded(value) }),
            null,
          );
    const water = {
      have: TentReadout.rounded(state.water),
      room: TentReadout.rounded(state.bottles),
    };
    return {
      water: row(
        "water",
        texts.say("water.short", water),
        texts.say("water", water),
        state.bottles > 0 ? Math.min(1, state.water / state.bottles) : 0,
      ),
      gas:
        tent.gas === null
          ? row("gas", texts.say("plenty.short"), texts.say("plenty"), 1)
          : row(
              "gas",
              texts.say("gas", { grams: Math.round(tent.gas) }),
              texts.say("gas", { grams: Math.round(tent.gas) }),
              Math.min(1, (tent.gas / this.canister) % 1 || (tent.gas > 0 ? 1 : 0)),
            ),
      meals: count("meals", tent.meals),
      bars: count("bars", state.bars),
      oxygen: count("oxygen", state.oxygen),
    };
  }

  private chore(chore: Chore, { tent, timeOfDay }: TentState): ChoreRow {
    const { texts } = this;
    const name = texts.say(`chore.${chore}`);
    const whole = texts.say(`name.${chore}`);
    const lack = tent.lacks[chore];
    if (tent.chore === chore) {
      const left = this.time(this.left(chore, tent.progress, timeOfDay));
      const asleep = chore === "nap" || chore === "sleep";
      const stop = TentReadout.chip("stop", texts.say(asleep ? "wake" : "stop"));
      return {
        chore,
        name,
        chips: chore === "guitar" ? [stop] : [TentReadout.chip("clock", left), stop],
        label:
          chore === "guitar"
            ? texts.say("doing.guitar", { name: whole })
            : texts.say(asleep ? "doing.sleep" : "doing", { name: whole, left }),
        doing: true,
        progress: tent.progress,
        able: true,
      };
    }
    const chips = this.costs(chore, lack);
    return {
      chore,
      name,
      chips,
      label:
        lack === null
          ? this.about(chore)
          : texts.say("lacking", {
              name: whole,
              lack: texts.say(`lack.${lack}`, {
                water: TentReadout.rounded(this.numbers.meal.water),
              }),
            }),
      doing: false,
      progress: 0,
      able: lack === null,
    };
  }

  /** What a chore takes and gives, as marks: the mark of what it lacks crossed out, or added
   * crossed out where it has none (no meals, not at Base Camp). */
  private costs(chore: Chore, lack: Lack | null): readonly Chip[] {
    const { texts, numbers } = this;
    const chip = (mark: Mark, text: string, lacking = false): Chip =>
      TentReadout.chip(mark, text, lacking);
    const minutes = (seconds: number): string =>
      texts.say("minutes", { minutes: Math.round(seconds / TentReadout.SECONDS_A_MINUTE) });
    const grams = (value: number): Chip =>
      chip("flame", texts.say("gas", { grams: Math.round(value) }), lack === "gas");
    switch (chore) {
      case "melt":
        return [
          chip("clock", minutes(numbers.melt.seconds)),
          grams(numbers.melt.gas),
          chip(
            "drop",
            texts.say("more", { litres: TentReadout.rounded(numbers.melt.litres) }),
            lack === "room",
          ),
        ];
      case "cook":
        return [
          chip("clock", minutes(numbers.meal.seconds)),
          grams(numbers.meal.gas),
          chip(
            "drop",
            texts.say("litres", { litres: TentReadout.rounded(numbers.meal.water) }),
            lack === "water",
          ),
          chip("bolt", texts.say("kcal", { kcal: Math.round(numbers.meal.kcal) })),
          ...(lack === "meals" ? [chip("pouch", texts.say("count", { count: 0 }), true)] : []),
        ];
      case "nap":
        return [
          chip(
            "clock",
            texts.say("hours.whole", {
              hours: TentReadout.rounded(numbers.nap / TentReadout.SECONDS_AN_HOUR),
            }),
          ),
        ];
      case "sleep":
        return [chip("alarm", this.readings.clock(numbers.wake))];
      case "guitar":
        return lack === "guitar" ? [chip("tent", this.camps(TentReadout.BASE_CAMP), true)] : [];
    }
  }

  /** What a chore takes and gives, in a sentence. */
  private about(chore: Chore): string {
    const { texts, numbers } = this;
    const minute = TentReadout.SECONDS_A_MINUTE;
    const fills = {
      melt: {
        minutes: Math.round(numbers.melt.seconds / minute),
        gas: Math.round(numbers.melt.gas),
        litres: TentReadout.rounded(numbers.melt.litres),
      },
      cook: {
        minutes: Math.round(numbers.meal.seconds / minute),
        gas: Math.round(numbers.meal.gas),
        water: TentReadout.rounded(numbers.meal.water),
        kcal: Math.round(numbers.meal.kcal),
      },
      nap: { hours: TentReadout.rounded(numbers.nap / TentReadout.SECONDS_AN_HOUR) },
      sleep: { time: this.readings.clock(numbers.wake) },
      guitar: {},
    }[chore];
    return texts.say(`about.${chore}`, fills);
  }

  /** The mountain's seconds a chore in hand has left. */
  private left(chore: Chore, progress: number, timeOfDay: number): number {
    const { numbers } = this;
    if (chore === "sleep") {
      const day = MountainClock.SECONDS_A_DAY;
      const until = numbers.wake - timeOfDay;
      return until - Math.floor(until / day) * day;
    }
    const whole =
      chore === "melt"
        ? numbers.melt.seconds
        : chore === "cook"
          ? numbers.meal.seconds
          : numbers.nap;
    return whole * (1 - progress);
  }

  /** A length of the mountain's time in words: minutes under an hour, hours and minutes over. */
  private time(seconds: number): string {
    const { hours, minutes } = this.readings.duration(
      Math.ceil(seconds / TentReadout.SECONDS_A_MINUTE) * TentReadout.SECONDS_A_MINUTE,
    );
    return hours > 0
      ? this.texts.say("hours", { hours, minutes })
      : this.texts.say("minutes", { minutes });
  }

  private static chip(mark: Mark, text: string, lacking = false): Chip {
    return { mark, text, lacking };
  }

  /** An amount as the panel writes it: to a tenth. */
  private static rounded(value: number): number {
    return Math.round(value * 10) / 10;
  }
}
