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

  static start(climbers: readonly ClimberId[], bottles = OxygenSystem.DEFAULT_BOTTLES): Json {
    return {
      seen: 0,
      climbers: climbers.map((id) => ({
        id,
        bottles: bottles - 1,
        remaining: null,
        flow: 0,
      })),
    };
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
