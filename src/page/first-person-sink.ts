import type { ActionSink, PlayerAction } from "../input/player-action";
import type { RouteSteering } from "../rendering3d";
import type { ClimberId, Walk } from "../simulation";

/** What the sink reads of the 3D picture: which way along the route the player's body faces,
 * and the head it turns. */
export interface FirstPersonView {
  readonly way: 1 | -1;
  readonly look: { turn(left: number, up: number): void };
}

/**
 * The player's actions in first person, between the controls and the game (#311). The controls
 * push one of eight ways, as the slope seen from the side wants them; through the climber's own
 * eyes a push up is forward, the way they look along the route, a push down is back, and a push
 * to a side turns their head, so the keys alone, or a phone's stick, both walk and look. The
 * game hears the walk the push comes to where the climber stands (`RouteSteering`), again each
 * time that changes while the push is held: on the ground, onto a ladder, up it. A turn to face
 * the viewer has nobody to face, and turns the head instead. Everything else goes on as it is.
 */
export class FirstPersonSink implements ActionSink {
  /** Radians a second a held push to a side turns the head. */
  private static readonly TURN = 1.7;

  private push: "forward" | "back" | null = null;
  private turning: 1 | 0 | -1 = 0;
  private sent: Walk["direction"] = "stop";

  constructor(
    private readonly next: ActionSink,
    private readonly steering: RouteSteering,
    private readonly climber: ClimberId,
    private readonly facing: () => 1 | -1,
    private readonly view: FirstPersonView,
  ) {}

  send(action: PlayerAction): void {
    if (action.kind === "turn" && action.climber === this.climber) {
      // The push went back the way they came, across the old picture: to the left facing up
      // the route, and to the right facing down it.
      this.turning = this.facing() > 0 ? 1 : -1;
      return;
    }
    if (action.kind !== "walk" || action.climber !== this.climber) {
      this.next.send(action);
      return;
    }
    const { direction } = action;
    this.push = direction.startsWith("up")
      ? "forward"
      : direction.startsWith("down")
        ? "back"
        : null;
    this.turning = direction.endsWith("left") ? 1 : direction.endsWith("right") ? -1 : 0;
    this.update(0);
  }

  /** A frame, `seconds` after the last: the head turns while a push to a side is held, and the
   * walk follows the ground the climber has come to. */
  update(seconds: number): void {
    if (this.turning !== 0) {
      this.view.look.turn(this.turning * FirstPersonSink.TURN * seconds, 0);
    }
    const direction =
      this.push === null
        ? "stop"
        : this.steering.direction(this.climber, this.push === "forward", this.view.way);
    if (direction !== this.sent) {
      this.sent = direction;
      this.next.send({ kind: "walk", climber: this.climber, direction });
    }
  }
}
