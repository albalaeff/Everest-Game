import { SimulationClock } from "../simulation";
import type { Climber } from "./climber";
import type { AidSeconds } from "./injuries";
import type { RescueLine } from "./rescue-line";
import type { Slope } from "./slope";
import type { Point, Way } from "./terrain";

/**
 * A rescue's numbers (#241), handed to the physics with its others: how near a casualty a
 * rescuer kneels to treat or lift them, in metres; the seconds of play, at a whole stride, the
 * anchor of a rescue line takes to build, and each piece of first aid; how fast a whole stride
 * hauls a casualty up a rescue line on its pulleys, in m/s; the seconds a casualty takes to get
 * onto a rescuer's back, or off it; and the share of their stride a rescuer keeps with a casualty
 * on their back.
 */
export interface RescueSettings {
  readonly reach: number;
  readonly anchor: number;
  readonly aid: AidSeconds;
  readonly haul: number;
  readonly lift: number;
  readonly carry: number;
}

/** What a rescuer does for a casualty in a step, the haul held: first aid; lifting them onto
 * their back, or setting them down off it; building the anchor of a rescue line over them; or
 * hauling them up one. */
export type RescueTask =
  | { readonly kind: "aid"; readonly casualty: Climber }
  | { readonly kind: "lift"; readonly casualty: Climber }
  | { readonly kind: "set-down"; readonly casualty: Climber }
  | { readonly kind: "anchor"; readonly casualty: Climber; readonly line: RescueLine }
  | { readonly kind: "line-haul"; readonly casualty: Climber; readonly line: RescueLine };

/** Who works for a casualty this step, and at what. */
export interface RescueTasks {
  of(climber: Climber): RescueTask | null;
}

/**
 * A step's rescue work (#241): what each climber who holds the haul, on their feet with their
 * arms whole, does for a casualty where they stand, as a rescuer does it, the most pressing
 * first. With a casualty on their back, standing still: they set them down, the haul let go
 * since it lifted them and held anew; nor does the hold that set them down lift them again. At a rescue line's
 * anchor with a casualty at its foot who can be moved: they haul them up it. By a casualty who's
 * due first aid, with a first-aid kit: the tourniquet on what bleeds, then the splint, then the
 * wrap on a sprain. By a casualty who can't walk and can be moved, on ground the route reaches:
 * they lift them onto their back. At the edge over a climber who lies where the route doesn't
 * reach, with a rescue kit: they build the anchor and throw the rope down. One rescuer does one
 * thing a step, and whoever hauls a climber who hangs on a fixed rope does that first.
 */
export class RescueWork implements RescueTasks {
  /** How near a spot along the ground a rescuer stands to anchor a line there, in metres: the
   * engine's number, a lip's. */
  private static readonly AT_A_LIP = 0.6;
  private static readonly WAYS: readonly Way[] = [-1, 1];

  private readonly tasks = new Map<Climber, RescueTask>();

  constructor(
    private readonly slope: Slope,
    private readonly climbers: readonly Climber[],
    /** Whether a climber's hands are taken this step already: hauling a partner who hangs. */
    taken: (climber: Climber) => boolean,
  ) {
    for (const rescuer of climbers) {
      const at = taken(rescuer) ? null : rescuer.helper(slope);
      const task = at === null ? null : this.taskOf(rescuer, at);
      if (task !== null) {
        this.tasks.set(rescuer, task);
      }
    }
  }

  of(climber: Climber): RescueTask | null {
    return this.tasks.get(climber) ?? null;
  }

  /** The step's work, done: the first aid given, the lift a step on, the anchor a step nearer
   * built, the casualty a step higher up the line; a kit used up where its job is done; and a
   * lift nobody went on with, let go. */
  carryOut(): void {
    const held = new Set<Climber>();
    for (const [rescuer, task] of this.tasks) {
      if (task.kind === "lift" || task.kind === "set-down") {
        held.add(task.casualty);
      }
      const progress = this.work(rescuer, task);
      rescuer.helped({ kind: task.kind, whom: task.casualty.id, progress });
    }
    for (const climber of this.climbers) {
      if (!held.has(climber)) {
        climber.letGo();
      }
    }
  }

  /** A rescuer's step of work at their task, at their stride's share of its pace. How far that
   * piece of the work has come, 0 to 1. */
  private work(rescuer: Climber, task: RescueTask): number {
    const { rescue } = this.slope.settings;
    const { casualty } = task;
    const given = SimulationClock.STEP_SECONDS * rescuer.haulStride;
    if (task.kind === "aid") {
      if (casualty.treated(given, rescue.aid)) {
        rescuer.spend("firstAid");
      }
      return casualty.aidDue(rescue.aid)?.progress ?? 1;
    }
    if (task.kind === "lift" || task.kind === "set-down") {
      const done = casualty.lifted(rescuer.id, given, rescue.lift);
      const progress = casualty.liftProgress(rescue.lift);
      if (done && task.kind === "lift") {
        rescuer.shoulder(casualty);
      } else if (done) {
        rescuer.setDown(this.slope);
      }
      if (done) {
        rescuer.spendHold();
      }
      return progress;
    }
    if (task.kind === "anchor") {
      if (task.line.build(rescue.anchor > 0 ? given / rescue.anchor : 1)) {
        rescuer.spend("rescueKit");
      }
      return task.line.progress;
    }
    casualty.hauledUp(task.line, rescue.haul * given);
    const whole = Math.abs(task.line.top - task.line.foot);
    const left = Math.abs(task.line.top - casualty.alongNow(this.slope));
    return whole > 0 ? 1 - Math.min(1, left / whole) : 1;
  }

  /** What a rescuer who stands `at` does this step, or nothing. */
  private taskOf(rescuer: Climber, at: Point): RescueTask | null {
    const carried = rescuer.carrying;
    if (carried !== null) {
      const sets = rescuer.standsStill && rescuer.liftsAnew;
      return sets ? { kind: "set-down", casualty: carried } : null;
    }
    return (
      this.lineHaul(rescuer) ??
      this.aid(rescuer, at) ??
      this.lift(rescuer, at) ??
      this.anchor(rescuer)
    );
  }

  /** At a rescue line's anchor, within the haul's reach: the casualty at its foot, or on it
   * already, who can't walk and can be moved, is hauled up it. */
  private lineHaul(rescuer: Climber): RescueTask | null {
    const { haul, rescue } = this.slope.settings;
    const here = rescuer.onTheGround;
    if (here === null) {
      return null;
    }
    for (const line of this.slope.lines.values()) {
      if (!line.ready || Math.abs(here - line.top) > haul.reach) {
        continue;
      }
      const casualty = this.climbers.find((other) => {
        if (other === rescuer || !other.down || !other.movable) {
          return false;
        }
        if (other.hauledOn !== null) {
          return other.hauledOn === line;
        }
        const lies = other.reachable;
        return (
          lies !== null &&
          (line.holds(lies) || Math.abs(lies - line.foot) <= rescue.reach) &&
          Math.abs(lies - line.top) > RescueWork.AT_A_LIP
        );
      });
      if (casualty !== undefined) {
        return { kind: "line-haul", casualty, line };
      }
    }
    return null;
  }

  /** By a casualty who's due first aid, a first-aid kit in the rescuer's pack: the nearest. */
  private aid(rescuer: Climber, at: Point): RescueTask | null {
    if (rescuer.carries.firstAid !== true) {
      return null;
    }
    const { aid } = this.slope.settings.rescue;
    const casualty = this.nearest(rescuer, at, (other) => other.aidDue(aid) !== null);
    return casualty === null ? null : { kind: "aid", casualty };
  }

  /** By a casualty who can't walk and can be moved, on ground the route reaches: the nearest. */
  private lift(rescuer: Climber, at: Point): RescueTask | null {
    if (!rescuer.liftsAnew) {
      return null;
    }
    const { faces } = this.slope;
    const casualty = this.nearest(rescuer, at, (other) => {
      const lies = other.reachable;
      return other.down && other.movable && lies !== null && !faces.deadEnd(lies);
    });
    return casualty === null ? null : { kind: "lift", casualty };
  }

  /** At the edge over a climber who lies where the route doesn't reach, a rescue kit in the
   * rescuer's pack: the anchor of a line down to them, a new one or one half built there. None
   * where a line that's ready runs down to them from that edge already. */
  private anchor(rescuer: Climber): RescueTask | null {
    const here = rescuer.onTheGround;
    if (here === null || rescuer.carries.rescueKit !== true) {
      return null;
    }
    const { slope } = this;
    for (const casualty of this.climbers) {
      const lies = casualty === rescuer ? null : casualty.strandedAt(slope);
      if (lies === null) {
        continue;
      }
      for (const way of RescueWork.WAYS) {
        const spot = slope.anchorSpot(lies, way);
        if (spot === null || Math.abs(here - spot) > RescueWork.AT_A_LIP) {
          continue;
        }
        const thrown = [...slope.lines.values()].find((line) => line.top === spot);
        if (thrown?.ready === true) {
          continue;
        }
        return {
          kind: "anchor",
          casualty,
          line: thrown ?? slope.throwLine(spot, lies, rescuer.id),
        };
      }
    }
    return null;
  }

  /** The climber nearest a rescuer who stands `at`, within the rescue's reach, whom they can
   * reach on the ground and who is `wanted`; none if there's none. */
  private nearest(
    rescuer: Climber,
    at: Point,
    wanted: (other: Climber) => boolean,
  ): Climber | null {
    const { terrain, settings } = this.slope;
    let found: Climber | null = null;
    let least = settings.rescue.reach;
    for (const other of this.climbers) {
      const lies = other === rescuer ? null : other.reachable;
      if (lies === null || !wanted(other)) {
        continue;
      }
      const point = terrain.point(lies);
      const x = point.x - at.x;
      const y = point.y - at.y;
      const away = Math.sqrt(x * x + y * y);
      if (away <= least) {
        found = other;
        least = away;
      }
    }
    return found;
  }
}
