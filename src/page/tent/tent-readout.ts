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
  | "feel"
  | `feel.${BodyView["tiredness"]}`
  | `symptom.${BodyView["symptoms"][number]}`
  | `stock.${"water" | "gas" | "meals" | "bars" | "oxygen"}`
  | "water"
  | "gas"
  | "count"
  | "plenty"
  | `chore.${Chore}`
  | `cost.${Chore}`
  | "doing"
  | "doing.sleep"
  | "doing.guitar"
  | "minutes"
  | "hours"
  | `lack.${Lack}`
  | "drink"
  | "eat"
  | "pack"
  | "advice"
  | "advice.asleep"
  | "slept";

/** A thing the tent has, as its panel shows it: its amount in words, and how full its gauge is,
 * 0 to 1, or none for what isn't measured against anything. */
export interface StockRow {
  readonly text: string;
  readonly share: number | null;
}

/** A chore as the panel shows it: its line under its name, whether it's the one in hand and how
 * far through it is, and whether it can begin. */
export interface ChoreRow {
  readonly chore: Chore;
  readonly note: string;
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

/** The tent's panel in words. */
export interface TentPanel {
  readonly where: string;
  readonly clock: string;
  readonly feel: string;
  readonly stock: Readonly<Record<"water" | "gas" | "meals" | "bars" | "oxygen", StockRow>>;
  readonly chores: readonly ChoreRow[];
  /** What's said under the chores: the stove's advice, or how long the last sleep was. */
  readonly advice: string;
}

/**
 * The tent's panel in words (#258), from the tent's rule, the body, the pack and the clock: where
 * the tent is and what time it is, how the climber feels, in the self-check's words; the water,
 * the gas, the meals, the bars and the oxygen there are; and each chore with what it takes and
 * gives, by the tent's numbers, or what it lacks to begin, or, in hand, how long it has left. It
 * holds nothing: the same state reads the same.
 */
export class TentReadout {
  private static readonly SECONDS_A_MINUTE = 60;
  private static readonly SECONDS_AN_HOUR = 3600;
  private readonly readings = new Readings();

  constructor(
    private readonly texts: Texts<TentTextName>,
    private readonly numbers: TentNumbers,
    /** The grams of gas a full canister holds, and each camp's name by its id. */
    private readonly canister: number,
    private readonly camps: (id: string) => string,
  ) {}

  of(state: TentState, asleep = false): TentPanel {
    const { texts, readings } = this;
    const { tent, body } = state;
    // Fresh goes without saying beside a symptom: "thirsty", not "fresh, thirsty".
    const symptoms = body.symptoms.map((symptom) => texts.say(`symptom.${symptom}`));
    const feels =
      body.tiredness === "fresh" && symptoms.length > 0
        ? symptoms
        : [texts.say(`feel.${body.tiredness}`), ...symptoms];
    const count = (value: number | null): StockRow => ({
      text:
        value === null
          ? texts.say("plenty")
          : texts.say("count", { count: TentReadout.rounded(value) }),
      share: null,
    });
    const slept = tent.slept === null ? 0 : tent.slept.to - tent.slept.from;
    return {
      where: texts.say("where", {
        camp: this.camps(tent.camp),
        altitude: readings.altitude(state.altitude),
      }),
      clock: readings.clock(state.timeOfDay),
      feel: texts.say("feel", { feel: feels.join(", ") }),
      stock: {
        water: {
          text: texts.say("water", {
            have: TentReadout.rounded(state.water),
            room: TentReadout.rounded(state.bottles),
          }),
          share: state.bottles > 0 ? Math.min(1, state.water / state.bottles) : 0,
        },
        gas:
          tent.gas === null
            ? { text: texts.say("plenty"), share: 1 }
            : {
                text: texts.say("gas", { grams: Math.round(tent.gas) }),
                share: Math.min(1, (tent.gas / this.canister) % 1 || (tent.gas > 0 ? 1 : 0)),
              },
        meals: count(tent.meals),
        bars: count(state.bars),
        oxygen: count(state.oxygen),
      },
      chores: CHORES.map((chore) => this.chore(chore, state)),
      advice: asleep
        ? texts.say("advice.asleep")
        : slept >= TentReadout.SECONDS_A_MINUTE && tent.chore === null
          ? texts.say("slept", { time: this.time(slept) })
          : texts.say("advice"),
    };
  }

  private chore(chore: Chore, { tent, timeOfDay }: TentState): ChoreRow {
    const { texts, numbers } = this;
    const lack = tent.lacks[chore];
    const doing = tent.chore === chore;
    const minute = TentReadout.SECONDS_A_MINUTE;
    if (doing) {
      const left = this.left(chore, tent.progress, timeOfDay);
      const note =
        chore === "guitar"
          ? texts.say("doing.guitar")
          : texts.say(chore === "nap" || chore === "sleep" ? "doing.sleep" : "doing", {
              left: this.time(left),
            });
      return { chore, note, doing, progress: tent.progress, able: true };
    }
    if (lack !== null) {
      const note = texts.say(`lack.${lack}`, { water: TentReadout.rounded(numbers.meal.water) });
      return { chore, note, doing, progress: 0, able: false };
    }
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
    return { chore, note: texts.say(`cost.${chore}`, fills), doing, progress: 0, able: true };
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

  /** An amount as the panel writes it: to a tenth. */
  private static rounded(value: number): number {
    return Math.round(value * 10) / 10;
  }
}
