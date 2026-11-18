import type { Tool } from "../simulation";

/** A point on the slope, in metres. */
export interface SlopePoint {
  readonly x: number;
  readonly y: number;
}

/** The player's climber as the input sees them: where they are, and the rope each cowstail is
 * clipped to, or none; and, for the turn back (#235), which way along the slope they face,
 * whether they've turned to face the viewer, and what keeps them from turning: a fall, a ladder,
 * the ice or a rope they lower down; and whether they're in a tent, which the tent's key takes
 * them out of (#258). The slope physics' `ClimberView` is one; a view that says nothing of the way
 * they face turns nobody. */
export interface SeenClimber extends SlopePoint {
  readonly first: string | null;
  readonly second: string | null;
  readonly facing?: 1 | -1;
  readonly towardViewer?: boolean;
  readonly falling?: boolean;
  readonly ladder?: string | null;
  readonly onIce?: boolean;
  readonly lowering?: boolean;
  readonly sheltered?: boolean;
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
