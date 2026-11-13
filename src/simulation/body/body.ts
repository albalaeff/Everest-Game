import type { ClimberId } from "../game-action";
import type { Json } from "../json";
import type { MountainClock } from "../mountain-clock";
import type { Moment, Rule } from "../rule";
import { BloodOxygen } from "./blood-oxygen";
import type { BodyNumbers } from "./body-numbers";
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
}

/** The supplemental oxygen the climbers breathe: the oxygen system's (#23). */
export interface Breathing {
  /** In L/min: nought on the air alone. */
  flow(id: ClimberId): number;
}

/** The body's whole state, as saves keep it. */
type BodySave = {
  /** The mountain's seconds, on its clock, that the body has lived through. */
  readonly seen: number;
  readonly climbers: readonly ConditionSave[];
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

  constructor(
    private readonly numbers: BodyNumbers,
    private readonly clock: MountainClock,
    private readonly legs: Legs,
    private readonly breathing: Breathing = Body.AIR,
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

  /** How a climber feels, in words, and what a pulse oximeter on their finger reads. */
  climber(id: ClimberId): BodyView {
    const { altitude, moving } = this.legs.climber(id);
    const felt = this.oxygen.felt(altitude, this.breathing.flow(id), moving);
    return this.conditionOf(id).view(this.numbers, moving, this.oxygen.spo2(felt));
  }

  load(state: Json): void {
    const save = state as unknown as BodySave;
    this.seen = save.seen;
    this.climbers.clear();
    for (const climber of save.climbers) {
      this.climbers.set(climber.id, Condition.load(climber));
    }
  }

  save(): Json {
    const save: BodySave = {
      seen: this.seen,
      climbers: [...this.climbers.values()].map((condition) => condition.save()),
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
      const { altitude, moving, exertion } = this.legs.climber(id);
      const flow = this.breathing.flow(id);
      const recovers = this.oxygen.felt(altitude, flow, false) <= this.numbers.deathZone;
      condition.live(hours, moving, exertion, recovers, this.numbers, this.effort);
      const capacity = this.oxygen.capacity(this.oxygen.felt(altitude, flow, true));
      this.legs.stride(id, condition.stride(this.numbers, capacity));
      this.legs.sureness(id, condition.sureness(this.numbers));
    }
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

  private conditionOf(id: ClimberId): Condition {
    const condition = this.climbers.get(id);
    if (condition === undefined) {
      throw new RangeError(`${id} has no body on this expedition`);
    }
    return condition;
  }
}
