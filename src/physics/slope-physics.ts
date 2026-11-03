import type { ClimberId, Json, Moment, Rule } from "../simulation";
import { Climber } from "./climber";
import type { ClimberSave, ClimberView } from "./climber";
import { Rope } from "./rope";
import type { RopeSave } from "./rope";
import { Slope } from "./slope";
import type { SlopeSettings } from "./slope";
import { Terrain } from "./terrain";
import type { Pair, Point } from "./terrain";

export type { SlopeSettings } from "./slope";

/** A rope as a level lays it: its anchors on the ground, by how far along it they are. */
export interface RopeLayout {
  readonly id: string;
  readonly from: number;
  readonly to: number;
  /** In metres: at least the way between its anchors, and the rest is slack. */
  readonly length: number;
}

/** A climber as a level starts them: standing somewhere along the ground. */
export interface ClimberLayout {
  readonly id: ClimberId;
  readonly along: number;
}

/** A section of the route as a scenario starts it: its ground, its ropes and who's on it. */
export interface SlopeLayout {
  readonly terrain: readonly Pair[];
  readonly ropes: readonly RopeLayout[];
  readonly climbers: readonly ClimberLayout[];
}

/** The slope physics' whole state, as saves keep it. */
type SlopeSave = {
  readonly terrain: readonly Pair[];
  readonly ropes: readonly RopeSave[];
  readonly climbers: readonly ClimberSave[];
};

/**
 * The slope physics, as a rule of the core run inside its step (docs/conventions/slope-physics.md):
 * climbers walk over the ground, a slip where friction can't hold them becomes a fall, and a
 * fixed rope holds a climber clipped to it. Its numbers are handed to it; the ground, the ropes
 * and the climbers are its state, which a scenario starts and a save keeps.
 */
export class SlopePhysics implements Rule {
  /** Its key in scenarios and saves: never change it once saves exist. */
  static readonly NAME = "slope-physics";

  readonly name = SlopePhysics.NAME;

  private slope: Slope | null = null;
  private readonly climbers = new Map<ClimberId, Climber>();

  constructor(private readonly settings: SlopeSettings) {}

  /** A scenario's start state for a layout: the ropes laid, every climber standing. */
  static start(layout: SlopeLayout): Json {
    const terrain = new Terrain(layout.terrain);
    const onTheGround = (along: number, what: string): number => {
      if (!(along >= 0 && along <= terrain.length)) {
        throw new RangeError(`${what} is off the ground, at ${along} m along it`);
      }
      return along;
    };
    const ropes = layout.ropes.map(({ id, from, to, length }) => {
      const anchor = (along: number) => terrain.point(onTheGround(along, `The rope ${id}`));
      return Rope.laid(id, anchor(from), anchor(to), length, terrain).save();
    });
    const climbers = layout.climbers.map(({ id, along }) =>
      Climber.standing(id, onTheGround(along, id)).save(),
    );
    const save: SlopeSave = { terrain: layout.terrain, ropes, climbers };
    return save;
  }

  /** What a climber is doing, for the rendering and the rules above. */
  climber(id: ClimberId): ClimberView {
    return this.climberFor(id).view(this.loaded);
  }

  /** Where a rope lies: its anchors and every point between. */
  rope(id: string): readonly Point[] {
    return this.loaded.rope(id).shape;
  }

  get terrain(): Terrain {
    return this.loaded.terrain;
  }

  load(state: Json): void {
    const save = state as unknown as SlopeSave;
    const ropes = save.ropes.map((rope) => [rope.id, Rope.load(rope)] as const);
    const slope = new Slope(this.settings, new Terrain(save.terrain), new Map(ropes));
    this.slope = slope;
    this.climbers.clear();
    for (const climber of save.climbers) {
      this.climbers.set(climber.id, Climber.load(climber, slope));
    }
  }

  save(): Json {
    const { terrain, ropes } = this.loaded;
    const save: SlopeSave = {
      terrain: terrain.points,
      ropes: [...ropes.values()].map((rope) => rope.save()),
      climbers: [...this.climbers.values()].map((climber) => climber.save()),
    };
    return save;
  }

  advance(moment: Moment): void {
    const slope = this.loaded;
    for (const action of moment.actions) {
      this.climberFor(action.climber).hear(action, slope);
    }
    slope.advance([...this.climbers.values()], moment);
  }

  private get loaded(): Slope {
    if (this.slope === null) {
      throw new RangeError("The slope physics has no slope: load a state first");
    }
    return this.slope;
  }

  private climberFor(id: ClimberId): Climber {
    const climber = this.climbers.get(id);
    if (climber === undefined) {
      throw new RangeError(`${id} isn't on the slope`);
    }
    return climber;
  }
}
