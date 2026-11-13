import type { ClimberView, Point, SlopePhysics } from "../../physics";
import type { Expedition } from "../../simulation";
import type { ClimberId, GameAction, Pace, Walk } from "../../simulation";

/** A face of ice with no ladder, by its ends along the ground: its foot and its top. */
interface BareFace {
  readonly foot: number;
  readonly top: number;
}

/**
 * A climber crossing a section headless, as a careful player would: walking up and right, or down
 * and left, the jumar's slide held, clipped to the fixed ropes with both cowstails wherever one is
 * within reach, the cowstails moved across one at a time where a rope ends at the next one's
 * anchor, and both off where a rope ends and nothing follows. At a ladder down a wall ahead it
 * walks down and right onto it, and on the way down, up and left at its foot; off its other end, it
 * walks flat. At a face of ice with no ladder ahead, it climbs it on its tools, a pick at a time,
 * each swung in solid ice short of full stretch, the last over the lip; at the lip of one, it steps
 * down onto its front points and climbs down it, a pick lower each time. On blue ice and on a
 * ladder across a crevasse it takes the rest step, where a slip is likeliest (#208), unless it's
 * told not to; hanging on its rope after a slip, it climbs back up, and goes on its way. Only tests
 * import it.
 */
export class Crossing {
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
  /** How near two heights or lengths are to be the same, and how near a face's end the walker
   * stands to be at it: the physics' lip. */
  private static readonly EXACT = 1e-9;
  private static readonly AT_FACE = 0.6;
  /** How far past where it unclipped the walker goes before it clips again: the old rope's
   * anchor is still within reach there. */
  private static readonly FREE_METRES = 1;
  private static readonly WAYS: Readonly<Record<"up" | "down", Walk["direction"]>> = {
    up: "up-right",
    down: "down-left",
  };
  /** The way's key for a ladder down a wall, which the way's own key doesn't climb: down it on the
   * way up, up it on the way down. */
  private static readonly DOWN_A_WALL: Readonly<Record<"up" | "down", Walk["direction"]>> = {
    up: "down-right",
    down: "up-left",
  };
  /** The way's key off the end of a ladder down a wall it has climbed: flat, as the way's own
   * key, slanting, climbs an upright ladder from either end. */
  private static readonly OFF_A_WALL: Readonly<Record<"up" | "down", Walk["direction"]>> = {
    up: "right",
    down: "left",
  };

  /** The ladders climbed, in order. */
  readonly laddersClimbed: string[] = [];
  /** The faces with no ladder it went up or down on its tools, by their foot along the ground, in
   * order. */
  readonly facesClimbed: number[] = [];
  private started = false;
  /** On the ice: which way it climbs the face it's on, and how high its feet were a step ago, to
   * see when they've stopped under the pick. */
  private iceWay: "up" | "down" = "up";
  private feetBefore: number | null = null;
  /** How high its feet were when it last swung a pick in, and which action of a re-clip on the ice
   * comes next: none, or 1 to 4. */
  private pickedAt: number | null = null;
  private iceReclip = 0;
  /** How many steps it has stood at the lip of a face it goes down: the first, its key down;
   * then a re-clip onto the rope down it; then its front points, if no rope takes it down. */
  private atLip = 0;
  /** The pace it goes at; the key it held before it slipped, until it's back on its feet. */
  private pace: Pace["pace"] = "steady";
  private beforeSlip: Walk["direction"] | null = null;
  /** The key the walker holds. */
  private walking: Walk["direction"];
  /** Which action of the re-clip comes next while the ropes hold the walker: none, or 1 to 4. */
  private reclipping = 0;
  /** Where the walker took both cowstails off, until it's a metre on. */
  private freedAt: number | null = null;
  private lastLadder: string | null = null;

  constructor(
    private readonly expedition: Expedition,
    private readonly physics: SlopePhysics,
    private readonly climber: ClimberId,
    private readonly way: "up" | "down" = "up",
    /** Whether it takes the rest step on the ice and the crossings, or keeps its steady pace. */
    private readonly careful = true,
  ) {
    this.walking = Crossing.WAYS[way];
  }

  /** One step of the crossing: what the walker does, then the expedition's step. */
  step(): void {
    this.expedition.advance(this.actions());
  }

  /** Steps until the climber is `along` metres along the ground, or `steps` have gone: whether
   * they got there. */
  until(along: number, steps: number): boolean {
    for (let step = 0; step < steps; step += 1) {
      if (this.reached(along)) {
        return true;
      }
      this.step();
    }
    return this.reached(along);
  }

  /** Whether the climber is `along` metres along the ground, or past it, the way they go. */
  private reached(along: number): boolean {
    const now = this.physics.along(this.climber);
    return this.way === "up" ? now >= along : now <= along;
  }

  private actions(): readonly GameAction[] {
    const { climber } = this;
    const view = this.physics.climber(climber);
    const along = this.physics.along(climber);
    // A ladder once, however many times a slip off it puts the walker back on it.
    if (
      view.ladder !== null &&
      view.ladder !== this.lastLadder &&
      this.laddersClimbed.at(-1) !== view.ladder
    ) {
      this.laddersClimbed.push(view.ladder);
    }
    this.lastLadder = view.ladder;
    if (!this.started) {
      this.started = true;
      return [
        { kind: "jumar", climber, held: true },
        { kind: "walk", climber, direction: Crossing.WAYS[this.way] },
      ];
    }
    if (view.dead) {
      return [];
    }
    if (view.falling) {
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
    const onTools = this.onTools(view, along);
    if (onTools !== null) {
      return onTools;
    }
    const careful = this.carefulPace(view, along);
    if (careful !== this.pace) {
      this.pace = careful;
      return [{ kind: "pace", climber, pace: careful }];
    }
    const direction = this.direction(view);
    if (direction !== this.walking && this.reclipping === 0) {
      this.walking = direction;
      return [{ kind: "walk", climber, direction }];
    }
    const held = !view.moving && view.walking !== "stop";
    if (held || this.reclipping > 0) {
      return this.reclip(held, along);
    }
    if (this.freedAt !== null && Math.abs(along - this.freedAt) < Crossing.FREE_METRES) {
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
  private onTools(view: ClimberView, along: number): readonly GameAction[] | null {
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
    if (at === null || face === null || !this.ahead(face, along)) {
      return null;
    }
    if (this.facesClimbed.at(-1) !== face.foot) {
      this.facesClimbed.push(face.foot);
    }
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
        const below = this.onFace(face, lip.y - Crossing.STEP_DOWN);
        return [{ kind: "tool", climber, tool: "crampons", x: below.x, y: below.y }];
      }
    }
  }

  /** On the ice, held by the rope it came up on past its anchor: the second cowstail onto the
   * rope up the face, then the first, one action a step. */
  private reclipOnIce(): readonly GameAction[] {
    const { climber } = this;
    this.iceReclip = (this.iceReclip % 4) + 1;
    const [kind, cowstail] = Crossing.RECLIP[this.iceReclip - 1] ?? ["clip", "first"];
    if (this.iceReclip === 4) {
      this.iceReclip = 0;
    }
    return [{ kind, climber, cowstail }];
  }

  /** Whether a face lies ahead on the walker's way from `along`, its near end within a lip's reach
   * and its far end further on, not behind it. */
  private ahead({ foot, top }: BareFace, along: number): boolean {
    const way = this.way === "up" ? 1 : -1;
    const [near, far] = [(foot - along) * way, (top - along) * way].sort((a, b) => a - b);
    return (near ?? 0) >= -Crossing.AT_FACE && (far ?? 0) > Crossing.EXACT;
  }

  /** The next pick on `face` for feet `feet` high, climbing it `way`: going up, as high as it
   * bites well, short of the brittle ice, or over the lip once that's within reach; going down,
   * a little over the shoulder. */
  private pick(face: BareFace, feet: number, way: "up" | "down"): GameAction {
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
      return place(this.onFace(face, feet + Crossing.PICK_DOWN));
    }
    const [highest = 0] = Crossing.PICKS_UP;
    if (feet + highest >= lip.y - Crossing.EXACT) {
      const beyond = face.top + (face.top > face.foot ? 1 : -1) * Crossing.OVER_LIP;
      return place(physics.terrain.point(beyond));
    }
    const solid = Crossing.PICKS_UP.map((rise) => this.onFace(face, feet + rise)).find(
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

  /** The key for where the walker stands: on a ladder, the one it got on with; at the end of a
   * ladder down a wall, the one that climbs it where its way goes onto it (the top ahead, or the
   * foot behind), and the flat one where its way comes off it; anywhere else, its way's. */
  private direction(view: ClimberView): Walk["direction"] {
    if (view.ladder !== null) {
      return this.walking;
    }
    for (const id of this.physics.ladders) {
      const [top, foot] = this.physics.ladder(id);
      if (top === undefined || foot === undefined || top.y <= foot.y) {
        continue;
      }
      const [onto, off] = this.way === "up" ? [top, foot] : [foot, top];
      if (onto.x === view.x && onto.y === view.y) {
        return Crossing.DOWN_A_WALL[this.way];
      }
      if (off.x === view.x && off.y === view.y) {
        return Crossing.OFF_A_WALL[this.way];
      }
    }
    return Crossing.WAYS[this.way];
  }

  /** The ropes hold the walker: the second cowstail onto the next rope, then the first across,
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
