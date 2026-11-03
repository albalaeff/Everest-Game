import type { ClimberId, Tool } from "../simulation";
import type { Control } from "./controls";
import type { ActionSink } from "./player-action";
import type { SlopePoint, SlopeView } from "./slope-view";
import { Steering } from "./steering";

/**
 * One player's actions, whatever device they come from. Each sends what the player does here, and
 * only a change goes on, because replays and the room server keep every action.
 */
export class PlayerInput {
  private steering = Steering.STOPPED;
  private readonly held = new Set<Control>();

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
      this.sink.send({ kind: "walk", climber, direction: steering.direction });
    }
    this.steering = steering;
  }

  press(control: Control): void {
    if (this.held.has(control)) {
      return;
    }
    if (control.release !== undefined) {
      this.held.add(control);
    }
    this.sink.send(control.press(this.climber));
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
