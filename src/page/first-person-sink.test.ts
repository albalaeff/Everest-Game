import { describe, expect, it } from "vitest";

import type { PlayerAction } from "../input/player-action";
import type { Walk } from "../simulation";
import { FirstPersonSink } from "./first-person-sink";

/** What the game was sent, in order. */
class Heard {
  readonly actions: PlayerAction[] = [];

  send(action: PlayerAction): void {
    this.actions.push(action);
  }

  get walks(): readonly string[] {
    return this.actions.flatMap((action) => (action.kind === "walk" ? [action.direction] : []));
  }
}

/** A steering that says what it's set to, for a push forward, and the opposite for one back. */
class SetSteering {
  ahead: Walk["direction"] = "right";
  back: Walk["direction"] = "left";

  direction(_climber: string, forward: boolean): Walk["direction"] {
    return forward ? this.ahead : this.back;
  }
}

/** A sink between the controls and a game that keeps what it hears, a steering to set, and
 * the head's turns. */
function sink(): {
  readonly first: FirstPersonSink;
  readonly heard: Heard;
  readonly steering: SetSteering;
  readonly turned: number[];
} {
  const heard = new Heard();
  const steering = new SetSteering();
  const turned: number[] = [];
  const view = {
    way: 1 as const,
    look: {
      turn(left: number): void {
        turned.push(left);
      },
    },
    aim: () => ({ tool: "ice-axe" as const, x: 12.3, y: 5.5 }),
  };
  return {
    first: new FirstPersonSink(heard, steering, "player", () => 1, view),
    heard,
    steering,
    turned,
  };
}

const walk = (direction: Walk["direction"]): PlayerAction => ({
  kind: "walk",
  climber: "player",
  direction,
});

describe("the player's pushes in first person", () => {
  it("walks forward on a push up, back on a push down, and stops when it's let go", () => {
    const { first, heard } = sink();
    first.send(walk("up"));
    first.send(walk("stop"));
    first.send(walk("down"));
    first.send(walk("stop"));
    expect(heard.walks).toEqual(["right", "stop", "left", "stop"]);
  });

  it("sends the walk again when the ground under a held push changes: onto a ladder, up it", () => {
    const { first, heard, steering } = sink();
    first.send(walk("up"));
    first.update(1 / 60);
    first.update(1 / 60);
    steering.ahead = "up-right";
    first.update(1 / 60);
    first.update(1 / 60);
    expect(heard.walks).toEqual(["right", "up-right"]);
  });

  it("turns the head on a push to a side, for as long as it's held, and walks nowhere", () => {
    const { first, heard, turned } = sink();
    first.send(walk("left"));
    first.update(0.5);
    first.update(0.5);
    first.send(walk("stop"));
    first.update(0.5);
    expect(turned.length).toBe(2);
    expect(Math.min(...turned)).toBeGreaterThan(0);
    first.send(walk("right"));
    first.update(0.5);
    expect(turned.at(-1) ?? 0).toBeLessThan(0);
    expect(heard.walks).toEqual([]);
  });

  it("walks and turns at once on a diagonal", () => {
    const { first, heard, turned } = sink();
    first.send(walk("up-right"));
    first.update(0.1);
    expect(heard.walks).toEqual(["right"]);
    expect(turned.at(-1) ?? 0).toBeLessThan(0);
  });

  it("turns the head, not the climber, on the old picture's turn to face the viewer", () => {
    const { first, heard, turned } = sink();
    first.send({ kind: "turn", climber: "player", toward: "viewer" });
    first.update(0.25);
    expect(heard.actions).toEqual([]);
    expect(turned.at(-1) ?? 0).toBeGreaterThan(0);
  });

  it("puts a tool where the climber looks, wherever the click fell", () => {
    const { first, heard } = sink();
    first.send({ kind: "tool", climber: "player", tool: "crampons", x: -40, y: 900 });
    expect(heard.actions).toEqual([
      { kind: "tool", climber: "player", tool: "ice-axe", x: 12.3, y: 5.5 },
    ]);
  });

  it("passes everything else on as it is", () => {
    const { first, heard } = sink();
    const clip: PlayerAction = { kind: "clip", climber: "player", cowstail: "first" };
    const panel: PlayerAction = { kind: "panel", panel: "devices" };
    first.send(clip);
    first.send(panel);
    expect(heard.actions).toEqual([clip, panel]);
  });
});
