import type { Point } from "../physics";
import type { Tool } from "../simulation";

/** The climber the camera follows, as the physics shows them: where they are, and the rope each
 * cowstail is clipped to, which the input reads through the camera. */
export interface Watched {
  readonly x: number;
  readonly y: number;
  readonly first: string | null;
  readonly second: string | null;
}

/** Who the camera follows: the page gives it the player's climber, read from the physics each
 * time it's asked. */
export interface WatchedClimber {
  readonly climber: Watched;
}

/** A point on the screen, in CSS pixels from its top left corner. */
export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface ScreenSize {
  readonly width: number;
  readonly height: number;
}

/**
 * The window onto the slope: 20 m of it from the top of the screen to the bottom, on a phone as on
 * a PC, with the climber a third from the left and below the middle, so more of the way up is in
 * view. It follows the climber smoothly, and maps the screen to slope metres and back. It's the
 * input's `SlopeView`: the page hands it to `PlayerInput`, so a click lands in slope metres.
 */
export class Camera {
  /** Slope metres from the top of the screen to the bottom. */
  static readonly METRES_HIGH = 20;
  /** Where the climber stands on the screen: shares of its width and its height. */
  static readonly ANCHOR_X = 1 / 3;
  static readonly ANCHOR_Y = 0.6;
  /** How long the camera takes to close most of the way, 63%, onto the climber. */
  static readonly SETTLE_SECONDS = 0.25;
  private static readonly TOOL_REACH_METRES = 1;
  /** A point of the screen lands on the slope to the centimetre: the actions it makes, kept by
   * every replay and sent to the room, carry no more. */
  private static readonly POINTS_A_METRE = 100;

  /** The slope point under the screen's anchor. */
  private x: number;
  private y: number;
  private width: number;
  private height: number;

  constructor(
    private readonly watched: WatchedClimber,
    width: number,
    height: number,
  ) {
    this.width = width;
    this.height = height;
    const { x, y } = watched.climber;
    this.x = x;
    this.y = y;
  }

  get climber(): Watched {
    return this.watched.climber;
  }

  get position(): Point {
    return { x: this.x, y: this.y };
  }

  get screen(): ScreenSize {
    return { width: this.width, height: this.height };
  }

  /** The screen's anchor: where the slope point the camera is on lands. */
  get anchor(): ScreenPoint {
    return { x: this.width * Camera.ANCHOR_X, y: this.height * Camera.ANCHOR_Y };
  }

  get pixelsPerMetre(): number {
    return this.height / Camera.METRES_HIGH;
  }

  /** The screen's new size: the slope stays where it was. */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  /** The slope point under a point of the screen, to the centimetre. */
  at(screenX: number, screenY: number): Point {
    const { x, y } = this.anchor;
    const metres = this.pixelsPerMetre;
    return {
      x: Camera.rounded(this.x + (screenX - x) / metres),
      y: Camera.rounded(this.y - (screenY - y) / metres),
    };
  }

  /** Where a slope point lands on the screen. */
  toScreen(point: Point): ScreenPoint {
    const { x, y } = this.anchor;
    const metres = this.pixelsPerMetre;
    return { x: x + (point.x - this.x) * metres, y: y - (point.y - this.y) * metres };
  }

  /** Where a tool goes when the player has nothing to point with: a metre ahead of the climber,
   * the ice axe above and the crampons below. */
  ahead(tool: Tool["tool"]): Point {
    const reach = Camera.TOOL_REACH_METRES;
    const { x, y } = this.climber;
    return { x: x + reach, y: y + (tool === "ice-axe" ? reach : -reach) };
  }

  /** Closes on the climber for `seconds` more: the same place after a second at 30 frames a second
   * as at 60, and never past them. */
  follow(seconds: number): void {
    const share = 1 - Math.exp(-Math.max(seconds, 0) / Camera.SETTLE_SECONDS);
    const { x, y } = this.climber;
    this.x += (x - this.x) * share;
    this.y += (y - this.y) * share;
  }

  /** Straight onto the climber: at the start, and after anything that moves them at once. */
  jump(): void {
    const { x, y } = this.climber;
    this.x = x;
    this.y = y;
  }

  private static rounded(metres: number): number {
    return Math.round(metres * Camera.POINTS_A_METRE) / Camera.POINTS_A_METRE;
  }
}
