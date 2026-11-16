import type { Point } from "../physics";
import type { ScreenPlace } from "./sherpa-bubble";

/**
 * An element of the page pinned to a point of the slope, as the coach's arrow (#233) and its mark
 * on an anchor (#247) are: put each frame where the point is on the screen, through the camera,
 * and hidden while it's off the screen, within `MARGIN` of its edges, or the page draws no
 * picture. It touches the page only when it shows, or once to hide.
 */
export class SlopePin {
  /** How far in from the screen's edges a point has to be for its element to show, in CSS
   * pixels. */
  private static readonly MARGIN = 12;

  constructor(
    private readonly window: Window,
    private readonly element: HTMLElement,
    private readonly place: ScreenPlace,
  ) {}

  /** Pins the element at `point` and shows it, where that's on the screen; hides it otherwise,
   * or for no point. Says whether it shows. */
  at(point: Point | null): boolean {
    const at = point === null ? null : this.place(point.x, point.y);
    const [x = 0, y = 0] = at ?? [];
    const margin = SlopePin.MARGIN;
    const { innerWidth: width, innerHeight: height } = this.window;
    const shown =
      at !== null && x >= margin && x <= width - margin && y >= margin && y <= height - margin;
    if (!shown) {
      if (!this.element.hidden) {
        this.element.hidden = true;
      }
      return false;
    }
    this.element.style.left = `${x.toFixed(1)}px`;
    this.element.style.top = `${y.toFixed(1)}px`;
    this.element.hidden = false;
    return true;
  }
}
