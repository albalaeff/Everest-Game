import type { ClimberId, HazardGround, Json, Legs, Moment, Rule } from "../simulation";
import { Climber } from "./climber";
import type { ClimberSave, ClimberView } from "./climber";
import { Ladder } from "./ladder";
import type { LadderLayout } from "./ladder";
import { Rope } from "./rope";
import type { RopeSave } from "./rope";
import type { SectionAltitude } from "./section-scale";
import { Slope } from "./slope";
import type { SlopeSettings } from "./slope";
import { Snow } from "./snow";
import type { SnowLayout } from "./snow";
import { Terrain } from "./terrain";
import type { Pair, Point } from "./terrain";

export type { LadderLayout } from "./ladder";
export type { SlopeSettings } from "./slope";
export type { SnowLayout } from "./snow";

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
  /** Their skill on ladders and fixed ropes: the share of the speed they go at on a ladder or
   * clipped to a rope, 1 unless it says otherwise. */
  readonly technique?: number;
}

/** A section of the route as a scenario starts it: its ground and the snow on it, if any, the
 * real altitude of its ends, its ropes and ladders, and who's on it. */
export interface SlopeLayout {
  readonly terrain: readonly Pair[];
  readonly snow?: SnowLayout;
  readonly altitude: SectionAltitude;
  readonly ropes: readonly RopeLayout[];
  readonly ladders: readonly LadderLayout[];
  readonly climbers: readonly ClimberLayout[];
}

/** The slope physics' whole state, as saves keep it: the ground's line and how the snow lies on
 * it, which lays the same snow again. */
type SlopeSave = {
  readonly terrain: readonly Pair[];
  readonly snow?: SnowLayout;
  readonly altitude: SectionAltitude;
  readonly ropes: readonly RopeSave[];
  readonly ladders: readonly LadderLayout[];
  readonly climbers: readonly ClimberSave[];
};

/**
 * The slope physics, as a rule of the core run inside its step (docs/conventions/slope-physics.md):
 * climbers walk over the ground and cross on ladders, a slip where friction can't hold them
 * becomes a fall, and a fixed rope holds a climber clipped to it, on the carabiner or the jumar.
 * It's the ground the objective hazards look at, and the knocks they give are falls here; a
 * climber they kill falls and lies still.
 * Its numbers are handed to it; the ground, the ropes, the ladders and the climbers are its
 * state, which a scenario starts and a save keeps.
 */
export class SlopePhysics implements Rule, HazardGround, Legs {
  /** Its key in scenarios and saves: never change it once saves exist. */
  static readonly NAME = "slope-physics";

  readonly name = SlopePhysics.NAME;

  private slope: Slope | null = null;
  /** The ground as the save has it, once loaded: its line, and the snow on it. */
  private ground: Pick<SlopeSave, "terrain" | "snow"> = { terrain: [] };
  private readonly onSlope = new Map<ClimberId, Climber>();

  constructor(private readonly settings: SlopeSettings) {}

  /** A scenario's start state for a layout: the snow lying on the ground, the ropes and ladders
   * laid, every climber standing. */
  static start(layout: SlopeLayout): Json {
    const terrain = SlopePhysics.laid(layout);
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
    const ladders = layout.ladders.map(({ id, from, to }) => {
      const end = (along: number) => onTheGround(along, `The ladder ${id}`);
      return new Ladder({ id, from: end(from), to: end(to) }, terrain).save();
    });
    const climbers = layout.climbers.map(({ id, along, technique = 1 }) => {
      if (!(technique > 0)) {
        throw new RangeError(`${id} needs a technique above nought, not ${technique}`);
      }
      return Climber.standing(id, onTheGround(along, id), technique).save();
    });
    const { terrain: line, snow, altitude } = layout;
    const save: SlopeSave = {
      terrain: line,
      ...(snow === undefined ? {} : { snow }),
      altitude,
      ropes,
      ladders,
      climbers,
    };
    return save;
  }

  /** The ground a layout or a save lays: its line, with the snow on it if it has any, level along
   * its ladders. */
  private static laid({
    terrain,
    snow,
    ladders,
  }: Pick<SlopeSave, "terrain" | "snow" | "ladders">): Terrain {
    const line = new Terrain(terrain);
    return snow === undefined ? line : new Snow(line, snow, ladders);
  }

  /** What a climber is doing, for the rendering and the rules above. */
  climber(id: ClimberId): ClimberView {
    return this.climberFor(id).view(this.loaded);
  }

  /** Every living climber on the slope, in the layout's order: the hazards' ground. */
  get climbers(): readonly ClimberId[] {
    return [...this.onSlope.values()].filter((climber) => !climber.dead).map(({ id }) => id);
  }

  /** Whether a climber is clipped to a rope, by either cowstail. */
  clipped(id: ClimberId): boolean {
    return this.climberFor(id).ropes.length > 0;
  }

  /** Sets how far a climber's strides go from now on, as a share of the walking power and the
   * ladder speeds. */
  stride(id: ClimberId, share: number): void {
    this.climberFor(id).setStride(share);
  }

  /** How far along the ground a climber is: their feet, or the ground nearest their body. */
  along(id: ClimberId): number {
    return this.climberFor(id).alongNow(this.loaded);
  }

  /** Knocks a climber off their feet, down the slope, on `step`: what a hazard does when it goes.
   * A clipped climber's rope holds them, as in any fall; one already falling falls on. */
  knock(id: ClimberId, step: number): void {
    this.climberFor(id).knock(this.loaded, step);
  }

  /** Kills a climber on `step`: knocked down as by `knock`, they lie where they come to rest
   * and take no more actions. */
  kill(id: ClimberId, step: number): void {
    this.climberFor(id).kill(this.loaded, step);
  }

  /** Where a rope lies: its anchors and every point between. */
  rope(id: string): readonly Point[] {
    return this.loaded.rope(id).shape;
  }

  /** Where a ladder lies: its two ends. */
  ladder(id: string): readonly Point[] {
    return this.loaded.ladder(id).shape;
  }

  /** The ropes on the slope, in the layout's order, for the rendering to draw. */
  get ropes(): readonly string[] {
    return [...this.loaded.ropes.keys()];
  }

  /** The ladders on the slope, in the layout's order. */
  get ladders(): readonly string[] {
    return [...this.loaded.ladders.keys()];
  }

  get terrain(): Terrain {
    return this.loaded.terrain;
  }

  load(state: Json): void {
    const save = state as unknown as SlopeSave;
    const terrain = SlopePhysics.laid(save);
    const ropes = save.ropes.map((rope) => [rope.id, Rope.load(rope)] as const);
    const ladders = save.ladders.map((ladder) => [ladder.id, new Ladder(ladder, terrain)] as const);
    const slope = new Slope(
      this.settings,
      terrain,
      save.altitude,
      new Map(ropes),
      new Map(ladders),
    );
    this.slope = slope;
    this.ground = {
      terrain: save.terrain,
      ...(save.snow === undefined ? {} : { snow: save.snow }),
    };
    this.onSlope.clear();
    for (const climber of save.climbers) {
      this.onSlope.set(climber.id, Climber.load(climber, slope));
    }
  }

  save(): Json {
    const { scale, ropes, ladders } = this.loaded;
    const save: SlopeSave = {
      ...this.ground,
      altitude: scale.altitude,
      ropes: [...ropes.values()].map((rope) => rope.save()),
      ladders: [...ladders.values()].map((ladder) => ladder.save()),
      climbers: [...this.onSlope.values()].map((climber) => climber.save()),
    };
    return save;
  }

  advance(moment: Moment): void {
    const slope = this.loaded;
    for (const action of moment.actions) {
      this.climberFor(action.climber).hear(action, slope);
    }
    slope.advance([...this.onSlope.values()], moment);
  }

  private get loaded(): Slope {
    if (this.slope === null) {
      throw new RangeError("The slope physics has no slope: load a state first");
    }
    return this.slope;
  }

  private climberFor(id: ClimberId): Climber {
    const climber = this.onSlope.get(id);
    if (climber === undefined) {
      throw new RangeError(`${id} isn't on the slope`);
    }
    return climber;
  }
}
