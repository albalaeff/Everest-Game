import type { ClimberId, HazardGround, JoltGround, Json, Legs, Moment, Rule } from "../simulation";
import { Climber } from "./climber";
import type { ClimberSave, ClimberView, Gear, Kit } from "./climber";
import { Ladder } from "./ladder";
import type { LadderCondition, LadderLayout } from "./ladder";
import { Rope } from "./rope";
import type { RopeSave } from "./rope";
import type { SectionAltitude } from "./section-scale";
import { Slope } from "./slope";
import type { AlongStretch, SlopeSettings } from "./slope";
import { Snow } from "./snow";
import type { SnowLayout } from "./snow";
import { Terrain } from "./terrain";
import type { Pair, Point } from "./terrain";

export type { LadderCondition, LadderLayout } from "./ladder";
export type { AlongStretch, FootingSettings, IceClimbSettings, SlopeSettings } from "./slope";
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
  /** Their skill in crampons, on ladders and on fixed ropes: the share of the speed they go at on
   * the ground, a ladder or the ice, and of the typical client's pace at a clip (#197), 1 unless
   * it says otherwise. */
  readonly technique?: number;
  /** What they checked of their kit before setting off (#196): all of it unless it says
   * otherwise. */
  readonly kit?: Kit;
  /** What they carry of the gear the slope's techniques need: the jumar and the ice axe unless
   * it says otherwise. */
  readonly gear?: Gear;
}

/** A section of the route as a scenario starts it: its ground and the snow on it, if any, the
 * stretches of it that are bare blue ice (#190), the stretches of its faces whose ice is brittle,
 * the real altitude of its ends, its ropes and ladders, and who's on it. */
export interface SlopeLayout {
  readonly terrain: readonly Pair[];
  readonly snow?: SnowLayout;
  readonly ice?: readonly AlongStretch[];
  readonly brittle?: readonly AlongStretch[];
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
  readonly ice?: readonly AlongStretch[];
  readonly brittle?: readonly AlongStretch[];
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
export class SlopePhysics implements Rule, HazardGround, JoltGround, Legs {
  /** Its key in scenarios and saves: never change it once saves exist. */
  static readonly NAME = "slope-physics";

  /** How near a face's foot a climber stands to be at it, in metres: the engine's number. */
  private static readonly AT_FACE = 0.3;
  /** How near a face's lip a climber stands to be at it, in metres along the ground. */
  private static readonly AT_LIP = 0.6;

  readonly name = SlopePhysics.NAME;

  private slope: Slope | null = null;
  /** The ground as the save has it, once loaded: its line, the snow on it, and its ice. */
  private ground: Pick<SlopeSave, "terrain" | "snow" | "ice" | "brittle"> = { terrain: [] };
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
    const ladders = layout.ladders.map(({ id, from, to, breaks, trainees }) => {
      const end = (along: number) => onTheGround(along, `The ladder ${id}`);
      const staged =
        breaks === undefined ? {} : { breaks, ...(trainees === undefined ? {} : { trainees }) };
      return new Ladder({ id, from: end(from), to: end(to), ...staged }, terrain).save();
    });
    const climbers = layout.climbers.map(({ id, along, technique = 1, kit, gear }) => {
      if (!(technique > 0)) {
        throw new RangeError(`${id} needs a technique above nought, not ${technique}`);
      }
      return Climber.standing(id, onTheGround(along, id), technique, kit, gear).save();
    });
    const { terrain: line, snow, ice, brittle, altitude } = layout;
    const save: SlopeSave = {
      terrain: line,
      ...(snow === undefined ? {} : { snow }),
      ...(ice === undefined ? {} : { ice }),
      ...(brittle === undefined ? {} : { brittle }),
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

  /** Sets how sure-footed a climber is from now on: the share of their footing they get back. */
  sureness(id: ClimberId, share: number): void {
    this.climberFor(id).setSureness(share);
  }

  /** Sets what a climber carries of the gear the slope's techniques need, from now on: their
   * pack's (`Packs`). */
  equip(id: ClimberId, gear: Gear): void {
    this.climberFor(id).equip(gear);
  }

  /** Puts fresh batteries in a climber's headlamp: it's checked from now on. */
  relamp(id: ClimberId): void {
    this.climberFor(id).relamp();
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

  /** How a jolt they can't prevent unbalances a climber now (#197), a gust or a ladder twisting:
   * the share of its chance that slips them, nought where nothing slips (`Climber.unsteadiness`). */
  unsteadiness(id: ClimberId): number {
    return this.climberFor(id).unsteadiness(this.loaded);
  }

  /** A jolt slips a climber on `step`, from where they stand: their rope holds them if they're
   * clipped. */
  upset(id: ClimberId, step: number): void {
    this.climberFor(id).upset(this.loaded, step);
  }

  /** Who is coming past a climber on a rope they share (#197): on their feet within `reach`
   * metres behind them along the ground, stepping their way, while the climber stands or goes
   * the other way; or none. */
  passerOf(id: ClimberId, reach: number): ClimberId | null {
    const me = this.climberFor(id);
    const at = me.onTheGround;
    if (at === null || me.dead) {
      return null;
    }
    for (const other of this.onSlope.values()) {
      const there = other.onTheGround;
      if (other === me || other.dead || there === null || !other.tookAStep) {
        continue;
      }
      const toward = Math.sign(at - there);
      const near = Math.abs(at - there) <= reach;
      const shared = other.ropes.some((rope) => me.ropes.includes(rope));
      const aside = !me.tookAStep || me.heading !== toward;
      if (toward !== 0 && other.heading === toward && near && shared && aside) {
        return other.id;
      }
    }
    return null;
  }

  /** Whether a climber stands on a ladder: a twist at its lashings jolts whoever is on it. */
  onALadder(id: ClimberId): boolean {
    return this.climber(id).ladder !== null;
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

  /** The rope nearest a climber's feet within a cowstail's reach, or none: what a clip would
   * take. */
  ropeWithin(id: ClimberId): string | null {
    const { x, y } = this.climber(id);
    return this.loaded.ropeWithin({ x, y })?.rope.id ?? null;
  }

  /** Where a climber hanging on their rope would be hauled up to, their way back up it; none for
   * one on their feet, or not hanging (#209): where the Sherpa's agent goes to pull them out
   * (#212). */
  liftPoint(id: ClimberId): Point | null {
    return this.climberFor(id).liftPoint(this.loaded);
  }

  /** How hard a ladder bounces now: nought at rest, and on one up a wall. */
  ladderBounce(id: string): number {
    return this.loaded.ladder(id).bounce;
  }

  /** Whether a ladder is whole, creaking before it breaks, or broken until it's lashed back
   * (#209); and the end that tore free, while it's broken. */
  ladderCondition(id: string): LadderCondition {
    return this.loaded.ladder(id).condition;
  }

  ladderTorn(id: string): "start" | "finish" | null {
    return this.loaded.ladder(id).torn;
  }

  /** The stretches of the ground that are bare blue ice, along it. */
  get ice(): readonly AlongStretch[] {
    return this.ground.ice ?? [];
  }

  /** The stretches of the ground's faces whose ice is brittle, along it. */
  get brittle(): readonly AlongStretch[] {
    return this.ground.brittle ?? [];
  }

  /** The faces of ice no ladder stands on or crosses, which the route goes up on the tools and
   * down on the rope: each one's ends along the ground, its foot first, for the picture. A face
   * between a ladder's ends, a wall it stands against or a crevasse's side, is the ladder's. */
  get bareFaces(): readonly { readonly foot: number; readonly top: number }[] {
    const slope = this.loaded;
    return slope.faces.all
      .filter(({ from, to }) => !slope.underALadder((from + to) / 2))
      .map(({ foot, top }) => ({ foot, top }));
  }

  /** The faces of ice a climber stands at or hangs on: each one's ends along the ground, its
   * foot first, for the coach and the walkers of the tests. */
  face(along: number): { readonly foot: number; readonly top: number } | null {
    const { faces } = this.loaded;
    const face = faces.at(along) ?? faces.above(along, SlopePhysics.AT_FACE);
    return face === null ? null : { foot: face.foot, top: face.top };
  }

  /** The wall of ice with no ladder a climber on their feet stands at: at its foot, to climb on
   * their tools; at its lip, to climb down it, or to lower themselves down it on the fixed rope
   * that runs down it (`rope`); or none. */
  iceWall(id: ClimberId): "foot" | "lip" | "rope" | null {
    const view = this.climber(id);
    if (view.falling || view.dead || view.onIce || view.lowering || view.ladder !== null) {
      return null;
    }
    const slope = this.loaded;
    const along = this.along(id);
    const foot = slope.faces.above(along, SlopePhysics.AT_FACE);
    if (foot !== null && !slope.ladderEndBy(foot.foot, Slope.BY_A_LADDER)) {
      return "foot";
    }
    const lip = slope.faces.below(along, SlopePhysics.AT_LIP);
    if (lip !== null && !slope.ladderEndBy(lip.top, Slope.BY_A_LADDER)) {
      return slope.ropeDown(lip) ? "rope" : "lip";
    }
    return null;
  }

  /** Whether the ground at `along` is a dead end, which nobody walks out of. */
  deadEnd(along: number): boolean {
    return this.loaded.faces.deadEnd(along);
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
      save.ice ?? [],
      save.brittle ?? [],
    );
    this.slope = slope;
    this.ground = {
      terrain: save.terrain,
      ...(save.snow === undefined ? {} : { snow: save.snow }),
      ...(save.ice === undefined ? {} : { ice: save.ice }),
      ...(save.brittle === undefined ? {} : { brittle: save.brittle }),
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
