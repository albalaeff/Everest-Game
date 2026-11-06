import type { ClimberView, Point, Terrain } from "../physics";
import type { BodyView } from "../simulation";
import type { Joint, LadderFooting, PoseState } from "./climber-pose";

/** What a figure reads the ground and the ladders from: the slope physics. */
export interface ReadSlope {
  readonly terrain: Terrain;
  ladder(id: string): readonly Point[];
}

/** Where a figure's climber is drawn this frame, between the steps: their point and each
 * cowstail's carabiner, and how many times life size. */
export interface DrawnAt {
  readonly at: Point;
  readonly jumar: Point | null;
  readonly carabiner: Point | null;
  readonly grown: number;
}

/**
 * How a figure reads its climber for the pose (`ClimberPose`), each frame: which way they face,
 * how far they've come, the ground under the boots and the ladder they're on, in the figure's
 * metres, `grown` times life size from where the climber is drawn, x the way they face. On the
 * ground they face the way they last walked; on a ladder up a wall, the wall, going up or down it
 * by the key. A wall's face or a crevasse's edge beside them is no ground for a boot, which stands
 * level there. It keeps only the picture's own: the way they face and go, how far they've come,
 * and where they were drawn last.
 */
export class ClimberReading {
  /** A ladder's rungs, as the slope layer draws them: every 30 cm, from 15 cm off its `from` end. */
  static readonly RUNG_METRES = 0.3;
  /** The steepest a ladder lies and is still crossed on its rungs, as a sine: the pose's. */
  private static readonly ACROSS = 0.5;
  /** The steepest the ground under a boot is read, rise over run, with a little more for a step:
   * past it, the ground is a wall's face or a crevasse's edge. */
  private static readonly STEEPEST = 1.5;
  private static readonly STEP_METRES = 0.05;
  /** How far up a wall's ladder from its middle the way that side of it starts. */
  private static readonly WALL_SIDE_METRES = 0.5;

  private facingNow: 1 | -1 = 1;
  private upward = true;
  private travelled = 0;
  private onLadder: string | null = null;
  private started = false;
  /** The frame's, and the last one's till the next is read: where the climber is drawn, the
   * height the ground is read from, the scale. */
  private x = 0;
  private y = 0;
  private from = 0;
  private grown = 1;
  private readonly ground = (ahead: number): number => {
    const across = this.facingNow * this.grown * ahead;
    const rise = this.slope.terrain.height(this.x + across) - this.from;
    const steep =
      Math.abs(rise) > ClimberReading.STEEPEST * Math.abs(across) + ClimberReading.STEP_METRES;
    return (this.from + (steep ? 0 : rise) - this.y) / this.grown;
  };

  constructor(private readonly slope: ReadSlope) {}

  /** Which way the figure faces: right is 1. */
  get facing(): 1 | -1 {
    return this.facingNow;
  }

  /** The pose's state this frame, for the climber the physics and the body show, drawn at
   * `drawn`. */
  read(view: ClimberView, body: BodyView, drawn: DrawnAt): PoseState {
    const { at, grown } = drawn;
    const upright = !view.falling && !view.dead;
    const [start, finish] = upright && view.ladder !== null ? this.slope.ladder(view.ladder) : [];
    const along = start === undefined || finish === undefined ? null : { start, finish };
    const heading = along === null ? null : ClimberReading.heading(along.start, along.finish);
    const wall = heading !== null && Math.abs(heading.y) >= ClimberReading.ACROSS;
    if (along !== null && view.ladder !== this.onLadder) {
      // Onto a wall's ladder at its foot, the way is up it; at its top, down.
      const bottom = along.start.y < along.finish.y ? along.start : along.finish;
      const top = bottom === along.start ? along.finish : along.start;
      const toBottom = Math.hypot(at.x - bottom.x, at.y - bottom.y);
      this.upward = toBottom <= Math.hypot(at.x - top.x, at.y - top.y);
    }
    this.onLadder = along === null ? null : view.ladder;
    if (upright) {
      this.face(view, at, heading, wall);
      if (this.started) {
        const dx = at.x - this.x;
        const dy = at.y - this.y;
        this.travelled += (wall ? Math.hypot(dx, dy) : Math.abs(dx)) / grown;
      }
    }
    this.started = true;
    this.x = at.x;
    this.y = at.y;
    this.from = view.falling ? this.slope.terrain.height(at.x) : at.y;
    this.grown = grown;
    return {
      travelled: this.travelled,
      moving: view.moving,
      falling: view.falling,
      dead: view.dead,
      tiredness: body.tiredness,
      pace: body.pace,
      ground: this.ground,
      jumar: this.local(drawn.jumar, at),
      carabiner: this.local(drawn.carabiner, at),
      sliding: view.jumarHeld,
      ladder: along === null || heading === null ? null : this.footing(along, heading, at, wall),
    };
  }

  /** Faces the way they walk on the ground or across a ladder, and the wall up one. */
  private face(view: ClimberView, at: Point, heading: Point | null, wall: boolean): void {
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
  }

  /** The ladder as the figure goes along it, from where it's drawn: the way, a rung, the ends. */
  private footing(
    { start, finish }: { readonly start: Point; readonly finish: Point },
    heading: Point,
    at: Point,
    wall: boolean,
  ): LadderFooting {
    const facing = this.facingNow;
    const up = heading.y >= 0;
    const sign = (wall ? up === this.upward : heading.x * facing >= 0) ? 1 : -1;
    const length = Math.hypot(finish.x - start.x, finish.y - start.y);
    const rung = ClimberReading.RUNG_METRES;
    const { grown } = this;
    const on = (at.x - start.x) * heading.x + (at.y - start.y) * heading.y;
    return {
      way: { x: sign * heading.x * facing, y: sign * heading.y },
      rung: (sign * (rung / 2 - on)) / grown,
      spacing: rung / grown,
      ends: [(sign * -on) / grown, (sign * (length - on)) / grown],
    };
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

  private static heading(start: Point, finish: Point): Point {
    const x = finish.x - start.x;
    const y = finish.y - start.y;
    const length = Math.hypot(x, y) || 1;
    return { x: x / length, y: y / length };
  }
}
