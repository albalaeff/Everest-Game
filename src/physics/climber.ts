import { SimulationClock } from "../simulation";
import type { ClimberId, GameAction, Moment, Walk } from "../simulation";
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
};

/** What a climber checked of their kit before setting off (#196): their crampons fitted and
 * strapped, fresh batteries in their headlamp, their water bottles filled. */
export type Kit = {
  readonly crampons: boolean;
  readonly lamp: boolean;
  readonly water: boolean;
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
  /** How sure their feet are, from 1, steady, to 0, when they slip (#190). */
  readonly footing: number;
  /** Hanging on their rope off the ground, where they can climb back up it to where they
   * slipped. */
  readonly hanging: boolean;
  /** What they checked of their kit; whether a crampon has come loose, and whether they're
   * refitting it (#196). */
  readonly kit: Kit;
  readonly cramponLoose: boolean;
  readonly refitting: boolean;
}

type CarabinerSave = { readonly rope: string; readonly slide: Slide };

type OnLadderSave = { readonly ladder: string; readonly rung: number };

/** Where a climber slipped from: a ladder's rung, or the ground `along` it where `ladder` is
 * null. */
type FromSave = {
  readonly ladder: string | null;
  readonly rung: number;
  readonly along: number;
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
};

/** A climber as saves keep them. */
export type ClimberSave = {
  readonly id: ClimberId;
  /** The share of the speed they go at on a ladder or clipped to a rope. */
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
  /** Missing from the saves of builds before footing (#190): steady, and sure. */
  readonly footing?: number;
  readonly sureness?: number;
  /** Missing from the saves of builds before the gear check (#196): all of it checked, and
   * nothing loose. */
  readonly kit?: Kit;
  readonly cramponLoose?: boolean;
  readonly refitting?: number;
  readonly onTheMove?: number;
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

/** A fall going on: the body, where it began, and what the fall's record will say. */
class Falling {
  /** Whether the body touched the ground in the last sub-step. */
  grounded = false;
  /** The hardest it has hit the ground, in m/s into it. */
  impact = 0;
  /** Whether the climber holds on where they hang, climbing back up their rope: gravity has
   * them no more. */
  holding = false;
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
    return falling;
  }

  save(): FallingSave {
    const { step, top, lowest, speed, grounded, impact, holding, from } = this;
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

  record(held: boolean): Fall {
    const { step, impact } = this;
    return { step, drop: this.top - this.lowest, speed: this.speed, impact, held };
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
    /** How sure their feet are, from 1 to 0, when they slip; and how sure-footed the body makes
     * them, at their pace and as tired as they are, a share. */
    private footing: number,
    private sureness: number,
    private readonly kit: Kit,
    /** Whether a crampon has come loose; the seconds of a refit left; and the seconds they've
     * been on the move. */
    private cramponLoose: boolean,
    private refitting: number,
    private onTheMove: number,
  ) {}

  /** Everything checked. */
  static readonly CHECKED: Kit = { crampons: true, lamp: true, water: true };

  /** A climber standing at `along`, still, clipped to nothing, going at `technique`'s share of
   * the speed on ladders and ropes, with what they checked of their `kit`. */
  static standing(
    id: ClimberId,
    along: number,
    technique: number,
    kit: Kit = Climber.CHECKED,
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
      1,
      1,
      kit,
      false,
      0,
      0,
    );
  }

  static load(save: ClimberSave, slope: Slope): Climber {
    const carabiner = (clip: CarabinerSave | null) =>
      clip === null ? null : new Carabiner(slope.rope(clip.rope), clip.slide);
    return new Climber(
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
      save.footing ?? 1,
      save.sureness ?? 1,
      save.kit ?? Climber.CHECKED,
      save.cramponLoose ?? false,
      save.refitting ?? 0,
      save.onTheMove ?? 0,
    );
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
      footing: this.footing,
      sureness: this.sureness,
      kit: this.kit,
      cramponLoose: this.cramponLoose,
      refitting: this.refitting,
      onTheMove: this.onTheMove,
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
      footing: this.footing,
      hanging: this.hangs(slope),
      kit: this.kit,
      cramponLoose: this.cramponLoose,
      refitting: this.refitting > 0,
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
    }
    if (action.kind === "jumar") {
      this.jumarHeld = action.held;
    }
    if (
      action.kind === "clip" &&
      this.falling === null &&
      this.cowstail(action.cowstail) === null
    ) {
      const nearest = slope.ropeWithin(this.where(slope));
      if (nearest !== null) {
        this.clip(action.cowstail, new Carabiner(nearest.rope, nearest.slide));
      }
    }
    if (action.kind === "unclip") {
      this.clip(action.cowstail, null);
    }
    if (action.kind === "tool" && action.tool === "ice-axe") {
      this.arrest(action, slope);
    }
    // Their crampons, on their feet on the ground with one loose: they kneel to refit it.
    if (
      action.kind === "tool" &&
      action.tool === "crampons" &&
      this.cramponLoose &&
      this.falling === null &&
      this.onLadder === null &&
      this.refitting <= 0
    ) {
      this.refitting = slope.settings.footing.crampon.refit;
    }
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
   */
  walk(slope: Slope, moment: Moment): void {
    this.moving = false;
    this.exertion = 0;
    if (this.killed) {
      return;
    }
    if (this.falling !== null) {
      this.climbBack(this.falling, slope);
      return;
    }
    if (this.refitting > 0) {
      // Kneeling to refit a crampon: no step till it's on, and steady while they're down.
      this.refitting = Math.max(0, this.refitting - SimulationClock.STEP_SECONDS);
      if (this.refitting === 0) {
        this.cramponLoose = false;
      }
      this.steadyIfStill(slope);
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
    this.steadyIfStill(slope);
  }

  /** On their feet and still, they steady themselves. */
  private steadyIfStill(slope: Slope): void {
    if (!this.moving && this.falling === null) {
      this.steady(slope.settings.footing.still, slope);
    }
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
      if (this.standable(along, slope)) {
        this.stand(falling, along, slope);
      }
    }
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

  /** Back on their feet after a fall, at `along`: shaken, their footing what it is after a slip. */
  private stand(falling: Falling, along: number, slope: Slope): void {
    this.falls.push(falling.record(this.carabiners.length > 0));
    this.along = along;
    this.falling = null;
    this.footing = slope.settings.footing.afterSlip;
  }

  /** Whether they hang on their rope off the ground, to climb back up it to where they slipped:
   * alive, clipped, and their body in the air, against a wall's face, or held where they've
   * climbed to. */
  private hangs(slope: Slope): boolean {
    const { falling } = this;
    if (falling === null || falling.from === null || this.killed || this.carabiners.length === 0) {
      return false;
    }
    if (falling.holding || !falling.grounded) {
      return true;
    }
    return !this.standable(slope.terrain.nearest(falling.body).along, slope);
  }

  /** Hanging on their rope, a key that points up climbs them back up it toward where they
   * slipped, at the climb's speed: up a wall's face and over its lip, never through the ice, holding
   * on where they are as they go. Back on that rung, or on ground they can stand on, they're on
   * their feet, shaken. */
  private climbBack(falling: Falling, slope: Slope): void {
    const up = this.walking === "up" || this.walking.startsWith("up-");
    const { from } = falling;
    if (!up || !this.hangs(slope) || from === null || this.stride === 0) {
      return;
    }
    const target =
      from.ladder === null
        ? slope.terrain.point(from.along)
        : slope.ladder(from.ladder).point(from.rung);
    const { body } = falling;
    const x = target.x - body.x;
    const y = target.y - body.y;
    const away = Math.sqrt(x * x + y * y);
    const step =
      slope.settings.climbBack * this.stride * this.technique * SimulationClock.STEP_SECONDS;
    falling.holding = true;
    this.moving = true;
    this.exertion = 1;
    if (away <= step) {
      if (from.ladder !== null) {
        this.onLadder = new OnLadder(slope.ladder(from.ladder), from.rung);
      }
      this.stand(falling, from.along, slope);
      return;
    }
    const next = { x: body.x + (x / away) * step, y: body.y + (y / away) * step };
    const { terrain } = slope;
    if (!terrain.holds(next)) {
      body.place(next.x, next.y);
      return;
    }
    // The ice is in the way: along its surface, up a wall's face, and on the ground at its top.
    const surface = terrain.nearest(next);
    body.place(surface.x, surface.y);
    if (from.ladder === null && this.standable(surface.along, slope)) {
      this.stand(falling, surface.along, slope);
    }
  }

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
   * ladder; ground too steep to walk down is a fall. Each metre walked on a steepness slips at
   * the same chance, however fast.
   */
  private walkGround(slope: Slope, moment: Moment): void {
    const way = Climber.WAYS[this.walking];
    if (way === 0 || slope.underLadder(this.along, way)) {
      return;
    }
    const { terrain, walking, footingLoss } = slope;
    const ahead = terrain.ahead(this.along, way);
    const steepness = Steepness.ofWay(ahead.x, ahead.y);
    const step = walking.step(steepness, this.stride);
    const speed = step.speed * (this.carabiners.length > 0 ? this.technique : 1);
    if (walking.steeperUp(steepness)) {
      return;
    }
    if (walking.steeperDown(steepness)) {
      this.fall(slope, ahead, speed, moment.step);
      return;
    }
    const stop = slope.stopAhead(this.along, way);
    const walked = this.along + way * speed * SimulationClock.STEP_SECONDS;
    const along = way > 0 ? Math.min(walked, stop) : Math.max(walked, stop);
    if (this.ropesLet(terrain.point(along), slope)) {
      this.along = along;
      this.exertion = step.exertion;
      const { footing } = slope.settings;
      const ice = slope.onIce(along)
        ? footing.ice * (1 + footing.iceSteep * Math.abs(steepness.sine))
        : 0;
      const loss = ((footingLoss.at(steepness) + ice) * speed) / walking.step(steepness, 1).speed;
      this.stepped(slope, moment, ahead, speed, loss);
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
    if (!this.ropesLet(ladder.point(next), slope)) {
      return;
    }
    const { bounce, crampon } = slope.settings.footing;
    // A crampon not checked comes loose on a ladder, once they've been on the move long enough.
    if (!this.kit.crampons && !this.cramponLoose && this.onTheMove >= crampon.looseAfter) {
      this.cramponLoose = true;
    }
    ladder.shake(next - rung, bounce.excite);
    const loss = slope.ladderFootingLoss.at(steepness) * share + bounce.loss * ladder.bounce;
    this.onLadder = next === end.rung ? null : new OnLadder(ladder, next);
    this.along = next === end.rung ? end.along : this.along;
    this.exertion = 1;
    this.stepped(slope, moment, ladder.ahead(way), speed, loss, {
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
    const { cowstail } = slope.settings;
    return this.carabiners.every((carabiner) =>
      carabiner.lets(foot, cowstail, this.grips(carabiner)),
    );
  }

  /** After a step `ahead` at `speed`, from `on` the rung it ended on, if any: the carabiners
   * follow, and the step costs footing at `loss` a second and gives it back as far as they're
   * sure-footed; with none left, it's a slip. */
  private stepped(
    slope: Slope,
    moment: Moment,
    ahead: Point,
    speed: number,
    loss: number,
    on: FromSave | null = null,
  ): void {
    this.moving = true;
    this.onTheMove += SimulationClock.STEP_SECONDS;
    this.slide(slope);
    const { moving } = slope.settings.footing;
    this.footing = Math.min(
      1,
      this.footing + (moving * this.sure(slope) - loss) * SimulationClock.STEP_SECONDS,
    );
    // Only a step that costs footing can slip: one on safe ground never does.
    if (this.footing <= 0 && loss > 0) {
      this.footing = 0;
      this.fall(slope, ahead, speed, moment.step, on);
    }
    this.footing = Math.max(this.footing, 0);
  }

  /** Standing, their footing comes back at `rate` a second, as far as they're sure-footed. */
  private steady(rate: number, slope: Slope): void {
    this.footing = Math.min(
      1,
      this.footing + rate * this.sure(slope) * SimulationClock.STEP_SECONDS,
    );
  }

  /** How sure-footed they are now: as the body makes them, and less on a loose crampon. */
  private sure(slope: Slope): number {
    return this.sureness * (this.cramponLoose ? slope.settings.footing.crampon.loose : 1);
  }

  /** Whether a carabiner of theirs grips its rope: the jumar does, unless they're on their feet
   * with their hand sliding it. */
  private grips(carabiner: Carabiner): boolean {
    return carabiner === this.first && !(this.jumarHeld && this.falling === null);
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
      this.stand(falling, slope.terrain.nearest(body).along, slope);
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
    this.falling = new Falling(body, step, foot.y, foot.y, speed, from);
  }
}
