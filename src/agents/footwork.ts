import type { ClimberView, Point, SlopePhysics } from "../physics";
import type { ClimberId, GameAction, Pace, Walk } from "../simulation";

/** Which way along the route a climber goes: up it, toward the camp at its top, or down it. */
export type RouteWay = "up" | "down";

/** A face of ice with no ladder, by its ends along the ground: its foot and its top. */
interface BareFace {
  readonly foot: number;
  readonly top: number;
}

/** A climber's footwork as plain data, for an agent's save: where its moves are up to. */
export type FootworkSave = {
  readonly started: boolean;
  /** The way it was last asked to go, or none: it stands. */
  readonly way: RouteWay | null;
  readonly iceWay: RouteWay;
  readonly feetBefore: number | null;
  readonly pickedAt: number | null;
  readonly iceReclip: number;
  readonly atLip: number;
  readonly pace: Pace["pace"];
  readonly beforeSlip: Walk["direction"] | null;
  readonly walking: Walk["direction"];
  readonly reclipping: number;
  readonly freedAt: number | null;
  /** The foot of the last face of ice with no ladder it went up or down. */
  readonly face: number | null;
};

/**
 * A climber's footwork on a section, as a careful climber's (#212): what they do each step to go
 * up the route or down it, or to stand. Walking up and right, or down and left, the jumar's slide
 * held, clipped to the fixed ropes with both cowstails wherever one is within reach, the
 * cowstails moved across one at a time where a rope ends at the next one's anchor, each on before
 * the other comes off, however long the clip takes (#197), and both off where a rope ends and
 * nothing follows. At a ladder down a wall ahead it walks down and right
 * onto it, and on the way down, up and left at its foot; off its other end, it walks flat. At a
 * face of ice with no ladder ahead, it climbs it on its tools, a pick at a time, each swung in
 * solid ice short of full stretch, the last over the lip; at the lip of one, it steps down onto
 * its front points and climbs down it, a pick lower each time, or lowers itself down the rope
 * that runs down it. On blue ice and on a ladder across a crevasse it takes the rest step, where
 * a slip is likeliest (#208), unless it's told not to; hanging on its rope after a slip, it climbs
 * back up, and goes on its way. Asked to stand, it stops on its feet and stays clipped; a new way
 * takes over once it's on its feet on the ground, off any ladder, ice or rope down a step.
 * The Sherpa's agent moves on it, and the tests' walkers too.
 */
export class Footwork {
  /** How high over its feet it swings a pick, going up, most wanted first: as high as it bites
   * well, short of full stretch, and lower, a little at a time, where the ice there is brittle.
   * Going down, as low as it goes, a little over the shoulder. */
  private static readonly PICKS_UP = Array.from({ length: 11 }, (_, lower) => 1.95 - lower * 0.05);
  private static readonly PICK_DOWN = 1.45;
  /** How far past a face's lip it plants its last pick, along the ground, and how far below the
   * lip it points its front points to step down. */
  private static readonly OVER_LIP = 0.3;
  private static readonly STEP_DOWN = 1;
  /** A re-clip, an action a step: the second cowstail off the old rope and onto the new, then the
   * first. */
  private static readonly RECLIP: readonly (readonly ["unclip" | "clip", "first" | "second"])[] = [
    ["unclip", "second"],
    ["clip", "second"],
    ["unclip", "first"],
    ["clip", "first"],
  ];
  /** How near two heights or lengths are to be the same, and how near a face's end the climber
   * stands to be at it: the physics' lip. */
  private static readonly EXACT = 1e-9;
  private static readonly AT_FACE = 0.6;
  /** How far past where it unclipped the climber goes before it clips again: the old rope's
   * anchor is still within reach there. */
  private static readonly FREE_METRES = 1;
  /** How near a ladder's end it stands, each way, to change its cowstails over there to the rope
   * within reach before it steps on, in metres: a cowstail's reach of the rope's anchor (#228). */
  private static readonly AT_A_LADDER = 0.8;
  private static readonly WAYS: Readonly<Record<RouteWay, Walk["direction"]>> = {
    up: "up-right",
    down: "down-left",
  };
  /** The way's key for a ladder down a wall, which the way's own key doesn't climb: down it on the
   * way up, up it on the way down. */
  private static readonly DOWN_A_WALL: Readonly<Record<RouteWay, Walk["direction"]>> = {
    up: "down-right",
    down: "up-left",
  };
  /** The way's key off the end of a ladder down a wall it has climbed: flat, as the way's own
   * key, slanting, climbs an upright ladder from either end. */
  private static readonly OFF_A_WALL: Readonly<Record<RouteWay, Walk["direction"]>> = {
    up: "right",
    down: "left",
  };
  /** Where a climber stands still: nothing held but the jumar. */
  static readonly STANDING: FootworkSave = {
    started: false,
    way: null,
    iceWay: "up",
    feetBefore: null,
    pickedAt: null,
    iceReclip: 0,
    atLip: 0,
    pace: "steady",
    beforeSlip: null,
    walking: "stop",
    reclipping: 0,
    freedAt: null,
    face: null,
  };

  private started: boolean;
  private way: RouteWay | null;
  /** On the ice: which way it climbs the face it's on, and how high its feet were a step ago, to
   * see when they've stopped under the pick. */
  private iceWay: RouteWay;
  private feetBefore: number | null;
  /** How high its feet were when it last swung a pick in, and which action of a re-clip on the ice
   * comes next: none, or 1 to 4. */
  private pickedAt: number | null;
  private iceReclip: number;
  /** How many steps it has stood at the lip of a face it goes down: the first, its key down;
   * then a re-clip onto the rope down it; then its front points, if no rope takes it down. */
  private atLip: number;
  /** The pace it goes at; the key it held before it slipped, until it's back on its feet. */
  private pace: Pace["pace"];
  private beforeSlip: Walk["direction"] | null;
  /** The key the climber holds. */
  private walking: Walk["direction"];
  /** Which action of the re-clip comes next while the ropes hold the climber: none, or 1 to 4. */
  private reclipping: number;
  /** Where the climber took both cowstails off, until it's a metre on. */
  private freedAt: number | null;
  private lastFace: number | null;

  constructor(
    private readonly physics: SlopePhysics,
    readonly climber: ClimberId,
    /** Whether it takes the rest step on the ice and the crossings, or keeps its steady pace. */
    private readonly careful = true,
    save: FootworkSave = Footwork.STANDING,
  ) {
    this.started = save.started;
    this.way = save.way;
    this.iceWay = save.iceWay;
    this.feetBefore = save.feetBefore;
    this.pickedAt = save.pickedAt;
    this.iceReclip = save.iceReclip;
    this.atLip = save.atLip;
    this.pace = save.pace;
    this.beforeSlip = save.beforeSlip;
    this.walking = save.walking;
    this.reclipping = save.reclipping;
    this.freedAt = save.freedAt;
    this.lastFace = save.face;
  }

  /** The foot of the last face of ice with no ladder it went up or down, or none yet. */
  get face(): number | null {
    return this.lastFace;
  }

  /** The way it goes now, or none while it stands. */
  get going(): RouteWay | null {
    return this.way;
  }

  save(): FootworkSave {
    return {
      started: this.started,
      way: this.way,
      iceWay: this.iceWay,
      feetBefore: this.feetBefore,
      pickedAt: this.pickedAt,
      iceReclip: this.iceReclip,
      atLip: this.atLip,
      pace: this.pace,
      beforeSlip: this.beforeSlip,
      walking: this.walking,
      reclipping: this.reclipping,
      freedAt: this.freedAt,
      face: this.lastFace,
    };
  }

  /** What the climber does this step to go `way` along the route, or to stand where it is. On a
   * ladder, on the ice, lowering down a step or in a fall, it goes on as it was going: a new way
   * takes over once it's on its feet on the ground. */
  actions(way: RouteWay | null): readonly GameAction[] {
    const { climber } = this;
    const view = this.physics.climber(climber);
    const along = this.physics.along(climber);
    this.turn(way, view);
    if (!this.started) {
      this.started = true;
      const jumar: GameAction = { kind: "jumar", climber, held: true };
      if (this.way === null) {
        return [jumar];
      }
      this.walking = Footwork.WAYS[this.way];
      return [jumar, { kind: "walk", climber, direction: this.walking }];
    }
    if (view.dead || view.clipping !== null) {
      // Its hands at a clip (#197), it waits for the carabiner to go on before the next action:
      // never both cowstails off.
      return [];
    }
    if (view.falling) {
      if (
        view.hanging &&
        view.first !== null &&
        view.second !== null &&
        view.first !== view.second
      ) {
        // Hanging from two ropes, caught at a changeover, the one anchored the other way holds it
        // back: the second comes off, and it climbs the jumar's (#197).
        return [{ kind: "unclip", climber, cowstail: "second" }];
      }
      // Hanging on the rope, it climbs back up; sliding, it waits.
      const up: Walk["direction"] = "up";
      if (view.hanging && this.walking !== up) {
        this.beforeSlip ??= this.walking;
        this.walking = up;
        return [{ kind: "walk", climber, direction: up }];
      }
      return [];
    }
    if (this.beforeSlip !== null) {
      // Back on its feet, on the ground or a ladder's rung: on the way it was going.
      this.walking = this.beforeSlip;
      this.beforeSlip = null;
      return [{ kind: "walk", climber, direction: this.walking }];
    }
    const { way: going } = this;
    if (going === null) {
      return this.stand(view, along);
    }
    const onTools = this.onTools(view, along, going);
    if (onTools !== null) {
      return onTools;
    }
    const careful = this.carefulPace(view, along);
    if (careful !== this.pace) {
      this.pace = careful;
      return [{ kind: "pace", climber, pace: careful }];
    }
    if (this.reclipping === 0 && this.atANewRope(view)) {
      return this.changeOver(view, along);
    }
    const direction = this.direction(view, going);
    if (direction !== this.walking && this.reclipping === 0) {
      this.walking = direction;
      return [{ kind: "walk", climber, direction }];
    }
    const held = !view.moving && view.walking !== "stop";
    if (held || this.reclipping > 0) {
      return this.reclip(held, along);
    }
    return this.clipLoose(view, along);
  }

  /** Takes up a new way, or standing, once the climber is on their feet on the ground: what was
   * half done of the old one is dropped. */
  private turn(way: RouteWay | null, view: ClimberView): void {
    if (way === this.way) {
      return;
    }
    const busy =
      view.falling ||
      view.ladder !== null ||
      view.onIce ||
      view.lowering ||
      this.beforeSlip !== null;
    if (busy) {
      return;
    }
    this.way = way;
    this.reclipping = 0;
    this.iceReclip = 0;
    this.atLip = 0;
    this.pickedAt = null;
    this.feetBefore = null;
    this.freedAt = null;
  }

  /** Standing: the key let go, then both cowstails on a rope within reach. */
  private stand(view: ClimberView, along: number): readonly GameAction[] {
    const { climber } = this;
    if (this.walking !== "stop") {
      this.walking = "stop";
      return [{ kind: "walk", climber, direction: "stop" }];
    }
    return this.clipLoose(view, along);
  }

  /** Whether it stands on the ground at a ladder's end, clipped to a rope, with another rope within
   * reach there:
   * the one along the ladder, anchored at its lip, which a cowstail on the rope it came on can't
   * reach once it's out on the rungs, where a rope across a crevasse hangs down into it (#228). */
  private atANewRope(view: ClimberView): boolean {
    const within = this.physics.ropeWithin(this.climber);
    if (view.ladder !== null || within === null || (view.first === null && view.second === null)) {
      return false;
    }
    if (view.first === within && view.second === within) {
      return false;
    }
    const near = (end: { readonly x: number; readonly y: number }): boolean =>
      Math.abs(end.x - view.x) <= Footwork.AT_A_LADDER &&
      Math.abs(end.y - view.y) <= Footwork.AT_A_LADDER;
    return this.physics.ladders.some((id) => this.physics.ladder(id).some(near));
  }

  /** At a ladder's end, onto the rope within reach before it steps on (#228): it stops, then takes
   * one cowstail off the old rope and clips it to the new, then the other, never both off at once. */
  private changeOver(view: ClimberView, along: number): readonly GameAction[] {
    const { climber } = this;
    if (this.walking !== "stop") {
      this.walking = "stop";
      return [{ kind: "walk", climber, direction: "stop" }];
    }
    const within = this.physics.ropeWithin(climber);
    if (view.first !== null && view.second !== null) {
      const off = view.second !== within ? "second" : "first";
      return [{ kind: "unclip", climber, cowstail: off }];
    }
    return this.clipLoose(view, along);
  }

  /** Each cowstail that's off clipped to the rope within reach, once it's a metre past where it
   * took both off. */
  private clipLoose(view: ClimberView, along: number): readonly GameAction[] {
    const { climber } = this;
    if (this.freedAt !== null && Math.abs(along - this.freedAt) < Footwork.FREE_METRES) {
      return [];
    }
    this.freedAt = null;
    const loose = (["first", "second"] as const).filter((cowstail) => view[cowstail] === null);
    return loose.map((cowstail) => ({ kind: "clip", climber, cowstail }));
  }

  /** On a face of ice with no ladder, or at one its way goes up or down: what it does there. On
   * the ice, its key up or down the face, and the next pick once its feet stop under the last;
   * lowering down one on its rope, both cowstails on that rope; at the foot of one ahead, the
   * first pick; at the lip of one ahead, the way down it (`atALip`). Elsewhere: none. */
  private onTools(view: ClimberView, along: number, way: RouteWay): readonly GameAction[] | null {
    const { climber } = this;
    if (view.onIce) {
      if (this.walking !== this.iceWay) {
        this.walking = this.iceWay;
        return [{ kind: "walk", climber, direction: this.iceWay }];
      }
      if (this.iceReclip > 0) {
        return this.reclipOnIce();
      }
      const stopped = this.feetBefore !== null && Math.abs(view.y - this.feetBefore) < 1e-6;
      this.feetBefore = view.y;
      const face = this.physics.face(along);
      if (!stopped || face === null) {
        return [];
      }
      if (this.pickedAt !== null && Math.abs(view.y - this.pickedAt) < 1e-6) {
        // A new pick and still no higher: the rope it came up on holds it, past its anchor.
        this.pickedAt = null;
        return this.reclipOnIce();
      }
      this.pickedAt = view.y;
      return [this.pick(face, view.y, this.iceWay)];
    }
    this.pickedAt = null;
    this.iceReclip = 0;
    if (view.lowering) {
      // Down the rope that runs down the face, to its foot, the first cowstail onto it too.
      this.atLip = 0;
      if (view.first === null) {
        return [{ kind: "clip", climber, cowstail: "first" }];
      }
      if (view.second !== null && view.first !== view.second) {
        return [{ kind: "unclip", climber, cowstail: "first" }];
      }
      return [];
    }
    this.feetBefore = null;
    const at = this.physics.iceWall(climber);
    const face = this.physics.face(along);
    if (at === null || face === null || !this.ahead(face, along, way)) {
      return null;
    }
    this.lastFace = face.foot;
    if (at === "foot") {
      this.iceWay = "up";
      return [this.pick(face, view.y, "up")];
    }
    this.iceWay = "down";
    return this.atALip(face);
  }

  /** At the lip of a face it goes down, one action a step until it's on its way down: its key
   * down, which lowers it down the face on the rope that runs down it, if it's on that rope; if
   * it's still on the rope it came on, its cowstails onto the rope down the face, the second
   * first, and a step to let the key take it down; and if no rope does, its front points kicked
   * in below the lip, to climb down on its tools. */
  private atALip(face: BareFace): readonly GameAction[] {
    const { climber } = this;
    this.atLip += 1;
    switch (this.atLip) {
      case 1:
        this.walking = "down";
        return [{ kind: "walk", climber, direction: "down" }];
      case 2:
        return [{ kind: "unclip", climber, cowstail: "second" }];
      case 3:
        return [{ kind: "clip", climber, cowstail: "second" }];
      case 4:
        return [{ kind: "unclip", climber, cowstail: "first" }];
      case 5:
        return [{ kind: "clip", climber, cowstail: "first" }];
      case 6:
        return [];
      default: {
        this.atLip = 0;
        const lip = this.physics.terrain.point(face.top);
        const below = this.onFace(face, lip.y - Footwork.STEP_DOWN);
        return [{ kind: "tool", climber, tool: "crampons", x: below.x, y: below.y }];
      }
    }
  }

  /** On the ice, held by the rope it came up on past its anchor: the second cowstail onto the
   * rope up the face, then the first, one action a step. */
  private reclipOnIce(): readonly GameAction[] {
    const { climber } = this;
    this.iceReclip = (this.iceReclip % 4) + 1;
    const [kind, cowstail] = Footwork.RECLIP[this.iceReclip - 1] ?? ["clip", "first"];
    if (this.iceReclip === 4) {
      this.iceReclip = 0;
    }
    return [{ kind, climber, cowstail }];
  }

  /** Whether a face lies ahead on the climber's way from `along`, its near end within a lip's
   * reach and its far end further on, not behind it. */
  private ahead({ foot, top }: BareFace, along: number, way: RouteWay): boolean {
    const sign = way === "up" ? 1 : -1;
    const [near, far] = [(foot - along) * sign, (top - along) * sign].sort((a, b) => a - b);
    return (near ?? 0) >= -Footwork.AT_FACE && (far ?? 0) > Footwork.EXACT;
  }

  /** The next pick on `face` for feet `feet` high, climbing it `way`: going up, as high as it
   * bites well, short of the brittle ice, or over the lip once that's within reach; going down,
   * a little over the shoulder. */
  private pick(face: BareFace, feet: number, way: RouteWay): GameAction {
    const { climber, physics } = this;
    const lip = physics.terrain.point(face.top);
    const place = (point: Point): GameAction => ({
      kind: "tool",
      climber,
      tool: "ice-axe",
      x: point.x,
      y: point.y,
    });
    if (way === "down") {
      return place(this.onFace(face, feet + Footwork.PICK_DOWN));
    }
    const [highest = 0] = Footwork.PICKS_UP;
    if (feet + highest >= lip.y - Footwork.EXACT) {
      const beyond = face.top + (face.top > face.foot ? 1 : -1) * Footwork.OVER_LIP;
      return place(physics.terrain.point(beyond));
    }
    const solid = Footwork.PICKS_UP.map((rise) => this.onFace(face, feet + rise)).find(
      (point) => !this.brittleAt(point),
    );
    return place(solid ?? this.onFace(face, feet + highest));
  }

  /** Whether the ice at a point of a face is brittle. */
  private brittleAt(point: Point): boolean {
    const along = this.physics.terrain.nearest(point).along;
    return this.physics.brittle.some(({ from, to }) => along >= from && along <= to);
  }

  /** The point of `face` at `height`, found along the ground between its foot and its top. */
  private onFace({ foot, top }: BareFace, height: number): Point {
    const { terrain } = this.physics;
    let [low, high] = [foot, top];
    for (let round = 0; round < 60; round += 1) {
      const middle = (low + high) / 2;
      if (terrain.point(middle).y < height) {
        low = middle;
      } else {
        high = middle;
      }
    }
    return terrain.point((low + high) / 2);
  }

  /** The rest step on blue ice and on or onto a ladder across a crevasse, the steady pace
   * elsewhere. */
  private carefulPace(view: ClimberView, along: number): Pace["pace"] {
    const onIce = this.physics.ice.some(({ from, to }) => along >= from - 1 && along <= to + 1);
    const across = (id: string): boolean => {
      const [start, end] = this.physics.ladder(id);
      return (
        start !== undefined &&
        end !== undefined &&
        Math.abs(end.y - start.y) < Math.abs(end.x - start.x)
      );
    };
    const onACrossing =
      (view.ladder !== null && across(view.ladder)) ||
      this.physics.ladders.some((id) => {
        const [start, end] = this.physics.ladder(id);
        const near = (point: { readonly x: number } | undefined): boolean =>
          point !== undefined && Math.abs(point.x - view.x) < 1;
        return across(id) && (near(start) || near(end));
      });
    return this.careful && (onIce || onACrossing) ? "rest-step" : "steady";
  }

  /** The key for where the climber stands: on a ladder, the one it got on with; at the end of a
   * ladder down a wall, the one that climbs it where its way goes onto it (the top ahead, or the
   * foot behind), and the flat one where its way comes off it; anywhere else, its way's. */
  private direction(view: ClimberView, way: RouteWay): Walk["direction"] {
    if (view.ladder !== null) {
      return this.walking;
    }
    for (const id of this.physics.ladders) {
      const [top, foot] = this.physics.ladder(id);
      if (top === undefined || foot === undefined || top.y <= foot.y) {
        continue;
      }
      const [onto, off] = way === "up" ? [top, foot] : [foot, top];
      if (onto.x === view.x && onto.y === view.y) {
        return Footwork.DOWN_A_WALL[way];
      }
      if (off.x === view.x && off.y === view.y) {
        return Footwork.OFF_A_WALL[way];
      }
    }
    return Footwork.WAYS[way];
  }

  /** The ropes hold the climber: the second cowstail onto the next rope, then the first across,
   * one action a step; still held after that, both come off, and it walks on free. */
  private reclip(held: boolean, along: number): readonly GameAction[] {
    const { climber } = this;
    if (!held) {
      this.reclipping = 0;
      return [];
    }
    this.reclipping += 1;
    switch (this.reclipping) {
      case 1:
        return [{ kind: "unclip", climber, cowstail: "second" }];
      case 2:
        return [{ kind: "clip", climber, cowstail: "second" }];
      case 3:
        return [{ kind: "unclip", climber, cowstail: "first" }];
      case 4:
        return [{ kind: "clip", climber, cowstail: "first" }];
      default:
        this.reclipping = 0;
        this.freedAt = along;
        return [
          { kind: "unclip", climber, cowstail: "first" },
          { kind: "unclip", climber, cowstail: "second" },
        ];
    }
  }
}
