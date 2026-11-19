import type { ClimberView, Point, RescueLineView, Terrain, Way } from "../physics";
import type { BodyView, HandView } from "../simulation";
import type { Joint, LadderFooting, PoseState, Tending } from "./climber-pose";
import { DeviceHold } from "./device-hold";
import { HaulPath } from "./haul-path";
import type { PickIn } from "./ice-tools";
import { LineAnchor } from "./line-anchor";
import { LineHold } from "./line-hold";

/** What a figure reads the ground, the ladders, the ropes and the rescue lines from: the slope
 * physics. */
export interface ReadSlope {
  readonly terrain: Terrain;
  ladder(id: string): readonly Point[];
  rope(id: string): readonly Point[];
  readonly lines: readonly RescueLineView[];
}

/** The rescuer a carried climber rides on, as drawn this frame (#241): which way they face,
 * where their hips are in the layer, and how far they lean. */
export interface Mount {
  readonly facing: 1 | -1;
  readonly hips: Point;
  readonly lean: number;
}

/** Whom a figure is drawn with in a rescue (#241), as the slope layer has them this frame: the
 * rescuer who carries them, or none; and where the hurt limb of the casualty they work on is
 * drawn, in the layer, or none. */
export interface Beside {
  readonly mount: Mount | null;
  readonly wound: Point | null;
}

/** Where a figure's climber is drawn this frame, between the steps: their point and each
 * cowstail's carabiner, and how many times life size. */
export interface DrawnAt {
  readonly at: Point;
  readonly jumar: Point | null;
  readonly carabiner: Point | null;
  readonly grown: number;
  /** On their way into a tent or out of it (#258): the way they face through its door, and how
   * far down on hands and knees they are, 0 to 1. Not said, they're as the physics has them. */
  readonly through?: { readonly facing: 1 | -1; readonly down: number } | null;
  /** Their hand as the `Devices` rule has it (#271): the device in it, the one before, and for
   * how long. Not said, their hands are empty. */
  readonly hand?: HandView | null;
}

/**
 * How a figure reads its climber for the pose (`ClimberPose`), each frame: which way they face,
 * how far they've come, the ground under the boots, the ladder they're on and the rope from the
 * jumar to its anchor, in the figure's metres, `grown` times life size from where the climber is
 * drawn, x the way they face. On the ground they face the way they last walked; on a ladder up a
 * wall, the wall, going up or down it by the key. A wall's face or a crevasse's edge beside them
 * is no ground for a boot, which stands level there. On the ice, each pick is told by the swing
 * that put it there and the way into the ice where it is. In a rescue (#241): a climber down
 * with a bone broken is told by the limb; one on a rescue line holds it a reach above them, going
 * down it and back up it as down a fixed rope, and hangs from there hauled up it; a rescuer
 * faces whom they work for, their hands at the hurt limb where it's drawn; and one carried faces
 * the way their rescuer does, on their back. It keeps only the picture's own: the way they face
 * and go, how far they've come, where they were drawn last, the picks seen, and where a rescue
 * line holds them.
 */
export class ClimberReading {
  /** A ladder's rungs, as the slope layer draws them: every 30 cm, from 15 cm off its `from` end. */
  static readonly RUNG_METRES = 0.3;
  /** Up a face of ice, how far apart the front points kick in: short steps, the boots near level
   * at a halt, as a climber front-points. */
  static readonly ICE_STEP_METRES = 0.16;
  /** The steepest a ladder lies and is still crossed on its rungs, as a sine: the pose's. */
  private static readonly ACROSS = 0.5;
  /** The steepest the ground under a boot is read, rise over run, with a little more for a step:
   * past it, the ground is a wall's face or a crevasse's edge. */
  private static readonly STEEPEST = 1.5;
  private static readonly STEP_METRES = 0.05;
  /** How far up a wall's ladder from its middle the way that side of it starts. */
  private static readonly WALL_SIDE_METRES = 0.5;
  /** The chance a metre of slipping at which the figure wobbles its hardest (#208): a hurried step
   * on blue ice; a steady one wobbles a little, and a careful one hardly. */
  private static readonly WOBBLY = 0.06;

  /** How near, in metres, a pick in the ice is to one seen last frame to be the same one. */
  private static readonly SAME_PICK = 1e-6;
  /** What a face of ice goes by as the ladder a climber is on, and how far each way along it the
   * pose reads it, in metres. */
  private static readonly ICE = "the ice";
  private static readonly FACE_METRES = 6;
  /** A climber who hangs on their rope puts their boots on a wall's face beside them (#243): how
   * far to either side they look for one, a leg's reach; how far it stands over their harness,
   * and how much the ground rises at it, to be one, so they're on it till they're level with its
   * lip; and how finely they look, all in metres at life size. */
  private static readonly BESIDE = { reach: 0.9, over: 0.05, rise: 0.25, step: 0.05 };
  /** How far to a side of them a rescue's work is for a climber to turn to it (#241): a hurt
   * limb, or an anchor's screws. */
  private static readonly TURN_METRES = 0.1;
  /** With nobody in a rescue. */
  static readonly ALONE: Beside = { mount: null, wound: null };
  /** How much a sprained leg limps, of the most a figure does (#241): until it's wrapped, and
   * once it is. */
  private static readonly LIMP = { sore: 1, wrapped: 0.45 };

  private facingNow: 1 | -1 = 1;
  /** The way up the rescue line they were hauled up last, and the line's ground (#279). */
  private hauledBy: {
    readonly id: string;
    readonly shape: readonly Point[];
    readonly path: HaulPath;
  } | null = null;
  private upward = true;
  /** The picks seen in the ice last frame, where they are on the slope and the swing each was,
   * and how many swings there have been. */
  private seenPicks: readonly { readonly at: Point; readonly swing: number }[] = [];
  private swings = 0;
  private travelled = 0;
  private onLadder: string | null = null;
  private started = false;
  /** The frame's, and the last one's till the next is read: where the climber is drawn, the
   * height the ground is read from, the scale. */
  private x = 0;
  private y = 0;
  private from = 0;
  private grown = 1;
  /** Where the rescue line they're on holds them this frame, in the layer, and the rope that
   * bears them from its anchor down to there; none off a line (#241). */
  private tied: { readonly line: string; readonly taut: readonly Point[] } | null = null;
  private readonly ground = (ahead: number): number => {
    const across = this.facingNow * this.grown * ahead;
    const rise = this.slope.terrain.height(this.x + across) - this.from;
    const steep =
      Math.abs(rise) > ClimberReading.STEEPEST * Math.abs(across) + ClimberReading.STEP_METRES;
    return (this.from + (steep ? 0 : rise) - this.y) / this.grown;
  };
  private readonly terrain = (ahead: number): number => {
    const across = this.facingNow * this.grown * ahead;
    return (this.slope.terrain.height(this.x + across) - this.y) / this.grown;
  };

  constructor(private readonly slope: ReadSlope) {}

  /** Which way the figure faces: right is 1. */
  get facing(): 1 | -1 {
    return this.facingNow;
  }

  /** The rescue line that holds them this frame and its rope from the anchor down to where
   * they're tied in, taut, in the layer; none off a line (#241). */
  get onLine(): { readonly line: string; readonly taut: readonly Point[] } | null {
    return this.tied;
  }

  /** Where the climber is drawn this frame: where the figure has them, or, hauled up a rescue
   * line, on the way the taut rope brings them (#279). */
  get drawnAt(): Point {
    return { x: this.x, y: this.y };
  }

  /** The pose's state this frame, for the climber the physics and the body show, drawn at
   * `drawn`, `beside` whom the rescue has them. */
  read(
    view: ClimberView,
    body: BodyView,
    drawn: DrawnAt,
    beside: Beside = ClimberReading.ALONE,
  ): PoseState {
    const { grown } = drawn;
    // Hauled up a rescue line, a casualty hangs on it as one who fell hangs on their rope.
    const hauled = view.hauled && !view.dead;
    const line =
      view.onLine === null || view.dead
        ? null
        : (this.slope.lines.find(({ id }) => id === view.onLine) ?? null);
    // Hauled, they come up the way the taut rope brings them, over the steps of the ice (#279).
    const haul = hauled && line !== null ? this.haulOf(line) : null;
    const down = line === null ? 0 : new LineHold(line.shape, drawn.at, grown).down;
    const at = haul === null ? drawn.at : haul.at(down);
    const offFeet = view.falling || hauled;
    const upright = !offFeet && !view.dead && !view.down;
    // On the tools, or lowering down a face on its rope: the face is their ladder.
    const onIce = upright && (view.onIce || view.lowering);
    const [start, finish] = onIce
      ? this.face(at)
      : upright && view.ladder !== null
        ? this.slope.ladder(view.ladder)
        : [];
    const along = start === undefined || finish === undefined ? null : { start, finish };
    const heading = along === null ? null : ClimberReading.heading(along.start, along.finish);
    const wall = heading !== null && Math.abs(heading.y) >= ClimberReading.ACROSS;
    const ladder = onIce ? ClimberReading.ICE : view.ladder;
    if (along !== null && ladder !== this.onLadder) {
      // Onto a wall's ladder at its foot, the way is up it; at its top, down.
      const bottom = along.start.y < along.finish.y ? along.start : along.finish;
      const top = bottom === along.start ? along.finish : along.start;
      const toBottom = Math.hypot(at.x - bottom.x, at.y - bottom.y);
      this.upward = toBottom <= Math.hypot(at.x - top.x, at.y - top.y);
    }
    this.onLadder = along === null ? null : ladder;
    if (upright) {
      this.turnTo(view, at, heading, wall);
      // Through a tent's door, they face the way they go (#258).
      this.facingNow = drawn.through?.facing ?? this.facingNow;
      if (this.started) {
        const dx = at.x - this.x;
        const dy = at.y - this.y;
        this.travelled += (wall ? Math.hypot(dx, dy) : Math.abs(dx)) / grown;
      }
    }
    const mount = view.carriedBy === null || view.dead ? null : beside.mount;
    if (mount !== null) {
      this.facingNow = mount.facing;
    }
    this.started = true;
    this.x = at.x;
    this.y = at.y;
    this.from = offFeet ? this.under(at) : at.y;
    this.grown = grown;
    const hold =
      line === null ? null : new LineHold(haul === null ? line.shape : haul.rope(down), at, grown);
    this.tied = line === null || hold === null ? null : { line: line.id, taut: hold.taut };
    // Hanging on their rope, they turn to a wall's face within a leg's reach, to put their
    // boots on it (#243); hauled, to the way the rope pulls them over its lip (#279).
    const held = ((view.falling && view.hanging) || hauled) && !view.dead;
    const anchor = line?.shape[0] ?? null;
    const toAnchor = haul === null || anchor === null ? 0 : anchor.x - haul.lip.x;
    if (Math.abs(toAnchor) > ClimberReading.TURN_METRES) {
      this.facingNow = toAnchor > 0 ? 1 : -1;
    } else if (held && this.faceBeside(at, this.facingNow) === null) {
      const behind = this.facingNow === 1 ? -1 : 1;
      this.facingNow = this.faceBeside(at, behind) === null ? this.facingNow : behind;
    }
    const face = held ? this.faceBeside(at, this.facingNow) : null;
    const tending = upright ? this.tending(view, at, beside) : null;
    return {
      travelled: this.travelled,
      // Hauling, they stand braced: the body tires, the legs don't stride (#209); nor at a
      // casualty's side, at an anchor, or lifting them (#241).
      moving: view.moving && !view.hauling && view.helping === null,
      falling: offFeet,
      dead: view.dead,
      tiredness: body.tiredness,
      hauling: view.hauling,
      bracing:
        view.haulHeld && !view.hauling && view.helping === null && !view.falling && !view.dead,
      hanging: view.hanging || hauled,
      pace: body.pace,
      ground: this.ground,
      terrain: this.terrain,
      // On a rescue line, their hold on it: the rope they go down and up by, or hang from.
      jumar: this.local(hold === null ? drawn.jumar : hold.point, at),
      carabiner: this.local(drawn.carabiner, at),
      sliding: view.jumarHeld || (hold !== null && view.moving),
      slack:
        hold !== null
          ? hold.fromTop / grown
          : view.first === null || drawn.jumar === null
            ? 0
            : ClimberReading.toAnchor(this.slope.rope(view.first), drawn.jumar) / grown,
      ladder:
        along === null || heading === null
          ? null
          : this.footing(along, heading, at, wall, onIce ? this.alongTheIce(at) : null),
      footing: 1 - Math.min(1, view.slipChance / ClimberReading.WOBBLY),
      picks: this.picks(onIce ? view.picks : [], at),
      pickPoor: view.pickPoor,
      tools: view.gear.tools,
      onIce,
      face: face === null ? null : face / grown,
      hurt: view.down && !view.dead ? ClimberReading.broken(view) : null,
      hauled: haul === null ? null : { lip: this.local(haul.lip, at) ?? { x: 0, y: 0 } },
      tending,
      carrying: view.carrying !== null && upright,
      riding:
        mount === null
          ? null
          : { hips: this.local(mount.hips, at) ?? { x: 0, y: 0 }, lean: mount.lean },
      limp: upright ? ClimberReading.limp(view) : 0,
      crawling: upright ? (drawn.through?.down ?? 0) : 0,
      device: upright && drawn.hand != null ? new DeviceHold(drawn.hand).shown : null,
    };
  }

  /** The way up a rescue line a casualty is hauled by: the one worked out for it before while
   * it's the same line, its ground unchanged (#279). */
  private haulOf(line: RescueLineView): HaulPath {
    const kept = this.hauledBy;
    const same =
      kept !== null &&
      kept.id === line.id &&
      kept.shape.length === line.shape.length &&
      kept.shape.every((at, index) => {
        const now = line.shape[index];
        return now !== undefined && now.x === at.x && now.y === at.y;
      });
    if (kept !== null && same) {
      return kept.path;
    }
    const path = new HaulPath(line.shape, this.slope.terrain);
    this.hauledBy = { id: line.id, shape: line.shape, path };
    return path;
  }

  /** The limb a climber down with a bone broken sits by: the leg, if one is, or the arm. */
  private static broken(view: ClimberView): "leg" | "arm" {
    const leg = view.injuries.some(({ part, kind }) => part === "leg" && kind !== "sprain");
    return leg ? "leg" : "arm";
  }

  /** How much a climber on their feet limps: on a sprained leg, less once it's wrapped. */
  private static limp(view: ClimberView): number {
    const sprain = view.injuries.find(({ part, kind }) => part === "leg" && kind === "sprain");
    if (sprain === undefined) {
      return 0;
    }
    return sprain.splinted ? ClimberReading.LIMP.wrapped : ClimberReading.LIMP.sore;
  }

  /** A rescuer's work on their knees this frame, the haul held (#241): first aid, or lifting a
   * casualty or setting them down, at the hurt limb where it's drawn; or an anchor's screws. None
   * hauling on a rescue line, which they stand to. */
  private tending(view: ClimberView, at: Point, beside: Beside): Tending | null {
    const kind = view.helping?.kind ?? null;
    if (kind === null || kind === "line-haul") {
      return null;
    }
    if (kind === "anchor") {
      return { what: "anchor", at: this.local(this.anchorWork(at), at) };
    }
    // They turn to the hurt limb where it's drawn: beside a casualty at their own spot too,
    // where the picture stands them a step apart.
    const { wound } = beside;
    if (wound !== null && Math.abs(wound.x - at.x) > ClimberReading.TURN_METRES) {
      this.facingNow = wound.x > at.x ? 1 : -1;
    }
    return { what: "aid", at: this.local(wound, at) };
  }

  /** Where the hands work at the anchor a climber drawn `at` builds: at the nearest rescue
   * line's that isn't done, the way they turn to; none with no such line. */
  private anchorWork(at: Point): Point | null {
    const { terrain, lines } = this.slope;
    const away = (point: Point): number => Math.hypot(point.x - at.x, point.y - at.y);
    const works = lines
      .filter(({ built }) => built < 1)
      .map((line) => new LineAnchor(terrain, line, this.grown).working)
      .sort((one, other) => away(one) - away(other));
    const [nearest] = works;
    if (nearest === undefined) {
      return null;
    }
    if (Math.abs(nearest.x - at.x) > ClimberReading.TURN_METRES) {
      this.facingNow = nearest.x > at.x ? 1 : -1;
    }
    return nearest;
  }

  /** The ground under a climber off their feet, drawn `at`: on a wall's line the ground's height
   * is its top, so one against its face, under its top, is over its foot (#243): in the air, as
   * the physics has them. */
  private under(at: Point): number {
    const { terrain } = this.slope;
    const here = terrain.height(at.x);
    if (here <= at.y + ClimberReading.STEP_METRES) {
      return here;
    }
    const { step } = ClimberReading.BESIDE;
    return Math.min(here, terrain.height(at.x - step), terrain.height(at.x + step));
  }

  /** How far to `side` of a climber drawn `at` a wall's face stands over their harness, within a
   * leg's reach of them, in metres: nought against it; none in the open air. */
  private faceBeside(at: Point, side: 1 | -1): number | null {
    const { reach, over, rise, step } = ClimberReading.BESIDE;
    const { terrain } = this.slope;
    const steps = Math.round((reach * this.grown) / step);
    let last = this.under(at);
    for (let away = 1; away <= steps; away += 1) {
      const height = terrain.height(at.x + side * away * step);
      if (height - last > rise && height - at.y > over * this.grown) {
        return (away - 1) * step;
      }
      last = height;
    }
    return null;
  }

  /** The picks in the ice, the one they hang from first, from where the climber is drawn: each
   * told by its swing, a new one by the next, and the way into the ice where it is. */
  private picks(picks: readonly Point[], at: Point): readonly PickIn[] {
    const { terrain } = this.slope;
    // The oldest first, so a new pick's swing comes after those it went in with.
    const seen = [...picks].reverse().map((pick) => {
      const known = this.seenPicks.find(
        ({ at: was }) =>
          Math.abs(was.x - pick.x) < ClimberReading.SAME_PICK &&
          Math.abs(was.y - pick.y) < ClimberReading.SAME_PICK,
      );
      const swing = known?.swing ?? (this.swings += 1);
      return { at: pick, swing };
    });
    this.seenPicks = seen;
    return [...seen].reverse().map(({ at: pick, swing }) => {
      // The ground goes on up the face, or along the top over its lip: into it is to its right.
      const ahead = terrain.ahead(terrain.nearest(pick).along, 1);
      return {
        swing,
        at: this.local(pick, at) ?? { x: 0, y: 0 },
        into: { x: ahead.y * this.facingNow, y: -ahead.x },
      };
    });
  }

  /** The face of ice a climber on their tools is on, as a ladder up it for the pose: from its
   * foot to its lip, so the pose knows where it ends and the head comes over it (#222). At its
   * foot or its lip they stand on a corner, and the face is the steeper of the ground ahead and
   * behind. Off a face, the ground's line through where they're drawn, a few metres each way. */
  private face(at: Point): readonly Point[] {
    const { terrain } = this.slope;
    const along = terrain.nearest(at).along;
    const onward = terrain.ahead(along, 1);
    const back = terrain.ahead(along, -1);
    const steeper: Way = Math.abs(back.y) > Math.abs(onward.y) ? -1 : 1;
    const ahead = steeper > 0 ? onward : { x: -back.x, y: -back.y };
    if (Math.abs(ahead.y) < ClimberReading.ACROSS) {
      const reach = ClimberReading.FACE_METRES;
      return [
        { x: at.x - ahead.x * reach, y: at.y - ahead.y * reach },
        { x: at.x + ahead.x * reach, y: at.y + ahead.y * reach },
      ];
    }
    // The way along the ground that goes up the face, and the way down it.
    const up: Way = ahead.y >= 0 ? 1 : -1;
    const down: Way = up > 0 ? -1 : 1;
    return [terrain.point(this.faceEnd(along, down)), terrain.point(this.faceEnd(along, up))];
  }

  /** How far along the ground a face runs from `along` the way `way`: to the first corner past
   * which the ground is no wall, or the ground's end. */
  private faceEnd(along: number, way: Way): number {
    const { terrain } = this.slope;
    let at = along;
    for (;;) {
      if (Math.abs(terrain.ahead(at, way).y) < ClimberReading.ACROSS) {
        return at;
      }
      const corner = terrain.cornerAhead(at, way);
      if (corner === at) {
        return at;
      }
      at = corner;
    }
  }

  /** Faces the way they walk on the ground or across a ladder, and the wall up one. */
  private turnTo(view: ClimberView, at: Point, heading: Point | null, wall: boolean): void {
    const { walking } = view;
    if (wall && heading !== null) {
      const up = heading.y >= 0 ? heading : { x: -heading.x, y: -heading.y };
      const side = ClimberReading.WALL_SIDE_METRES;
      const { terrain } = this.slope;
      const higher = terrain.height(at.x + side) >= terrain.height(at.x - side) ? 1 : -1;
      this.facingNow = up.x > 0.05 ? 1 : up.x < -0.05 ? -1 : higher;
      if (walking.includes("up")) {
        this.upward = true;
      } else if (walking.includes("down")) {
        this.upward = false;
      }
      return;
    }
    if (walking.includes("left")) {
      this.facingNow = -1;
    } else if (walking.includes("right")) {
      this.facingNow = 1;
    }
    // Holding the haul, they face along the rope in their hands, toward its far end: the
    // crevasse its line crosses, and whoever hangs on it or crosses by it.
    if (view.haulHeld && view.first !== null) {
      const points = this.slope.rope(view.first);
      const [start, end] = [points[0], points[points.length - 1]];
      if (start !== undefined && end !== undefined) {
        const far =
          Math.hypot(start.x - at.x, start.y - at.y) >= Math.hypot(end.x - at.x, end.y - at.y)
            ? start
            : end;
        if (Math.abs(far.x - at.x) > ClimberReading.WALL_SIDE_METRES) {
          this.facingNow = far.x > at.x ? 1 : -1;
        }
      }
    }
    // At a rescue's work, they face whom they work for, as the physics turns them (#241),
    // whatever rope they're clipped to.
    if (view.helping !== null && view.helping.kind !== "set-down") {
      this.facingNow = view.facing;
    }
  }

  /** The ladder as the figure goes along it, from where it's drawn: the way, a rung, the ends. A
   * face of ice has no rungs: where the front points kick in is `iceAlong`, how far along the
   * ground the climber is, in steps of the ice's, so a boot stays where it kicked in as they go. */
  private footing(
    { start, finish }: { readonly start: Point; readonly finish: Point },
    heading: Point,
    at: Point,
    wall: boolean,
    iceAlong: number | null,
  ): LadderFooting {
    const facing = this.facingNow;
    const up = heading.y >= 0;
    const sign = (wall ? up === this.upward : heading.x * facing >= 0) ? 1 : -1;
    const length = Math.hypot(finish.x - start.x, finish.y - start.y);
    const rung = iceAlong === null ? ClimberReading.RUNG_METRES : ClimberReading.ICE_STEP_METRES;
    const { grown } = this;
    const on = (at.x - start.x) * heading.x + (at.y - start.y) * heading.y;
    return {
      way: { x: sign * heading.x * facing, y: sign * heading.y },
      rung: (sign * (rung / 2 - (iceAlong ?? on))) / grown,
      spacing: rung / grown,
      ends: [(sign * -on) / grown, (sign * (length - on)) / grown],
    };
  }

  /** How far along the ground a climber on a face of ice is, where they're drawn. */
  private alongTheIce(at: Point): number {
    return this.slope.terrain.nearest(at).along;
  }

  /** A point in the figure's metres from where its climber is drawn. */
  private local(point: Point | null, at: Point): Joint | null {
    if (point === null) {
      return null;
    }
    return {
      x: ((point.x - at.x) * this.facingNow) / this.grown,
      y: (point.y - at.y) / this.grown,
    };
  }

  /** How far a rope runs from `point` on it to its nearer end, its anchor: along its `chain`,
   * from where on it the point is nearest. */
  private static toAnchor(chain: readonly Point[], point: Point): number {
    let along = 0;
    let total = 0;
    let nearest = Infinity;
    for (let link = 1; link < chain.length; link += 1) {
      const from = chain[link - 1];
      const to = chain[link];
      if (from === undefined || to === undefined) {
        continue;
      }
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length = Math.hypot(dx, dy);
      const onIt =
        length > 0 ? ((point.x - from.x) * dx + (point.y - from.y) * dy) / length ** 2 : 0;
      const share = Math.min(Math.max(onIt, 0), 1);
      const away = Math.hypot(from.x + dx * share - point.x, from.y + dy * share - point.y);
      if (away < nearest) {
        nearest = away;
        along = total + length * share;
      }
      total += length;
    }
    return Math.min(along, total - along);
  }

  private static heading(start: Point, finish: Point): Point {
    const x = finish.x - start.x;
    const y = finish.y - start.y;
    const length = Math.hypot(x, y) || 1;
    return { x: x / length, y: y / length };
  }
}
