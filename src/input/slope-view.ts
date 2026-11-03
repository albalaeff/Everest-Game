import type { Tool } from "../simulation";

/** A point on the slope, in metres. */
export interface SlopePoint {
  readonly x: number;
  readonly y: number;
}

/** The player's climber as the input sees them: where they are, and the rope each cowstail is
 * clipped to, or none. The slope physics' `ClimberView` is one. */
export interface SeenClimber extends SlopePoint {
  readonly first: string | null;
  readonly second: string | null;
}

/** The window as far as the input cares: `window` itself, which follows a turned phone. */
export type ScreenSize = Pick<Window, "innerWidth" | "innerHeight">;

/** How the screen maps onto the slope. */
export interface SlopeView {
  readonly climber: SeenClimber;
  at(screenX: number, screenY: number): SlopePoint;
  /** Where a tool goes when the player has nothing to point with. */
  ahead(tool: Tool["tool"]): SlopePoint;
}

/** A plain mapping with the climber mid-screen and clipped to nothing, until the camera of #19
 * takes its place. */
export class PlainSlopeView implements SlopeView {
  private static readonly PIXELS_PER_METRE = 100;
  private static readonly TOOL_REACH_METRES = 1;

  readonly climber: SeenClimber = { x: 0, y: 0, first: null, second: null };

  constructor(private readonly screen: ScreenSize) {}

  at(screenX: number, screenY: number): SlopePoint {
    const { innerWidth, innerHeight } = this.screen;
    return {
      x: (screenX - innerWidth / 2) / PlainSlopeView.PIXELS_PER_METRE,
      y: (innerHeight / 2 - screenY) / PlainSlopeView.PIXELS_PER_METRE,
    };
  }

  ahead(tool: Tool["tool"]): SlopePoint {
    const reach = PlainSlopeView.TOOL_REACH_METRES;
    return { x: this.climber.x + reach, y: this.climber.y + (tool === "ice-axe" ? reach : -reach) };
  }
}
