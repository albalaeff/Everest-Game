import type { ClimberId, GameAction } from "./game-action";
import type { Json } from "./json";
import type { MountainClock } from "./mountain-clock";
import type { Moment, Rule } from "./rule";

export interface OxygenNumbers {
  readonly bottleLitres: number;
  readonly bottlePressure: number;
  readonly bottles: number;
  readonly maximumFlow: number;
}

export interface OxygenView {
  readonly bottles: number;
  readonly flow: number;
  readonly pressure: number;
}

type ClimberSave = {
  readonly id: ClimberId;
  readonly bottles: number;
  readonly remaining: number | null;
  readonly flow: number;
};

type OxygenSave = {
  readonly seen: number;
  readonly climbers: readonly ClimberSave[];
};

interface ClimberState {
  readonly id: ClimberId;
  bottles: number;
  remaining: number;
  flow: number;
}

/** Bottled oxygen: one regulator per climber, with automatic swaps between carried bottles. */
export class OxygenSystem implements Rule {
  static readonly NAME = "oxygen";
  static readonly DEFAULT_BOTTLES = 5;

  readonly name = OxygenSystem.NAME;
  private seen = 0;
  private readonly climbers = new Map<ClimberId, ClimberState>();

  constructor(
    private readonly numbers: OxygenNumbers,
    private readonly clock: MountainClock,
  ) {}

  /** The state a scenario starts the oxygen in: each climber with `bottles`, or as many as
   * `bottles` says each carries, the first of them full on the regulator; none, and there's
   * nothing to breathe. */
  static start(
    climbers: readonly ClimberId[],
    bottles: number | ((id: ClimberId) => number) = OxygenSystem.DEFAULT_BOTTLES,
  ): Json {
    return {
      seen: 0,
      climbers: climbers.map((id) => {
        const carried = typeof bottles === "number" ? bottles : bottles(id);
        if (!(carried >= 0)) {
          throw new RangeError(`${id} can't carry ${carried} bottles of oxygen`);
        }
        return {
          id,
          bottles: Math.max(0, carried - 1),
          remaining: carried > 0 ? null : 0,
          flow: 0,
        };
      }),
    };
  }

  /** Sets how many bottles a climber carries from now on, as their pack changes at a camp
   * (`Packs`): the one on the regulator stays as full as it is, a first one goes on full, and
   * with none left there's nothing to breathe. */
  stock(id: ClimberId, bottles: number): void {
    const climber = this.state(id);
    if (!(bottles >= 0)) {
      throw new RangeError(`${id} can't carry ${bottles} bottles of oxygen`);
    }
    if (bottles === 0) {
      climber.bottles = 0;
      climber.remaining = 0;
      climber.flow = 0;
      return;
    }
    if (climber.remaining <= 0) {
      climber.remaining = this.numbers.bottleLitres;
    }
    climber.bottles = bottles - 1;
  }

  flow(id: ClimberId): number {
    return this.state(id).flow;
  }

  climber(id: ClimberId): OxygenView {
    const state = this.state(id);
    return {
      bottles: state.bottles + (state.remaining > 0 ? 1 : 0),
      flow: state.flow,
      pressure: Math.max(
        0,
        Math.round((state.remaining / this.numbers.bottleLitres) * this.numbers.bottlePressure),
      ),
    };
  }

  load(state: Json): void {
    const save = state as unknown as OxygenSave;
    this.seen = save.seen;
    this.climbers.clear();
    for (const climber of save.climbers) {
      this.climbers.set(climber.id, {
        ...climber,
        remaining: climber.remaining ?? this.numbers.bottleLitres,
      });
    }
  }

  save(): Json {
    const save: OxygenSave = {
      seen: this.seen,
      climbers: [...this.climbers.values()].map((climber) => ({ ...climber })),
    };
    return save;
  }

  advance(moment: Moment): void {
    for (const action of moment.actions) {
      if (action.kind === "oxygen") {
        this.change(action);
      }
    }
    const seconds = this.clock.elapsed - this.seen;
    this.seen = this.clock.elapsed;
    for (const climber of this.climbers.values()) {
      this.consume(climber, seconds);
    }
  }

  private change(action: Extract<GameAction, { kind: "oxygen" }>): void {
    const climber = this.state(action.climber);
    const change = action.change === "up" ? 1 : -1;
    climber.flow = Math.max(0, Math.min(this.numbers.maximumFlow, climber.flow + change));
    if (climber.remaining <= 0) {
      climber.flow = 0;
    }
  }

  private consume(climber: ClimberState, seconds: number): void {
    let litres = (climber.flow * seconds) / 60;
    while (litres > 0 && climber.flow > 0) {
      const used = Math.min(litres, climber.remaining);
      climber.remaining -= used;
      litres -= used;
      if (climber.remaining === 0 && climber.bottles > 0) {
        climber.bottles -= 1;
        climber.remaining = this.numbers.bottleLitres;
      } else if (climber.remaining === 0) {
        climber.flow = 0;
      }
    }
  }

  private state(id: ClimberId): ClimberState {
    const state = this.climbers.get(id);
    if (state === undefined) {
      throw new RangeError(`${id} has no oxygen on this expedition`);
    }
    return state;
  }
}
