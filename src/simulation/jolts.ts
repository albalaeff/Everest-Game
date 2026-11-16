import { DayWarmth } from "./day-warmth";
import type { SunShares, WarmthHours } from "./day-warmth";
import type { ClimberId } from "./game-action";
import type { Json } from "./json";
import type { MountainClock } from "./mountain-clock";
import type { HazardWeather } from "./objective-hazards";
import { HazardChance } from "./objective-hazards";
import type { Moment, Rule } from "./rule";

/** What jolts a climber off balance, which they can't prevent but can see coming (#197): a gust
 * of wind across the slope, and a lashed ladder twisting under whoever is on it. */
export type JoltKind = "gust" | "twist";

/** How one kind of jolt goes: its numbers, handed in from the knowledge base. */
export interface JoltOdds {
  /** How many times an hour it comes on a stretch with someone on it, in the cold of the night. */
  readonly rate: number;
  /** How many times the rate it is at the warmest hour of a sunny day, while snow falls, and in
   * a strong wind. */
  readonly warmth: number;
  readonly snow: number;
  readonly wind: number;
  /** How many of the mountain's seconds pass between its first sign, the snow streaming or the
   * creak and first sway, and its coming. */
  readonly warning: number;
  /** The chance it slips a climber on the move where a slip can happen, at a sure-footedness of
   * 1: less one braced standing still, and nought where nothing slips (`JoltGround.unsteadiness`). */
  readonly slip: number;
}

/** The jolts' numbers (docs/conventions.md → Data, not literals): each kind's, and the day's
 * warmth, which they share with the hazards. */
export interface JoltSettings {
  readonly kinds: Readonly<Record<JoltKind, JoltOdds>>;
  readonly warmth: WarmthHours;
  readonly sun: SunShares;
}

/** A stretch of the ground a jolt comes on, in metres along it, both ends in: the open slope a gust
 * blows over, or a lashed ladder's, from end to end, which twists under whoever is on it. A type,
 * not an interface, so that saves keep it as plain data. */
export type JoltZone = {
  readonly id: string;
  readonly kind: JoltKind;
  readonly from: number;
  readonly to: number;
};

/** What a scenario sets: the weather, and the stretches jolts come on. */
export interface JoltStart {
  readonly weather: HazardWeather;
  readonly zones: readonly JoltZone[];
}

/** A zone's jolt on its way: its first sign came on the step `began`, and it comes on `comes`. */
export type JoltWarning = {
  readonly zone: string;
  readonly kind: JoltKind;
  readonly began: number;
  readonly comes: number;
};

/** A jolt that came: when, on the mountain's clock too, whom it caught, and whom of them it slipped. */
export type Jolt = {
  readonly zone: string;
  readonly kind: JoltKind;
  readonly step: number;
  /** The mountain's seconds since midnight. */
  readonly timeOfDay: number;
  readonly caught: readonly ClimberId[];
  readonly slipped: readonly ClimberId[];
};

/**
 * The ground as the jolts see it: who's on it, where, whether they stand on a ladder, how a jolt
 * would unbalance them, and a way to slip them. The slope physics is it in the game; the core can't
 * import the physics, so it knows only this (docs/conventions.md → Modules).
 */
export interface JoltGround {
  /** Every living climber on the ground, in the scenario's order. */
  readonly climbers: readonly ClimberId[];
  /** How far along the ground a climber is, in metres. */
  along(climber: ClimberId): number;
  /** Whether a climber stands on a ladder. */
  onALadder(climber: ClimberId): boolean;
  /** The share of a jolt's chance that slips a climber now: nought where nothing slips. */
  unsteadiness(climber: ClimberId): number;
  /** Slips a climber on this step, from where they stand: their rope holds them if clipped. */
  upset(climber: ClimberId, step: number): void;
}

/** The jolts' whole state, as saves keep it. */
type JoltSave = {
  readonly weather: HazardWeather;
  readonly zones: readonly JoltZone[];
  readonly warnings: readonly JoltWarning[];
  readonly jolts: readonly Jolt[];
};

/**
 * The jolts, as a rule of the core (#197): what a climber can't prevent but can read, so that
 * standing still isn't a sure refuge and a rope at every changeover is. Each step someone is in a
 * zone, a gust anywhere on it, a twist on its ladder, a jolt may come, at its rate raised by the
 * sun's warmth (`DayWarmth`: the morning's thermals, the anchors loosening as the ice softens) and
 * by snow and wind. Its first sign comes its `warning` first, long enough to stop and brace; then
 * each climber it catches slips at its chance, as unsteady as they are where they stand. A zone
 * nobody is in draws nothing, so the quicker crossing is jolted less, and a section with no zones
 * draws as before.
 */
export class Jolts implements Rule {
  /** Its key in scenarios and saves: never change it once saves exist. */
  static readonly NAME = "jolts";
  private static readonly HOUR = 3600;
  private static readonly KINDS: ReadonlySet<string> = new Set(["gust", "twist"]);

  readonly name = Jolts.NAME;

  private readonly warmth: DayWarmth;
  private state: JoltSave | null = null;

  /** `clock` is the expedition's, which runs before this in its rules. */
  constructor(
    private readonly settings: JoltSettings,
    private readonly clock: MountainClock,
    private readonly ground: JoltGround,
  ) {
    this.warmth = new DayWarmth(settings.warmth, settings.sun);
  }

  /** A scenario's start state: its weather and zones, with nothing on its way yet. */
  static start(start: JoltStart): Json {
    if (!HazardChance.knows(start.weather)) {
      throw new RangeError(`The jolts don't know the weather ${start.weather}`);
    }
    for (const { id, kind, from, to } of start.zones) {
      if (!Jolts.KINDS.has(kind)) {
        throw new RangeError(`The zone ${id} is of a jolt the game doesn't know, ${kind}`);
      }
      if (!(from >= 0 && from < to)) {
        throw new RangeError(
          `The zone ${id} has to run forward along the ground, not ${from}–${to} m`,
        );
      }
    }
    const save: JoltSave = { weather: start.weather, zones: start.zones, warnings: [], jolts: [] };
    return save;
  }

  get zones(): readonly JoltZone[] {
    return this.loaded.zones;
  }

  /**
   * Brings a jolt of `kind` on its way to `climber` between steps, over the stretch of that kind
   * they're on, a gust's or a lashed ladder's, as if the chance had on `step`: it warns its
   * `warning` first, and comes on whoever it catches then. The god mode's (#245), never a rule's.
   * None where no such stretch is under them, or one is on its way there already: whether it came.
   */
  bring(kind: JoltKind, climber: ClimberId, step: number): boolean {
    const { zones, warnings } = this.loaded;
    const along = this.ground.along(climber);
    const zone = zones.find((each) => each.kind === kind && along >= each.from && along <= each.to);
    if (zone === undefined || warnings.some((coming) => coming.zone === zone.id)) {
      return false;
    }
    const steps = Math.ceil(this.settings.kinds[kind].warning / this.clock.secondsAStep);
    const coming: JoltWarning = { zone: zone.id, kind, began: step, comes: step + steps };
    this.state = { ...this.loaded, warnings: [...warnings, coming] };
    return true;
  }

  /** Changes the weather between steps, as a scenario sets it: the god mode's (#245). */
  changeWeather(weather: HazardWeather): void {
    if (!HazardChance.knows(weather)) {
      throw new RangeError(`The jolts don't know the weather ${weather}`);
    }
    this.state = { ...this.loaded, weather };
  }

  /** The jolts on their way now, which haven't come yet. */
  get warnings(): readonly JoltWarning[] {
    return this.loaded.warnings;
  }

  /** Every jolt that came, in order. */
  get jolts(): readonly Jolt[] {
    return this.loaded.jolts;
  }

  /** The kind of jolt on its way to a climber, for the page to warn them: a gust coming over the
   * stretch they're on, or a twist on the ladder they stand on; or none. */
  comingTo(climber: ClimberId): JoltKind | null {
    const { zones, warnings } = this.loaded;
    const zone = zones.find(
      (each) => warnings.some((warning) => warning.zone === each.id) && this.catches(each, climber),
    );
    return zone?.kind ?? null;
  }

  /** How many times an hour `kind` comes on a stretch with someone on it, at `timeOfDay` seconds
   * after midnight, in `weather`. */
  perHour(kind: JoltKind, timeOfDay: number, weather: HazardWeather): number {
    const odds = this.settings.kinds[kind];
    const warmed = 1 + (odds.warmth - 1) * this.warmth.at(timeOfDay, weather);
    const snow = weather === "snow" ? odds.snow : 1;
    const wind = weather === "wind" ? odds.wind : 1;
    return odds.rate * warmed * snow * wind;
  }

  load(state: Json): void {
    this.state = state as unknown as JoltSave;
  }

  save(): Json {
    return this.loaded;
  }

  advance(moment: Moment): void {
    const { weather, zones } = this.loaded;
    const { timeOfDay, secondsAStep } = this.clock;
    const { step, random } = moment;
    for (const zone of zones) {
      const warning = this.loaded.warnings.find((coming) => coming.zone === zone.id);
      if (warning !== undefined) {
        if (step >= warning.comes) {
          this.come(zone, moment, timeOfDay);
        }
        continue;
      }
      if (this.caught(zone).length === 0) {
        continue;
      }
      const chance = (this.perHour(zone.kind, timeOfDay, weather) * secondsAStep) / Jolts.HOUR;
      if (random.chance(chance)) {
        const steps = Math.ceil(this.settings.kinds[zone.kind].warning / secondsAStep);
        if (steps === 0) {
          this.come(zone, moment, timeOfDay);
        } else {
          const coming: JoltWarning = {
            zone: zone.id,
            kind: zone.kind,
            began: step,
            comes: step + steps,
          };
          this.state = { ...this.loaded, warnings: [...this.loaded.warnings, coming] };
        }
      }
    }
  }

  /** The jolt comes on whoever it catches now, and stops warning: each slips at its chance, as
   * unsteady as they are, drawn only where that isn't nought. */
  private come(zone: JoltZone, moment: Moment, timeOfDay: number): void {
    const { step, random } = moment;
    const caught = this.caught(zone);
    const slipped: ClimberId[] = [];
    const { slip } = this.settings.kinds[zone.kind];
    for (const climber of caught) {
      const chance = slip * this.ground.unsteadiness(climber);
      if (chance > 0 && random.chance(Math.min(1, chance))) {
        slipped.push(climber);
        this.ground.upset(climber, step);
      }
    }
    const jolt: Jolt = { zone: zone.id, kind: zone.kind, step, timeOfDay, caught, slipped };
    const { warnings, jolts } = this.loaded;
    this.state = {
      ...this.loaded,
      warnings: warnings.filter((coming) => coming.zone !== zone.id),
      jolts: [...jolts, jolt],
    };
  }

  /** Who a zone's jolt catches now, in the scenario's order: anyone on a gust's stretch, and
   * whoever stands on the ladder a twist is on. */
  private caught(zone: JoltZone): readonly ClimberId[] {
    return this.ground.climbers.filter((climber) => this.catches(zone, climber));
  }

  private catches(zone: JoltZone, climber: ClimberId): boolean {
    const along = this.ground.along(climber);
    const on = along >= zone.from && along <= zone.to;
    return on && (zone.kind === "gust" || this.ground.onALadder(climber));
  }

  private get loaded(): JoltSave {
    if (this.state === null) {
      throw new RangeError("The jolts have no zones: load a state first");
    }
    return this.state;
  }
}
