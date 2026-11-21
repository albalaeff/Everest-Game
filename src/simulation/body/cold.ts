import type { ChillReading, WindChill } from "../wind-chill";

/** The parts of a climber the cold freezes first (#272): the face, which a hood, goggles and a
 * buff leave partly bare, and the fingers, in mittens that come off to clip in. */
export const FROST_PARTS = ["face", "fingers"] as const;
export type FrostPart = (typeof FROST_PARTS)[number];

/** The cold's numbers, from the knowledge base (cold.*, #272). */
export interface ColdNumbers {
  /** The core temperature a body keeps, in °C. */
  readonly normal: number;
  /** Where hypothermia's stages begin, in °C of the core: mild, moderate and severe, and the
   * profound cold a body dies in. */
  readonly stages: {
    readonly mild: number;
    readonly moderate: number;
    readonly severe: number;
    readonly death: number;
  };
  /** The coldest wind chill, in °C, a climber dressed for the mountain keeps their heat in: at
   * rest, and on the move, working. */
  readonly holds: { readonly resting: number; readonly moving: number };
  /** How fast their core cools, in °C an hour, for each degree of wind chill colder than they
   * hold their heat in. */
  readonly cooling: number;
  /** How fast it warms again, in °C an hour: by shivering, out of the cold, while the body can
   * still rewarm itself, above moderate hypothermia; and in a tent, from the stove and the bag. */
  readonly rewarming: { readonly shivering: number; readonly sheltered: number };
  /** How many degrees warmer a tent's air is than the air outside, out of the wind. */
  readonly tent: number;
  /** How many times slower than bare skin each part freezes, covered as climbers cover it. */
  readonly covers: Readonly<Record<FrostPart, number>>;
  /** A part's frost, in the times bare skin takes to freeze in the chill: numb from, frostnip
   * from, frostbite from. Frostbite stays; numbness and frostnip thaw out of the freezing chill. */
  readonly frost: { readonly numb: number; readonly nip: number; readonly bite: number };
  /** The hours a part frostnipped takes to thaw out of the freezing chill. */
  readonly thaw: number;
  /** How sure-footed, and how fast, a mildly hypothermic climber still is: shares. */
  readonly clumsy: { readonly footing: number; readonly stride: number };
}

/** The cold where a climber is, as their body feels it: the air, in °C, the wind, in km/h, and
 * whether they're in a tent, out of it. */
export interface Exposure {
  readonly air: number;
  readonly wind: number;
  readonly sheltered: boolean;
}

/** A climber's cold, as saves keep it: their core, each part's frost, and the parts frostbitten. */
export type ColdSave = {
  readonly core: number;
  readonly frost: Readonly<Record<FrostPart, number>>;
  readonly bitten: readonly FrostPart[];
};

/** How cold a climber is, in words: as they feel it, never a number (spec.md → Simulation
 * systems). Losing heat is `cold`; then hypothermia's stages; and the frost on each part. */
export type ColdSymptom =
  | "cold"
  | "shivering"
  | "confused"
  | "unconscious"
  | "numb-fingers"
  | "numb-face"
  | "frostnip"
  | "frostbite";

/**
 * One climber's body in the cold (#272): their core temperature and the frost on their face and
 * fingers. Colder than they hold their heat in, their core cools in proportion to how much
 * colder, faster at rest than on the move, who make heat (cold.exercise-prevents-hypothermia);
 * out of it, they shiver warm again while they still can, above moderate hypothermia
 * (cold.shivering-rewarming, cold.below-moderate-needs-heat), and a tent's stove and bag warm
 * them from any cold (cold.safe-rewarming). Mild hypothermia makes them clumsy and slow, moderate
 * stops them, severe takes their consciousness, and profound kills (cold.hypothermia-*). Skin
 * freezes by Canada's times for the wind chill (cold.freeze-time-*), slower covered, in freezing
 * air only (cold.frostbite-needs-freezing-air): numb, then frostnip, which thaws, then frostbite,
 * which stays.
 */
export class Cold {
  private constructor(
    private core: number,
    private readonly frost: Record<FrostPart, number>,
    private readonly bitten: Set<FrostPart>,
  ) {}

  /** A climber warm and unfrozen, as a scenario starts them. */
  static warm(numbers: ColdNumbers): Cold {
    return new Cold(numbers.normal, { face: 0, fingers: 0 }, new Set());
  }

  static load(save: ColdSave): Cold {
    return new Cold(save.core, { ...save.frost }, new Set(save.bitten));
  }

  save(): ColdSave {
    return {
      core: this.core,
      frost: { ...this.frost },
      bitten: FROST_PARTS.filter((part) => this.bitten.has(part)),
    };
  }

  /** Lives through `hours` of the mountain's time in `exposure`, on the move or not. */
  live(
    hours: number,
    exposure: Exposure,
    moving: boolean,
    numbers: ColdNumbers,
    chill: WindChill,
  ): void {
    if (this.dead(numbers)) {
      return;
    }
    const felt = this.felt(exposure, numbers, chill);
    const holds = moving ? numbers.holds.moving : numbers.holds.resting;
    if (exposure.sheltered) {
      this.core = Math.min(numbers.normal, this.core + numbers.rewarming.sheltered * hours);
    } else if (felt.chill < holds) {
      this.core -= numbers.cooling * (holds - felt.chill) * hours;
    } else if (this.core >= numbers.stages.moderate) {
      this.core = Math.min(numbers.normal, this.core + numbers.rewarming.shivering * hours);
    }
    const freezes = exposure.sheltered || exposure.air >= 0 ? null : felt.freezes;
    for (const part of FROST_PARTS) {
      this.freeze(part, hours, freezes, numbers);
    }
  }

  /** Whether the cold has killed them: their core down to profound hypothermia's death. */
  dead(numbers: ColdNumbers): boolean {
    return this.core <= numbers.stages.death;
  }

  /** Whether they can go on at all: not below moderate hypothermia. */
  stopped(numbers: ColdNumbers): boolean {
    return this.core < numbers.stages.moderate;
  }

  /** Their stride and their footing as the cold leaves them: clumsy and slower in mild
   * hypothermia, as shares; nought once it stops them. */
  stride(numbers: ColdNumbers): number {
    return this.stopped(numbers) ? 0 : this.mild(numbers) ? numbers.clumsy.stride : 1;
  }

  footing(numbers: ColdNumbers): number {
    return this.mild(numbers) ? numbers.clumsy.footing : 1;
  }

  /** How the cold feels, in the order of `ColdSymptom`: `losing`, whether they're losing heat
   * where they are now. */
  symptoms(numbers: ColdNumbers, losing: boolean): readonly ColdSymptom[] {
    const { core, frost, bitten } = this;
    const { stages } = numbers;
    const numb = (part: FrostPart) =>
      !bitten.has(part) && frost[part] >= numbers.frost.numb && frost[part] < numbers.frost.nip;
    const nipped = FROST_PARTS.some(
      (part) => !bitten.has(part) && frost[part] >= numbers.frost.nip,
    );
    const felt: readonly (readonly [ColdSymptom, boolean])[] = [
      ["cold", core >= stages.mild && (losing || core < numbers.normal - 1)],
      ["shivering", core < stages.mild && core >= stages.moderate],
      ["confused", core < stages.moderate && core >= stages.severe],
      ["unconscious", core < stages.severe],
      ["numb-fingers", numb("fingers")],
      ["numb-face", numb("face")],
      ["frostnip", nipped],
      ["frostbite", bitten.size > 0],
    ];
    return felt.filter(([, feels]) => feels).map(([symptom]) => symptom);
  }

  /** Whether they're losing heat in `exposure`, on the move or not: colder than they hold. */
  losing(exposure: Exposure, moving: boolean, numbers: ColdNumbers, chill: WindChill): boolean {
    const holds = moving ? numbers.holds.moving : numbers.holds.resting;
    return !exposure.sheltered && this.felt(exposure, numbers, chill).chill < holds;
  }

  /** The parts frostbitten, which stay so: for the debrief. */
  get frostbitten(): readonly FrostPart[] {
    return FROST_PARTS.filter((part) => this.bitten.has(part));
  }

  /** Their core temperature, in °C: never shown (spec.md → Simulation systems), but the debrief
   * and the tests read it. */
  get temperature(): number {
    return this.core;
  }

  private mild(numbers: ColdNumbers): boolean {
    return this.core < numbers.stages.mild;
  }

  /** The wind chill on them: the wind's in the open, the tent's warmer, still air inside it. */
  private felt(exposure: Exposure, numbers: ColdNumbers, chill: WindChill): ChillReading {
    return exposure.sheltered
      ? chill.of(exposure.air + numbers.tent, 0)
      : chill.of(exposure.air, exposure.wind);
  }

  /** A part's frost over `hours`: it grows by the share of the time bare skin takes to freeze
   * that passed, slower as it's covered, while the chill freezes; it thaws back otherwise, but
   * frostbite stays. */
  private freeze(
    part: FrostPart,
    hours: number,
    freezes: ChillReading["freezes"],
    numbers: ColdNumbers,
  ): void {
    const { frost } = numbers;
    if (freezes !== null) {
      const minutes = (freezes.min + freezes.max) / 2;
      this.frost[part] += (hours * 60) / minutes / numbers.covers[part];
    } else {
      const floor = this.bitten.has(part) ? frost.bite : 0;
      this.frost[part] = Math.max(floor, this.frost[part] - (frost.nip * hours) / numbers.thaw);
    }
    if (this.frost[part] >= frost.bite) {
      this.bitten.add(part);
    }
  }
}
