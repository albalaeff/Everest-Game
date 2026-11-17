import type { ClimberView, Point } from "../physics";
import type { Changeover } from "./changeover";
import type { CoachTip } from "./coach";

/** Which way an arrow points, on the screen. */
export type PointerWay = "up" | "down" | "left" | "right";

/** What an arrow's words say: the control to use where it points. */
export type PointerSays =
  | "walk"
  | "clip-second"
  | "clip-first"
  | "off-second"
  | "off-first"
  | "jumar"
  | "up"
  | "down"
  | "cross"
  | "pick"
  | "pick-over"
  | "step-down"
  | "lower"
  | "climb-rope"
  | "jumar-on"
  | "haul"
  | "raise"
  | "back-off"
  | "move-on"
  | "refit";

/** An arrow on the slope: a place, in slope metres, the way the arrow points, and what its words
 * say. Its `tip` is at the place where it shows exactly where, a carabiner's place on the rope or
 * a pick's in the ice, and it stands off it on the side it comes from; its `tail` is there where
 * it shows the way to go, and it runs on from the place, which is clear of the climber. */
export interface Pointing {
  readonly at: Point;
  readonly way: PointerWay;
  readonly anchor: "tip" | "tail";
  readonly says: PointerSays;
}

/** What the pointer reads of the climb: the player's climber, the ropes and the ladders, the ice
 * they stand at and the edge a partner comes up at. The page hands it the physics' views. */
export interface PointerWorld {
  player(): ClimberView;
  /** The rope a clip of the player's would take now, or none. */
  ropeWithin(): string | null;
  readonly ropes: readonly string[];
  rope(id: string): readonly Point[];
  readonly ladders: readonly string[];
  ladder(id: string): readonly Point[];
  /** The face of ice the player stands at, hangs on or climbs: its foot and its top, or none. */
  iceFace(): { readonly foot: Point; readonly top: Point } | null;
  /** Where the next pick bites well on that face, going up: above the feet, clear of brittle ice,
   * or over its lip once that's within reach; or none. */
  pickSpot(): Point | null;
  /** Where a partner who hangs on the rope comes up: the edge to stand at; or none. */
  liftPoint(): Point | null;
}

/**
 * Where the coach's tip points (#233): for the tip on the card, the exact place on the slope it's
 * about, the way an arrow points and the control its words name, so the player sees where
 * as well as what (docs/guidelines.md → The mountain is the interface), from the side that leaves
 * the climber in view: up from under the rope, out of the ice. The place a carabiner goes
 * on the rope within reach, the second cowstail's first and then the jumar's; at a changeover
 * (#247), the step to do now: the carabiner, then the jumar, to take off the rope they came on,
 * where it is, and the place on the next rope each goes; the way to walk, up a ladder at its foot
 * and down one at its top, along a crossing; the jumar's slide from the hand, the way they face; where the next pick
 * bites well on a wall of ice, and over its lip; the face to step down onto and the rope to lower
 * down; up the rope when hanging, and the carabiner to clip the jumar beside; the edge to stand
 * at to pull a partner out or set a ladder back; back from under a cracking serac and on from
 * under a standing one; the boots to refit a crampon at. A tip about no place has no arrow. Pure:
 * it holds nothing, and reads the climb each time it's asked.
 */
export class CoachPointer {
  /** How far ahead of the climber, and how high over the ground they stand on, an arrow for the
   * way to go points, in metres: clear of the figure. */
  private static readonly AHEAD = 1.3;
  private static readonly CHEST = 1.1;
  /** How far up a ladder from its foot, and down it from its top, its arrow points, how far along
   * a crossing from its end, and how near a ladder's end the player has to be for it. */
  private static readonly ON_LADDER = 2.2;
  private static readonly ALONG_CROSSING = 1.2;
  private static readonly AT_TOP = 0.6;
  private static readonly NEAR_LADDER = 3;
  /** How far over a hanging climber's feet the arrow up their rope points, and how far down a
   * face from its lip the arrows onto it and down it. */
  private static readonly OVER_HEAD = 2.4;
  private static readonly DOWN_FACE = 0.7;
  /** How far under the boots the arrow to a loose crampon points. */
  private static readonly UNDER_BOOTS = 0.1;
  /** How far along the next rope from a changeover's anchor its arrow points while a clip still
   * takes the old one: where the rope they're on lets them reach. */
  private static readonly PAST_ANCHOR = 0.6;

  /** The arrow for `tip`, as the climb stands, or none; at a changeover, for the `change` on the
   * card (#247). */
  point(
    tip: CoachTip | null,
    world: PointerWorld,
    change: Changeover | null = null,
  ): Pointing | null {
    if (tip === null) {
      return null;
    }
    const view = world.player();
    const { AHEAD, CHEST } = CoachPointer;
    const beside = (way: 1 | -1): Point => ({ x: view.x + way * AHEAD, y: view.y + CHEST });
    switch (tip) {
      case "walk":
        return { at: beside(1), way: "right", anchor: "tail", says: "walk" };
      case "clip":
      case "unclipped":
      case "ladder-creak":
        return this.clip(view, world);
      case "anchor":
      case "rope-end":
        return change === null || view.falling ? null : this.changeover(view, world, change);
      case "jumar":
        return view.firstAt === null
          ? null
          : {
              at: { x: view.firstAt.x + view.facing * AHEAD, y: view.firstAt.y + CHEST },
              way: view.facing > 0 ? "right" : "left",
              anchor: "tail",
              says: "jumar",
            };
      case "ladder-up":
      case "ladder-down":
      case "crossing":
        return this.ladder(tip, view, world);
      case "ice-wall":
      case "on-ice":
      case "pick-poor":
      case "hanging-no-jumar":
      case "crevasse-floor":
        return this.pick(view, world);
      case "ice-down":
        return this.downAFace(view, world, "step-down");
      case "rappel":
        return this.downAFace(view, world, "lower");
      case "hanging":
        return {
          at: { x: view.x, y: view.y + CoachPointer.OVER_HEAD },
          way: "up",
          anchor: "tail",
          says: "climb-rope",
        };
      case "hanging-carabiner": {
        const carabiner = view.secondAt ?? view.firstAt;
        return carabiner === null
          ? null
          : { at: carabiner, way: "down", anchor: "tip", says: "jumar-on" };
      }
      case "haul": {
        const edge = world.liftPoint();
        return edge === null ? null : { at: edge, way: "down", anchor: "tip", says: "haul" };
      }
      case "ladder-broken": {
        const end = this.nearestEnd(view, world);
        return end === null ? null : { at: end.near, way: "down", anchor: "tip", says: "raise" };
      }
      case "serac-crack":
        return { at: beside(-1), way: "left", anchor: "tail", says: "back-off" };
      case "stopped-under-seracs":
        return { at: beside(1), way: "right", anchor: "tail", says: "move-on" };
      case "crampon-loose":
        return view.ladder === null
          ? {
              at: { x: view.x, y: view.y - CoachPointer.UNDER_BOOTS },
              way: "up",
              anchor: "tip",
              says: "refit",
            }
          : null;
      default:
        return null;
    }
  }

  /** Up from under the rope within reach, onto the place on it a carabiner goes: the second
   * cowstail's first, then the jumar's. None with both on, or with no rope in reach. */
  private clip(view: ClimberView, world: PointerWorld): Pointing | null {
    const rope = world.ropeWithin();
    if (rope === null || view.falling) {
      return null;
    }
    const at = CoachPointer.nearestOn(world.rope(rope), view);
    const says: PointerSays | null =
      view.second === null ? "clip-second" : view.first === null ? "clip-first" : null;
    return at === null || says === null ? null : { at, way: "up", anchor: "tip", says };
  }

  /** At a changeover (#247), up onto the place of its step to do now: the carabiner or the jumar
   * to take off the rope they came on, where it is on it; or the place on the next rope it goes,
   * its point nearest them once a clip takes that rope, and until then a little along it from the
   * anchor. None once it's over. */
  private changeover(view: ClimberView, world: PointerWorld, change: Changeover): Pointing | null {
    const step = change.now(view);
    const off = (at: Point | null, says: PointerSays): Pointing => ({
      at: at ?? change.anchor,
      way: "up",
      anchor: "tip",
      says,
    });
    switch (step) {
      case null:
        return null;
      case "carabiner-off":
        return off(view.secondAt, "off-second");
      case "jumar-off":
        return off(view.firstAt, "off-first");
      case "carabiner-on":
      case "jumar-on": {
        const { next } = change;
        const rope = next === null ? [] : world.rope(next);
        const at =
          world.ropeWithin() === next
            ? CoachPointer.nearestOn(rope, view)
            : CoachPointer.past(rope, change.anchor);
        const says = step === "carabiner-on" ? "clip-second" : "clip-first";
        return at === null ? null : { at, way: "up", anchor: "tip", says };
      }
    }
  }

  /** The point of a rope a little along it from its end at `anchor`, or none. */
  private static past(rope: readonly Point[], anchor: Point): Point | null {
    const [first, last] = [rope[0], rope.at(-1)];
    if (first === undefined || last === undefined) {
      return null;
    }
    const away = (point: Point): number => Math.hypot(point.x - anchor.x, point.y - anchor.y);
    const [from, to] = away(first) <= away(last) ? [first, last] : [last, first];
    const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    const share = Math.min(CoachPointer.PAST_ANCHOR, length) / length;
    return { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share };
  }

  /** Up a wall's ladder from its foot, down one from its top, or along a crossing from its end:
   * the ladder whose end is nearest the player. */
  private ladder(
    tip: "ladder-up" | "ladder-down" | "crossing",
    view: ClimberView,
    world: PointerWorld,
  ): Pointing | null {
    const end = this.nearestEnd(view, world);
    if (end === null) {
      return null;
    }
    const { near, far } = end;
    const length = Math.hypot(far.x - near.x, far.y - near.y) || 1;
    const along = (metres: number): Point => ({
      x: near.x + ((far.x - near.x) * metres) / length,
      y: near.y + ((far.y - near.y) * metres) / length,
    });
    if (tip === "crossing") {
      const on = along(CoachPointer.ALONG_CROSSING);
      return {
        at: { x: on.x, y: on.y + CoachPointer.CHEST },
        way: far.x >= near.x ? "right" : "left",
        anchor: "tail",
        says: "cross",
      };
    }
    return tip === "ladder-up"
      ? { at: along(CoachPointer.ON_LADDER), way: "up", anchor: "tail", says: "up" }
      : { at: along(CoachPointer.AT_TOP), way: "down", anchor: "tail", says: "down" };
  }

  /** The ice the next pick goes into, pointed at out of the ice, so the arrow stands on the wall
   * and not over the climber's head, or from above once it's over the lip. */
  private pick(view: ClimberView, world: PointerWorld): Pointing | null {
    const spot = world.pickSpot();
    const face = world.iceFace();
    if (spot === null || face === null) {
      return null;
    }
    if (spot.y >= face.top.y) {
      return { at: spot, way: "down", anchor: "tip", says: "pick-over" };
    }
    return { at: spot, way: spot.x >= view.x ? "left" : "right", anchor: "tip", says: "pick" };
  }

  /** A little down the face from its lip: to step down onto, pointed at from the open side, or to
   * lower down on its rope. */
  private downAFace(
    view: ClimberView,
    world: PointerWorld,
    says: "step-down" | "lower",
  ): Pointing | null {
    const face = world.iceFace();
    if (face === null) {
      return null;
    }
    const at: Point = { x: face.top.x, y: face.top.y - CoachPointer.DOWN_FACE };
    if (says === "lower") {
      return { at, way: "down", anchor: "tail", says };
    }
    return { at, way: view.x >= face.top.x ? "right" : "left", anchor: "tip", says };
  }

  /** The ladder's end nearest the player, within reach of a tip about it, and its other end. */
  private nearestEnd(
    view: ClimberView,
    world: PointerWorld,
  ): { readonly near: Point; readonly far: Point } | null {
    let best: { readonly near: Point; readonly far: Point; readonly away: number } | null = null;
    for (const id of world.ladders) {
      const shape = world.ladder(id);
      const [start, finish] = [shape[0], shape[shape.length - 1]];
      if (start === undefined || finish === undefined) {
        continue;
      }
      for (const [near, far] of [
        [start, finish],
        [finish, start],
      ] as const) {
        const away = Math.hypot(near.x - view.x, near.y - view.y);
        if (away <= CoachPointer.NEAR_LADDER && away < (best?.away ?? Infinity)) {
          best = { near, far, away };
        }
      }
    }
    return best;
  }

  /** The point of a rope's line nearest a climber's point. */
  private static nearestOn(rope: readonly Point[], climber: Point): Point | null {
    let best: Point | null = null;
    let nearest = Infinity;
    for (let index = 0; index + 1 < rope.length; index += 1) {
      const from = rope[index];
      const to = rope[index + 1];
      if (from === undefined || to === undefined) {
        continue;
      }
      const x = to.x - from.x;
      const y = to.y - from.y;
      const squared = x * x + y * y;
      const projected =
        squared === 0 ? 0 : ((climber.x - from.x) * x + (climber.y - from.y) * y) / squared;
      const share = Math.min(Math.max(projected, 0), 1);
      const point = { x: from.x + x * share, y: from.y + y * share };
      const away = Math.hypot(point.x - climber.x, point.y - climber.y);
      if (away < nearest) {
        nearest = away;
        best = point;
      }
    }
    return best;
  }
}
