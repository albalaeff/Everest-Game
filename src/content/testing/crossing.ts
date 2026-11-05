import type { SlopePhysics } from "../../physics";
import type { Expedition } from "../../simulation";
import type { ClimberId, GameAction } from "../../simulation";

/**
 * A climber crossing a section headless, as a careful player would: walking up and right, the
 * jumar's slide held, clipped to the fixed ropes with both cowstails wherever one is within reach,
 * the cowstails moved across one at a time where a rope ends at the next one's anchor, and both
 * off where a rope ends and nothing follows. Only tests import it.
 */
export class Crossing {
  /** How far past where it unclipped the walker goes before it clips again: the old rope's
   * anchor is still within reach there. */
  private static readonly FREE_METRES = 1;

  /** The ladders climbed, in order. */
  readonly laddersClimbed: string[] = [];
  private started = false;
  /** Which action of the re-clip comes next while the ropes hold the walker: none, or 1 to 4. */
  private reclipping = 0;
  /** Where the walker took both cowstails off, until it's a metre on. */
  private freedAt: number | null = null;
  private lastLadder: string | null = null;

  constructor(
    private readonly expedition: Expedition,
    private readonly physics: SlopePhysics,
    private readonly climber: ClimberId,
  ) {}

  /** One step of the crossing: what the walker does, then the expedition's step. */
  step(): void {
    this.expedition.advance(this.actions());
  }

  /** Steps until the climber is `along` metres along the ground, or `steps` have gone: whether
   * they got there. */
  until(along: number, steps: number): boolean {
    for (let step = 0; step < steps; step += 1) {
      if (this.physics.along(this.climber) >= along) {
        return true;
      }
      this.step();
    }
    return this.physics.along(this.climber) >= along;
  }

  private actions(): readonly GameAction[] {
    const { climber } = this;
    const view = this.physics.climber(climber);
    const along = this.physics.along(climber);
    if (view.ladder !== null && view.ladder !== this.lastLadder) {
      this.laddersClimbed.push(view.ladder);
    }
    this.lastLadder = view.ladder;
    if (!this.started) {
      this.started = true;
      return [
        { kind: "jumar", climber, held: true },
        { kind: "walk", climber, direction: "up-right" },
      ];
    }
    if (view.falling || view.dead) {
      return [];
    }
    const held = !view.moving && view.walking !== "stop";
    if (held || this.reclipping > 0) {
      return this.reclip(held, along);
    }
    if (this.freedAt !== null && along < this.freedAt + Crossing.FREE_METRES) {
      return [];
    }
    this.freedAt = null;
    const loose = (["first", "second"] as const).filter((cowstail) => view[cowstail] === null);
    return loose.map((cowstail) => ({ kind: "clip", climber, cowstail }));
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
