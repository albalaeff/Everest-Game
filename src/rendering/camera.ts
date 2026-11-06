import type { Point } from "../physics";
import type { Tool } from "../simulation";
import { Zoom } from "./zoom";
import { ZoomGlide } from "./zoom-glide";

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
 * The window onto the slope: the zoom's metres of it from the top of the screen to the bottom, 20
 * to start with, on a phone as on a PC, with the climber a third from the left and below the
 * middle, so more of the way up is in view. It follows the climber smoothly, glides from one zoom
 * to the next around them, and maps the screen to slope metres and back. It's the input's
 * `SlopeView`: the page hands it to `PlayerInput`, so a click lands in slope metres.
 */
export class Camera {
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
  /** The level it's on, or gliding to. */
  private level: Zoom;
  private glide: ZoomGlide;

  constructor(
    private readonly watched: WatchedClimber,
    width: number,
    height: number,
    zoom: Zoom = Zoom.STANDARD,
  ) {
    this.width = width;
    this.height = height;
    const { x, y } = watched.climber;
    this.x = x;
    this.y = y;
    this.level = zoom;
    this.glide = ZoomGlide.at(zoom.metresHigh);
  }

  get climber(): Watched {
    return this.watched.climber;
  }

  /** The level it's on, or gliding to. */
  get zoom(): Zoom {
    return this.level;
  }

  /** Slope metres from the top of the screen to the bottom, this frame. */
  get metresHigh(): number {
    return this.glide.metresHigh;
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
    return this.height / this.glide.metresHigh;
  }

  /** The screen's new size: the slope stays where it was. */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  /** Another level: the view glides there over the next frames, around the screen's anchor, so
   * the climber stays where they are on it. */
  zoomTo(zoom: Zoom): void {
    if (zoom === this.level) {
      return;
    }
    this.level = zoom;
    this.glide = this.glide.towards(zoom.metresHigh);
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

  /** Closes on the climber, `on` the point the picture draws them at this frame, between the
   * steps, and glides on to its zoom, for `seconds` more: the same place after a second at 30
   * frames a second as at 60, and never past them. */
  follow(seconds: number, on: Point = this.climber): void {
    const share = 1 - Math.exp(-Math.max(seconds, 0) / Camera.SETTLE_SECONDS);
    this.x += (on.x - this.x) * share;
    this.y += (on.y - this.y) * share;
    this.glide = this.glide.after(seconds);
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
