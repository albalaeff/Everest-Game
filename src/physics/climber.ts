import { SimulationClock } from "../simulation";
import type { ClimberId, GameAction, Moment, Tool, Walk } from "../simulation";
import type { Face } from "./faces";
import type { Ladder } from "./ladder";
import { Particle } from "./particle";
import type { ParticleSave } from "./particle";
import type { Rope, Slide } from "./rope";
import { Slope } from "./slope";
import { Steepness } from "./steepness";
import type { Point, Way } from "./terrain";

/** A fall, once it's over: the step it began on, how far down it went, and its top speed; how
 * hard it hit the ground, if it fell through the air onto it, and whether a rope held them. */
export type Fall = {
  readonly step: number;
  /** Metres from where it began down to its lowest point. */
  readonly drop: number;
  /** Metres a second. */
  readonly speed: number;
  /** Metres a second, landing from the air: missing from the falls of saves before #190. */
  readonly impact?: number;
  /** Whether they were clipped to a rope as it ended, which held them. */
  readonly held?: boolean;
  /** Whether a crampon of theirs was loose, which the check they skipped left them (#196):
   * missing where none was. */
  readonly looseCrampon?: boolean;
  /** Whether the ladder they stood on broke under them, and whether a partner pulled them out
   * (#209), and who (#212): missing where not. */
  readonly broke?: boolean;
  readonly pulled?: boolean;
  readonly pulledBy?: readonly ClimberId[];
};

/** What a climber checked of their kit before setting off (#196): their crampons fitted and
 * strapped, fresh batteries in their headlamp, their water bottles filled. */
export type Kit = {
  readonly crampons: boolean;
  readonly lamp: boolean;
  readonly water: boolean;
};

/** What a climber carries that the slope's techniques need: the jumar on their first cowstail,
 * without which that cowstail is a plain carabiner and no rope is climbed; and how many ice tools,
 * the ice axe the first of them, a second technical tool the other. */
export type Gear = {
  readonly jumar: boolean;
  readonly tools: number;
};

/** A climber as the rest of the game sees them: the rendering, the rules above and the tests. */
export interface ClimberView {
  readonly x: number;
  readonly y: number;
  /** Metres above sea level, as the altimeter reads them on the section's scale. */
  readonly altitude: number;
  /** Off their feet: sliding, in the air, or hanging on a rope. */
  readonly falling: boolean;
  /** Killed: they lie where they came to rest, and do nothing more. */
  readonly dead: boolean;
  readonly walking: Walk["direction"];
  /** Whether they took a step in the last step. */
  readonly moving: boolean;
  /** The share of their stride's power their last step took: all of it on a ladder and wherever
   * the power holds them back, less where their footing does, and nought still. */
  readonly exertion: number;
  /** The rope each cowstail is clipped to, or none: the first's is the jumar's. */
  readonly first: string | null;
  readonly second: string | null;
  /** Where each cowstail's carabiner is on its rope, or none: the picture draws them there. */
  readonly firstAt: Point | null;
  readonly secondAt: Point | null;
  /** Whether their hand slides the jumar: its key is held. */
  readonly jumarHeld: boolean;
  /** The ladder they're on, or none. */
  readonly ladder: string | null;
  /** Each fall that's over, in order. */
  readonly falls: readonly Fall[];
  /** The chance each metre of their last step had of slipping (#208): by the ground it was on,
   * blue ice, a ladder or steep snow, and as carefully as they went; nought standing still or on
   * safe ground. */
  readonly slipChance: number;
  /** Hanging on their rope off the ground, where they can climb back up it to where they
   * slipped. */
  readonly hanging: boolean;
  /** What they checked of their kit; whether a crampon has come loose, and whether they're
   * refitting it (#196). */
  readonly kit: Kit;
  readonly cramponLoose: boolean;
  readonly refitting: boolean;
  /** Whether they're hauling a partner up the rope now, and holding the haul at all (#209). */
  readonly hauling: boolean;
  readonly haulHeld: boolean;
  /** Whether they're on the ice, on their tools and front points; where each pick in the ice
   * is, the highest first; and whether the highest bites poorly. */
  readonly onIce: boolean;
  readonly picks: readonly Point[];
  readonly pickPoor: boolean;
  /** Whether they're lowering themselves down a face of ice on the fixed rope that runs down it. */
  readonly lowering: boolean;
  /** What they carry of the gear the slope's techniques need. */
  readonly gear: Gear;
  /** The cowstail whose carabiner is going onto a rope now, their hands at it, or none (#197). */
  readonly clipping: "first" | "second" | null;
  /** The chance a second they had of slipping standing still where they stood in the last step
   * (#197): on the front points of a face, on a ladder bouncing hard, or on blue ice steeper than
   * a flat foot holds on; nought on the move, and anywhere else. */
  readonly stillChance: number;
  /** What of their ropes held them back in the last step, as their key took them on (#247): the
   * jumar gripping its rope (`jumar`), or a rope's length past its anchor, which no carabiner
   * runs past (`rope`); none where they stepped or stood, or a wall or a ladder's end stopped
   * them. The coach reads it. */
  readonly heldBack: "jumar" | "rope" | null;
  /** Which way along the slope they face: the way they last walked, up the route to begin with;
   * and whether they've turned out of it to face the viewer, standing (#235). */
  readonly facing: Way;
  readonly towardViewer: boolean;
}

/** A cowstail's carabiner going onto a rope (#197), as saves keep it: which cowstail, the rope
 * and where on it, and the seconds of the clip still to go. */
type ClippingSave = {
  readonly cowstail: "first" | "second";
  readonly rope: string;
  readonly slide: Slide;
  readonly left: number;
};

type CarabinerSave = { readonly rope: string; readonly slide: Slide };

type OnLadderSave = { readonly ladder: string; readonly rung: number };

/** Where a climber slipped from: a ladder's rung, or the ground `along` it where `ladder` is
 * null. */
type FromSave = {
  readonly ladder: string | null;
  readonly rung: number;
  readonly along: number;
};

/** A climber on the ice, as saves keep them: a length along the ground on their face, where each
 * pick is along it, and whether the highest bites poorly. */
type OnIceSave = {
  readonly at: number;
  readonly picks: readonly number[];
  readonly poor: boolean;
};

/** A climber lowering themselves down a face on its rope, as saves keep them: a length along the
 * ground on their face. */
type LoweringSave = {
  readonly at: number;
};

type FallingSave = {
  readonly step: number;
  readonly top: number;
  readonly lowest: number;
  readonly speed: number;
  readonly grounded: boolean;
  readonly body: ParticleSave;
  /** Missing from the saves of falls before #190, which nobody climbs back from. */
  readonly from?: FromSave;
  readonly impact?: number;
  readonly holding?: boolean;
  /** Missing from the saves of falls before #209: off a ladder that broke, pulled out, and the
   * lip they climb back to, where they came from. */
  readonly broke?: boolean;
  readonly pulled?: boolean;
  readonly lip?: number;
  /** Who has hauled them so far (#212): missing where nobody has. */
  readonly pullers?: readonly ClimberId[];
};

/** Who hauls whom this step (#209): the speed a hanging climber is hauled up at, in m/s, who
 * hauls them (#212), the lip they're hauled up to where it isn't their own way back (#239), and
 * whether a climber is hauling. */
export interface Hauls {
  of(climber: Climber): number;
  who(climber: Climber): readonly ClimberId[];
  to(climber: Climber): number | null;
  by(climber: Climber): boolean;
}

/** A place a hanging climber can be hauled up to (#239): a hauler stands within the haul's reach
 * of `point`; `lip` is where along the ground they come up, or none for their own way back. */
export type HaulPoint = { readonly point: Point; readonly lip: number | null };

/** A climber as saves keep them. */
export type ClimberSave = {
  readonly id: ClimberId;
  /** The share of the speed they go at in crampons, on the ground, on a ladder and on the ice,
   * and of the typical client's pace at clipping a carabiner onto a rope (#197). */
  readonly technique: number;
  /** Where they stand, along the ground, when they're on their feet and not on a ladder. */
  readonly along: number;
  readonly onLadder: OnLadderSave | null;
  readonly walking: Walk["direction"];
  readonly stride: number;
  readonly moving: boolean;
  /** Missing from the saves of builds before steps had a cost (#150): all of their power on the
   * move, as it was then. */
  readonly exertion?: number;
  /** Whether their hand slides the jumar: its key is held. */
  readonly jumarHeld: boolean;
  readonly first: CarabinerSave | null;
  readonly second: CarabinerSave | null;
  readonly falling: FallingSave | null;
  readonly falls: readonly Fall[];
  readonly dead: boolean;
  /** Missing from the saves of builds before the slips' chance (#208): safe, and sure. */
  readonly slipChance?: number;
  readonly sureness?: number;
  /** Missing from the saves of builds before the gear check (#196): all of it checked, and
   * nothing loose. */
  readonly kit?: Kit;
  readonly cramponLoose?: boolean;
  readonly refitting?: number;
  readonly onTheMove?: number;
  /** Missing from the saves of builds before the haul (#209): not held. */
  readonly haulHeld?: boolean;
  /** Missing from the saves of builds before the ice tools: the jumar and the ice axe, and on
   * their feet. */
  readonly gear?: Gear;
  readonly onIce?: OnIceSave;
  /** Missing from the saves of builds before the rappel, and where they're not lowering. */
  readonly lowering?: LoweringSave;
  /** Missing from the saves of builds before the clip took its time (#197), and where no clip is
   * going on; and the chance of slipping standing still, nought where it's missing. */
  readonly clipping?: readonly ClippingSave[];
  readonly stillChance?: number;
  /** Missing where nothing held them back in the last step, and from the saves of builds before
   * #247. */
  readonly heldBack?: "jumar" | "rope";
  /** Missing from the saves of builds before the turn to the viewer (#235): facing up the route,
   * and not turned. */
  readonly facing?: Way;
  readonly towardViewer?: boolean;
};

/** A cowstail's carabiner, or its jumar, on a rope: it runs along it, or grips it where it is. */
class Carabiner {
  constructor(
    readonly rope: Rope,
    private slide: Slide,
  ) {}

  save(): CarabinerSave {
    return { rope: this.rope.id, slide: this.slide };
  }

  /** Where it is on its rope. */
  get at(): Point {
    return this.rope.at(this.slide);
  }

  /** Another carabiner on the same rope, at the same place. */
  beside(): Carabiner {
    return new Carabiner(this.rope, this.slide);
  }

  /** Slides along the rope to where it's nearest the climber. */
  slideToward(climber: Point): void {
    this.slide = this.rope.slideToward(this.slide, climber);
  }

  /** Whether the rope lets its climber be at a point: anywhere its length reaches while this
   * runs along it, and within the rope on each side of it while it `grips`. */
  lets(point: Point, reach: number, grips: boolean): boolean {
    return grips ? this.rope.letsAt(this.slide, point, reach) : this.rope.lets(point, reach);
  }

  /** Puts a falling climber back where the rope lets them be, if they've gone past it. */
  hold(body: Particle, reach: number, grips: boolean): void {
    if (grips) {
      this.rope.holdAt(this.slide, body, reach);
    } else {
      this.rope.hold(body, reach);
    }
  }

  /** Pulls the rope after the climber, to within the cowstail's reach. */
  pull(climber: Point, reach: number): void {
    this.rope.follow(this.slide, climber, reach);
  }
}

/** Where on a ladder a climber stands: `rung` metres along it. */
class OnLadder {
  constructor(
    readonly ladder: Ladder,
    readonly rung: number,
  ) {}

  static load(save: OnLadderSave, slope: Slope): OnLadder {
    return new OnLadder(slope.ladder(save.ladder), save.rung);
  }

  save(): OnLadderSave {
    return { ladder: this.ladder.id, rung: this.rung };
  }

  get point(): Point {
    return this.ladder.point(this.rung);
  }
}

/**
 * A climber on the ice: on a face too steep to walk, on their front points, hanging from the pick
 * they swung in last. Their feet go up until that pick is at their shoulder and down until their
 * arm is straight; to go further they swing the next one in. With two tools the pick before stays
 * in the ice while the next goes in; on the axe alone, there's a moment with none.
 */
class OnIce {
  constructor(
    readonly face: Face,
    /** Where each pick in the ice is, along the ground: the one they hang from first. */
    public picks: readonly number[],
    /** Whether the pick they hang from bites poorly: swung at full stretch, or into brittle ice. */
    public poor: boolean,
  ) {}

  static load(save: OnIceSave, slope: Slope): OnIce | null {
    const face = slope.faces.at(save.at);
    return face === null ? null : new OnIce(face, save.picks, save.poor);
  }

  save(): OnIceSave {
    const { face, picks, poor } = this;
    return { at: (face.from + face.to) / 2, picks, poor };
  }

  /** The pick they hang from, along the ground. */
  get hold(): number {
    return this.picks[0] ?? this.face.top;
  }
}

/**
 * A climber lowering themselves down a face of ice on the fixed rope that runs down it, as on the
 * mountain's fixed lines: the rope through their descender, their front points on the ice, their
 * cowstails on the rope. Their feet go down the face, or back up it on the jumar.
 */
class Lowering {
  constructor(readonly face: Face) {}

  static load(save: LoweringSave, slope: Slope): Lowering | null {
    const face = slope.faces.at(save.at);
    return face === null ? null : new Lowering(face);
  }

  save(): LoweringSave {
    const { face } = this;
    return { at: (face.from + face.to) / 2 };
  }
}

/** A fall going on: the body, where it began, and what the fall's record will say. */
class Falling {
  /** Whether the body touched the ground in the last sub-step. */
  grounded = false;
  /** The hardest it has hit the ground, in m/s into it. */
  impact = 0;
  /** Whether the climber holds on where they hang, climbing back up their rope: gravity has
   * them no more. */
  holding = false;
  /** Whether the ladder they stood on broke under them, and whether a partner has pulled them up
   * (#209). */
  broke = false;
  pulled = false;
  /** Who has hauled them so far (#212). */
  pullers: readonly ClimberId[] = [];
  /** Where along the ground the lip they climb back to is, off a ladder that broke. */
  lip: number | null = null;
  /** Where the body was when the step began. */
  private startX: number;
  private startY: number;

  constructor(
    readonly body: Particle,
    readonly step: number,
    private readonly top: number,
    private lowest: number,
    private speed: number,
    readonly from: FromSave | null,
  ) {
    this.startX = body.x;
    this.startY = body.y;
  }

  static load(save: FallingSave): Falling {
    const falling = new Falling(
      Particle.load(save.body),
      save.step,
      save.top,
      save.lowest,
      save.speed,
      save.from ?? null,
    );
    falling.grounded = save.grounded;
    falling.impact = save.impact ?? 0;
    falling.holding = save.holding ?? false;
    falling.broke = save.broke ?? false;
    falling.pulled = save.pulled ?? false;
    falling.pullers = save.pullers ?? [];
    falling.lip = save.lip ?? null;
    return falling;
  }

  save(): FallingSave {
    const { step, top, lowest, speed, grounded, impact, holding, from, broke, pulled } = this;
    return {
      step,
      top,
      lowest,
      speed,
      grounded,
      body: this.body.save(),
      ...(from === null ? {} : { from }),
      impact,
      holding,
      ...(broke ? { broke } : {}),
      ...(pulled ? { pulled } : {}),
      ...(this.lip === null ? {} : { lip: this.lip }),
      ...(this.pullers.length === 0 ? {} : { pullers: this.pullers }),
    };
  }

  beginStep(): void {
    this.startX = this.body.x;
    this.startY = this.body.y;
  }

  /** Notes the body's height and speed after a sub-step of `seconds`. */
  note(seconds: number): void {
    this.lowest = Math.min(this.lowest, this.body.y);
    this.speed = Math.max(this.speed, this.body.speed(seconds));
  }

  /** Whether the body lies still on the ground: it has moved less than `speed` a second for a
   * whole step of `seconds`, and is slower than that at its end. */
  resting(speed: number, step: number, substep: number): boolean {
    const x = this.body.x - this.startX;
    const y = this.body.y - this.startY;
    const moved = Math.sqrt(x * x + y * y);
    return this.grounded && moved < speed * step && this.body.speed(substep) < speed;
  }

  record(held: boolean, looseCrampon: boolean): Fall {
    const { step, impact } = this;
    const drop = this.top - this.lowest;
    return {
      step,
      drop,
      speed: this.speed,
      impact,
      held,
      ...(looseCrampon ? { looseCrampon } : {}),
      ...(this.broke ? { broke: true } : {}),
      ...(this.pulled ? { pulled: true } : {}),
      ...(this.pullers.length === 0 ? {} : { pulledBy: this.pullers }),
    };
  }
}

/**
 * One climber on the slope: on their feet somewhere along the ground or on a ladder, or falling,
 * a body under gravity. They're a point at their feet. Each cowstail is clipped to a rope, or
 * not. The first ends in the jumar, which runs along its rope only while their hand slides it and
 * they're on their feet, and grips the rope where it is otherwise, in a fall too. The second
 * ends in a carabiner, which always runs.
 */
export class Climber {
  private static readonly WAYS: Readonly<Record<Walk["direction"], Way | 0>> = {
    right: 1,
    "up-right": 1,
    "down-right": 1,
    left: -1,
    "up-left": -1,
    "down-left": -1,
    up: 0,
    down: 0,
    stop: 0,
  };

  private constructor(
    readonly id: ClimberId,
    private readonly technique: number,
    private along: number,
    private onLadder: OnLadder | null,
    private walking: Walk["direction"],
    private stride: number,
    private moving: boolean,
    private exertion: number,
    private jumarHeld: boolean,
    private first: Carabiner | null,
    private second: Carabiner | null,
    private falling: Falling | null,
    private readonly falls: Fall[],
    private killed: boolean,
    /** The chance a metre of their last step had of slipping; and how sure-footed the body makes
     * them, at their pace and as tired as they are, a share that divides it. */
    private slipChance: number,
    private sureness: number,
    private kit: Kit,
    /** Whether a crampon has come loose; the seconds of a refit left; and the seconds they've
     * been on the move. */
    private cramponLoose: boolean,
    private refitting: number,
    private onTheMove: number,
    /** Whether the haul is held, and whether they hauled someone in the last step (#209). */
    private haulHeld: boolean,
    private gear: Gear,
    /** On the ice, on their tools, or not; lowering down a face on its rope, or not. */
    private onIce: OnIce | null,
    private lowering: Lowering | null,
  ) {}

  /** Whether they hauled a partner in the last step. */
  private pulling = false;
  /** Where the player pointed a tool in this step, until the step takes it. */
  private swing: Pick<Tool, "tool" | "x" | "y"> | null = null;
  /** The cowstails whose carabiners are going onto a rope, in turn, the first being clipped now
   * (#197); the chance a second they had of slipping standing still in the last step; and whether
   * they took a step in it. */
  private clipping: readonly ClippingSave[] = [];
  private stillChance = 0;
  /** What of their ropes held them back in the last step, if anything did (#247). */
  private heldBack: "jumar" | "rope" | null = null;
  /** Which way along the slope they face, and whether they've turned to face the viewer (#235). */
  private facing: Way = 1;
  private towardViewer = false;
  private took = false;

  /** Everything checked. */
  static readonly CHECKED: Kit = { crampons: true, lamp: true, water: true };
  /** The jumar on the first cowstail, and the ice axe. */
  static readonly EQUIPPED: Gear = { jumar: true, tools: 1 };
  /** How near the ice a hanging body is to be on it, and how near a face's foot or its lip a
   * climber stands to start up or down it, in metres: the engine's numbers. */
  private static readonly TOUCH = 0.05;
  private static readonly AT_FACE = 0.3;
  private static readonly AT_LIP = 0.6;
  private static readonly EXACT = 1e-9;
  /** Nobody hauls anybody. */
  static readonly NO_HAULS: Hauls = {
    of: () => 0,
    who: () => [],
    to: () => null,
    by: () => false,
  };

  /** A climber standing at `along`, still, clipped to nothing, going at `technique`'s share of
   * the speed in crampons and of the pace of a clip, with what they checked of their `kit`. */
  static standing(
    id: ClimberId,
    along: number,
    technique: number,
    kit: Kit = Climber.CHECKED,
    gear: Gear = Climber.EQUIPPED,
  ): Climber {
    return new Climber(
      id,
      technique,
      along,
      null,
      "stop",
      1,
      false,
      0,
      false,
      null,
      null,
      null,
      [],
      false,
      0,
      1,
      kit,
      false,
      0,
      0,
      false,
      gear,
      null,
      null,
    );
  }

  /** The same climber stood on their feet at `along`, alive and still, off any ladder, fall, face
   * or clip going on, as `standing` lays one, with their own technique, stride, sureness, kit, a
   * crampon come loose, time on the move, gear and falls: the god mode's (#245). On `rope`, both
   * cowstails are on it there, the jumar's and the carabiner's; on none, neither. */
  placed(along: number, rope: { readonly rope: Rope; readonly slide: Slide } | null): Climber {
    const carabiner = (): Carabiner | null =>
      rope === null ? null : new Carabiner(rope.rope, rope.slide);
    return new Climber(
      this.id,
      this.technique,
      along,
      null,
      "stop",
      this.stride,
      false,
      0,
      false,
      carabiner(),
      carabiner(),
      null,
      [...this.falls],
      false,
      0,
      this.sureness,
      this.kit,
      this.cramponLoose,
      0,
      this.onTheMove,
      false,
      this.gear,
      null,
      null,
    );
  }

  static load(save: ClimberSave, slope: Slope): Climber {
    const carabiner = (clip: CarabinerSave | null) =>
      clip === null ? null : new Carabiner(slope.rope(clip.rope), clip.slide);
    const climber = new Climber(
      save.id,
      save.technique,
      save.along,
      save.onLadder === null ? null : OnLadder.load(save.onLadder, slope),
      save.walking,
      save.stride,
      save.moving,
      save.exertion ?? (save.moving ? 1 : 0),
      save.jumarHeld,
      carabiner(save.first),
      carabiner(save.second),
      save.falling === null ? null : Falling.load(save.falling),
      [...save.falls],
      save.dead,
      save.slipChance ?? 0,
      save.sureness ?? 1,
      save.kit ?? Climber.CHECKED,
      save.cramponLoose ?? false,
      save.refitting ?? 0,
      save.onTheMove ?? 0,
      save.haulHeld ?? false,
      save.gear ?? Climber.EQUIPPED,
      save.onIce === undefined ? null : OnIce.load(save.onIce, slope),
      save.lowering === undefined ? null : Lowering.load(save.lowering, slope),
    );
    climber.clipping = save.clipping ?? [];
    climber.stillChance = save.stillChance ?? 0;
    climber.heldBack = save.heldBack ?? null;
    climber.facing = save.facing ?? 1;
    climber.towardViewer = save.towardViewer ?? false;
    return climber;
  }

  save(): ClimberSave {
    return {
      id: this.id,
      technique: this.technique,
      along: this.along,
      onLadder: this.onLadder?.save() ?? null,
      walking: this.walking,
      stride: this.stride,
      moving: this.moving,
      exertion: this.exertion,
      jumarHeld: this.jumarHeld,
      first: this.first?.save() ?? null,
      second: this.second?.save() ?? null,
      falling: this.falling?.save() ?? null,
      falls: [...this.falls],
      dead: this.killed,
      slipChance: this.slipChance,
      sureness: this.sureness,
      kit: this.kit,
      cramponLoose: this.cramponLoose,
      refitting: this.refitting,
      onTheMove: this.onTheMove,
      ...(this.haulHeld ? { haulHeld: true } : {}),
      gear: this.gear,
      ...(this.onIce === null ? {} : { onIce: this.onIce.save() }),
      ...(this.lowering === null ? {} : { lowering: this.lowering.save() }),
      ...(this.clipping.length === 0 ? {} : { clipping: this.clipping }),
      ...(this.stillChance > 0 ? { stillChance: this.stillChance } : {}),
      ...(this.heldBack === null ? {} : { heldBack: this.heldBack }),
      ...(this.facing === 1 ? {} : { facing: this.facing }),
      ...(this.towardViewer ? { towardViewer: true } : {}),
    };
  }

  get dead(): boolean {
    return this.killed;
  }

  view(slope: Slope): ClimberView {
    const where = this.where(slope);
    return {
      x: where.x,
      y: where.y,
      altitude: slope.scale.altitudeAt(where),
      falling: this.falling !== null,
      dead: this.killed,
      walking: this.walking,
      moving: this.moving,
      exertion: this.exertion,
      first: this.first?.rope.id ?? null,
      second: this.second?.rope.id ?? null,
      firstAt: this.first?.at ?? null,
      secondAt: this.second?.at ?? null,
      jumarHeld: this.jumarHeld,
      ladder: this.onLadder?.ladder.id ?? null,
      falls: [...this.falls],
      slipChance: this.slipChance,
      hanging: this.hangs(slope),
      kit: this.kit,
      cramponLoose: this.cramponLoose,
      refitting: this.refitting > 0,
      hauling: this.pulling,
      haulHeld: this.haulHeld,
      onIce: this.onIce !== null,
      picks: this.onIce?.picks.map((along) => slope.terrain.point(along)) ?? [],
      pickPoor: this.onIce?.poor ?? false,
      lowering: this.lowering !== null,
      gear: this.gear,
      clipping: this.clipping[0]?.cowstail ?? null,
      stillChance: this.stillChance,
      heldBack: this.heldBack,
      facing: this.facing,
      towardViewer: this.towardViewer,
    };
  }

  /** Takes an action of theirs: the walking, the cowstails and the jumar are the physics', the
   * rest isn't. The dead take none. */
  hear(action: GameAction, slope: Slope): void {
    if (this.killed) {
      return;
    }

    if (action.kind === "walk") {
      this.walking = action.direction;
      // A walk turns them side-on, the way it points across the slope (#235).
      if (action.direction !== "stop") {
        this.towardViewer = false;
        this.facing = Climber.WAYS[action.direction] || this.facing;
      }
    }
    // On their feet on the ground, they stop and turn to face out of the slope (#235).
    const afoot =
      this.falling === null &&
      this.onLadder === null &&
      this.onIce === null &&
      this.lowering === null;
    if (action.kind === "turn" && afoot) {
      this.towardViewer = true;
      this.walking = "stop";
    }
    if (action.kind === "jumar") {
      this.jumarHeld = action.held;
    }
    if (action.kind === "haul") {
      this.haulHeld = action.held;
    }
    const going = (cowstail: "first" | "second"): boolean =>
      this.clipping.some((clip) => clip.cowstail === cowstail);
    if (
      action.kind === "clip" &&
      this.cowstail(action.cowstail) === null &&
      !going(action.cowstail)
    ) {
      if (this.falling === null) {
        const nearest = slope.ropeWithin(this.where(slope));
        const seconds = slope.settings.clip / this.technique;
        if (nearest !== null && !(seconds > 0)) {
          this.clip(action.cowstail, new Carabiner(nearest.rope, nearest.slide));
        } else if (nearest !== null) {
          // Their hands at it, the carabiner goes on once the clip's seconds are up (#197).
          const { cowstail } = action;
          const { rope, slide } = nearest;
          this.clipping = [...this.clipping, { cowstail, rope: rope.id, slide, left: seconds }];
        }
      } else if (this.hangs(slope)) {
        // Hanging on a rope by one cowstail: the other goes onto the same rope, beside it.
        const [held] = this.carabiners;
        if (held !== undefined) {
          this.clip(action.cowstail, held.beside());
        }
      }
    }
    if (action.kind === "unclip") {
      this.clip(action.cowstail, null);
      this.clipping = this.clipping.filter((clip) => clip.cowstail !== action.cowstail);
    }
    if (action.kind !== "tool") {
      return;
    }
    const sliding = this.falling !== null && this.falling.grounded && !this.hangs(slope);
    // Their crampons, on their feet on the ground with one loose: they kneel to refit it.
    const refits =
      action.tool === "crampons" &&
      this.cramponLoose &&
      this.falling === null &&
      this.onLadder === null &&
      this.onIce === null &&
      this.lowering === null &&
      this.refitting <= 0;
    if (action.tool === "ice-axe" && sliding) {
      this.arrest(action, slope);
    } else if (refits) {
      this.refitting = slope.settings.footing.crampon.refit;
    } else {
      // A pick swung into the ice, or the front points kicked into it: the step takes it.
      this.swing = { tool: action.tool, x: action.x, y: action.y };
    }
  }

  /** What they carry of the gear from now on: what their pack holds (`Packs`). */
  equip(gear: Gear): void {
    if (!(gear.tools >= 0)) {
      throw new RangeError(`${this.id} can't carry ${gear.tools} ice tools`);
    }
    this.gear = gear;
  }

  /** Fresh batteries in their headlamp: it's checked from now on. */
  relamp(): void {
    this.kit = { ...this.kit, lamp: true };
  }

  /** Sets how far their strides go from now on, as a share of the walking power and the ladder
   * speeds. */
  setStride(share: number): void {
    if (!(share >= 0)) {
      throw new RangeError(`${this.id} can't take strides of ${share} times the speed`);
    }
    this.stride = share;
  }

  /** Sets how sure-footed they are from now on: the share of their footing they get back. */
  setSureness(share: number): void {
    if (!(share >= 0)) {
      throw new RangeError(`${this.id} can't be ${share} times as sure-footed`);
    }
    this.sureness = share;
  }

  /**
   * Takes this step's steps, on their feet: on a ladder if they're on one or their way steps onto
   * one, and along the ground otherwise. Each goes as far as their ropes let them, and may slip.
   * One who takes no step stands, where a stance can be hard (#197).
   */
  walk(slope: Slope, moment: Moment, hauls: Hauls = Climber.NO_HAULS): void {
    this.moving = false;
    this.exertion = 0;
    this.slipChance = 0;
    this.stillChance = 0;
    this.heldBack = null;
    this.pulling = false;
    this.took = false;
    const { swing } = this;
    this.swing = null;
    if (this.killed) {
      return;
    }
    if (swing !== null) {
      this.place(swing, slope, moment);
    }
    if (this.falling !== null) {
      this.clipping = [];
      this.climbBack(this.falling, slope, hauls.of(this), hauls.who(this), hauls.to(this));
      return;
    }
    if (hauls.by(this)) {
      // Braced at the edge, hand over hand on the rope: all their power, and no step.
      this.pulling = true;
      this.moving = true;
      this.exertion = 1;
      return;
    }
    this.step(slope, moment);
    if (this.standingStill) {
      this.standStill(slope, moment);
    }
  }

  /** Whether they're on their feet and took no step this step: not lowering on a rope, which holds
   * them, and not in a fall. */
  private get standingStill(): boolean {
    return !this.took && this.falling === null && this.lowering === null;
  }

  /** This step's step, on their feet: none while their hands are at a clip or a crampon. */
  private step(slope: Slope, moment: Moment): void {
    if (this.clipping.length > 0) {
      this.clipOn(slope);
      if (this.clipping.length > 0) {
        if (this.onIce !== null) {
          // Hanging still on the tools while a hand clips: that's work too.
          this.moving = true;
          this.exertion = slope.settings.iceClimb.hang;
        }
        return;
      }
      // The last carabiner's on: their hands are free for the rest of the step.
    }
    if (this.refitting > 0) {
      // Kneeling to refit a crampon: no step till it's on.
      this.refitting = Math.max(0, this.refitting - SimulationClock.STEP_SECONDS);
      if (this.refitting === 0) {
        this.cramponLoose = false;
      }
      return;
    }
    if (this.onIce !== null) {
      this.climbIce(this.onIce, slope, moment);
      return;
    }
    if (this.lowering !== null) {
      this.lower(this.lowering, slope, moment);
      return;
    }
    if (this.stride > 0) {
      const onLadder = this.onLadder ?? this.ladderAhead(slope);
      if (onLadder === null) {
        this.walkGround(slope, moment);
      } else {
        this.climb(onLadder, slope, moment);
      }
    }
  }

  /** The clip their hands are at, a step on: its carabiner goes onto its rope once its seconds
   * are up, and the next cowstail's clip begins. */
  private clipOn(slope: Slope): void {
    const [clip, ...after] = this.clipping;
    if (clip === undefined) {
      return;
    }
    const left = clip.left - SimulationClock.STEP_SECONDS;
    if (left > Climber.EXACT) {
      this.clipping = [{ ...clip, left }, ...after];
      return;
    }
    this.clipping = after;
    this.clip(clip.cowstail, new Carabiner(slope.rope(clip.rope), clip.slide));
  }

  /**
   * Standing still where a stance is hard (#197): on the front points, their calves tiring, on a
   * face, the more on the axe alone and on a pick that bites poorly, and on blue ice steeper than
   * a crampon's flat foot holds on, under their feet: the flat at a crevasse's lip or a wall's
   * foot is no such stance; and on a ladder, by how hard it bounces past what a crossing's
   * own sway does. Each has a chance a second of slipping, divided by how sure-footed they are;
   * anywhere else, standing still never slips.
   */
  private standStill(slope: Slope, moment: Moment): void {
    const { still } = slope.settings.footing;
    const { iceClimb } = slope.settings;
    let chance = 0;
    if (this.onIce !== null && !this.onTheRope(this.onIce, slope)) {
      const oneTool = this.gear.tools < 2 ? iceClimb.oneToolSlip : 1;
      chance = still.frontPoints * oneTool * (this.onIce.poor ? iceClimb.poor : 1);
    } else if (this.onLadder !== null) {
      chance = still.bounce * Math.max(0, this.onLadder.ladder.bounce - still.bounceFrom);
    } else if (slope.onIce(this.along)) {
      const ahead = slope.terrain.ahead(this.along, 1);
      const behind = slope.terrain.ahead(this.along, -1);
      // The ground under their feet: at a corner, a lip or a wall's foot, the gentler side is
      // the one they stand on (#237).
      const steepness = Math.min(
        Math.abs(Steepness.ofWay(ahead.x, ahead.y).sine),
        Math.abs(Steepness.ofWay(behind.x, behind.y).sine),
      );
      chance = steepness > Steepness.ofDegrees(still.steepness).sine ? still.frontPoints : 0;
    }
    if (!(chance > 0)) {
      return;
    }
    const sure = this.sure(slope);
    this.stillChance = sure > 0 ? chance / sure : Number.POSITIVE_INFINITY;
    if (moment.random.chance(Math.min(1, this.stillChance * SimulationClock.STEP_SECONDS))) {
      this.fall(slope, Climber.DOWN, 0, moment.step);
    }
  }

  /**
   * How a jolt they can't prevent unbalances them now (#197), a gust, a ladder twisting at a
   * lashing or a climber passing them on their rope: the share of its chance that slips them.
   * Nought off their feet, lowering on the rope, and where nothing slips; whole on a ladder, on
   * the front points, on blue ice and on snow steep enough to slip on, and less standing still,
   * braced for it; divided by how sure-footed they are.
   */
  unsteadiness(slope: Slope): number {
    if (this.killed || this.falling !== null || this.lowering !== null) {
      return 0;
    }
    if (this.onIce !== null && this.onTheRope(this.onIce, slope)) {
      return 0;
    }
    let slips = this.onIce !== null || this.onLadder !== null || slope.onIce(this.along);
    if (!slips) {
      const ahead = slope.terrain.ahead(this.along, 1);
      const behind = slope.terrain.ahead(this.along, -1);
      slips = [ahead, behind].some(({ x, y }) => slope.slipChance.at(Steepness.ofWay(x, y)) > 0);
    }
    if (!slips) {
      return 0;
    }
    const braced = this.took ? 1 : slope.settings.footing.braced;
    const sure = this.sure(slope);
    return sure > 0 ? braced / sure : Number.POSITIVE_INFINITY;
  }

  /** Whether, on the ice, a rope of theirs holds them where they are, its reach letting them no
   * higher up the face: they rest on it, their weight off their front points, as at a changeover
   * there, and nothing slips them off. */
  private onTheRope(onIce: OnIce, slope: Slope): boolean {
    const higher = slope.terrain.point(this.along + onIce.face.up * Climber.TOUCH);
    return this.carabiners.length > 0 && !this.ropesLet(higher, slope);
  }

  /** A jolt slips them, from where they stand: a fall, which their rope holds if they're
   * clipped. Their hands let go of any clip. */
  upset(slope: Slope, step: number): void {
    if (this.killed || this.falling !== null) {
      return;
    }
    this.clipping = [];
    this.fall(slope, Climber.DOWN, 0, step);
  }

  /** Where they stand along the ground, on their feet off a ladder and off the ice; none
   * otherwise. */
  get onTheGround(): number | null {
    return this.falling === null && this.onLadder === null && this.onIce === null
      ? this.along
      : null;
  }

  /** Whether they took a step in the last step. */
  get tookAStep(): boolean {
    return this.took;
  }

  /** The way along the ground their key points: 1 on, -1 back, 0 neither. */
  get heading(): Way | 0 {
    return Climber.WAYS[this.walking];
  }

  beginStep(): void {
    this.falling?.beginStep();
  }

  integrate(slope: Slope): void {
    if (this.falling !== null && !this.falling.holding) {
      this.falling.grounded = false;
      this.falling.body.integrate(slope.settings.gravity, slope.substepSeconds);
    }
  }

  /** Pulls each rope they're clipped to after them. */
  pullRopes(slope: Slope): void {
    const where = this.where(slope);
    for (const carabiner of this.carabiners) {
      carabiner.pull(where, slope.settings.cowstail);
    }
  }

  /** Falling, they go no further than each rope they're clipped to lets them. */
  holdOn(slope: Slope): void {
    if (this.falling !== null) {
      for (const carabiner of this.carabiners) {
        carabiner.hold(this.falling.body, slope.settings.cowstail, this.grips(carabiner));
      }
    }
  }

  /** A falling body meets the ground, on snow or ice: it hits it at its speed into it, nought
   * sliding along a slope or down a wall's face, and past the lethal landing, the fall kills them.
   * Holding on as they climb back up, they're on their rope, not the ground. */
  land(slope: Slope): void {
    const { falling } = this;
    if (falling === null || falling.holding) {
      return;
    }
    const { body } = falling;
    const impact = body.into(slope.terrain, slope.substepSeconds);
    if (impact > falling.impact) {
      falling.impact = impact;
      if (impact >= slope.settings.lethalLanding) {
        this.killed = true;
        this.walking = "stop";
      }
    }
    if (body.land(slope.terrain, slope.frictionAt(body))) {
      falling.grounded = true;
    }
  }

  /** After a sub-step, the fall notes how it goes. */
  note(slope: Slope): void {
    this.falling?.note(slope.substepSeconds);
  }

  /** After they or the ropes move, the carabiners that run slide after them. */
  slide(slope: Slope): void {
    const where = this.where(slope);
    for (const carabiner of this.carabiners) {
      if (!this.grips(carabiner)) {
        carabiner.slideToward(where);
      }
    }
  }

  /** At the end of a step, a fall whose body lies still on the ground is over: they stand. */
  settle(slope: Slope): void {
    const { falling } = this;
    const step = SimulationClock.STEP_SECONDS;
    if (falling?.resting(Slope.REST_SPEED, step, slope.substepSeconds) === true) {
      const along = slope.terrain.nearest(falling.body).along;
      if (this.standsAt(along, slope)) {
        this.stand(falling, along);
      }
    }
  }

  /** Whether a fall that comes to rest at `along` is over there: on ground they could stand on,
   * and, for a climber their rope holds, not a dead end, a ledge down a crevasse's wall or the
   * snow at its foot, where they still hang on the rope to climb back up it. */
  private standsAt(along: number, slope: Slope): boolean {
    const held = this.carabiners.length > 0 && slope.faces.deadEnd(along);
    return this.standable(along, slope) && !held;
  }

  /** Whether a climber at rest at `along` could stand there: on ground no steeper than they
   * walk, not against a wall's face, where only their rope holds them. */
  private standable(along: number, slope: Slope): boolean {
    const { terrain, walking } = slope;
    const steepness = (way: Way): Steepness => {
      const { x, y } = terrain.ahead(along, way);
      return Steepness.ofWay(x, y);
    };
    const forward = steepness(1);
    const back = steepness(-1);
    const wall = (it: Steepness): boolean => walking.steeperUp(it) || walking.steeperDown(it);
    return !(wall(forward) && wall(back));
  }

  /** Back on their feet after a fall, at `along`. */
  private stand(falling: Falling, along: number): void {
    this.falls.push(falling.record(this.carabiners.length > 0, this.cramponLoose));
    this.along = along;
    this.falling = null;
  }

  /** Whether they hang on their rope off the ground, to climb back up it to where they slipped:
   * alive, clipped, and their body in the air, against a wall's face, on a ledge or a crevasse's
   * foot nobody walks out of, or held where they've climbed to. */
  private hangs(slope: Slope): boolean {
    const { falling } = this;
    if (falling === null || falling.from === null || this.killed || this.carabiners.length === 0) {
      return false;
    }
    if (falling.holding || !falling.grounded) {
      return true;
    }
    return !this.standsAt(slope.terrain.nearest(falling.body).along, slope);
  }

  /** Hanging on their rope, a key that points up climbs them back up it toward where they
   * slipped, at the climb's speed, on the jumar: with the first cowstail on the rope and a jumar
   * on it. A carabiner alone climbs no rope: they clip the jumar on first, climb the ice on
   * their tools, or wait for a partner's haul. Free on the rope they go straight to where they
   * slipped; against the ice they go along it, up a wall's face and over its lip, never through
   * it, holding on where they are as they go. Back on that rung, or on ground they can walk off,
   * they're on their feet, shaken. */
  private climbBack(
    falling: Falling,
    slope: Slope,
    hauled: number,
    haulers: readonly ClimberId[],
    to: number | null,
  ): void {
    const up = this.walking === "up" || this.walking.startsWith("up-");
    const { from } = falling;
    const jumar = this.first !== null && this.gear.jumar;
    const own =
      up && jumar && this.stride > 0 ? slope.settings.climbBack * this.stride * this.technique : 0;
    if (own + hauled <= 0 || !this.hangs(slope) || from === null) {
      return;
    }
    if (hauled > 0 && to !== null && falling.lip === null) {
      // Hauled from a ladder's end, they come up there, and climb that way too from now (#239).
      falling.lip = to;
    }
    const { terrain } = slope;
    const { body } = falling;
    const step = (own + hauled) * SimulationClock.STEP_SECONDS;
    falling.holding = true;
    falling.pulled ||= hauled > 0;
    falling.pullers = [
      ...falling.pullers,
      ...haulers.filter((hauler) => !falling.pullers.includes(hauler)),
    ];
    this.moving = own > 0;
    this.exertion = own > 0 ? 1 : 0;
    const lip = this.lipOf(falling, slope);
    const surface = terrain.nearest(body);
    if (Climber.distance(surface, body) <= Climber.TOUCH) {
      // Against the ice: along it to the ground they came off, or the lip their ladder stands on.
      const exit =
        lip?.along ??
        (from.ladder === null
          ? this.offTheFace(from.along, slope)
          : slope.ladder(from.ladder).nearerEnd(body).along);
      const away = exit - surface.along;
      if (Math.abs(away) <= step) {
        this.stand(falling, exit);
        return;
      }
      const next = surface.along + (away > 0 ? step : -step);
      const point = terrain.point(next);
      body.place(point.x, point.y);
      if (this.standsAt(next, slope) && !slope.underALadder(next)) {
        this.stand(falling, next);
      }
      return;
    }
    const back = from.ladder === null ? this.offTheFace(from.along, slope) : from.along;
    const target =
      lip?.point ??
      (from.ladder === null ? terrain.point(back) : slope.ladder(from.ladder).point(from.rung));
    const x = target.x - body.x;
    const y = target.y - body.y;
    const away = Math.sqrt(x * x + y * y);
    if (away <= step) {
      if (lip !== null) {
        this.stand(falling, lip.along);
        return;
      }
      if (from.ladder !== null) {
        this.onLadder = new OnLadder(slope.ladder(from.ladder), from.rung);
      }
      this.stand(falling, back);
      return;
    }
    const next = { x: body.x + (x / away) * step, y: body.y + (y / away) * step };
    // The ice in the way stops them at its surface, and they go on along it.
    const placed = terrain.holds(next) ? terrain.nearest(next) : next;
    body.place(placed.x, placed.y);
  }

  /** Where a climber who hangs climbs back to: the lip nearer where they stood on a ladder that
   * broke under them, or the nearer end of one that's broken now, there being no rung to go back
   * to; none otherwise. */
  private lipOf(
    falling: Falling,
    slope: Slope,
  ): { readonly along: number; readonly point: Point } | null {
    if (falling.lip !== null) {
      return { along: falling.lip, point: slope.terrain.point(falling.lip) };
    }
    const { from } = falling;
    if (from?.ladder == null) {
      return null;
    }
    const ladder = slope.ladder(from.ladder);
    return ladder.condition === "broken" ? ladder.nearerEnd(falling.body) : null;
  }

  /** Where a hanging climber would be pulled up to: their way back up the rope; none for one on
   * their feet, or not hanging (#209). */
  liftPoint(slope: Slope): Point | null {
    const { falling } = this;
    if (falling === null || falling.from === null || !this.hangs(slope)) {
      return null;
    }
    const lip = this.lipOf(falling, slope);
    if (lip !== null) {
      return lip.point;
    }
    const { from } = falling;
    return from.ladder === null
      ? slope.terrain.point(from.along)
      : slope.ladder(from.ladder).point(from.rung);
  }

  /** Where a hauler can haul them up from (#239): within the haul's reach of their way back up
   * the rope; and, hanging off a ladder that stands, of either of its ends across a crevasse, or
   * of its top up a wall: the rope along it is anchored past its ends, and whoever pulls it in at
   * one brings them up there. None for one who doesn't hang. */
  haulPoints(slope: Slope): readonly HaulPoint[] {
    const lift = this.liftPoint(slope);
    const falling = this.falling;
    if (lift === null || falling === null) {
      return [];
    }
    const own: HaulPoint = { point: lift, lip: null };
    const from = falling.from;
    if (falling.lip !== null || from?.ladder == null) {
      return [own];
    }
    const ladder = slope.ladder(from.ladder);
    if (ladder.condition === "broken") {
      return [own];
    }
    const ends = ladder.ends.map((along) => ({ point: slope.terrain.point(along), lip: along }));
    const top = ends.reduce((high, end) => (end.point.y > high.point.y ? end : high));
    return [own, ...(ladder.across ? ends : [top])];
  }

  /** Whether they can haul someone now: holding the haul, on their feet on the ground, alive and
   * with a stride to brace on; and where they stand. */
  hauler(slope: Slope): Point | null {
    const able =
      this.haulHeld &&
      !this.killed &&
      this.falling === null &&
      this.onLadder === null &&
      this.onIce === null &&
      this.lowering === null &&
      this.refitting <= 0 &&
      this.stride > 0;
    return able ? slope.terrain.point(this.along) : null;
  }

  /** How hard they haul: their stride's share of the haul's speed. */
  get haulStride(): number {
    return this.stride;
  }

  /** The ladder under them broke: off it they fall, straight down, from the rung they stood on;
   * their rope holds them if they're clipped (#209). */
  offBroken(ladder: Ladder, slope: Slope, step: number): void {
    const on = this.onLadder;
    if (on?.ladder !== ladder || this.killed) {
      return;
    }
    this.fall(slope, Climber.DOWN, 0, step, {
      ladder: ladder.id,
      rung: on.rung,
      along: this.along,
    });
    if (this.falling !== null) {
      // Out to the nearer lip, along the rope.
      this.falling.broke = true;
      this.falling.lip = ladder.end(on.rung <= ladder.length / 2 ? -1 : 1).along;
    }
  }

  /** Straight down. */
  private static readonly DOWN: Point = { x: 0, y: -1 };

  /** Off their feet, thrown down the section, toward its start, at the knock's speed: what a
   * hazard does when it goes. One already falling falls on. */
  knock(slope: Slope, step: number): void {
    if (this.falling === null) {
      this.fall(slope, slope.terrain.ahead(this.along, -1), slope.settings.knock, step);
    }
  }

  /** Killed by a hazard: knocked down as by `knock`, and they never get up. */
  kill(slope: Slope, step: number): void {
    this.knock(slope, step);
    this.killed = true;
    this.walking = "stop";
  }

  /** How far along the ground they are: their feet, or the ground nearest their body. */
  alongNow(slope: Slope): number {
    return slope.terrain.nearest(this.where(slope)).along;
  }

  /** The ropes their cowstails are clipped to. */
  get ropes(): readonly Rope[] {
    return this.carabiners.map(({ rope }) => rope);
  }

  /**
   * Along the ground at the speed their stride's power pays for on its steepness, no faster than
   * the fastest walk, up to the next corner or ladder's end, and at their technique's share of it
   * clipped to a rope. Ground too steep to walk up stops them, and so does the ground under a
   * ladder; ground too steep to walk down is a fall. Each metre walked on steep snow or blue ice
   * slips at the same chance, however fast: more the steeper it is (#208).
   */
  private walkGround(slope: Slope, moment: Moment): void {
    const way = Climber.WAYS[this.walking];
    const roped = this.down ? this.ropedDown(slope, way) : null;
    if (roped !== null) {
      this.lowering = new Lowering(roped);
      this.lower(this.lowering, slope, moment);
      return;
    }
    if (way === 0 || slope.underLadder(this.along, way)) {
      return;
    }
    const { terrain, walking } = slope;
    const ahead = terrain.ahead(this.along, way);
    const steepness = Steepness.ofWay(ahead.x, ahead.y);
    const step = walking.step(steepness, this.stride);
    // Their technique's share, clipped or not, and never past the fastest walk (#197).
    const speed = Math.min(step.speed * this.technique, slope.settings.fastestWalk);
    if (walking.steeperUp(steepness)) {
      return;
    }
    if (walking.steeperDown(steepness)) {
      // On the rope that runs down it, they stop at the edge, to lower themselves down it.
      if (this.ropedDown(slope, way) === null) {
        this.fall(slope, ahead, speed, moment.step);
      }
      return;
    }
    const stop = slope.stopAhead(this.along, way);
    const walked = this.along + way * speed * SimulationClock.STEP_SECONDS;
    const along = way > 0 ? Math.min(walked, stop) : Math.max(walked, stop);
    if (this.mayStep(terrain.point(along), slope)) {
      const metres = Math.abs(along - this.along);
      this.along = along;
      this.exertion = step.exertion;
      const { footing } = slope.settings;
      const ice = slope.onIce(along)
        ? footing.ice * (1 + footing.iceSteep * Math.abs(steepness.sine))
        : 0;
      this.stepped(slope, moment, ahead, speed, metres, slope.slipChance.at(steepness) + ice);
    }
  }

  /** Whether their key points down: straight down, or down and to a side. */
  private get down(): boolean {
    return this.walking === "down" || this.walking.startsWith("down-");
  }

  /** The face of ice that drops from the lip they stand at, the way along the ground `way` points
   * (either way, for straight down), with a rope they're clipped to running down it (`Rope.
   * runsDown`). None where a ladder stands at the lip, which is the way down there, or where no
   * rope of theirs runs down it. */
  private ropedDown(slope: Slope, way: Way | 0): Face | null {
    const face = slope.faces.below(this.along, Climber.AT_LIP);
    if (face === null || slope.ladderEndBy(face.top, Slope.BY_A_LADDER)) {
      return null;
    }
    const downward: Way = face.up > 0 ? -1 : 1;
    if (way !== 0 && way !== downward) {
      return null;
    }
    const { cowstail } = slope.settings;
    return this.carabiners.some(({ rope }) => rope.runsDown(face, cowstail)) ? face : null;
  }

  /**
   * Lowering down a face on its rope: a key that points down takes their feet down the face's
   * line at the rappel's speed, their technique's share of it, to its foot, where they're on their
   * feet; one that points up takes them back up it on the jumar, at the climb back's, to its lip.
   * Their ropes hold them as they go, and the rope through their descender holds a slip: there's
   * none. Off the rope down it, nothing holds them, and they fall. On their front points against
   * the ice, it takes the share of their power hanging on the tools does, and all of it going
   * back up.
   */
  private lower(lowering: Lowering, slope: Slope, moment: Moment): void {
    const { face } = lowering;
    const { terrain, settings } = slope;
    if (!this.carabiners.some(({ rope }) => rope.runsDown(face, settings.cowstail))) {
      this.fall(slope, Climber.DOWN, 0, moment.step);
      return;
    }
    const up = this.walking === "up" || this.walking.startsWith("up-");
    const jumar = this.first !== null && this.gear.jumar;
    this.exertion = settings.iceClimb.hang;
    if ((!this.down && !(up && jumar)) || this.stride <= 0) {
      return;
    }
    const speed = (this.down ? settings.rappel : settings.climbBack) * this.stride * this.technique;
    const end = this.down ? face.foot : face.top;
    const way: Way = end > this.along ? 1 : -1;
    const room = Math.abs(end - this.along);
    const metres = Math.min(speed * SimulationClock.STEP_SECONDS, room);
    const next = this.along + way * metres;
    if (!this.mayStep(terrain.point(next), slope)) {
      return;
    }
    this.along = metres >= room - Climber.EXACT ? end : next;
    this.moving = true;
    this.exertion = up ? 1 : settings.iceClimb.hang;
    if (this.along === end) {
      // At the foot, or back at the lip: on their feet.
      this.lowering = null;
    }
  }

  /** Along a ladder at their technique's share of its speed for its steepness the way they go,
   * and off it onto the ground at its end. */
  private climb(onLadder: OnLadder, slope: Slope, moment: Moment): void {
    const { ladder, rung } = onLadder;
    const way = ladder.way(this.walking);
    if (way === 0) {
      return;
    }
    const steepness = ladder.steepness(way);
    const share = this.stride * this.technique;
    const speed = slope.ladderSpeed.at(steepness) * share;
    const end = ladder.end(way);
    const climbed = rung + way * speed * SimulationClock.STEP_SECONDS;
    const next = way > 0 ? Math.min(climbed, end.rung) : Math.max(climbed, end.rung);
    if (!this.mayStep(ladder.point(next), slope)) {
      return;
    }
    const { bounce, crampon } = slope.settings.footing;
    // A crampon not checked comes loose on a ladder, once they've been on the move long enough.
    if (!this.kit.crampons && !this.cramponLoose && this.onTheMove >= crampon.looseAfter) {
      this.cramponLoose = true;
    }
    ladder.shake(next - rung, bounce.excite);
    ladder.passed(rung, next, moment.step, this.id);
    const chance = slope.ladderSlipChance.at(steepness) + bounce.slip * ladder.bounce;
    this.onLadder = next === end.rung ? null : new OnLadder(ladder, next);
    this.along = next === end.rung ? end.along : this.along;
    this.exertion = 1;
    this.stepped(slope, moment, ladder.ahead(way), speed, Math.abs(next - rung), chance, {
      ladder: ladder.id,
      rung: next,
      along: this.along,
    });
  }

  /** The ladder their way steps onto from where they stand, at its end there. */
  private ladderAhead(slope: Slope): OnLadder | null {
    const ladder = slope.ladderFrom(this.along, this.walking);
    return ladder === null ? null : new OnLadder(ladder, ladder.rungAt(this.along));
  }

  /** Whether every rope they're clipped to lets them stand at `foot`. */
  private ropesLet(foot: Point, slope: Slope): boolean {
    return this.holder(foot, slope) === null;
  }

  /** Whether their ropes let them step to `foot`, the step their key asks for; if not, what held
   * them back is noted for their view (#247). */
  private mayStep(foot: Point, slope: Slope): boolean {
    const holder = this.holder(foot, slope);
    if (holder !== null) {
      this.heldBack = holder;
    }
    return holder === null;
  }

  /** What of their ropes keeps them from `foot`: a rope's length, which no carabiner runs past,
   * where even a running one wouldn't let them; else the jumar, gripping where it is; none where
   * every rope lets them. */
  private holder(foot: Point, slope: Slope): "jumar" | "rope" | null {
    const { cowstail } = slope.settings;
    const refusing = this.carabiners.filter(
      (carabiner) => !carabiner.lets(foot, cowstail, this.grips(carabiner)),
    );
    if (refusing.length === 0) {
      return null;
    }
    return refusing.some((carabiner) => !carabiner.lets(foot, cowstail, false)) ? "rope" : "jumar";
  }

  /** After a step of `metres` `ahead` at `speed`, from `on` the rung it ended on, if any: the
   * carabiners follow, and the step slips at `chance` a metre, divided by how sure-footed they are
   * (#208), drawn from the expedition's chance. A step on safe ground draws nothing. */
  private stepped(
    slope: Slope,
    moment: Moment,
    ahead: Point,
    speed: number,
    metres: number,
    chance: number,
    on: FromSave | null = null,
  ): void {
    this.moving = true;
    this.took = true;
    this.onTheMove += SimulationClock.STEP_SECONDS;
    this.slide(slope);
    const sure = this.sure(slope);
    this.slipChance = chance <= 0 ? 0 : sure > 0 ? chance / sure : Number.POSITIVE_INFINITY;
    if (this.slipChance > 0 && metres > 0) {
      if (moment.random.chance(Math.min(1, this.slipChance * metres))) {
        this.fall(slope, ahead, speed, moment.step, on);
      }
    }
  }

  /** How sure-footed they are now: as the body makes them, and less on a loose crampon. */
  private sure(slope: Slope): number {
    return this.sureness * (this.cramponLoose ? slope.settings.footing.crampon.loose : 1);
  }

  /** Whether a carabiner of theirs grips its rope: the jumar does, if they carry one, unless
   * they're on their feet with their hand sliding it, or climbing back up the rope on it, where it holds them only as
   * they let go (#209). */
  private grips(carabiner: Carabiner): boolean {
    const sliding = (this.jumarHeld || this.lowering !== null) && this.falling === null;
    const jumar = carabiner === this.first && this.gear.jumar;
    return jumar && !sliding && this.falling?.holding !== true;
  }

  /** Their feet, on the ground or on a ladder, or their body in a fall. */
  private where(slope: Slope): Point {
    return this.falling?.body ?? this.onLadder?.point ?? slope.terrain.point(this.along);
  }

  /** The carabiners clipped to a rope, the first cowstail's first. */
  private get carabiners(): readonly Carabiner[] {
    return [this.first, this.second].filter((carabiner) => carabiner !== null);
  }

  private cowstail(cowstail: "first" | "second"): Carabiner | null {
    return cowstail === "first" ? this.first : this.second;
  }

  private clip(cowstail: "first" | "second", carabiner: Carabiner | null): void {
    if (cowstail === "first") {
      this.first = carabiner;
    } else {
      this.second = carabiner;
    }
  }

  /** Self-arrest: the ice axe driven into the ground at `axe`, within reach above their body,
   * ends a slide still slow enough to hold, and they stand where it stopped. In the air, or
   * too fast, it holds nothing. */
  private arrest(axe: Point, slope: Slope): void {
    const { falling } = this;
    if (falling === null || !falling.grounded) {
      return;
    }
    const { body } = falling;
    const { arrestSpeed, axeReach } = slope.settings;
    const x = axe.x - body.x;
    const y = axe.y - body.y;
    const reached = y >= 0 && Math.sqrt(x * x + y * y) <= axeReach;
    if (reached && body.speed(slope.substepSeconds) <= arrestSpeed) {
      this.stand(falling, slope.terrain.nearest(body).along);
    }
  }

  /** Off their feet from where they stand, going `ahead` at `speed`: off a ladder, past it,
   * from the rung `on` it they stood on, or from the ground; in the air if their feet weren't on
   * it. */
  private fall(
    slope: Slope,
    ahead: Point,
    speed: number,
    step: number,
    on: FromSave | null = null,
  ): void {
    const foot = this.where(slope);
    const seconds = slope.substepSeconds;
    const body = new Particle(
      foot.x,
      foot.y,
      foot.x - ahead.x * speed * seconds,
      foot.y - ahead.y * speed * seconds,
    );
    const from: FromSave =
      on ??
      (this.onLadder === null
        ? { ladder: null, rung: 0, along: this.along }
        : { ladder: this.onLadder.ladder.id, rung: this.onLadder.rung, along: this.along });
    this.onLadder = null;
    this.onIce = null;
    this.lowering = null;
    this.towardViewer = false;
    this.falling = new Falling(body, step, foot.y, foot.y, speed, from);
  }

  /**
   * A tool pointed at the ice. The ice axe: on the ice already, the next pick, swung in where it
   * was pointed if their arm reaches it, between the height of their shoulder and full stretch
   * above their feet, or over the lip of their face; standing at a face's foot, on a ledge of it,
   * or hanging against it on their rope, the first pick, and they're on the ice, but never once
   * they stand on its lip. The crampons,
   * pointed down a face from its lip: they turn to face the ice, the axe planted over the lip, and
   * step down onto it. A pick swung at full stretch, or into brittle ice, bites poorly. On the axe
   * alone there's a moment with no pick in the ice as it swings, and now and then that's a fall.
   */
  private place(swing: Pick<Tool, "tool" | "x" | "y">, slope: Slope, moment: Moment): void {
    if (
      this.gear.tools <= 0 ||
      this.onLadder !== null ||
      this.lowering !== null ||
      this.refitting > 0
    ) {
      return;
    }
    const { terrain, settings } = slope;
    const ice = settings.iceClimb;
    const surface = terrain.nearest(swing);
    if (Climber.distance(surface, swing) > ice.snap) {
      return;
    }
    if (swing.tool === "crampons") {
      this.stepDown(surface.along, slope);
      return;
    }
    const found = slope.faceFor(surface.along);
    if (found === null) {
      return;
    }
    const { falling, onIce } = this;
    if (falling !== null) {
      // Hanging against the ice, or lying at its foot: near enough to swing a pick into it.
      const body = terrain.nearest(falling.body);
      const near = Climber.distance(body, falling.body) <= settings.axeReach;
      const still = this.hangs(slope) || falling.grounded;
      if (!near || !still || !this.reaches(found, surface, body, body.y, slope)) {
        return;
      }
      this.stand(falling, body.along);
      this.onIce = new OnIce(found.face, [surface.along], this.bitesPoorly(surface, body.y, slope));
      return;
    }
    if (onIce === null && this.along === found.face.top) {
      // On their feet on its lip, they're up it: down it is the crampons', kicked in below them.
      return;
    }
    const feet = terrain.point(this.along);
    if (!this.reaches(found, surface, { along: this.along }, feet.y, slope)) {
      return;
    }
    if (onIce === null) {
      this.onIce = new OnIce(found.face, [surface.along], this.bitesPoorly(surface, feet.y, slope));
      return;
    }
    if (found.face !== onIce.face) {
      return;
    }
    if (this.gear.tools < 2) {
      // The axe alone: out of the ice as it swings, on the front points.
      const sure = this.sure(slope);
      const chance = sure > 0 ? ice.swingSlip / sure : 1;
      if (moment.random.chance(Math.min(1, chance))) {
        this.fall(slope, Climber.DOWN, 0, moment.step);
        return;
      }
    }
    onIce.picks = this.gear.tools < 2 ? [surface.along] : [surface.along, onIce.hold];
    onIce.poor = this.bitesPoorly(surface, feet.y, slope);
  }

  /** Whether a climber whose feet are at `feet`, `height` high, reaches a pick's place on a
   * face: their feet on that face or at its foot, and the place between their shoulder and their
   * full stretch above them, or over its lip within their stretch. */
  private reaches(
    { face, over }: { readonly face: Face; readonly over: boolean },
    place: Point,
    feet: { readonly along: number },
    height: number,
    slope: Slope,
  ): boolean {
    const { reach, lockOff } = slope.settings.iceClimb;
    const atFace = face.holds(feet.along) || Math.abs(feet.along - face.foot) <= Climber.AT_FACE;
    const rise = place.y - height;
    const low = over ? 0 : lockOff;
    return atFace && rise >= low - Climber.EXACT && rise <= reach + Climber.EXACT;
  }

  /** Whether a pick swung in at `place` by a climber whose feet are `height` high bites poorly:
   * at full stretch, or into brittle ice. */
  private bitesPoorly(
    place: { readonly along: number; readonly y: number },
    height: number,
    slope: Slope,
  ): boolean {
    return place.y - height > slope.settings.iceClimb.stretch || slope.onBrittle(place.along);
  }

  /** From a face's lip, down onto it: pointed at the face below their feet, they turn to face the
   * ice, plant the axe over the lip and step down onto their front points. */
  private stepDown(pointed: number, slope: Slope): void {
    if (this.falling !== null || this.onIce !== null || this.lowering !== null) {
      return;
    }
    const face = slope.faces.below(this.along, Climber.AT_LIP);
    if (face === null || slope.faces.at(pointed) !== face) {
      return;
    }
    const { terrain, settings } = slope;
    const planted = face.top + face.up * settings.iceClimb.overLip;
    const lip = Math.min(Math.max(planted, 0), terrain.length);
    if (!this.ropesLet(terrain.point(face.top), slope)) {
      return;
    }
    this.along = face.top;
    this.onIce = new OnIce(face, [lip], false);
  }

  /**
   * On the ice: a key that points up walks their feet up the face until the pick they hang from
   * is at their shoulder, and one that points down, down it until their arm is straight; the next
   * pick, swung in, takes them further. A pick planted over the lip takes them up onto the ground
   * at the top, and the face's foot puts them back on their feet. They go at the ice's speed, a
   * share of it on the axe alone, as far as their ropes let them, and each metre slips at the
   * ice's chance: more on the axe alone, and more on a pick that bites poorly. Hanging still on
   * the tools is work too.
   */
  private climbIce(onIce: OnIce, slope: Slope, moment: Moment): void {
    const { terrain, settings } = slope;
    const ice = settings.iceClimb;
    const { face } = onIce;
    this.moving = true;
    this.exertion = ice.hang;
    const up = this.walking === "up" || this.walking.startsWith("up-");
    const down = this.walking === "down" || this.walking.startsWith("down-");
    if ((!up && !down) || this.stride <= 0) {
      return;
    }
    const hold = terrain.point(onIce.hold).y;
    const over = !face.holds(onIce.hold);
    const limit = up
      ? face.alongAt(over ? face.topHeight : hold - ice.lockOff)
      : face.alongAt(hold - ice.reach);
    const way: Way = up ? face.up : face.up > 0 ? -1 : 1;
    const room = (limit - this.along) * way;
    if (room <= Climber.EXACT) {
      return;
    }
    const twoTools = this.gear.tools >= 2;
    const speed = ice.speed * this.stride * this.technique * (twoTools ? 1 : ice.oneTool);
    const metres = Math.min(speed * SimulationClock.STEP_SECONDS, room);
    const next = this.along + way * metres;
    if (!this.mayStep(terrain.point(next), slope)) {
      return;
    }
    const ahead = terrain.ahead(this.along, way);
    this.along = next;
    this.exertion = 1;
    const off = up ? face.top : face.foot;
    if (Math.abs(next - off) <= Climber.EXACT) {
      // Over the lip, or down at the foot: on their feet.
      this.along = off;
      this.onIce = null;
    }
    const chance = ice.slip * (twoTools ? 1 : ice.oneToolSlip) * (onIce.poor ? ice.poor : 1);
    this.stepped(slope, moment, ahead, speed, metres, chance);
  }

  /** Where a climber who slipped at `along` gets back on their feet: there, or, off a face of
   * ice, where nobody stands, at its top, up the rope they hang on; or at its foot, where that
   * rope is anchored below the face and reaches no higher (#197): they let themselves down to it. */
  private offTheFace(along: number, slope: Slope): number {
    const face = slope.faces.at(along);
    if (face === null || along === face.foot || along === face.top) {
      return along;
    }
    const top = slope.terrain.point(face.top);
    const { cowstail } = slope.settings;
    const reaches = this.carabiners.some((carabiner) => carabiner.lets(top, cowstail, false));
    return reaches || this.carabiners.length === 0 ? face.top : face.foot;
  }

  private static distance(from: Point, to: Point): number {
    const x = to.x - from.x;
    const y = to.y - from.y;
    return Math.sqrt(x * x + y * y);
  }
}
