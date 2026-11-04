import type { ClimberId } from "./game-action";
import type { Json } from "./json";
import type { MountainClock } from "./mountain-clock";
import type { Moment, Rule } from "./rule";

/** What can come down on a climber, or give way under them (spec.md → Simulation systems). */
export type HazardKind = "serac" | "avalanche" | "crevasse" | "cornice";

/** The weather as the hazards feel it, which the scenario sets until the weather (#39) does. */
export type HazardWeather = "clear" | "cloud" | "snow" | "wind";

/** How one kind of hazard goes: its numbers, handed in from the knowledge base. */
export interface HazardOdds {
  /** How many times an hour it goes on a climber under it, in the cold of the night. */
  readonly rate: number;
  /** How many times the rate it is at the warmest hour of a sunny day. */
  readonly warmth: number;
  /** How many times the rate it is while snow falls. */
  readonly snow: number;
  /** How many times the rate it is in a strong wind. */
  readonly wind: number;
}

/** The hazards' numbers (docs/conventions.md → Data, not literals). */
export interface HazardSettings {
  readonly kinds: Readonly<Record<HazardKind, HazardOdds>>;
  /** The day's warmth, in hours of the day: it starts to warm the ice `from`, is warmest at
   * `peak`, and is over `until`. */
  readonly warmth: { readonly from: number; readonly peak: number; readonly until: number };
  /** How much of the sun's warmth reaches the ice under cloud, and while snow falls: a share. */
  readonly sun: { readonly cloud: number; readonly snow: number };
}

/** A stretch of the ground under a hazard, in metres along it, both ends in: a type, not an
 * interface, so that saves keep it as plain data. */
export type HazardZone = {
  readonly id: string;
  readonly kind: HazardKind;
  readonly from: number;
  readonly to: number;
};

/** What a scenario sets: the weather, and the zones of its section. */
export interface HazardStart {
  readonly weather: HazardWeather;
  readonly zones: readonly HazardZone[];
}

/** A zone that went: when, on the mountain's clock too, and who was under it. */
export type Strike = {
  readonly zone: string;
  readonly kind: HazardKind;
  readonly step: number;
  /** The mountain's seconds since midnight. */
  readonly timeOfDay: number;
  readonly climbers: readonly ClimberId[];
};

/**
 * The ground as the hazards see it: who's on it, where along it, and a way to knock them off
 * their feet. The slope physics is it in the game; the core can't import the physics, so it
 * knows only this (docs/conventions.md → Modules).
 */
export interface HazardGround {
  /** Every climber on the ground, in the scenario's order. */
  readonly climbers: readonly ClimberId[];
  /** How far along the ground a climber is, in metres: their feet, or their body in a fall. */
  along(climber: ClimberId): number;
  /** Knocks a climber off their feet on this step: a fall, which their rope holds if clipped. */
  knock(climber: ClimberId, step: number): void;
}

/** The hazards' whole state, as saves keep it. */
type HazardSave = {
  readonly weather: HazardWeather;
  readonly zones: readonly HazardZone[];
  readonly strikes: readonly Strike[];
};

/**
 * How often each kind of hazard goes on a climber under it, by the hour and the weather: its rate
 * in the cold of the night, raised by the sun's warmth as the day goes, and by snow and wind.
 * The warmth rises in a line from `from` to `peak` and falls in one to `until`, so it needs
 * nothing but the four operations (docs/conventions/simulation-core.md → The same result).
 */
export class HazardChance {
  private static readonly HOUR = 3600;
  private static readonly WEATHERS: ReadonlySet<string> = new Set([
    "clear",
    "cloud",
    "snow",
    "wind",
  ]);

  constructor(private readonly settings: HazardSettings) {
    const { from, peak, until } = settings.warmth;
    if (!(from < peak && peak < until)) {
      throw new RangeError(
        `The day's warmth can't rise from ${from} h to ${peak} h and end at ${until} h`,
      );
    }
  }

  /** Whether the hazards know a weather. */
  static knows(weather: string): boolean {
    return HazardChance.WEATHERS.has(weather);
  }

  /** How many times an hour `kind` goes on a climber under it, at `timeOfDay` seconds after
   * midnight, in `weather`. */
  perHour(kind: HazardKind, timeOfDay: number, weather: HazardWeather): number {
    const odds = this.settings.kinds[kind];
    const warmed = 1 + (odds.warmth - 1) * this.warmthAt(timeOfDay) * this.sunIn(weather);
    const snow = weather === "snow" ? odds.snow : 1;
    const wind = weather === "wind" ? odds.wind : 1;
    return odds.rate * warmed * snow * wind;
  }

  /** The chance `kind` goes on a climber under it within `seconds` of the mountain's time, at
   * that hour and in that weather. */
  within(seconds: number, kind: HazardKind, timeOfDay: number, weather: HazardWeather): number {
    return (this.perHour(kind, timeOfDay, weather) * seconds) / HazardChance.HOUR;
  }

  /** The day's warmth at a time of day: 0 in the night, 1 at its peak. */
  private warmthAt(timeOfDay: number): number {
    const hour = timeOfDay / HazardChance.HOUR;
    const { from, peak, until } = this.settings.warmth;
    if (hour <= from || hour >= until) {
      return 0;
    }
    return hour < peak ? (hour - from) / (peak - from) : (until - hour) / (until - peak);
  }

  /** How much of the sun's warmth reaches the ice in a weather. */
  private sunIn(weather: HazardWeather): number {
    const { sun } = this.settings;
    return weather === "cloud" ? sun.cloud : weather === "snow" ? sun.snow : 1;
  }
}

/**
 * The objective hazards, as a rule of the core (spec.md → Simulation systems): seracs, avalanches,
 * crevasses and cornices, which can't be beaten, only avoided by spending less time under them.
 * Each step someone is in a zone, it may go, at the `HazardChance` of the mountain's hour and the
 * weather; when it does, it knocks everyone in it off their feet. A zone nobody is in draws
 * nothing, so a quick crossing is a safer one, and a section with no zones draws as before.
 */
export class ObjectiveHazards implements Rule {
  /** Its key in scenarios and saves: never change it once saves exist. */
  static readonly NAME = "objective-hazards";
  private static readonly KINDS: ReadonlySet<string> = new Set([
    "serac",
    "avalanche",
    "crevasse",
    "cornice",
  ]);

  readonly name = ObjectiveHazards.NAME;

  private readonly chance: HazardChance;
  private state: HazardSave | null = null;

  /** `clock` is the expedition's, which runs before this in its rules. */
  constructor(
    settings: HazardSettings,
    private readonly clock: MountainClock,
    private readonly ground: HazardGround,
  ) {
    this.chance = new HazardChance(settings);
  }

  /** A scenario's start state: its weather and zones, with nothing struck yet. */
  static start(start: HazardStart): Json {
    if (!HazardChance.knows(start.weather)) {
      throw new RangeError(`The hazards don't know the weather ${start.weather}`);
    }
    for (const { id, kind, from, to } of start.zones) {
      if (!ObjectiveHazards.KINDS.has(kind)) {
        throw new RangeError(`The zone ${id} is of a hazard the game doesn't know, ${kind}`);
      }
      if (!(from >= 0 && from < to)) {
        throw new RangeError(
          `The zone ${id} has to run forward along the ground, not ${from}–${to} m`,
        );
      }
    }
    const save: HazardSave = { weather: start.weather, zones: start.zones, strikes: [] };
    return save;
  }

  get weather(): HazardWeather {
    return this.loaded.weather;
  }

  get zones(): readonly HazardZone[] {
    return this.loaded.zones;
  }

  /** Every zone that went, in order: for the debrief (#46). */
  get strikes(): readonly Strike[] {
    return this.loaded.strikes;
  }

  load(state: Json): void {
    this.state = state as unknown as HazardSave;
  }

  save(): Json {
    return this.loaded;
  }

  advance(moment: Moment): void {
    const { weather, zones } = this.loaded;
    const { timeOfDay } = this.clock;
    const seconds = this.clock.secondsAStep;
    for (const zone of zones) {
      const under = this.ground.climbers.filter((climber) => {
        const along = this.ground.along(climber);
        return along >= zone.from && along <= zone.to;
      });
      if (under.length === 0) {
        continue;
      }
      if (moment.random.chance(this.chance.within(seconds, zone.kind, timeOfDay, weather))) {
        this.strike(zone, under, moment.step, timeOfDay);
      }
    }
  }

  private strike(
    zone: HazardZone,
    under: readonly ClimberId[],
    step: number,
    timeOfDay: number,
  ): void {
    for (const climber of under) {
      this.ground.knock(climber, step);
    }
    const strike: Strike = { zone: zone.id, kind: zone.kind, step, timeOfDay, climbers: under };
    this.state = { ...this.loaded, strikes: [...this.loaded.strikes, strike] };
  }

  private get loaded(): HazardSave {
    if (this.state === null) {
      throw new RangeError("The hazards have no zones: load a state first");
    }
    return this.state;
  }
}
