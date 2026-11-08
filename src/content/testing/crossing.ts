import type { ClimberView, SlopePhysics } from "../../physics";
import type { Expedition } from "../../simulation";
import type { ClimberId, GameAction, Pace, Walk } from "../../simulation";

/**
 * A climber crossing a section headless, as a careful player would: walking up and right, or down
 * and left, the jumar's slide held, clipped to the fixed ropes with both cowstails wherever one is
 * within reach, the cowstails moved across one at a time where a rope ends at the next one's
 * anchor, and both off where a rope ends and nothing follows. At a ladder down a wall ahead it
 * walks down and right onto it, and on the way down, up and left at its foot; off its other end, it
 * walks flat. On blue ice and on a ladder across a crevasse it takes the rest step, where a slip is
 * likeliest (#208), unless it's told not to; hanging on its rope after a slip, it climbs back up,
 * and goes on its way. Only tests import it.
 */
export class Crossing {
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
  private started = false;
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
