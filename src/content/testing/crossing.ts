import { Footwork } from "../../agents/footwork";
import type { RouteWay } from "../../agents/footwork";
import type { SlopePhysics } from "../../physics";
import type { ClimberId, Expedition, GameAction } from "../../simulation";

/**
 * A climber crossing a section headless, as a careful player would, on the footwork the Sherpa's
 * agent moves on (`Footwork`, #212): up the route or down it, the jumar's slide held, clipped in
 * wherever a rope is within reach, the cowstails across at the anchors one at a time, the ladders
 * up and down the walls, the steps of ice on its tools or down their ropes, the rest step on blue
 * ice and the crossings unless it's told not to, and back up its rope after a slip. At the lip of
 * a ladder that fell into its crevasse it stops and holds the haul, for whoever comes to haul it
 * back up with it (#228). It writes down the ladders it climbs and the faces of ice it goes up or
 * down. Only tests import it.
 */
export class Crossing {
  /** The ladders climbed, in order. */
  readonly laddersClimbed: string[] = [];
  /** The faces with no ladder it went up or down on its tools, by their foot along the ground, in
   * order. */
  readonly facesClimbed: number[] = [];
  /** How near a ladder's end along the ground it stands to be at its lip, in metres. */
  private static readonly AT_THE_LIP = 1;

  private readonly footwork: Footwork;
  private lastLadder: string | null = null;

  constructor(
    private readonly expedition: Expedition,
    private readonly physics: SlopePhysics,
    private readonly climber: ClimberId,
    private readonly way: RouteWay = "up",
    /** Whether it takes the rest step on the ice and the crossings, or keeps its steady pace. */
    careful = true,
  ) {
    this.footwork = new Footwork(physics, climber, careful);
  }

  /** One step of the crossing: what the walker does, then the expedition's step. */
  step(): void {
    const view = this.physics.climber(this.climber);
    // A ladder once, however many times a slip off it puts the walker back on it.
    if (
      view.ladder !== null &&
      view.ladder !== this.lastLadder &&
      this.laddersClimbed.at(-1) !== view.ladder
    ) {
      this.laddersClimbed.push(view.ladder);
    }
    this.lastLadder = view.ladder;
    const fallen = !view.falling && view.ladder === null && this.atAFallenLadder();
    const actions = this.footwork.actions(fallen ? null : this.way);
    const { face } = this.footwork;
    if (face !== null && this.facesClimbed.at(-1) !== face) {
      this.facesClimbed.push(face);
    }
    const haul: readonly GameAction[] =
      fallen === view.haulHeld ? [] : [{ kind: "haul", climber: this.climber, held: fallen }];
    this.expedition.advance([...actions, ...haul]);
  }

  /** Whether it stands at the lip of a ladder that's broken (#228). */
  private atAFallenLadder(): boolean {
    const { physics } = this;
    const along = physics.along(this.climber);
    return physics.ladders.some(
      (id) =>
        physics.ladderCondition(id) === "broken" &&
        physics
          .ladder(id)
          .some(
            (end) => Math.abs(physics.terrain.nearest(end).along - along) <= Crossing.AT_THE_LIP,
          ),
    );
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
}
