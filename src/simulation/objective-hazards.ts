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
  /** How many of the mountain's seconds pass between the first sign of it going, a crack or a
   * roar, and its coming down: whoever gets clear in time is spared. 0 is no warning. */
  readonly warning: number;
  /** The chance it kills outright a climber it catches who isn't clipped to a rope. */
  readonly deadly: number;
  /** The same for one clipped to a rope, which holds them in the fall but not under ice. */
  readonly deadlyClipped: number;
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

/** A zone that's going: it began to on the step `began`, and comes down on the step `comes`. */
export type Warning = {
  readonly zone: string;
  readonly kind: HazardKind;
  readonly began: number;
  readonly comes: number;
};

/** A zone that came down: when, on the mountain's clock too, who was under it then, if anyone,
 * and who of them it killed. */
export type Strike = {
  readonly zone: string;
  readonly kind: HazardKind;
  readonly step: number;
  /** The mountain's seconds since midnight. */
  readonly timeOfDay: number;
  readonly climbers: readonly ClimberId[];
  readonly killed: readonly ClimberId[];
};

/**
 * The ground as the hazards see it: who's on it, where along it, whether they're on a rope, and
 * a way to knock them off their feet or kill them. The slope physics is it in the game; the core
 * can't import the physics, so it knows only this (docs/conventions.md → Modules).
 */
export interface HazardGround {
  /** Every living climber on the ground, in the scenario's order. */
  readonly climbers: readonly ClimberId[];
  /** How far along the ground a climber is, in metres: their feet, or their body in a fall. */
  along(climber: ClimberId): number;
  /** Whether a climber is clipped to a rope. */
  clipped(climber: ClimberId): boolean;
  /** Knocks a climber off their feet on this step: a fall, which their rope holds if clipped. */
  knock(climber: ClimberId, step: number): void;
  /** Kills a climber on this step: they fall, and never get up. */
  kill(climber: ClimberId, step: number): void;
}

/** The hazards' whole state, as saves keep it. */
type HazardSave = {
  readonly weather: HazardWeather;
  readonly zones: readonly HazardZone[];
  readonly warnings: readonly Warning[];
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

  /** The chance `kind` kills a climber it catches, clipped to a rope or not. */
  deadly(kind: HazardKind, clipped: boolean): number {
    const odds = this.settings.kinds[kind];
    return clipped ? odds.deadlyClipped : odds.deadly;
  }

  /** How many steps of `seconds` each `kind` warns for before it comes down: 0 for none. */
  warningSteps(kind: HazardKind, seconds: number): number {
    return Math.ceil(this.settings.kinds[kind].warning / seconds);
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
 * weather. A serac or an avalanche warns first, a crack or a roar, for its kind's `warning`; then
 * it comes down and knocks everyone still in it off their feet, so whoever gets clear is spared,
 * and kills some outright, at its kind's odds for those on a rope and those off it. A snow
 * bridge or a cornice gives way at once. A zone nobody is in draws nothing, so a quick
 * crossing is a safer one, and a section with no zones draws as before.
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
    const save: HazardSave = {
      weather: start.weather,
      zones: start.zones,
      warnings: [],
      strikes: [],
    };
    return save;
  }

  get weather(): HazardWeather {
    return this.loaded.weather;
  }

  get zones(): readonly HazardZone[] {
    return this.loaded.zones;
  }

  /** The zones going now, which haven't come down yet. */
  get warnings(): readonly Warning[] {
    return this.loaded.warnings;
  }

  /** Every zone that came down, in order: for the debrief (#46). */
  get strikes(): readonly Strike[] {
    return this.loaded.strikes;
  }

  /** The kind of hazard going over a point `along` the ground, for the page to warn whoever is
   * there, or none. */
  warningAt(along: number): HazardKind | null {
    const { zones, warnings } = this.loaded;
    const going = zones.find(
      (zone) => ObjectiveHazards.holds(zone, along) && warnings.some((w) => w.zone === zone.id),
    );
    return going?.kind ?? null;
  }

  load(state: Json): void {
    this.state = state as unknown as HazardSave;
  }

  save(): Json {
    return this.loaded;
  }

  advance(moment: Moment): void {
    const { weather, zones } = this.loaded;
    const { timeOfDay, secondsAStep } = this.clock;
    const { step } = moment;
    for (const zone of zones) {
      const warning = this.loaded.warnings.find((going) => going.zone === zone.id);
      if (warning !== undefined) {
        if (step >= warning.comes) {
          this.comeDown(zone, moment, timeOfDay);
        }
        continue;
      }
      if (this.under(zone).length === 0) {
        continue;
      }
      if (moment.random.chance(this.chance.within(secondsAStep, zone.kind, timeOfDay, weather))) {
        const steps = this.chance.warningSteps(zone.kind, secondsAStep);
        if (steps === 0) {
          this.comeDown(zone, moment, timeOfDay);
        } else {
          const going: Warning = {
            zone: zone.id,
            kind: zone.kind,
            began: step,
            comes: step + steps,
          };
          this.state = { ...this.loaded, warnings: [...this.loaded.warnings, going] };
        }
      }
    }
  }

  private static holds(zone: HazardZone, along: number): boolean {
    return along >= zone.from && along <= zone.to;
  }

  /** Who's in a zone now, in the scenario's order. */
  private under(zone: HazardZone): readonly ClimberId[] {
    return this.ground.climbers.filter((climber) =>
      ObjectiveHazards.holds(zone, this.ground.along(climber)),
    );
  }

  /** The zone comes down on whoever is in it now, and stops warning. Each it catches is killed
   * at its odds, drawn only where they aren't nought, or knocked off their feet. */
  private comeDown(zone: HazardZone, moment: Moment, timeOfDay: number): void {
    const { step, random } = moment;
    const under = this.under(zone);
    const killed: ClimberId[] = [];
    for (const climber of under) {
      const deadly = this.chance.deadly(zone.kind, this.ground.clipped(climber));
      if (deadly > 0 && random.chance(deadly)) {
        killed.push(climber);
        this.ground.kill(climber, step);
      } else {
        this.ground.knock(climber, step);
      }
    }
    const strike: Strike = {
      zone: zone.id,
      kind: zone.kind,
      step,
      timeOfDay,
      climbers: under,
      killed,
    };
    const { warnings, strikes } = this.loaded;
    this.state = {
      ...this.loaded,
      warnings: warnings.filter((going) => going.zone !== zone.id),
      strikes: [...strikes, strike],
    };
  }

  private get loaded(): HazardSave {
    if (this.state === null) {
      throw new RangeError("The hazards have no zones: load a state first");
    }
    return this.state;
  }
}
