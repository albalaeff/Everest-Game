import type { ClimberId, Tool, Walk } from "../simulation";
import type { Control } from "./controls";
import type { ActionSink } from "./player-action";
import type { SlopePoint, SlopeView } from "./slope-view";
import { Steering } from "./steering";

/**
 * One player's actions, whatever device they come from. Each sends what the player does here, and
 * only a change goes on, because replays and the room server keep every action. The turn back
 * goes through the viewer (#235): the first push back the way the climber came, on their feet on
 * the ground, is a `turn` to face out of the slope, and the next push, either way, is the walk.
 */
export class PlayerInput {
  private steering = Steering.STOPPED;
  private readonly held = new Set<Control>();
  /** Whether the turn was the last thing sent of the walking, but for a stop: the next push is
   * the walk. The view can't say so yet: the page's is a step behind what was sent, and a room's
   * by the trip there and back, so a quick second push would turn them twice and walk nowhere. */
  private turned = false;

  constructor(
    private readonly climber: ClimberId,
    private readonly slope: SlopeView,
    private readonly sink: ActionSink,
  ) {}

  steer(steering: Steering): void {
    const { climber } = this;
    if (steering.pace !== this.steering.pace) {
      this.sink.send({ kind: "pace", climber, pace: steering.pace });
    }
    if (steering.direction !== this.steering.direction) {
      const turns = this.turnsFirst(steering.direction);
      this.sink.send(
        turns
          ? { kind: "turn", climber, toward: "viewer" }
          : { kind: "walk", climber, direction: steering.direction },
      );
      this.turned = turns || (this.turned && steering.direction === "stop");
    }
    this.steering = steering;
  }

  /** Whether a push `direction` turns the climber to face the viewer before they walk it: one
   * that points back the way they came, while they stand side-on, on their feet on the ground.
   * Never twice running: the push after a turn is the walk, whatever the view shows by then. */
  private turnsFirst(direction: Walk["direction"]): boolean {
    const { facing, towardViewer, falling, ladder, onIce, lowering } = this.slope.climber;
    const across = direction.endsWith("left") ? -1 : direction.endsWith("right") ? 1 : 0;
    const afoot =
      falling !== true && (ladder ?? null) === null && onIce !== true && lowering !== true;
    return (
      !this.turned && facing !== undefined && across === -facing && towardViewer !== true && afoot
    );
  }

  press(control: Control): void {
    if (this.held.has(control)) {
      return;
    }
    if (control.release !== undefined) {
      this.held.add(control);
    }
    this.sink.send(control.press(this.climber, this.slope.climber));
  }

  release(control: Control): void {
    if (control.release !== undefined && this.held.delete(control)) {
      this.sink.send(control.release(this.climber));
    }
  }

  /** Uses a tool where the player pointed: the ice axe above the climber, the crampons below. */
  useTool(screenX: number, screenY: number): void {
    const point = this.slope.at(screenX, screenY);
    this.place(point.y >= this.slope.climber.y ? "ice-axe" : "crampons", point);
  }

  useToolAhead(tool: Tool["tool"]): void {
    this.place(tool, this.slope.ahead(tool));
  }

  /** Lets go of everything held, for when the releases will never come. */
  letGo(): void {
    for (const control of [...this.held]) {
      this.release(control);
    }
    this.steer(Steering.STOPPED);
  }

  private place(tool: Tool["tool"], { x, y }: SlopePoint): void {
    this.sink.send({ kind: "tool", climber: this.climber, tool, x, y });
  }
}
