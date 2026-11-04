import { SimulationClock } from "../simulation";
import type { ClimberId, GameAction, Moment, Walk } from "../simulation";
import type { Ladder } from "./ladder";
import { Particle } from "./particle";
import type { ParticleSave } from "./particle";
import type { Rope, Slide } from "./rope";
import { Slope } from "./slope";
import { Steepness } from "./steepness";
import type { Point, Way } from "./terrain";

/** A fall, once it's over: the step it began on, how far down it went, and its top speed. */
export type Fall = {
  readonly step: number;
  /** Metres from where it began down to its lowest point. */
  readonly drop: number;
  /** Metres a second. */
  readonly speed: number;
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
  /** The rope each cowstail is clipped to, or none: the first's is the jumar's. */
  readonly first: string | null;
  readonly second: string | null;
  /** The ladder they're on, or none. */
  readonly ladder: string | null;
  /** Each fall that's over, in order. */
  readonly falls: readonly Fall[];
}

type CarabinerSave = { readonly rope: string; readonly slide: Slide };

type OnLadderSave = { readonly ladder: string; readonly rung: number };

type FallingSave = {
  readonly step: number;
  readonly top: number;
  readonly lowest: number;
  readonly speed: number;
  readonly grounded: boolean;
  readonly body: ParticleSave;
};

/** A climber as saves keep them. */
export type ClimberSave = {
  readonly id: ClimberId;
  /** Where they stand, along the ground, when they're on their feet and not on a ladder. */
  readonly along: number;
  readonly onLadder: OnLadderSave | null;
  readonly walking: Walk["direction"];
  readonly stride: number;
  readonly moving: boolean;
  /** Whether their hand slides the jumar: its key is held. */
  readonly jumarHeld: boolean;
  readonly first: CarabinerSave | null;
  readonly second: CarabinerSave | null;
  readonly falling: FallingSave | null;
  readonly falls: readonly Fall[];
  readonly dead: boolean;
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

/** A fall going on: the body, and what the fall's record will say. */
class Falling {
  /** Whether the body touched the ground in the last sub-step. */
  grounded = false;
  /** Where the body was when the step began. */
  private startX: number;
  private startY: number;

  constructor(
    readonly body: Particle,
    readonly step: number,
    private readonly top: number,
    private lowest: number,
    private speed: number,
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
    );
    falling.grounded = save.grounded;
    return falling;
  }

  save(): FallingSave {
    const { step, top, lowest, speed, grounded } = this;
    return { step, top, lowest, speed, grounded, body: this.body.save() };
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

  record(): Fall {
    return { step: this.step, drop: this.top - this.lowest, speed: this.speed };
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
    private along: number,
    private onLadder: OnLadder | null,
    private walking: Walk["direction"],
    private stride: number,
    private moving: boolean,
    private jumarHeld: boolean,
    private first: Carabiner | null,
    private second: Carabiner | null,
    private falling: Falling | null,
    private readonly falls: Fall[],
    private killed: boolean,
  ) {}

  /** A climber standing at `along`, still, clipped to nothing. */
  static standing(id: ClimberId, along: number): Climber {
    return new Climber(id, along, null, "stop", 1, false, false, null, null, null, [], false);
  }

  static load(save: ClimberSave, slope: Slope): Climber {
    const carabiner = (clip: CarabinerSave | null) =>
      clip === null ? null : new Carabiner(slope.rope(clip.rope), clip.slide);
    return new Climber(
      save.id,
      save.along,
      save.onLadder === null ? null : OnLadder.load(save.onLadder, slope),
      save.walking,
      save.stride,
      save.moving,
      save.jumarHeld,
      carabiner(save.first),
      carabiner(save.second),
      save.falling === null ? null : Falling.load(save.falling),
      [...save.falls],
      save.dead,
    );
  }

  save(): ClimberSave {
    return {
      id: this.id,
      along: this.along,
      onLadder: this.onLadder?.save() ?? null,
      walking: this.walking,
      stride: this.stride,
      moving: this.moving,
      jumarHeld: this.jumarHeld,
      first: this.first?.save() ?? null,
      second: this.second?.save() ?? null,
      falling: this.falling?.save() ?? null,
      falls: [...this.falls],
      dead: this.killed,
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
      first: this.first?.rope.id ?? null,
      second: this.second?.rope.id ?? null,
      ladder: this.onLadder?.ladder.id ?? null,
      falls: [...this.falls],
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
  }

  /** Sets how far their strides go from now on, as a share of the walking and ladder speeds. */
  setStride(share: number): void {
    if (!(share >= 0)) {
      throw new RangeError(`${this.id} can't take strides of ${share} times the speed`);
    }
    this.stride = share;
  }

  /**
   * Takes this step's steps, on their feet: on a ladder if they're on one or their way steps onto
   * one, and along the ground otherwise. Each goes as far as their ropes let them, and may slip.
   */
  walk(slope: Slope, moment: Moment): void {
    this.moving = false;
    if (this.falling !== null || this.killed || this.stride === 0) {
      return;
    }
    const onLadder = this.onLadder ?? this.ladderAhead(slope);
    if (onLadder === null) {
      this.walkGround(slope, moment);
    } else {
      this.climb(onLadder, slope, moment);
    }
  }

  beginStep(): void {
    this.falling?.beginStep();
  }

  integrate(slope: Slope): void {
    if (this.falling !== null) {
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

  land(slope: Slope): void {
    if (this.falling?.body.land(slope.terrain, slope.settings.friction) === true) {
      this.falling.grounded = true;
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
      this.falls.push(falling.record());
      this.along = slope.terrain.nearest(falling.body).along;
      this.falling = null;
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
   * Along the ground at the speed for its steepness, up to the next corner or ladder's end. Ground
   * too steep to walk up stops them, and so does the ground under a ladder; ground too steep to
   * walk down is a fall.
   */
  private walkGround(slope: Slope, moment: Moment): void {
    const way = Climber.WAYS[this.walking];
    if (way === 0 || slope.underLadder(this.along, way)) {
      return;
    }
    const { terrain, walkingSpeed, slipChance } = slope;
    const ahead = terrain.ahead(this.along, way);
    const steepness = Steepness.ofWay(ahead.x, ahead.y);
    const speed = walkingSpeed.at(steepness) * this.stride;
    if (walkingSpeed.steeperUp(steepness)) {
      return;
    }
    if (walkingSpeed.steeperDown(steepness)) {
      this.fall(slope, ahead, speed, moment.step);
      return;
    }
    const stop = slope.stopAhead(this.along, way);
    const walked = this.along + way * speed * SimulationClock.STEP_SECONDS;
    const along = way > 0 ? Math.min(walked, stop) : Math.max(walked, stop);
    if (this.ropesLet(terrain.point(along), slope)) {
      this.along = along;
      this.stepped(slope, moment, ahead, speed, slipChance.at(steepness) * this.stride);
    }
  }

  /** Along a ladder at its speed for its steepness the way they go, and off it onto the ground at
   * its end. */
  private climb(onLadder: OnLadder, slope: Slope, moment: Moment): void {
    const { ladder, rung } = onLadder;
    const way = ladder.way(this.walking);
    if (way === 0) {
      return;
    }
    const steepness = ladder.steepness(way);
    const speed = slope.ladderSpeed.at(steepness) * this.stride;
    const end = ladder.end(way);
    const climbed = rung + way * speed * SimulationClock.STEP_SECONDS;
    const next = way > 0 ? Math.min(climbed, end.rung) : Math.max(climbed, end.rung);
    if (!this.ropesLet(ladder.point(next), slope)) {
      return;
    }
    this.onLadder = next === end.rung ? null : new OnLadder(ladder, next);
    this.along = next === end.rung ? end.along : this.along;
    this.stepped(
      slope,
      moment,
      ladder.ahead(way),
      speed,
      slope.ladderSlipChance.at(steepness) * this.stride,
    );
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

  /** After a step `ahead` at `speed`: the carabiners follow, and the step may slip, at `chance`
   * a second. */
  private stepped(slope: Slope, moment: Moment, ahead: Point, speed: number, chance: number): void {
    this.moving = true;
    this.slide(slope);
    const draw = chance * SimulationClock.STEP_SECONDS;
    if (draw > 0 && moment.random.chance(draw)) {
      this.fall(slope, ahead, speed, moment.step);
    }
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
      this.falls.push(falling.record());
      this.along = slope.terrain.nearest(body).along;
      this.falling = null;
    }
  }

  /** Off their feet from where they stand, going `ahead` at `speed`: off a ladder, past it. */
  private fall(slope: Slope, ahead: Point, speed: number, step: number): void {
    const foot = this.where(slope);
    const seconds = slope.substepSeconds;
    const body = new Particle(
      foot.x,
      foot.y,
      foot.x - ahead.x * speed * seconds,
      foot.y - ahead.y * speed * seconds,
    );
    this.onLadder = null;
    this.falling = new Falling(body, step, foot.y, foot.y, speed);
  }
}
