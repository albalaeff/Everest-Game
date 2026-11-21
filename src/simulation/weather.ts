import type { AirTemperature } from "./air-temperature";
import type { Json } from "./json";
import type { MountainClock } from "./mountain-clock";
import { HazardChance } from "./objective-hazards";
import type { HazardWeather } from "./objective-hazards";
import type { Rule } from "./rule";
import { SeededRandom } from "./seeded-random";
import type { Wind } from "./wind";

/** What kind of day the mountain has (#272): fine, with cloud in the afternoon at most; windy;
 * unsettled, snowing from the afternoon; or stormy, snow in a gale. Fine and windy days are good
 * ones, unsettled and stormy days bad ones, and bad days come in spells. */
export type DayKind = "fine" | "windy" | "unsettled" | "stormy";

/** The hours, after midnight, a part of a day begins between: drawn from the seed each day. */
export type HourRange = { readonly min: number; readonly max: number };

/** The weather's numbers, from the knowledge base (weather.day-*, weather.*-hour,
 * weather.turn-minutes). */
export interface WeatherNumbers {
  /** The chance the day after a good day is a bad one, and the day after a bad one. */
  readonly bad: { readonly afterGood: number; readonly afterBad: number };
  /** The share of the good days that are windy, and of the bad days that are stormy. */
  readonly windy: number;
  readonly stormy: number;
  /** When each part of a day begins: the cloud building on an unsettled day, its snow (and a fine
   * day's afternoon cloud), the snow easing to cloud (and a fine day clearing), the wind getting
   * up on a windy day and dropping, a storm breaking and easing to snow. */
  readonly hours: {
    readonly cloud: HourRange;
    readonly snow: HourRange;
    readonly clearing: HourRange;
    readonly wind: HourRange;
    readonly calm: HourRange;
    readonly storm: HourRange;
    readonly easing: HourRange;
  };
  /** How many of the mountain's seconds the sky takes to turn from one weather to the next. */
  readonly turn: number;
}

/** One weather from an hour on: the mountain's seconds since the first day's midnight. */
export type Spell = { readonly from: number; readonly weather: HazardWeather };

/** A day as the seed draws it: its kind, and its weathers from midnight, in order. */
export interface DrawnDay {
  readonly kind: DayKind;
  readonly spells: readonly Spell[];
}

/** The sky turning from one weather to the next: how far it has turned, 0 to 1. Steady, it's the
 * weather of the hour both ways, all the way turned. */
export interface SkyTurn {
  readonly from: HazardWeather;
  readonly to: HazardWeather;
  readonly share: number;
}

/** The weather of the hour, as the hazards and the jolts read it each step: `Weather`'s. */
export interface Sky {
  readonly now: HazardWeather;
}

/** The weather at any time, past or ahead, as it truly is: what a forecast tries to tell. */
export interface WeatherTruth {
  /** The weather of the hour at `seconds` since the first day's midnight. */
  at(seconds: number): HazardWeather;
  /** The air, in °C, `altitude` metres up then, and the wind, in km/h, as the sky has turned. */
  air(seconds: number, altitude: number): number;
  wind(seconds: number): number;
}

/** The weather as saves keep it: the seed its days are drawn from, and the weather a scenario or
 * the god mode holds, if one does. */
type WeatherSave = {
  readonly seed: number;
  readonly held: HazardWeather | null;
};

/** What a scenario sets: the climb's seed, and the weather to hold all climb long, if any. */
export interface WeatherStart {
  readonly seed: number;
  readonly held?: HazardWeather;
}

/**
 * The weather, as a rule of the core (#272, spec.md → Simulation systems): it changes through the
 * days from the climb's seed, by a chance of its own, so the expedition's draws aren't touched and
 * the days ahead are there to forecast. Good days and bad come in spells (`DayKind`), and each day
 * goes as the Khumbu's spring days do: clear nights and mornings, cloud building toward noon and
 * snow from the afternoon on a bad day (weather.precipitation-daily-cycle). The hazards and the
 * jolts read the weather of the hour from it (`Sky`), and the sky takes `turn` seconds to turn from
 * one to the next, the air and the wind with it, so nothing changes at a cut. A scenario, the god
 * mode and the stories can hold one weather instead.
 */
export class Weather implements Rule, WeatherTruth, Sky {
  /** Its key in scenarios and saves: never change it once saves exist. */
  static readonly NAME = "weather";
  /** The weather's own chance, apart from the expedition's: a seed's days are its own. */
  private static readonly CHANCE = 0x5e77;
  private static readonly DAY = 24 * 60 * 60;
  private static readonly HOUR = 60 * 60;

  readonly name = Weather.NAME;

  private state: WeatherSave | null = null;
  /** The days drawn so far from the seed, the first day's first: they're drawn in order, since a
   * day's kind depends on the day before. Not state: the seed draws them again. */
  private drawn: DrawnDay[] = [];
  private random: SeededRandom | null = null;
  /** Each day's changes of the weather, with the day before's and after's, and the last turn
   * worked out: not state either, but asked for many times a step. */
  private readonly changed = new Map<number, readonly Spell[]>();
  private turned: { readonly seconds: number; readonly turn: SkyTurn } | null = null;

  /** `clock` is the expedition's, which runs before this in its rules. */
  constructor(
    private readonly numbers: WeatherNumbers,
    private readonly clock: MountainClock,
    private readonly airs: AirTemperature,
    private readonly winds: Wind,
  ) {
    const { afterGood, afterBad } = numbers.bad;
    const shares = [afterGood, afterBad, numbers.windy, numbers.stormy];
    const ranges = Object.values(numbers.hours);
    const inADay = ranges.every(({ min, max }) => min >= 0 && min <= max && max < 24);
    if (!(shares.every((share) => share >= 0 && share <= 1) && inADay && numbers.turn >= 0)) {
      throw new RangeError("The weather's chances are shares, and its hours within a day");
    }
  }

  /** A scenario's start state: the seed's weather, or the one it holds. */
  static start(start: WeatherStart): Json {
    if (start.held !== undefined && !HazardChance.knows(start.held)) {
      throw new RangeError(`The weather can't hold ${start.held}`);
    }
    const save: WeatherSave = { seed: start.seed, held: start.held ?? null };
    return save;
  }

  /** A save from before the weather (#272) goes on in the route's weather, clear, held: the god
   * mode's climb alone could have had another. */
  missing(): Json {
    const save: WeatherSave = { seed: 0, held: "clear" };
    return save;
  }

  /** The weather held all climb long, by a scenario or the god mode, or none: the seed's. */
  get held(): HazardWeather | null {
    return this.loaded.held;
  }

  /** Holds a weather from now on between steps, or with none goes back to the seed's: the god
   * mode's (#245), never a rule's. */
  hold(weather: HazardWeather | null): void {
    if (weather !== null && !HazardChance.knows(weather)) {
      throw new RangeError(`The weather can't hold ${weather}`);
    }
    this.state = { seed: this.loaded.seed, held: weather };
    this.turned = null;
  }

  /** The weather of the hour now. */
  get now(): HazardWeather {
    return this.at(this.seconds);
  }

  /** How the sky is turning now, from one weather to the next, or steady. */
  get turn(): SkyTurn {
    return this.turnAt(this.seconds);
  }

  /** The kind of day it is now: the seed's, or none while a weather is held. */
  get today(): DayKind | null {
    return this.loaded.held === null ? this.dayOf(this.clock.day).kind : null;
  }

  /** The seconds since the first day's midnight now, on the mountain's clock. */
  get seconds(): number {
    return this.clock.day * Weather.DAY + this.clock.timeOfDay;
  }

  /** The day `day` days after the first, as the seed draws it. */
  dayOf(day: number): DrawnDay {
    if (!(Number.isInteger(day) && day >= 0)) {
      throw new RangeError(`The weather draws whole days from the first, not day ${day}`);
    }
    while (this.drawn.length <= day) {
      this.drawn.push(this.draw(this.drawn.at(-1) ?? null));
    }
    const drawn = this.drawn[day];
    if (drawn === undefined) {
      throw new RangeError(`The weather has no day ${day}`);
    }
    return drawn;
  }

  at(seconds: number): HazardWeather {
    const { held } = this.loaded;
    if (held !== null) {
      return held;
    }
    const day = Math.floor(Math.max(0, seconds) / Weather.DAY);
    const { spells } = this.dayOf(day);
    let weather = spells[0]?.weather ?? "clear";
    for (const spell of spells) {
      if (spell.from <= seconds) {
        weather = spell.weather;
      }
    }
    return weather;
  }

  /** How the sky turns at `seconds`: across `turn` seconds round each change of the weather, from
   * the one before to the one after; steady between them. */
  turnAt(seconds: number): SkyTurn {
    if (this.turned?.seconds === seconds) {
      return this.turned.turn;
    }
    const turn = this.turning(seconds);
    this.turned = { seconds, turn };
    return turn;
  }

  private turning(seconds: number): SkyTurn {
    const now = this.at(seconds);
    const half = this.numbers.turn / 2;
    if (this.loaded.held !== null || half <= 0) {
      return { from: now, to: now, share: 1 };
    }
    const day = Math.floor(Math.max(0, seconds) / Weather.DAY);
    for (const change of this.changes(day)) {
      if (Math.abs(seconds - change.from) < half) {
        const share = (seconds - change.from + half) / (2 * half);
        return { from: this.at(change.from - 1), to: change.weather, share };
      }
    }
    return { from: now, to: now, share: 1 };
  }

  air(seconds: number, altitude: number): number {
    const timeOfDay = this.timeOfDay(seconds);
    return this.blended(seconds, (weather) => this.airs.at(timeOfDay, weather, altitude));
  }

  wind(seconds: number): number {
    const timeOfDay = this.timeOfDay(seconds);
    return this.blended(seconds, (weather) => this.winds.steady(timeOfDay, weather));
  }

  /** The air, in °C, `altitude` metres up now, and the steady wind, in km/h, as the sky has
   * turned: what a climber feels, and the weather meter reads. */
  airNow(altitude: number): number {
    return this.air(this.seconds, altitude);
  }

  windNow(): number {
    return this.wind(this.seconds);
  }

  load(state: Json): void {
    const save = state as unknown as WeatherSave;
    if (this.state?.seed !== save.seed) {
      this.drawn = [];
      this.random = null;
      this.changed.clear();
    }
    this.state = save;
    this.turned = null;
  }

  save(): Json {
    return this.loaded;
  }

  advance(): void {
    // The weather draws nothing from the expedition's chance, and its days come from the clock: a
    // step changes nothing of its state.
  }

  /** A value of the weather's, `of` it, as the sky has turned at `seconds`: between the two
   * weathers' in a turn, by how far it has turned. */
  private blended(seconds: number, of: (weather: HazardWeather) => number): number {
    const { from, to, share } = this.turnAt(seconds);
    const before = of(from);
    return from === to ? before : before + (of(to) - before) * share;
  }

  /** Every change of the weather on the day before `day`, on it and on the day after: the spells
   * whose weather isn't the one before them. */
  private changes(day: number): readonly Spell[] {
    const known = this.changed.get(day);
    if (known !== undefined) {
      return known;
    }
    const spells = [day - 1, day, day + 1]
      .filter((each) => each >= 0)
      .flatMap((each) => this.dayOf(each).spells);
    const changes = spells.filter(
      (spell, index) => index > 0 && spell.weather !== spells[index - 1]?.weather,
    );
    this.changed.set(day, changes);
    return changes;
  }

  private timeOfDay(seconds: number): number {
    return seconds - Math.floor(seconds / Weather.DAY) * Weather.DAY;
  }

  /** The next day from the seed, after `before`, or the first: its kind, then the hour each of
   * its parts begins, every range drawn each day so a day's draws don't depend on its kind. */
  private draw(before: DrawnDay | null): DrawnDay {
    const random = this.chance();
    const { bad, windy, stormy, hours } = this.numbers;
    const wasBad = before !== null && (before.kind === "unsettled" || before.kind === "stormy");
    // The first day is as likely bad as any day in a long run of them.
    const settled = bad.afterGood / (1 - bad.afterBad + bad.afterGood);
    const isBad = random.chance(before === null ? settled : wasBad ? bad.afterBad : bad.afterGood);
    const worse = random.chance(isBad ? stormy : windy);
    const kind: DayKind = isBad ? (worse ? "stormy" : "unsettled") : worse ? "windy" : "fine";
    const day = this.drawn.length * Weather.DAY;
    const hour = ({ min, max }: HourRange): number =>
      day + (min + (max - min) * random.fraction()) * Weather.HOUR;
    const cloud = hour(hours.cloud);
    const snow = hour(hours.snow);
    const clearing = hour(hours.clearing);
    const wind = hour(hours.wind);
    const calm = hour(hours.calm);
    const storm = hour(hours.storm);
    const easing = hour(hours.easing);
    const spells: Spell[] =
      kind === "fine"
        ? [
            { from: day, weather: "clear" },
            { from: snow, weather: "cloud" },
            { from: clearing, weather: "clear" },
          ]
        : kind === "windy"
          ? [
              { from: day, weather: "clear" },
              { from: wind, weather: "wind" },
              { from: calm, weather: "clear" },
            ]
          : kind === "unsettled"
            ? [
                { from: day, weather: "clear" },
                { from: cloud, weather: "cloud" },
                { from: snow, weather: "snow" },
                { from: clearing, weather: "cloud" },
              ]
            : [
                { from: day, weather: "cloud" },
                { from: storm, weather: "storm" },
                { from: easing, weather: "snow" },
              ];
    return { kind, spells: Weather.ordered(spells) };
  }

  /** The spells in the order they come: a part the draw put no later than the one before it
   * takes that one's place, which never comes. The knowledge base's hours don't overlap, so this is
   * only a guard. */
  private static ordered(spells: readonly Spell[]): readonly Spell[] {
    const kept: Spell[] = [];
    for (const spell of spells) {
      const last = kept.at(-1);
      if (last !== undefined && spell.from <= last.from) {
        kept[kept.length - 1] = { from: last.from, weather: spell.weather };
      } else {
        kept.push(spell);
      }
    }
    return kept;
  }

  private chance(): SeededRandom {
    this.random ??= SeededRandom.fromSeed(this.loaded.seed ^ Weather.CHANCE);
    return this.random;
  }

  private get loaded(): WeatherSave {
    if (this.state === null) {
      throw new RangeError("The weather has no seed: load a state first");
    }
    return this.state;
  }
}
