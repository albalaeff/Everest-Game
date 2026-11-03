import type { Pace, Walk } from "../simulation";

/**
 * Where the player steers the climber: one of eight directions and one of three paces, from keys
 * or a stick alike. A stick has no speed of its own, since the pace comes from the body model
 * (spec.md → Cross-play).
 */
export class Steering {
  static readonly STOPPED = new Steering("stop", "steady");

  /** How far a stick is pushed, as a share of its reach: under the first it stands still. */
  private static readonly DEAD_ZONE = 1 / 6;
  private static readonly REST_STEP_ZONE = 1 / 2;
  private static readonly STEADY_ZONE = 13 / 15;

  /** tan 22.5°: each of the eight directions gets a sector of 45° around it. */
  private static readonly SECTOR_EDGE = 0.4142;

  private constructor(
    readonly direction: Walk["direction"],
    readonly pace: Pace["pace"],
  ) {}

  /** From keys: `across` is -1, 0 or 1 to the right, and `up` is -1, 0 or 1 upward. */
  static ofKeys(across: number, up: number, pace: Pace["pace"]): Steering {
    return new Steering(Steering.directionOf(across, up), pace);
  }

  /** From a stick: `x` and `y` are shares of its reach, and `y` runs down the screen. */
  static ofStick(x: number, y: number): Steering {
    const push = Math.hypot(x, y);
    if (push < Steering.DEAD_ZONE) {
      return Steering.STOPPED;
    }
    const across = Math.abs(x) > Steering.SECTOR_EDGE * Math.abs(y) ? Math.sign(x) : 0;
    const up = Math.abs(y) > Steering.SECTOR_EDGE * Math.abs(x) ? -Math.sign(y) : 0;
    return new Steering(Steering.directionOf(across, up), Steering.paceOf(push));
  }

  equals(other: Steering): boolean {
    return this.direction === other.direction && this.pace === other.pace;
  }

  private static directionOf(across: number, up: number): Walk["direction"] {
    const vertical = up > 0 ? "up" : "down";
    const horizontal = across > 0 ? "right" : "left";
    if (up === 0) {
      return across === 0 ? "stop" : horizontal;
    }
    return across === 0 ? vertical : `${vertical}-${horizontal}`;
  }

  private static paceOf(push: number): Pace["pace"] {
    if (push < Steering.REST_STEP_ZONE) {
      return "rest-step";
    }
    return push < Steering.STEADY_ZONE ? "steady" : "faster";
  }
}
