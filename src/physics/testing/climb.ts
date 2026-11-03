import { Expedition } from "../../simulation";
import type { ClimberId, Clip, ExpeditionSave, GameAction, Walk } from "../../simulation";
import { SlopePhysics } from "../slope-physics";
import type { SlopeLayout, SlopeSettings } from "../slope-physics";
import type { Point } from "../terrain";
import { TestMountain } from "./test-mountain";

/**
 * A climb for the physics' tests: the slope physics played through `Expedition`, on a seed, and the
 * actions a test sends it. Only tests import it.
 */
export class Climb {
  static readonly walk = (climber: ClimberId, direction: Walk["direction"]): GameAction => ({
    kind: "walk",
    climber,
    direction,
  });
  static readonly clip = (climber: ClimberId, cowstail: Clip["cowstail"]): GameAction => ({
    kind: "clip",
    climber,
    cowstail,
  });
  static readonly unclip = (climber: ClimberId, cowstail: Clip["cowstail"]): GameAction => ({
    kind: "unclip",
    climber,
    cowstail,
  });
  static readonly jumar = (climber: ClimberId, held: boolean): GameAction => ({
    kind: "jumar",
    climber,
    held,
  });

  readonly physics: SlopePhysics;
  readonly expedition: Expedition;

  /** A climb from a layout's start, or on from a save. */
  constructor(settings: SlopeSettings, start: SlopeLayout | ExpeditionSave, seed = 1) {
    this.physics = new SlopePhysics(settings);
    this.expedition =
      "scenario" in start
        ? Expedition.resume(start, [this.physics])
        : Expedition.start(TestMountain.scenario(seed, start), [this.physics]);
  }

  static readonly distance = (from: Point, to: Point): number =>
    Math.sqrt((to.x - from.x) * (to.x - from.x) + (to.y - from.y) * (to.y - from.y));

  /** The same climb from here on, on other numbers: a gust, say, that makes every step a slip. */
  under(settings: SlopeSettings): Climb {
    return new Climb(settings, this.expedition.save());
  }

  /** Plays `steps` steps, with `actions` in the first. */
  play(steps: number, actions: readonly GameAction[] = []): void {
    this.expedition.advance(actions);
    for (let step = 1; step < steps; step += 1) {
      this.expedition.advance();
    }
  }

  /** One step of walking, then still: one chance to slip. */
  step(climber: ClimberId, direction: Walk["direction"], first: readonly GameAction[] = []): void {
    this.play(1, [...first, Climb.walk(climber, direction)]);
    this.play(1, [Climb.walk(climber, "stop")]);
  }
}
