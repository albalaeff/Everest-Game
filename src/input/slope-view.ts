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

/** How the screen maps onto the slope: the rendering's `Camera`, which the page hands the input. */
export interface SlopeView {
  readonly climber: SeenClimber;
  at(screenX: number, screenY: number): SlopePoint;
  /** Where a tool goes when the player has nothing to point with. */
  ahead(tool: Tool["tool"]): SlopePoint;
}
