import type { Json } from "./json";
import type { Rule } from "./rule";
import { SimulationClock } from "./simulation-clock";

/** When an expedition's mountain time begins: a date, `YYYY-MM-DD`, and a time of day, `HH:MM`. */
export interface ClockStart {
  readonly date: string;
  readonly time: string;
}

/** The clock's whole state, as saves keep it: its start, the steps played and the seconds skipped. */
type ClockSave = {
  readonly date: string;
  readonly time: string;
  readonly steps: number;
  readonly skipped: number;
};

/**
 * The mountain's time, as a rule of the core (docs/conventions/simulation-core.md → Real time): it
 * runs `compression` times faster than play, the knowledge base's `time.compression`, and jumps
 * over what camp skips, a night or a rest day. One clock serves the whole expedition, in co-op
 * too. It counts steps and never adds up fractions, so a long expedition doesn't drift.
 */
export class MountainClock implements Rule {
  /** Its key in scenarios and saves: never change it once saves exist. */
  static readonly NAME = "mountain-clock";
  static readonly SECONDS_A_DAY = 24 * 60 * 60;
  private static readonly DATE = /^\d{4}-(\d{2})-(\d{2})$/;
  private static readonly TIME = /^(\d{2}):(\d{2})$/;

  readonly name = MountainClock.NAME;

  private began: ClockStart | null = null;
  /** Seconds from the start day's midnight to the start time. */
  private intoTheDay = 0;
  private steps = 0;
  private skipped = 0;

  /** `compression` is how many times faster than play the mountain's time runs. */
  constructor(private readonly compression: number) {
    if (!(compression > 0)) {
      throw new RangeError(`The mountain's time can't run ${compression} times play's`);
    }
  }

  /** A scenario's start state: the clock at its date and time, nothing played, nothing skipped. */
  static start(start: ClockStart): Json {
    const save: ClockSave = { date: start.date, time: start.time, steps: 0, skipped: 0 };
    return save;
  }

  /** A time of day, `seconds` since midnight, written `HH:MM`: the form a start's time takes,
   * and the clock's reading on the screen. */
  static text(seconds: number): string {
    const day = MountainClock.SECONDS_A_DAY;
    const inTheDay = seconds - Math.floor(seconds / day) * day;
    const hours = Math.floor(inTheDay / 3600);
    const minutes = Math.floor((inTheDay - hours * 3600) / 60);
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  /** The date and time the expedition began at. */
  get start(): ClockStart {
    if (this.began === null) {
      throw new RangeError("The mountain clock hasn't started: load a state first");
    }
    return this.began;
  }

  /** The mountain's seconds since the start: the play at the ratio, and the skips. */
  get elapsed(): number {
    return (this.steps * this.compression) / SimulationClock.STEPS_PER_SECOND + this.skipped;
  }

  /** The mountain's seconds a step of play takes, at the ratio: what camp skips aside. */
  get secondsAStep(): number {
    return this.compression * SimulationClock.STEP_SECONDS;
  }

  /** Days since the start date: 0 on it, 1 the next day. */
  get day(): number {
    return Math.floor(this.sinceMidnight / MountainClock.SECONDS_A_DAY);
  }

  /** Seconds since that day's midnight. */
  get timeOfDay(): number {
    return this.sinceMidnight - this.day * MountainClock.SECONDS_A_DAY;
  }

  /** Jumps the mountain's time forward, inside a step: the night or the rest day camp skips. */
  skip(seconds: number): void {
    if (!(seconds >= 0)) {
      throw new RangeError(`The mountain's time can't skip ${seconds} seconds: it never runs back`);
    }
    this.skipped += seconds;
  }

  load(state: Json): void {
    const save = state as unknown as ClockSave;
    this.intoTheDay = MountainClock.secondsOf(save.time);
    this.began = { date: MountainClock.dateOf(save.date), time: save.time };
    this.steps = save.steps;
    this.skipped = save.skipped;
  }

  save(): Json {
    const { date, time } = this.start;
    const save: ClockSave = { date, time, steps: this.steps, skipped: this.skipped };
    return save;
  }

  advance(): void {
    this.steps += 1;
  }

  private get sinceMidnight(): number {
    return this.intoTheDay + this.elapsed;
  }

  private static dateOf(date: string): string {
    const parts = MountainClock.DATE.exec(date);
    const month = Number(parts?.[1]);
    const day = Number(parts?.[2]);
    if (parts === null || month < 1 || month > 12 || day < 1 || day > 31) {
      throw new RangeError(`${date} isn't a date of the form YYYY-MM-DD`);
    }
    return date;
  }

  /** The seconds since midnight of a time of day, `HH:MM`. */
  private static secondsOf(time: string): number {
    const parts = MountainClock.TIME.exec(time);
    const hours = Number(parts?.[1]);
    const minutes = Number(parts?.[2]);
    if (parts === null || hours > 23 || minutes > 59) {
      throw new RangeError(`${time} isn't a time of day of the form HH:MM`);
    }
    return hours * 3600 + minutes * 60;
  }
}
