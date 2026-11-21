import type { ClimberId } from "../game-action";
import type { Json } from "../json";
import type { MountainClock } from "../mountain-clock";
import type { Moment, Rule } from "../rule";
import type { WindChill } from "../wind-chill";
import { BloodOxygen } from "./blood-oxygen";
import type { BodyNumbers } from "./body-numbers";
import { Cold } from "./cold";
import type { ColdNumbers, ColdSave, Exposure, FrostPart } from "./cold";
import { Condition } from "./condition";
import type { BodyStart, BodyView, ConditionSave } from "./condition";
import { PaceEffort } from "./pace-effort";

/** Where a climber is, as the body needs to know it. */
export interface Whereabouts {
  /** Metres above sea level. */
  readonly altitude: number;
  /** Whether they took a step in the last step, on their feet: not stopped, held back or
   * falling. */
  readonly moving: boolean;
  /** The share of their stride's power that step took: all of it where the power holds them
   * back, as up a slope, less where their footing does, and nought still. */
  readonly exertion: number;
  /** Whether they're in a tent, out of the wind (#258), hanging on their rope in a crevasse or
   * under a lip, out of it too, or dead (#272): the slope physics says; a stand-in may not. */
  readonly sheltered?: boolean;
  readonly hanging?: boolean;
  readonly dead?: boolean;
}

/** What moves the climbers, as the body sees it: the slope physics, which sits above the core. */
export interface Legs {
  climber(id: ClimberId): Whereabouts;
  /** Sets how far their strides go from now on, as a share of a fresh climber's at sea level with
   * nothing to carry: 0 stops them. */
  stride(id: ClimberId, share: number): void;
  /** Sets how sure-footed they are from now on, as a share of a fresh climber's at a steady pace
   * (#190). */
  sureness(id: ClimberId, share: number): void;
  /** The cold has killed them on this step (#272): they fall where they are, and never get up.
   * A stand-in with no ground to fall on may not have it. */
  perish?(id: ClimberId, step: number): void;
}

/** The weather outdoors, as the body feels it (#272): the air, in °C, `altitude` metres up now,
 * and the steady wind, in km/h, in the open. The weather is it in the game. */
export interface Outdoors {
  airNow(altitude: number): number;
  windNow(): number;
}

/** What the body feels the cold by (#272): the cold's numbers, the wind chill and the weather. */
export interface ColdSense {
  readonly numbers: ColdNumbers;
  readonly chill: WindChill;
  readonly outdoors: Outdoors;
}

/** A climber's cold as the debrief reads it (#272): their core, in °C, the parts frostbitten,
 * and whether the cold killed them. */
export interface ColdView {
  readonly core: number;
  readonly frostbitten: readonly FrostPart[];
  readonly froze: boolean;
}

/** The supplemental oxygen the climbers breathe: the oxygen system's (#23). */
export interface Breathing {
  /** In L/min: nought on the air alone. */
  flow(id: ClimberId): number;
}

/** The body's whole state, as saves keep it: the cold is missing from the saves of builds before
 * it (#272), whose climbers go on warm. */
type BodySave = {
  /** The mountain's seconds, on its clock, that the body has lived through. */
  readonly seen: number;
  readonly climbers: readonly ConditionSave[];
  readonly colds?: Readonly<Record<ClimberId, ColdSave>>;
};

/**
 * The climbers' bodies, as a rule of the core (docs/conventions/body.md): each step, it lives
 * through the mountain's time since the last, tiring each climber on the move by what their steps
 * take of their power and resting them still, and sets the stride the slope physics walks them at
 * in the same step, so it runs between the mountain's clock and the physics. Their blood oxygen
 * comes from the altitude and the oxygen they breathe. Its numbers are handed to it; each
 * climber's condition is its state, which a scenario starts and a save keeps. The player sees no
 * number of it but the oximeter's.
 */
export class Body implements Rule {
  /** Its key in scenarios and saves: never change it once saves exist. */
  static readonly NAME = "body";
  /** Nobody breathes from a bottle, until the oxygen system (#23). */
  static readonly AIR: Breathing = { flow: () => 0 };
  private static readonly SECONDS_AN_HOUR = 60 * 60;

  readonly name = Body.NAME;

  private readonly oxygen: BloodOxygen;
  private readonly effort: PaceEffort;
  private seen = 0;
  private readonly climbers = new Map<ClimberId, Condition>();
  /** Each climber's cold (#272): none where the body feels no cold, as on the tests' ridge. */
  private readonly colds = new Map<ClimberId, Cold>();
  /** Who sleeps through the time this step lives: said by the tents, before the body runs. */
  private readonly asleep = new Set<ClimberId>();

  /** `cold`, what the body feels the cold by (#272): without it, nobody gets cold. */
  constructor(
    private readonly numbers: BodyNumbers,
    private readonly clock: MountainClock,
    private readonly legs: Legs,
    private readonly breathing: Breathing = Body.AIR,
    private readonly cold: ColdSense | null = null,
  ) {
    this.oxygen = new BloodOxygen(numbers);
    this.effort = new PaceEffort(numbers.paces);
  }

  /** A scenario's start state: each climber as it starts them, at a steady pace. */
  static start(climbers: readonly BodyStart[]): Json {
    const save: BodySave = {
      seen: 0,
      climbers: climbers.map((climber) => Condition.start(climber).save()),
    };
    return save;
  }

  /** How a climber feels, in words, the cold's among them (#272), and what a pulse oximeter on
   * their finger reads. */
  climber(id: ClimberId): BodyView {
    const where = this.legs.climber(id);
    const { altitude, moving } = where;
    const felt = this.oxygen.felt(altitude, this.breathing.flow(id), moving);
    const view = this.conditionOf(id).view(this.numbers, moving, this.oxygen.spo2(felt));
    const { cold } = this;
    if (cold === null) {
      return view;
    }
    const chilled = this.coldOf(id);
    const losing = chilled.losing(this.exposure(where), moving, cold.numbers, cold.chill);
    return { ...view, symptoms: [...view.symptoms, ...chilled.symptoms(cold.numbers, losing)] };
  }

  /** A climber's cold, for the debrief (#272): none where the body feels no cold. */
  chilled(id: ClimberId): ColdView | null {
    this.conditionOf(id);
    const { cold } = this;
    if (cold === null) {
      return null;
    }
    const chilled = this.coldOf(id);
    return {
      core: chilled.temperature,
      frostbitten: chilled.frostbitten,
      froze: chilled.dead(cold.numbers),
    };
  }

  load(state: Json): void {
    const save = state as unknown as BodySave;
    this.seen = save.seen;
    this.climbers.clear();
    this.colds.clear();
    for (const climber of save.climbers) {
      this.climbers.set(climber.id, Condition.load(climber));
    }
    for (const [id, cold] of Object.entries(save.colds ?? {})) {
      this.colds.set(id, Cold.load(cold));
    }
  }

  save(): Json {
    const colds =
      this.cold === null
        ? {}
        : {
            colds: Object.fromEntries(
              [...this.climbers.keys()].map((id) => [id, this.coldOf(id).save()]),
            ),
          };
    const save: BodySave = {
      seen: this.seen,
      climbers: [...this.climbers.values()].map((condition) => condition.save()),
      ...colds,
    };
    return save;
  }

  advance(moment: Moment): void {
    for (const action of moment.actions) {
      if (action.kind === "pace") {
        this.conditionOf(action.climber).choose(action.pace);
      }
    }
    const { elapsed } = this.clock;
    const hours = (elapsed - this.seen) / Body.SECONDS_AN_HOUR;
    this.seen = elapsed;
    for (const [id, condition] of this.climbers) {
      const where = this.legs.climber(id);
      const { altitude, moving, exertion } = where;
      const flow = this.breathing.flow(id);
      const recovers = this.oxygen.felt(altitude, flow, false) <= this.numbers.deathZone;
      const asleep = this.asleep.has(id);
      condition.live(hours, moving, exertion, recovers, this.numbers, this.effort, asleep);
      const capacity = this.oxygen.capacity(this.oxygen.felt(altitude, flow, true));
      const { stride, footing } = this.feelTheCold(id, hours, where, moment.step);
      this.legs.stride(id, condition.stride(this.numbers, capacity) * stride);
      this.legs.sureness(id, condition.sureness(this.numbers) * footing);
    }
    this.asleep.clear();
  }

  /** A climber lives `hours` of the cold where they are (#272): what it leaves of their stride and
   * their footing, as shares. Dead of it, they fall on `step`. Nobody's cold without the cold's
   * sense, or once dead. */
  private feelTheCold(
    id: ClimberId,
    hours: number,
    where: Whereabouts,
    step: number,
  ): { readonly stride: number; readonly footing: number } {
    const { cold } = this;
    if (cold === null || where.dead === true) {
      return { stride: 1, footing: 1 };
    }
    const chilled = this.coldOf(id);
    const alive = !chilled.dead(cold.numbers);
    chilled.live(hours, this.exposure(where), where.moving, cold.numbers, cold.chill);
    if (alive && chilled.dead(cold.numbers)) {
      this.legs.perish?.(id, step);
    }
    return { stride: chilled.stride(cold.numbers), footing: chilled.footing(cold.numbers) };
  }

  /** The cold where a climber is: the air at their altitude, and the wind, but in a tent, or
   * hanging in a crevasse or under a lip, which are out of it. */
  private exposure(where: Whereabouts): Exposure {
    const { cold } = this;
    if (cold === null) {
      return { air: 0, wind: 0, sheltered: false };
    }
    const sheltered = where.sheltered === true;
    const calm = sheltered || where.hanging === true;
    const { outdoors } = cold;
    return { air: outdoors.airNow(where.altitude), wind: calm ? 0 : outdoors.windNow(), sheltered };
  }

  private coldOf(id: ClimberId): Cold {
    const { cold } = this;
    if (cold === null) {
      throw new RangeError("The body feels no cold");
    }
    let chilled = this.colds.get(id);
    if (chilled === undefined) {
      chilled = Cold.warm(cold.numbers);
      this.colds.set(id, chilled);
    }
    return chilled;
  }

  /** What a climber carries from now on, in kilograms; a drink of their water; a bar of their
   * food: their pack's (`Packs`), which runs before the body. */
  carry(id: ClimberId, kilograms: number): void {
    this.conditionOf(id).carry(kilograms);
  }

  drink(id: ClimberId, litres: number): void {
    this.conditionOf(id).drink(litres);
  }

  eat(id: ClimberId, kcal: number): void {
    this.conditionOf(id).eat(kcal);
  }

  /** A climber sleeps through the mountain's time this step lives, a step's or the night the
   * camp skips (#258): the tents', which run before the body. */
  sleep(id: ClimberId): void {
    this.conditionOf(id);
    this.asleep.add(id);
  }

  private conditionOf(id: ClimberId): Condition {
    const condition = this.climbers.get(id);
    if (condition === undefined) {
      throw new RangeError(`${id} has no body on this expedition`);
    }
    return condition;
  }
}
